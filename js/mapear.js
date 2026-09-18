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

export function contaParaApp(linha) {
  return {
    id: linha.id,
    nome: linha.nome,
    cor: linha.cor,
    tipo: linha.tipo === 'cartao' ? 'cartao' : 'conta',
    saldoInicial: Number(linha.saldo_inicial) || 0,
    ordem: Number(linha.ordem) || 0,
  };
}

export function contaParaBanco(conta, usuario) {
  return {
    id: conta.id,
    usuario,
    nome: conta.nome,
    cor: conta.cor,
    tipo: conta.tipo === 'cartao' ? 'cartao' : 'conta',
    saldo_inicial: conta.saldoInicial || 0,
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
  };
  // Vai junto quando o app já tem a hora: assim o desempate entre dois
  // lançamentos do mesmo dia é o mesmo aqui e no servidor. Sem ela, o banco
  // usa a hora em que recebeu — que numa fila offline pode ser bem depois.
  if (l.criadoEm) linha.criado_em = l.criadoEm;
  return linha;
}

/* ------------------------------ atalhos --------------------------------- */

export function estadoParaApp({ contas = [], categorias = [], lancamentos = [] }) {
  return {
    contas: contas.map(contaParaApp).sort((a, b) => a.ordem - b.ordem),
    categorias: categorias.map(categoriaParaApp),
    lancamentos: lancamentos.map(lancamentoParaApp),
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
