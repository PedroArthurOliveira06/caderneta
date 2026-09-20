/* =========================================================================
   Tradução entre o formato do banco e o formato do aplicativo.

   O banco escreve `saldo_inicial`, `conta_destino_id`, `parcelas_total`;
   o aplicativo escreve `saldoInicial`, `contaDestinoId`, `parcelasTotal`.
   Nenhum dos dois está errado — é a convenção de cada mundo. O erro seria
   deixar essa diferença vazar para o resto do código, e é isso que este
   arquivo impede: fora daqui, ninguém precisa saber que existem dois nomes.

   Funções puras, testadas com ida e volta: traduzir e destraduzir tem de
   devolver exatamente o que entrou.
   ========================================================================= */

/* ------------------------------ contas ---------------------------------- */

const tipoDeConta = (t) => (t === 'cartao' || t === 'reserva' ? t : 'conta');

export function contaParaApp(linha) {
  return {
    id: linha.id,
    nome: linha.nome,
    cor: linha.cor,
    tipo: tipoDeConta(linha.tipo),
    saldoInicial: Number(linha.saldo_inicial) || 0,
    diaVencimento: Number(linha.dia_vencimento) || 10,
    ordem: Number(linha.ordem) || 0,
  };
}

export function contaParaBanco(conta, usuario) {
  return {
    id: conta.id,
    usuario,
    nome: conta.nome,
    cor: conta.cor,
    tipo: tipoDeConta(conta.tipo),
    saldo_inicial: conta.saldoInicial || 0,
    dia_vencimento: conta.diaVencimento || 10,
    ordem: conta.ordem || 0,
  };
}

/* ---------------------------- categorias -------------------------------- */

export function categoriaParaApp(linha) {
  return { id: linha.id, nome: linha.nome, tipo: linha.tipo };
}

export function categoriaParaBanco(categoria, usuario) {
  return {
    id: categoria.id,
    usuario,
    nome: categoria.nome,
    tipo: categoria.tipo === 'entrada' ? 'entrada' : 'saida',
  };
}

/* ---------------------------- lançamentos ------------------------------- */

export function lancamentoParaApp(linha) {
  const pronto = {
    id: linha.id,
    data: linha.data,
    tipo: linha.tipo,
    valor: Number(linha.valor) || 0,
    contaId: linha.conta_id,
    contaDestinoId: linha.conta_destino_id,
    categoriaId: linha.categoria_id,
    descricao: linha.descricao || '',
  };
  // É o desempate entre dois lançamentos do mesmo dia; só existe quando já
  // foi gravado, então não se inventa a chave quando falta.
  if (linha.criado_em) pronto.criadoEm = linha.criado_em;
  // Só o cartão usa este campo; em banco ele vem vazio e não vira chave.
  if (linha.natureza) pronto.natureza = linha.natureza;
  // A marca de quem nasceu de um gasto que se repete. É ela que faz o aviso
  // do mês saber o que já foi lançado.
  if (linha.recorrente_id) pronto.recorrenteId = linha.recorrente_id;
  // Campos de parcelamento só existem quando a compra foi parcelada; deixar
  // `null` espalhado atrapalharia as comparações do tipo `parcelasTotal > 1`.
  if (linha.grupo) {
    pronto.grupo = linha.grupo;
    pronto.parcela = linha.parcela;
    pronto.parcelasTotal = linha.parcelas_total;
  }
  return pronto;
}

export function lancamentoParaBanco(l, usuario) {
  const linha = {
    id: l.id,
    usuario,
    data: l.data,
    tipo: l.tipo,
    valor: Math.abs(l.valor || 0),
    conta_id: l.contaId || null,
    // O banco recusa transferência para a mesma conta e exige destino; fora
    // de transferência o destino tem de ir vazio, não com sobra do formulário.
    conta_destino_id: l.tipo === 'transferencia' ? (l.contaDestinoId || null) : null,
    categoria_id: l.tipo === 'transferencia' ? null : (l.categoriaId || null),
    descricao: l.descricao || '',
    grupo: l.grupo || null,
    parcela: l.grupo ? l.parcela : null,
    parcelas_total: l.grupo ? l.parcelasTotal : null,
    recorrente_id: l.recorrenteId || null,
  };
  // Vai junto quando o app já tem a hora: assim o desempate entre dois
  // lançamentos do mesmo dia é o mesmo aqui e no servidor. Sem ela, o banco
  // usa a hora em que recebeu — que numa fila offline pode ser bem depois.
  if (l.criadoEm) linha.criado_em = l.criadoEm;
  linha.natureza = l.natureza === 'corrente' ? 'corrente' : (l.natureza === 'esporadico' ? 'esporadico' : null);
  return linha;
}

/* --------------------- gastos que se repetem ---------------------------- */

export function recorrenteParaApp(linha) {
  return {
    id: linha.id,
    descricao: linha.descricao || '',
    valor: Number(linha.valor) || 0,
    dia: Number(linha.dia) || 1,
    tipo: linha.tipo === 'entrada' ? 'entrada' : 'saida',
    contaId: linha.conta_id,
    categoriaId: linha.categoria_id,
    natureza: linha.natureza || null,
    // 'AAAA-MM': o mês a partir do qual ele passa a valer. Sem isso, cadastrar
    // hoje faria o app oferecer todos os meses anteriores.
    desde: linha.desde,
    ativo: linha.ativo !== false,
  };
}

export function recorrenteParaBanco(r, usuario) {
  return {
    id: r.id,
    usuario,
    descricao: r.descricao || '',
    valor: Math.abs(r.valor || 0),
    dia: r.dia || 1,
    tipo: r.tipo === 'entrada' ? 'entrada' : 'saida',
    conta_id: r.contaId || null,
    categoria_id: r.categoriaId || null,
    natureza: r.natureza === 'corrente' ? 'corrente' : (r.natureza === 'esporadico' ? 'esporadico' : null),
    desde: r.desde,
    ativo: r.ativo !== false,
  };
}

/* ------------------------------ atalhos --------------------------------- */

export function estadoParaApp({ contas = [], categorias = [], lancamentos = [], recorrentes = [] }) {
  return {
    contas: contas.map(contaParaApp).sort((a, b) => a.ordem - b.ordem),
    categorias: categorias.map(categoriaParaApp),
    lancamentos: lancamentos.map(lancamentoParaApp),
    recorrentes: recorrentes.map(recorrenteParaApp),
  };
}

/**
 * Dá nomes novos (UUID) aos registros de um backup, mantendo as ligações.
 *
 * Um backup feito antes de existir conta tem identificadores no formato
 * antigo, que o banco recusa. Trocar só os identificadores quebraria as
 * referências — o lançamento aponta para a conta pelo id —, então o mapa de
 * "antigo -> novo" é aplicado também em quem aponta.
 *
 * Quem já está no formato certo passa intacto, e restaurar um backup no
 * mesmo aparelho continua atualizando as mesmas linhas.
 */
export function renomearIds(pronto, novoId) {
  const ehUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
  const mapa = new Map();
  const novo = (antigo) => {
    if (!antigo) return null;
    if (ehUuid(antigo)) return antigo;
    if (!mapa.has(antigo)) mapa.set(antigo, novoId());
    return mapa.get(antigo);
  };

  return {
    ...pronto,
    contas: pronto.contas.map((c) => ({ ...c, id: novo(c.id) })),
    categorias: pronto.categorias.map((c) => ({ ...c, id: novo(c.id) })),
    lancamentos: pronto.lancamentos.map((l) => ({
      ...l,
      id: novo(l.id),
      contaId: novo(l.contaId),
      contaDestinoId: novo(l.contaDestinoId),
      categoriaId: novo(l.categoriaId),
      ...(l.grupo ? { grupo: novo(l.grupo) } : {}),
    })),
  };
}
