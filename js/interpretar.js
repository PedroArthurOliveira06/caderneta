/* =========================================================================
   Entende uma frase curta e devolve um lançamento pronto.

       "mercado 45"              -> gasto de 45,00 em Mercado, hoje
       "uber 23,50 nubank"       -> gasto no Nubank
       "salario 3200"            -> ENTRADA (a categoria é que diz isso)
       "ontem farmacia 89"       -> gasto de ontem
       "12/09 luz 210 itau"      -> gasto no dia 12/09

   Por que existe: no celular, o caminho normal é abrir, escolher tipo,
   digitar valor, escolher banco, escolher categoria, salvar. Digitar uma
   frase é um toque e duas palavras. O resto o app deduz — e mostra o que
   deduziu, para você corrigir antes de salvar.

   Função pura: recebe o texto e as listas de contas/categorias, devolve um
   objeto. Não lê banco, não toca na tela — por isso dá para testar tudo.
   ========================================================================= */

import { hojeISO, paraCentavos, somarMeses } from './formato.js';

/** "Alimentação" -> "alimentacao". Acento e maiúscula não podem atrapalhar
 *  quem digita com pressa. */
export function simplificar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function diaAnterior(iso) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const d = new Date(ano, mes - 1, dia - 1);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Acha o nome mais longo da lista que aparece no texto. O mais longo ganha
 * para "Outras entradas" não perder para "Outros", e "Banco do Brasil" não
 * perder para "Brasil" se um dia existirem os dois.
 */
function acharPorNome(lista, texto) {
  let achado = null;
  for (const item of lista) {
    const nome = simplificar(item.nome);
    if (!nome) continue;
    const posicao = texto.indexOf(nome);
    if (posicao === -1) continue;
    if (!achado || nome.length > achado.nome.length) {
      achado = { item, nome, posicao };
    }
  }
  return achado;
}

/**
 * @param {string} texto     o que a pessoa digitou
 * @param {object} contexto  { contas, categorias, hoje }
 * @returns {{
 *   valor: number, tipo: string, data: string,
 *   contaId: string|null, categoriaId: string|null,
 *   descricao: string, entendido: boolean
 * }}
 */
export function interpretar(texto, contexto = {}) {
  const contas = contexto.contas || [];
  const categorias = contexto.categorias || [];
  const hoje = contexto.hoje || hojeISO();

  let resto = ` ${simplificar(texto)} `;
  const vazio = {
    valor: 0, tipo: 'saida', data: hoje,
    contaId: null, categoriaId: null, descricao: '', entendido: false,
  };
  if (!resto.trim()) return vazio;

  /* ---- data: "hoje", "ontem" ou 12/09 (opcionalmente com o ano) ---- */
  let data = hoje;

  if (/\bontem\b/.test(resto)) {
    data = diaAnterior(hoje);
    resto = resto.replace(/\bontem\b/g, ' ');
  } else if (/\bhoje\b/.test(resto)) {
    resto = resto.replace(/\bhoje\b/g, ' ');
  }

  const comData = resto.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (comData) {
    const [tudo, dia, mes, ano] = comData;
    const anoCheio = ano
      ? (ano.length === 2 ? 2000 + Number(ano) : Number(ano))
      : Number(hoje.slice(0, 4));
    const candidata = `${anoCheio}-${String(Number(mes)).padStart(2, '0')}-${String(Number(dia)).padStart(2, '0')}`;
    // Sem ano e com data à frente de hoje, quem digita quase sempre quer o
    // ano passado ("paguei em 20/12" dito em janeiro), não o futuro.
    data = !ano && candidata > hoje ? somarMeses(candidata, -12) : candidata;
    resto = resto.replace(tudo, ' ');
  }

  /* ---- banco ou cartão citado pelo nome ---- */
  const conta = acharPorNome(contas, resto);
  if (conta) resto = resto.replace(conta.nome, ' ');

  /* ---- categoria; é ela quem revela se é entrada ou gasto ---- */
  const categoria = acharPorNome(categorias, resto);
  if (categoria) resto = resto.replace(categoria.nome, ' ');

  /* ---- valor: o primeiro número que sobrou ---- */
  const comValor = resto.match(/(\d+(?:[.,]\d{1,2})?)/);
  const valor = comValor ? paraCentavos(comValor[1]) : 0;
  if (comValor) resto = resto.replace(comValor[1], ' ');

  /* ---- tipo: o "+" na frente manda; senão, quem manda é a categoria ---- */
  const marcadoComoEntrada = /(^|\s)\+/.test(` ${simplificar(texto)}`)
    || /\b(recebi|entrou|deposito)\b/.test(` ${simplificar(texto)} `);
  resto = resto.replace(/\b(recebi|entrou|deposito)\b/g, ' ').replace(/\+/g, ' ');

  const tipo = marcadoComoEntrada || (categoria && categoria.item.tipo === 'entrada')
    ? 'entrada'
    : 'saida';

  const descricao = resto.replace(/\s+/g, ' ').trim();

  return {
    valor,
    tipo,
    data,
    contaId: conta ? conta.item.id : null,
    categoriaId: categoria ? categoria.item.id : null,
    descricao,
    // "Entendido" é só sobre o essencial: sem valor não há lançamento.
    entendido: valor > 0,
  };
}

/**
 * Frase curta descrevendo o que foi entendido, para o app mostrar antes de
 * salvar. O app não deve adivinhar em silêncio: ele mostra a leitura dele.
 */
export function explicar(leitura, contexto = {}) {
  const conta = (contexto.contas || []).find((c) => c.id === leitura.contaId);
  const categoria = (contexto.categorias || []).find((c) => c.id === leitura.categoriaId);
  const partes = [leitura.tipo === 'entrada' ? 'Entrada' : 'Gasto'];
  if (categoria) partes.push(categoria.nome);
  if (conta) partes.push(conta.nome);
  if (leitura.descricao) partes.push(`"${leitura.descricao}"`);
  if (leitura.data !== (contexto.hoje || hojeISO())) {
    const [, mes, dia] = leitura.data.split('-');
    partes.push(`${dia}/${mes}`);
  }
  return partes.join(' · ');
}

/**
 * Os gastos que mais se repetem, do mais usado para o menos, para virarem
 * atalhos de um toque. Junta pela combinação que a pessoa de fato repete:
 * o mesmo lugar, no mesmo banco.
 */
export function atalhosFrequentes(estado, quantidade = 4) {
  const contagem = new Map();

  for (const l of estado.lancamentos) {
    if (l.tipo !== 'saida') continue;
    // As parcelas de uma compra parecem repetição, mas não são hábito: são o
    // mesmo ato dividido. E o atalho copiaria o valor de UMA parcela para um
    // lançamento avulso, criando um registro errado.
    if (l.parcelasTotal > 1) continue;
    const rotulo = (l.descricao || '').trim()
      || (estado.categorias.find((c) => c.id === l.categoriaId) || {}).nome;
    if (!rotulo) continue;

    const chave = `${simplificar(rotulo)}|${l.contaId}`;
    const atual = contagem.get(chave) || {
      rotulo, contaId: l.contaId, categoriaId: l.categoriaId, vezes: 0, ultimoValor: 0, ultimaData: '',
    };
    atual.vezes += 1;
    if (l.data >= atual.ultimaData) {
      atual.ultimaData = l.data;
      atual.ultimoValor = l.valor;
      atual.categoriaId = l.categoriaId;
    }
    contagem.set(chave, atual);
  }

  return [...contagem.values()]
    .filter((a) => a.vezes > 1) // atalho para algo feito uma vez só é ruído
    .sort((a, b) => (b.vezes - a.vezes) || b.ultimaData.localeCompare(a.ultimaData))
    .slice(0, quantidade);
}
