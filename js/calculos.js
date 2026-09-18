/* =========================================================================
   Cálculos. Funções puras: recebem o estado, devolvem números. Não leem
   localStorage, não tocam na tela — é o que torna possível testar tudo isso
   com `npm test`, sem navegador.

   A regra que guia o arquivo inteiro: TRANSFERÊNCIA NÃO É GASTO. Passar
   dinheiro do Banco A para o Banco B muda o saldo dos dois, mas o total do
   mês em "saiu" continua igual. Errar isso é o jeito mais fácil de um app
   de gastos mentir para o dono.
   ========================================================================= */

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

/** Entrou / saiu / sobrou no mês. Transferências ficam de fora dos dois lados. */
export function totaisDoMes(estado, ano, mes, filtroContaId) {
  const lista = lancamentosDoMes(estado, ano, mes, filtroContaId);
  let entrou = 0;
  let saiu = 0;
  for (const l of lista) {
    if (l.tipo === 'entrada') entrou += l.valor;
    else if (l.tipo === 'saida') saiu += l.valor;
  }
  return { entrou, saiu, sobrou: entrou - saiu, quantidade: lista.length };
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
