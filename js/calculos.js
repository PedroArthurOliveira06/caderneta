/* =========================================================================
   Cálculos. Funções puras: recebem o estado, devolvem números. Não leem
   localStorage, não tocam na tela — é o que torna possível testar tudo isso
   com `npm test`, sem navegador.

   A regra que guia o arquivo inteiro: TRANSFERÊNCIA NÃO É GASTO. Passar
   dinheiro do Banco A para o Banco B muda o saldo dos dois, mas o total do
   mês em "saiu" continua igual. Errar isso é o jeito mais fácil de um app
   de gastos mentir para o dono.
   ========================================================================= */

import { simplificar, valor as textoDoValor, dataCurta, deslocarMes } from './formato.js';

/** Quanto o lançamento mexe no saldo DESTA conta. Positivo entra, negativo sai. */
export function efeitoNaConta(lancamento, contaId) {
  if (lancamento.tipo === 'entrada' && lancamento.contaId === contaId) {
    return lancamento.valor;
  }
  if (lancamento.tipo === 'saida' && lancamento.contaId === contaId) {
    return -lancamento.valor;
  }
  if (lancamento.tipo === 'transferencia') {
    if (lancamento.contaId === contaId) return -lancamento.valor;
    if (lancamento.contaDestinoId === contaId) return lancamento.valor;
  }
  return 0;
}

/**
 * Saldo da conta somando tudo até `ateISO` (inclusive), partindo do saldo
 * inicial informado no cadastro. Sem `ateISO`, soma o histórico inteiro.
 */
export function saldoDaConta(estado, contaId, ateISO) {
  const conta = estado.contas.find((c) => c.id === contaId);
  if (!conta) return 0;
  return estado.lancamentos.reduce(
    (soma, l) => (ateISO && l.data > ateISO ? soma : soma + efeitoNaConta(l, contaId)),
    conta.saldoInicial || 0
  );
}

/**
 * Três lugares onde o dinheiro pode estar, e eles respondem perguntas
 * diferentes:
 *
 *   'conta'   -> banco: o que dá para gastar hoje
 *   'cartao'  -> cartão de crédito: o que se deve (saldo negativo)
 *   'reserva' -> caixinha: o que existe mas está separado de propósito
 *
 * Registro antigo, gravado antes de os outros dois existirem, conta como
 * banco.
 */
export function tipoDaConta(conta) {
  const tipo = conta && conta.tipo;
  return tipo === 'cartao' || tipo === 'reserva' ? tipo : 'conta';
}

/**
 * [{conta, saldo}] na ordem de cadastro, mais o total somado. Passando
 * `tipo`, devolve só os bancos ou só os cartões — que é o que separa
 * "quanto eu tenho" de "quanto eu devo". Somar os dois num número só diria
 * quanto sobraria se a fatura fosse paga hoje, que é outra pergunta.
 */
export function saldos(estado, ateISO, tipo) {
  const linhas = [...estado.contas]
    .filter((c) => !tipo || tipoDaConta(c) === tipo)
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    .map((conta) => ({ conta, saldo: saldoDaConta(estado, conta.id, ateISO) }));
  return { linhas, total: linhas.reduce((s, l) => s + l.saldo, 0) };
}

/**
 * Quanto se deve nos cartões, como número positivo. O saldo de um cartão é
 * negativo (dívida); um cartão com saldo positivo é fatura paga a mais e não
 * vira "dívida negativa".
 */
export function faturaEmAberto(estado, ateISO) {
  return saldos(estado, ateISO, 'cartao').linhas
    .reduce((soma, l) => soma - Math.min(l.saldo, 0), 0);
}

/**
 * A fatura fechada que está esperando pagamento, e quanto falta dela.
 *
 * O ciclo do cartão: as compras de um mês fecham no último dia dele e são
 * cobradas no dia combinado do mês seguinte (no caso dele, dia 10). Então,
 * em qualquer data, a fatura pendente é sempre a que fechou no fim do mês
 * PASSADO — compras deste mês já pertencem à próxima.
 *
 * `pago` conta só as transferências feitas DEPOIS do fechamento: um
 * pagamento anterior a ele já está embutido no saldo daquela data, e contar
 * duas vezes faria a fatura parecer quitada antes da hora.
 *
 * Devolve null quando a conta não é cartão — quem pergunta não precisa
 * checar antes.
 */
export function faturaAVencer(estado, contaId, hoje) {
  const conta = estado.contas.find((c) => c.id === contaId);
  if (!conta || tipoDaConta(conta) !== 'cartao') return null;

  // Entre 1 e 28: dia 29, 30 ou 31 não existe em todo mês, e uma data que
  // some em fevereiro é pior que uma data aproximada.
  const dia = Math.min(Math.max(Number(conta.diaVencimento) || 10, 1), 28);

  const [ano, mes] = String(hoje).split('-').map(Number);
  const mm = String(mes).padStart(2, '0');
  const vencimento = `${ano}-${mm}-${String(dia).padStart(2, '0')}`;

  // Último dia do mês anterior: é quando a fatura que vence agora fechou.
  const anterior = new Date(ano, mes - 1, 0);
  const fechamento = [
    anterior.getFullYear(),
    String(anterior.getMonth() + 1).padStart(2, '0'),
    String(anterior.getDate()).padStart(2, '0'),
  ].join('-');

  const devido = Math.max(0, -saldoDaConta(estado, contaId, fechamento));

  const pago = estado.lancamentos
    .filter((l) => l.tipo === 'transferencia'
      && l.contaDestinoId === contaId
      && l.data > fechamento
      && l.data <= hoje)
    .reduce((soma, l) => soma + l.valor, 0);

  return {
    conta,
    fechamento,
    vencimento,
    devido,
    pago,
    falta: Math.max(0, devido - pago),
  };
}

/** Todas as faturas que ainda esperam pagamento, para a tela avisar. */
export function faturasAVencer(estado, hoje) {
  return estado.contas
    .filter((c) => tipoDaConta(c) === 'cartao')
    .map((c) => faturaAVencer(estado, c.id, hoje))
    .filter((f) => f && f.falta > 0);
}

/**
 * O nome que o lançamento tem na tela.
 *
 * Mora aqui, e não no desenho, porque a busca precisa procurar exatamente o
 * que a pessoa LÊ. Transferir para um cartão se chama "Pagamento da fatura"
 * no extrato; se esse nome só existisse na hora de desenhar, procurar por
 * "fatura" não acharia nada — e quem procura não tem como saber que aquela
 * linha na verdade não tem descrição nenhuma.
 */
export function rotuloDoLancamento(estado, l) {
  if (l.descricao) return l.descricao;

  if (l.tipo === 'transferencia') {
    const destino = estado.contas.find((c) => c.id === l.contaDestinoId);
    return tipoDaConta(destino) === 'cartao'
      ? 'Pagamento da fatura'
      : 'Transferência entre bancos';
  }

  const categoria = estado.categorias.find((c) => c.id === l.categoriaId);
  return categoria ? categoria.nome : 'Sem categoria';
}

/* ==================== o que fugiu da média ============================= */

/* Quanto acima da média já é notícia. Os dois juntos, não um ou outro:
   sozinha, a porcentagem grita por causa de R$ 8 numa categoria pequena, e
   sozinho, o valor cala num mês em que tudo subiu um pouco. */
const MESES_DE_COMPARACAO = 3;
const ACIMA_EM_PORCENTO = 0.2;
const ACIMA_EM_CENTAVOS = 3000;

/**
 * As categorias em que se gastou claramente mais que o habitual.
 *
 * O "habitual" é ele mesmo, não um orçamento que eu inventei: a média dos
 * meses anteriores. Um app que chuta quanto alguém DEVERIA gastar com comida
 * está adivinhando a vida de quem lê.
 *
 * A média ignora os meses em que a categoria não apareceu. Isso é o que
 * separa "gasto que subiu" de "gasto que acontece de vez em quando": o
 * veterinário de R$ 180 uma vez a cada três meses tem média R$ 180, e não
 * R$ 60 — que faria o app gritar toda vez que o cachorro adoecesse.
 *
 * Por isso também exige pelo menos dois meses com gasto: com um só não
 * existe média, existe uma ocasião.
 */
export function categoriasAcimaDoNormal(estado, ano, mes) {
  const anteriores = [];
  for (let i = 1; i <= MESES_DE_COMPARACAO; i++) {
    const { ano: a, mes: m } = deslocarMes(ano, mes, -i);
    anteriores.push(new Map(porCategoria(estado, a, m).map((c) => [c.categoriaId, c.valor])));
  }

  return porCategoria(estado, ano, mes)
    .filter((linha) => linha.categoriaId !== 'sem-categoria')
    .map((linha) => {
      const gastos = anteriores
        .map((mapa) => mapa.get(linha.categoriaId) || 0)
        .filter((v) => v > 0);

      if (gastos.length < 2) return null;

      const media = Math.round(gastos.reduce((a, b) => a + b, 0) / gastos.length);
      const excesso = linha.valor - media;

      if (excesso < ACIMA_EM_CENTAVOS || excesso < media * ACIMA_EM_PORCENTO) return null;

      return { ...linha, media, excesso, mesesComparados: gastos.length };
    })
    .filter(Boolean)
    .sort((a, b) => b.excesso - a.excesso);
}

/* ===================== o que falta classificar ========================= */

/**
 * Os lançamentos sem categoria, juntados pelo nome.
 *
 * A importação da planilha antiga trouxe 154 lançamentos com a categoria
 * vazia, e classificar um por um é abrir 154 diálogos. Mas gasto de verdade
 * se repete pelo nome: "Mercado" aparece vinte vezes. Juntando pelo nome, o
 * mesmo trabalho vira uma dúzia de escolhas.
 *
 * Transferência fica de fora porque não tem categoria por definição — passar
 * dinheiro de um banco para o outro não é um gasto de nada.
 *
 * O tipo entra na chave porque as categorias são separadas em gasto e
 * entrada: um grupo misturado não teria uma lista de categorias para
 * oferecer.
 */
export function paraClassificar(estado) {
  const grupos = new Map();

  for (const l of estado.lancamentos) {
    if (l.tipo === 'transferencia' || l.categoriaId) continue;

    const chave = `${l.tipo}|${simplificar(l.descricao)}`;
    if (!grupos.has(chave)) {
      grupos.set(chave, {
        chave,
        tipo: l.tipo,
        rotulo: l.descricao || 'Sem descrição',
        itens: [],
        valor: 0,
      });
    }
    const grupo = grupos.get(chave);
    grupo.itens.push(l);
    grupo.valor += l.valor;
  }

  // Maior grupo primeiro: é o que encolhe a fila mais rápido por toque.
  return [...grupos.values()]
    .sort((a, b) => b.itens.length - a.itens.length || b.valor - a.valor);
}

/** Quantos lançamentos ainda esperam categoria, para o aviso dizer o número. */
export function quantosSemCategoria(estado) {
  return estado.lancamentos
    .filter((l) => l.tipo !== 'transferencia' && !l.categoriaId).length;
}

/* ====================== gastos que se repetem ========================= */

/**
 * Em que dia daquele mês o gasto repetido cai.
 *
 * Dia 31 num mês de 30 vira o último dia dele, que é o que a cobrança de
 * verdade faz — e não pula para o mês seguinte, como o `new Date` faria.
 */
export function dataDoRecorrente(recorrente, ano, mes) {
  const ultimo = new Date(ano, mes, 0).getDate();
  const dia = Math.min(Math.max(Number(recorrente.dia) || 1, 1), ultimo);
  return [
    ano,
    String(mes).padStart(2, '0'),
    String(dia).padStart(2, '0'),
  ].join('-');
}

/**
 * Os gastos que se repetem e ainda NÃO entraram no mês pedido.
 *
 * Três recusas, e cada uma existe por um motivo:
 *
 * - O que já foi lançado some. Quem marca isso é o `recorrenteId` gravado no
 *   lançamento; comparar por nome e valor erraria assim que o Spotify subisse
 *   de preço e ele corrigisse o valor na mão.
 * - O que ainda não chegou o dia espera. Lançar a Apple do dia 15 no dia 3
 *   faria o saldo mentir por doze dias, todo mês.
 * - O que é mais antigo que o cadastro nunca aparece. Sem isso, cadastrar o
 *   Spotify hoje e folhear para março ofereceria seis meses de Spotify que
 *   ele nunca pediu.
 */
export function recorrentesPendentes(estado, ano, mes, hoje) {
  const mm = String(mes).padStart(2, '0');
  const prefixo = `${ano}-${mm}`;

  const jaLancados = new Set(estado.lancamentos
    .filter((l) => l.recorrenteId && String(l.data).startsWith(prefixo))
    .map((l) => l.recorrenteId));

  return (estado.recorrentes || [])
    .filter((r) => r.ativo !== false)
    .filter((r) => !jaLancados.has(r.id))
    .filter((r) => !r.desde || prefixo >= r.desde)
    .filter((r) => estado.contas.some((c) => c.id === r.contaId))
    .map((r) => ({ recorrente: r, data: dataDoRecorrente(r, ano, mes) }))
    .filter((p) => p.data <= hoje)
    .sort((a, b) => a.data.localeCompare(b.data));
}

/** Quanto sai por mês, somado, entre os que estão ligados. */
export function totalDosRecorrentes(estado) {
  return (estado.recorrentes || [])
    .filter((r) => r.ativo !== false && r.tipo !== 'entrada')
    .reduce((soma, r) => soma + (r.valor || 0), 0);
}

/** Lançamentos do mês, do mais recente para o mais antigo. */
export function lancamentosDoMes(estado, ano, mes, filtroContaId) {
  const prefixo = `${ano}-${String(mes).padStart(2, '0')}`;
  return estado.lancamentos
    .filter((l) => String(l.data).startsWith(prefixo))
    .filter((l) => !filtroContaId
      || l.contaId === filtroContaId
      || l.contaDestinoId === filtroContaId)
    .sort((a, b) => (a.data === b.data
      ? String(b.criadoEm || '').localeCompare(String(a.criadoEm || ''))
      : b.data.localeCompare(a.data)));
}

/**
 * Entrou / saiu / sobrou numa lista qualquer de lançamentos. Transferências
 * ficam de fora dos dois lados — é a regra do arquivo inteiro.
 */
export function totaisDe(lista) {
  let entrou = 0;
  let saiu = 0;
  for (const l of lista) {
    if (l.tipo === 'entrada') entrou += l.valor;
    else if (l.tipo === 'saida') saiu += l.valor;
  }
  return { entrou, saiu, sobrou: entrou - saiu, quantidade: lista.length };
}

/** Entrou / saiu / sobrou no mês. */
export function totaisDoMes(estado, ano, mes, filtroContaId) {
  return totaisDe(lancamentosDoMes(estado, ano, mes, filtroContaId));
}

/**
 * Busca em TODO o histórico, não só no mês aberto.
 *
 * É a razão de a busca existir: quem procura "veterinário" não lembra em que
 * mês foi — se lembrasse, folhearia. Uma busca presa ao mês devolveria vazio
 * justamente nas perguntas que valem a pena.
 *
 * Cada palavra digitada tem de aparecer em ALGUM pedaço do lançamento, não
 * todas no mesmo: "ifood nubank" acha o iFood pago no Nubank. O pedaço inclui
 * o valor escrito e a data em dia/mês, então "45,90" e "10/09" também acham.
 */
export function buscar(estado, termo, filtroContaId) {
  const palavras = simplificar(termo).split(/\s+/).filter(Boolean);
  if (!palavras.length) return [];

  const nomeDaConta = new Map(estado.contas.map((c) => [c.id, c.nome]));
  const nomeDaCategoria = new Map(estado.categorias.map((c) => [c.id, c.nome]));

  return estado.lancamentos
    .filter((l) => !filtroContaId
      || l.contaId === filtroContaId
      || l.contaDestinoId === filtroContaId)
    .filter((l) => {
      const palheiro = simplificar([
        rotuloDoLancamento(estado, l),
        nomeDaCategoria.get(l.categoriaId),
        nomeDaConta.get(l.contaId),
        nomeDaConta.get(l.contaDestinoId),
        textoDoValor(l.valor),
        dataCurta(l.data),
      ].filter(Boolean).join(' '));
      return palavras.every((palavra) => palheiro.includes(palavra));
    })
    .sort((a, b) => (a.data === b.data
      ? String(b.criadoEm || '').localeCompare(String(a.criadoEm || ''))
      : b.data.localeCompare(a.data)));
}

/** Gasto por categoria no mês, da maior para a menor, com o % do total. */
export function porCategoria(estado, ano, mes, filtroContaId, tipo = 'saida') {
  const lista = lancamentosDoMes(estado, ano, mes, filtroContaId)
    .filter((l) => l.tipo === tipo);
  const soma = new Map();
  for (const l of lista) {
    const chave = l.categoriaId || 'sem-categoria';
    soma.set(chave, (soma.get(chave) || 0) + l.valor);
  }
  const total = [...soma.values()].reduce((a, b) => a + b, 0);
  return [...soma.entries()]
    .map(([categoriaId, valor]) => ({
      categoriaId,
      categoria: estado.categorias.find((c) => c.id === categoriaId) || { nome: 'Sem categoria' },
      valor,
      fatia: total ? valor / total : 0,
    }))
    .sort((a, b) => b.valor - a.valor);
}

/** Gasto do mês por conta — para responder "qual banco puxou mais?". */
export function porConta(estado, ano, mes, tipo = 'saida') {
  return [...estado.contas]
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    .map((conta) => ({
      conta,
      valor: lancamentosDoMes(estado, ano, mes)
        .filter((l) => l.tipo === tipo && l.contaId === conta.id)
        .reduce((s, l) => s + l.valor, 0),
    }));
}

/**
 * A fatura do cartão, partida em duas: o que se repete todo mês (assinatura,
 * curso, cabelo) e o que foi de ocasião.
 *
 * Esta divisão existe SÓ no cartão de crédito, e isso não é limitação: é a
 * pergunta que o cartão cria. A fatura chega fechada, e o que interessa é
 * saber qual parte dela vem de novo no mês que vem. Gasto em conta corrente
 * é gasto, e ponto.
 *
 * O rótulo é do lançamento, não da categoria: no mesmo cartão, "Ifood"
 * pode ser a assinatura mensal num mês e um pedido avulso no outro.
 */
export function naturezaDoLancamento(lancamento) {
  return lancamento && lancamento.natureza === 'corrente' ? 'corrente' : 'esporadico';
}

export function porNatureza(estado, ano, mes, filtroContaId) {
  const cartoes = new Set(estado.contas
    .filter((c) => tipoDaConta(c) === 'cartao')
    .map((c) => c.id));

  const lista = lancamentosDoMes(estado, ano, mes, filtroContaId)
    .filter((l) => l.tipo === 'saida' && cartoes.has(l.contaId));

  let corrente = 0;
  let esporadico = 0;

  for (const l of lista) {
    if (naturezaDoLancamento(l) === 'corrente') corrente += l.valor;
    else esporadico += l.valor;
  }

  const total = corrente + esporadico;
  return {
    corrente,
    esporadico,
    total,
    fatiaCorrente: total ? corrente / total : 0,
  };
}

/** Agrupa a lista por dia, preservando a ordem já ordenada. */
export function agruparPorDia(lista) {
  const grupos = [];
  for (const l of lista) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.data === l.data) ultimo.itens.push(l);
    else grupos.push({ data: l.data, itens: [l] });
  }
  return grupos;
}

/** Os últimos N meses que têm algum lançamento, para o gráfico de evolução. */
export function evolucao(estado, ano, mes, quantidade = 6) {
  const meses = [];
  for (let i = quantidade - 1; i >= 0; i--) {
    const total = ano * 12 + (mes - 1) - i;
    const a = Math.floor(total / 12);
    const m = (total % 12) + 1;
    meses.push({ ano: a, mes: m, ...totaisDoMes(estado, a, m) });
  }
  return meses;
}
