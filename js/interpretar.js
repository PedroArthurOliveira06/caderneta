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

import { hojeISO, paraCentavos, somarMeses, simplificar } from './formato.js';

// Reexportado porque quem já usava a partir daqui não precisa saber que ela
// mudou de casa.
export { simplificar };

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
 * Devolve à descrição os acentos e as maiúsculas de quem digitou.
 *
 * A análise acontece sobre o texto rebaixado — é o que permite achar "itau"
 * dentro de "Itaú". Mas o que sobra dali vira a descrição do lançamento, e
 * ela fica no extrato para sempre: "Mercado do mes" e "Ifood" são o app
 * escrevendo errado no lugar da pessoa.
 *
 * As palavras que sobraram são procuradas, na ordem, no texto original. Uma
 * que não ache par — quando o corte caiu no meio de uma palavra, como o "45"
 * de "mercado45" — fica na versão rebaixada, que é exatamente o que o app já
 * fazia com todas. Nunca sai pior do que era.
 */
function comoFoiDigitado(original, simplificado) {
  const alvo = simplificado.split(' ').filter(Boolean);
  if (!alvo.length) return '';

  const palavras = String(original).trim().split(/\s+/);
  let i = 0;

  const escolhidas = alvo.map((procurada) => {
    const partida = i;
    while (i < palavras.length) {
      const atual = palavras[i];
      i += 1;
      if (simplificar(atual) === procurada) return atual;
    }
    i = partida; // não achou: a busca das próximas continua de onde estava
    return procurada;
  });

  const frase = escolhidas.join(' ');

  // Maiúscula inicial só quando ninguém escreveu maiúscula nenhuma. Quem
  // digitou "iFood" quis "iFood", e "IFood" seria outra correção indevida.
  return frase === frase.toLowerCase()
    ? frase.charAt(0).toUpperCase() + frase.slice(1)
    : frase;
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

  // O texto foi rebaixado só para poder comparar com nomes de banco e de
  // categoria. A descrição, porém, vai aparecer no extrato todo dia, e o
  // rebaixamento tirava os acentos junto: "mercado do mês" virava "Mercado
  // do mes". Aqui as palavras que sobraram são casadas de volta com o que a
  // pessoa realmente escreveu.
  const sobrou = resto.replace(/\s+/g, ' ').trim();
  const descricao = comoFoiDigitado(texto, sobrou);

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

  // A data aparece SEMPRE, inclusive quando é hoje. Antes ela só aparecia
  // quando era outro dia, e o efeito era que ninguém percebia que a data
  // fazia parte do que se podia escrever — quem lança dois dias depois
  // registrava tudo no dia errado sem notar.
  partes.push(nomeDoDia(leitura.data, contexto.hoje || hojeISO()));

  return partes.join(' · ');
}

/** 'hoje', 'ontem' ou '12/09' — como uma pessoa diria. */
export function nomeDoDia(data, hoje) {
  if (data === hoje) return 'hoje';

  const [a, m, d] = String(hoje).split('-').map(Number);
  const anterior = new Date(a, m - 1, d - 1);
  const ontem = [
    anterior.getFullYear(),
    String(anterior.getMonth() + 1).padStart(2, '0'),
    String(anterior.getDate()).padStart(2, '0'),
  ].join('-');
  if (data === ontem) return 'ontem';

  const [, mes, dia] = String(data).split('-');
  return `${dia}/${mes}`;
}

/**
 * A categoria mais provável para um lançamento com este nome, aprendida do
 * que já foi classificado antes.
 *
 * Sem isto, a pilha de "sem categoria" volta a crescer no dia seguinte ao de
 * limpá-la: o app sabia que "Mercado" é Alimentação doze vezes seguidas e
 * continuava perguntando na décima terceira.
 *
 * Duas passadas. Primeiro o nome igual, que é a resposta segura. Só se não
 * houver nenhum é que vale um nome que contém o outro — "Mercado do mês"
 * aprende com "Mercado" —, e aí com pelo menos quatro letras, senão "uber" e
 * "uberlândia" virariam a mesma coisa.
 *
 * O voto é por quantidade, e empate vai para o mais recente: mudar de ideia
 * sobre uma categoria deve valer mais que o hábito antigo.
 */
export function categoriaProvavel(estado, descricao, tipo) {
  const procurado = simplificar(descricao);
  if (!procurado) return null;

  const candidatos = (combina) => {
    const votos = new Map();
    for (const l of estado.lancamentos) {
      if (l.tipo !== tipo || !l.categoriaId) continue;
      const nome = simplificar(l.descricao);
      if (!nome || !combina(nome)) continue;

      const voto = votos.get(l.categoriaId) || { vezes: 0, ultima: '' };
      voto.vezes += 1;
      if (String(l.data) > voto.ultima) voto.ultima = String(l.data);
      votos.set(l.categoriaId, voto);
    }
    return votos;
  };

  let votos = candidatos((nome) => nome === procurado);
  if (!votos.size && procurado.length >= 4) {
    votos = candidatos((nome) =>
      nome.length >= 4 && (nome.includes(procurado) || procurado.includes(nome)));
  }

  let melhor = null;
  for (const [id, voto] of votos) {
    const ganha = !melhor
      || voto.vezes > melhor.vezes
      || (voto.vezes === melhor.vezes && voto.ultima > melhor.ultima);
    if (ganha) melhor = { id, ...voto };
  }

  // A categoria tem de existir ainda: uma apagada deixaria o palpite órfão.
  return melhor && (estado.categorias || []).some((c) => c.id === melhor.id)
    ? melhor.id
    : null;
}
