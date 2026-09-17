/* =========================================================================
   Camada de dados. Tudo vive em localStorage, num único objeto JSON.

   Por que localStorage e não um banco de verdade: o app é uma página estática
   no GitHub Pages, sem servidor. O lado ruim é real e está assumido — os
   dados ficam NESTE navegador, neste aparelho. Por isso o backup (exportar /
   importar arquivo) é parte do app, não um extra.

   Toda escrita passa por `mutar()`, que grava e avisa a tela. Nenhuma outra
   parte do código fala com localStorage direto.
   ========================================================================= */

const CHAVE = 'caderneta.v1';
const VERSAO = 1;

/** Cores de identidade das contas. Cor aqui SIGNIFICA de qual banco é o
 *  dinheiro — não é decoração, e por isso são bem distintas entre si.
 *
 *  Verde e vermelho ficam de fora de propósito: no app inteiro eles já
 *  querem dizer "entrou" e "saiu". Se um banco também fosse vermelho, um
 *  valor vermelho passaria a ter dois significados possíveis. */
export const CORES_CONTA = [
  { id: 'azul', nome: 'Azul', hex: '#1c5fc4' },
  { id: 'roxo', nome: 'Roxo', hex: '#5f2da8' },
  { id: 'ambar', nome: 'Âmbar', hex: '#8a5406' },
  { id: 'petroleo', nome: 'Petróleo', hex: '#0f5c66' },
  { id: 'magenta', nome: 'Magenta', hex: '#a41d6b' },
  { id: 'ardosia', nome: 'Ardósia', hex: '#46536b' },
];

const CATEGORIAS_INICIAIS = [
  { nome: 'Mercado', tipo: 'saida' },
  { nome: 'Casa', tipo: 'saida' },
  { nome: 'Transporte', tipo: 'saida' },
  { nome: 'Alimentação', tipo: 'saida' },
  { nome: 'Saúde', tipo: 'saida' },
  { nome: 'Educação', tipo: 'saida' },
  { nome: 'Lazer', tipo: 'saida' },
  { nome: 'Assinaturas', tipo: 'saida' },
  { nome: 'Outros', tipo: 'saida' },
  { nome: 'Salário', tipo: 'entrada' },
  { nome: 'Reembolso', tipo: 'entrada' },
  { nome: 'Outras entradas', tipo: 'entrada' },
];

function id() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function estadoVazio() {
  return {
    versao: VERSAO,
    configurado: false,
    contas: [],
    categorias: CATEGORIAS_INICIAIS.map((c) => ({ id: id(), ...c })),
    lancamentos: [],
  };
}

let estado = estadoVazio();
const ouvintes = new Set();

/* ------------------------------ leitura -------------------------------- */

export function obter() {
  return estado;
}

export function assinar(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

export function conta(contaId) {
  return estado.contas.find((c) => c.id === contaId) || null;
}

export function categoria(categoriaId) {
  return estado.categorias.find((c) => c.id === categoriaId) || null;
}

export function categoriasDe(tipo) {
  return estado.categorias.filter((c) => c.tipo === tipo);
}

/* ---------------------------- persistência ----------------------------- */

export function carregar() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (bruto) estado = migrar(JSON.parse(bruto));
  } catch (erro) {
    // Dado corrompido não pode derrubar o app inteiro: mantém o que já há em
    // memória e deixa a pessoa exportar/importar para se recuperar.
    console.error('Não foi possível ler os dados salvos:', erro);
  }
  return estado;
}

function migrar(dados) {
  const base = estadoVazio();
  const pronto = { ...base, ...dados, versao: VERSAO };
  pronto.contas = Array.isArray(dados.contas) ? dados.contas : [];
  pronto.categorias = Array.isArray(dados.categorias) && dados.categorias.length
    ? dados.categorias
    : base.categorias;
  pronto.lancamentos = Array.isArray(dados.lancamentos) ? dados.lancamentos : [];
  return pronto;
}

function mutar(fn) {
  fn(estado);
  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado));
  } catch (erro) {
    console.error('Não foi possível salvar:', erro);
    alert('Não deu para salvar neste navegador. Exporte um backup pelos Ajustes antes de fechar a página.');
  }
  ouvintes.forEach((ouvinte) => ouvinte(estado));
}

/* ------------------------------- contas -------------------------------- */

export function definirContasIniciais(lista) {
  mutar((e) => {
    e.contas = lista.map((c, i) => ({
      id: id(),
      nome: c.nome,
      cor: c.cor || CORES_CONTA[i % CORES_CONTA.length].id,
      saldoInicial: c.saldoInicial || 0,
      ordem: i,
    }));
    e.configurado = true;
  });
}

export function salvarConta(dados) {
  mutar((e) => {
    if (dados.id) {
      const alvo = e.contas.find((c) => c.id === dados.id);
      if (alvo) Object.assign(alvo, dados);
    } else {
      e.contas.push({
        id: id(),
        nome: dados.nome,
        cor: dados.cor || CORES_CONTA[e.contas.length % CORES_CONTA.length].id,
        saldoInicial: dados.saldoInicial || 0,
        ordem: e.contas.length,
      });
    }
  });
}

/** Só remove conta sem lançamento — apagar em cascata perderia histórico. */
export function podeRemoverConta(contaId) {
  return !estado.lancamentos.some(
    (l) => l.contaId === contaId || l.contaDestinoId === contaId
  );
}

export function removerConta(contaId) {
  if (!podeRemoverConta(contaId)) return false;
  mutar((e) => { e.contas = e.contas.filter((c) => c.id !== contaId); });
  return true;
}

/* ----------------------------- categorias ------------------------------ */

export function salvarCategoria(dados) {
  mutar((e) => {
    if (dados.id) {
      const alvo = e.categorias.find((c) => c.id === dados.id);
      if (alvo) Object.assign(alvo, dados);
    } else {
      e.categorias.push({ id: id(), nome: dados.nome, tipo: dados.tipo || 'saida' });
    }
  });
}

export function podeRemoverCategoria(categoriaId) {
  return !estado.lancamentos.some((l) => l.categoriaId === categoriaId);
}

export function removerCategoria(categoriaId) {
  if (!podeRemoverCategoria(categoriaId)) return false;
  mutar((e) => { e.categorias = e.categorias.filter((c) => c.id !== categoriaId); });
  return true;
}

/* ---------------------------- lançamentos ------------------------------ */

/**
 * tipo: 'saida' | 'entrada' | 'transferencia'
 * valor: centavos, sempre positivo (o sinal quem dá é o tipo)
 * transferência usa contaId (de onde sai) + contaDestinoId (onde entra)
 */
export function salvarLancamento(dados) {
  mutar((e) => {
    if (dados.id) {
      const alvo = e.lancamentos.find((l) => l.id === dados.id);
      if (alvo) Object.assign(alvo, dados, {
        valor: Math.abs(dados.valor || 0),
        editadoEm: new Date().toISOString(),
      });
    } else {
      e.lancamentos.push({
        id: id(),
        criadoEm: new Date().toISOString(),
        ...dados,
        valor: Math.abs(dados.valor || 0),
      });
    }
  });
}

export function removerLancamento(lancamentoId) {
  mutar((e) => { e.lancamentos = e.lancamentos.filter((l) => l.id !== lancamentoId); });
}

export function lancamento(lancamentoId) {
  return estado.lancamentos.find((l) => l.id === lancamentoId) || null;
}

/* ------------------------------- backup -------------------------------- */

export function exportarJSON() {
  return JSON.stringify({ ...estado, exportadoEm: new Date().toISOString() }, null, 2);
}

/** Marca que o backup foi baixado, para o app poder cobrar o próximo. */
export function registrarBackup() {
  mutar((e) => { e.ultimoBackupEm = new Date().toISOString(); });
}

/** Substitui tudo pelo conteúdo do arquivo. Devolve {ok, erro}. */
export function importarJSON(texto) {
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch (erro) {
    return { ok: false, erro: 'O arquivo não é um backup válido (não é JSON).' };
  }
  if (!dados || !Array.isArray(dados.contas) || !Array.isArray(dados.lancamentos)) {
    return { ok: false, erro: 'O arquivo não parece um backup da Caderneta.' };
  }
  mutar((e) => {
    const pronto = migrar(dados);
    e.versao = pronto.versao;
    e.configurado = true;
    e.contas = pronto.contas;
    e.categorias = pronto.categorias;
    e.lancamentos = pronto.lancamentos;
  });
  return { ok: true, total: estado.lancamentos.length };
}

export function apagarTudo() {
  mutar((e) => Object.assign(e, estadoVazio()));
}
