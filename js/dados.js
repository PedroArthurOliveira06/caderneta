/* =========================================================================
   Camada de dados. Tudo vive em localStorage, num único objeto JSON.

   Por que localStorage e não um banco de verdade: o app é uma página estática
   no GitHub Pages, sem servidor. O lado ruim é real e está assumido — os
   dados ficam NESTE navegador, neste aparelho. Por isso o backup (exportar /
   importar arquivo) é parte do app, não um extra.

   Toda escrita passa por `mutar()`, que grava e avisa a tela. Nenhuma outra
   parte do código fala com localStorage direto.
   ========================================================================= */

import * as servidor from './servidor.js';
import * as mapear from './mapear.js';

const CHAVE = 'caderneta.v1';
const VERSAO = 1;

/** Cores de identidade das contas. Cor aqui SIGNIFICA de qual banco é o
 *  dinheiro — não é decoração, e por isso são bem distintas entre si.
 *
 *  Verde e vermelho ficam de fora de propósito: no app inteiro eles já
 *  querem dizer "entrou" e "saiu". Se um banco também fosse vermelho, um
 *  valor vermelho passaria a ter dois significados possíveis. */
export const CORES_CONTA = [
  { id: 'azul', nome: 'Azul', hex: '#2563d8' },
  { id: 'roxo', nome: 'Roxo', hex: '#7a35dd' },
  { id: 'ambar', nome: 'Âmbar', hex: '#e08a12' },
  { id: 'petroleo', nome: 'Turquesa', hex: '#0a97ad' },
  { id: 'magenta', nome: 'Magenta', hex: '#d11e77' },
  { id: 'ardosia', nome: 'Ardósia', hex: '#4a5c78' },
];

/* `natureza` diz se o gasto se repete todo mês ou aparece de vez em quando.
   Os padrões abaixo são um chute razoável para começar — a pessoa muda com
   um toque em Ajustes, porque "Educação" é mensalidade para uns e curso
   avulso para outros. */
const CATEGORIAS_INICIAIS = [
  { nome: 'Mercado', tipo: 'saida', natureza: 'frequente' },
  { nome: 'Casa', tipo: 'saida', natureza: 'frequente' },
  { nome: 'Transporte', tipo: 'saida', natureza: 'frequente' },
  { nome: 'Alimentação', tipo: 'saida', natureza: 'frequente' },
  { nome: 'Assinaturas', tipo: 'saida', natureza: 'frequente' },
  { nome: 'Educação', tipo: 'saida', natureza: 'frequente' },
  { nome: 'Saúde', tipo: 'saida', natureza: 'esporadico' },
  { nome: 'Lazer', tipo: 'saida', natureza: 'esporadico' },
  { nome: 'Outros', tipo: 'saida', natureza: 'esporadico' },
  { nome: 'Salário', tipo: 'entrada' },
  { nome: 'Ajuda da família', tipo: 'entrada' },
  { nome: 'Reembolso', tipo: 'entrada' },
  { nome: 'Outras entradas', tipo: 'entrada' },
];

/**
 * Identificador de registro. UUID de verdade porque é o formato que o banco
 * espera — e porque ele nasce AQUI, no aparelho, e não no servidor. É isso
 * que deixa o app gravar offline e mandar depois: a linha já tem o nome
 * definitivo dela, então reenviar atualiza a mesma linha em vez de duplicar.
 */
function id() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  // Navegador antigo ou página sem HTTPS: sorteio manual no mesmo formato.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
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

/**
 * O app funciona de dois jeitos, com a MESMA interface para o resto do
 * código — nada fora deste arquivo sabe em qual deles está:
 *
 *   'local'    -> só este aparelho, sem conta e sem internet (como nasceu)
 *   'servidor' -> conta própria no Supabase, sincronizando entre aparelhos
 *
 * No modo servidor a gravação é otimista: muda na tela na hora, entra numa
 * fila e sobe depois. A fila fica guardada no navegador, então um gasto
 * lançado no elevador sem sinal não se perde — sobe quando a rede volta.
 *
 * Reenviar é seguro porque cada registro nasce com o id gerado aqui e o
 * envio é "upsert": mandar duas vezes atualiza a mesma linha em vez de
 * criar duas.
 */
let modo = 'local';
let usuarioId = null;
let chaveDados = CHAVE;
let chaveFila = null;
let fila = [];
let enviando = false;
let aoFalharEnvio = null;

export function definirAvisoDeFalha(fn) { aoFalharEnvio = fn; }
export function modoAtual() { return modo; }

export function carregar() {
  try {
    const bruto = localStorage.getItem(chaveDados);
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

function gravarLocal(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
    return true;
  } catch (erro) {
    console.error('Não foi possível salvar:', erro);
    return false;
  }
}

/**
 * @param {function}       fn     muda o estado em memória
 * @param {array|function} envios operações para o servidor. Pode ser uma
 *   função, para os casos em que o envio depende do que `fn` acabou de
 *   criar — ela só é chamada depois da mudança, e só se houver conta.
 */
function mutar(fn, envios) {
  fn(estado);

  if (!gravarLocal(chaveDados, estado)) {
    alert('Não deu para salvar neste navegador. Exporte um backup pelos Ajustes antes de fechar a página.');
  }

  if (modo === 'servidor' && envios) {
    const lista = typeof envios === 'function' ? envios() : envios;
    if (lista && lista.length) {
      fila.push(...lista);
      gravarLocal(chaveFila, fila);
      escoarFila();
    }
  }

  ouvintes.forEach((ouvinte) => ouvinte(estado));
}

/* ------------------------- fila de envio ------------------------------- */

/**
 * Sobe a fila em ordem, uma operação por vez. Sem rede, para e tenta de
 * novo depois — nada se perde. Com erro do servidor (um dado que ele
 * recusa), descarta a operação e recarrega do servidor: insistir para
 * sempre numa operação inválida travaria todas as outras atrás dela.
 */
async function escoarFila() {
  if (enviando || modo !== 'servidor' || !fila.length) return;
  enviando = true;

  try {
    while (fila.length) {
      const operacao = fila[0];
      try {
        if (operacao.op === 'upsert') await servidor.upsert(operacao.tabela, operacao.linhas);
        else await servidor.remover(operacao.tabela, operacao.filtro);
        fila.shift();
        gravarLocal(chaveFila, fila);
      } catch (erro) {
        if (erro.semRede) break; // volta quando a internet voltar

        fila.shift();
        gravarLocal(chaveFila, fila);
        if (aoFalharEnvio) aoFalharEnvio(erro);
        await sincronizar().catch(() => {});
      }
    }
  } finally {
    enviando = false;
  }
}

/** Chamado quando o aparelho reencontra a internet. */
export function tentarEscoar() {
  escoarFila();
}

export function enviosPendentes() {
  return fila.length;
}

/* --------------------------- modo servidor ----------------------------- */

export function entrarModoServidor(usuario) {
  modo = 'servidor';
  usuarioId = usuario.id;
  chaveDados = `${CHAVE}.${usuario.id}`;
  chaveFila = `${CHAVE}.fila.${usuario.id}`;

  estado = estadoVazio();
  carregar(); // mostra logo o que já foi visto neste aparelho

  try {
    fila = JSON.parse(localStorage.getItem(chaveFila) || '[]');
  } catch {
    fila = [];
  }
  return estado;
}

export function sairModoServidor() {
  modo = 'local';
  usuarioId = null;
  chaveDados = CHAVE;
  chaveFila = null;
  fila = [];
  estado = estadoVazio();
}

/** Troca o que está na tela pelo que está no servidor. */
export async function sincronizar() {
  if (modo !== 'servidor') return estado;

  const [contas, categorias, lancamentos] = await Promise.all([
    servidor.listar('contas', 'select=*&order=ordem'),
    servidor.listar('categorias', 'select=*&order=nome'),
    servidor.listar('lancamentos', 'select=*&order=data.desc'),
  ]);

  const doServidor = mapear.estadoParaApp({ contas, categorias, lancamentos });

  estado = {
    ...estadoVazio(),
    ...doServidor,
    // Conta nenhuma no servidor significa conta nova: o app leva a pessoa
    // para a tela de primeiro acesso.
    configurado: doServidor.contas.length > 0,
  };

  gravarLocal(chaveDados, estado);
  ouvintes.forEach((ouvinte) => ouvinte(estado));
  escoarFila();
  return estado;
}

/* Atalhos para montar as operações de envio. */
const enviarContas = (contas) =>
  [{ op: 'upsert', tabela: 'contas', linhas: contas.map((c) => mapear.contaParaBanco(c, usuarioId)) }];

const enviarCategorias = (categorias) =>
  [{ op: 'upsert', tabela: 'categorias', linhas: categorias.map((c) => mapear.categoriaParaBanco(c, usuarioId)) }];

const enviarLancamentos = (lista) =>
  [{ op: 'upsert', tabela: 'lancamentos', linhas: lista.map((l) => mapear.lancamentoParaBanco(l, usuarioId)) }];

const apagar = (tabela, filtro) => [{ op: 'delete', tabela, filtro }];

/* ------------------------------- contas -------------------------------- */

/**
 * Uma conta é um lugar onde o dinheiro está (`tipo: 'conta'`) ou um cartão
 * de crédito, que é o contrário: um lugar onde a dívida se acumula
 * (`tipo: 'cartao'`).
 *
 * A diferença é só de sinal e de leitura — o saldo de um cartão é negativo e
 * chama-se "fatura em aberto". Por isso nenhum cálculo precisa saber dos
 * dois: comprar no crédito é uma saída no cartão, e pagar a fatura é uma
 * transferência do banco para o cartão, que abate a dívida.
 *
 * Contas antigas, gravadas antes dos cartões existirem, não têm o campo —
 * por isso todo lugar que lê trata a ausência como 'conta'.
 */
function tipoValido(tipo) {
  return tipo === 'cartao' || tipo === 'reserva' ? tipo : 'conta';
}

export function tipoDaConta(conta) {
  return tipoValido(conta && conta.tipo);
}

export function ehReserva(conta) {
  return tipoDaConta(conta) === 'reserva';
}

export function ehCartao(conta) {
  return tipoDaConta(conta) === 'cartao';
}

export function definirContasIniciais(lista) {
  const contas = lista.map((c, i) => ({
    id: id(),
    nome: c.nome,
    cor: c.cor || CORES_CONTA[i % CORES_CONTA.length].id,
    tipo: tipoValido(c.tipo),
    saldoInicial: c.saldoInicial || 0,
    ordem: i,
  }));

  mutar((e) => {
    e.contas = contas;
    e.configurado = true;
  }, [
    ...enviarContas(contas),
    // As categorias iniciais existem só em memória até aqui; no primeiro
    // acesso com conta, elas precisam nascer no servidor também.
    ...enviarCategorias(estado.categorias),
  ]);
}

export function salvarConta(dados) {
  let salva;
  mutar((e) => {
    if (dados.id) {
      const alvo = e.contas.find((c) => c.id === dados.id);
      if (alvo) Object.assign(alvo, dados);
      salva = alvo;
    } else {
      salva = {
        id: id(),
        nome: dados.nome,
        cor: dados.cor || CORES_CONTA[e.contas.length % CORES_CONTA.length].id,
        tipo: tipoValido(dados.tipo),
        saldoInicial: dados.saldoInicial || 0,
        ordem: e.contas.length,
      };
      e.contas.push(salva);
    }
  }, () => enviarContas([salva]));
}

/** Só remove conta sem lançamento — apagar em cascata perderia histórico. */
export function podeRemoverConta(contaId) {
  return !estado.lancamentos.some(
    (l) => l.contaId === contaId || l.contaDestinoId === contaId
  );
}

export function removerConta(contaId) {
  if (!podeRemoverConta(contaId)) return false;
  mutar((e) => { e.contas = e.contas.filter((c) => c.id !== contaId); },
    apagar('contas', `id=eq.${contaId}`));
  return true;
}

/* ----------------------------- categorias ------------------------------ */

export function salvarCategoria(dados) {
  let salva;
  mutar((e) => {
    if (dados.id) {
      const alvo = e.categorias.find((c) => c.id === dados.id);
      if (alvo) Object.assign(alvo, dados);
      salva = alvo;
    } else {
      salva = { id: id(), nome: dados.nome, tipo: dados.tipo || 'saida', natureza: dados.natureza || 'frequente' };
      e.categorias.push(salva);
    }
  }, () => enviarCategorias([salva]));
}

export function podeRemoverCategoria(categoriaId) {
  return !estado.lancamentos.some((l) => l.categoriaId === categoriaId);
}

export function removerCategoria(categoriaId) {
  if (!podeRemoverCategoria(categoriaId)) return false;
  mutar((e) => { e.categorias = e.categorias.filter((c) => c.id !== categoriaId); },
    apagar('categorias', `id=eq.${categoriaId}`));
  return true;
}

/* ---------------------------- lançamentos ------------------------------ */

/**
 * tipo: 'saida' | 'entrada' | 'transferencia'
 * valor: centavos, sempre positivo (o sinal quem dá é o tipo)
 * transferência usa contaId (de onde sai) + contaDestinoId (onde entra)
 */
export function salvarLancamento(dados) {
  let salvo;
  mutar((e) => {
    if (dados.id) {
      const alvo = e.lancamentos.find((l) => l.id === dados.id);
      if (alvo) Object.assign(alvo, dados, {
        valor: Math.abs(dados.valor || 0),
        editadoEm: new Date().toISOString(),
      });
      salvo = alvo;
    } else {
      salvo = {
        id: id(),
        criadoEm: new Date().toISOString(),
        ...dados,
        valor: Math.abs(dados.valor || 0),
      };
      e.lancamentos.push(salvo);
    }
  }, () => enviarLancamentos([salvo]));
}

/**
 * Grava várias parcelas de uma vez. Existe para a compra parcelada ser uma
 * gravação só: se cada parcela fosse salva sozinha, seriam N escritas em
 * disco e N redesenhos de tela para um único ato do usuário.
 */
export function salvarParcelas(lista) {
  const grupo = id();
  const parcelas = lista.map((dados, i) => ({
    id: id(),
    criadoEm: new Date().toISOString(),
    ...dados,
    valor: Math.abs(dados.valor || 0),
    grupo,
    parcela: i + 1,
    parcelasTotal: lista.length,
  }));

  mutar((e) => { e.lancamentos.push(...parcelas); }, enviarLancamentos(parcelas));
  return grupo;
}

export function removerLancamento(lancamentoId) {
  mutar((e) => { e.lancamentos = e.lancamentos.filter((l) => l.id !== lancamentoId); },
    apagar('lancamentos', `id=eq.${lancamentoId}`));
}

/** Apaga a compra parcelada inteira, incluindo as parcelas futuras. */
export function removerGrupo(grupo) {
  mutar((e) => { e.lancamentos = e.lancamentos.filter((l) => l.grupo !== grupo); },
    apagar('lancamentos', `grupo=eq.${grupo}`));
}

export function parcelasDoGrupo(grupo) {
  return grupo ? estado.lancamentos.filter((l) => l.grupo === grupo) : [];
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

/**
 * ACRESCENTA lançamentos vindos de um arquivo, sem apagar nada.
 *
 * É diferente de restaurar um backup, que substitui tudo. Serve para trazer
 * histórico de fora — uma planilha antiga, por exemplo — para dentro do que
 * já existe.
 *
 * Os bancos vêm pelo NOME, não por identificador: um arquivo escrito fora do
 * app não teria como saber os ids daqui. Nome que não existe vira conta nova,
 * e a resposta diz quais foram criadas, para não haver surpresa silenciosa.
 */
export function adicionarLancamentos(lista) {
  const semAcento = (t) => String(t || '').normalize('NFD')
    .replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  const novasContas = [];
  const novos = [];
  const agora = new Date().toISOString();

  for (const item of lista) {
    const procurado = semAcento(item.banco);
    let conta = estado.contas.find((c) => semAcento(c.nome) === procurado)
      || novasContas.find((c) => semAcento(c.nome) === procurado);

    if (!conta) {
      const posicao = estado.contas.length + novasContas.length;
      conta = {
        id: id(),
        nome: String(item.banco || 'Sem banco').trim(),
        cor: CORES_CONTA[posicao % CORES_CONTA.length].id,
        // "Cartão BB" vira cartão sozinho: é o que o nome está dizendo.
        tipo: /cart[aã]o/i.test(item.banco || '') ? 'cartao' : 'conta',
        saldoInicial: 0,
        ordem: posicao,
      };
      novasContas.push(conta);
    }

    novos.push({
      id: id(),
      criadoEm: agora,
      data: item.data,
      tipo: item.tipo === 'entrada' ? 'entrada' : 'saida',
      valor: Math.abs(item.valor || 0),
      contaId: conta.id,
      contaDestinoId: null,
      categoriaId: null,
      descricao: item.descricao || '',
    });
  }

  mutar((e) => {
    e.contas.push(...novasContas);
    e.lancamentos.push(...novos);
    e.configurado = true;
  }, () => [
    // As contas sobem antes: o banco recusa um lançamento que aponte para
    // uma conta que ainda não existe lá.
    ...(novasContas.length ? enviarContas(novasContas) : []),
    ...enviarLancamentos(novos),
  ]);

  return { lancamentos: novos.length, contasCriadas: novasContas.map((c) => c.nome) };
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
  const pronto = mapear.renomearIds(migrar(dados), id);

  mutar((e) => {
    e.versao = pronto.versao;
    e.configurado = true;
    e.contas = pronto.contas;
    e.categorias = pronto.categorias;
    e.lancamentos = pronto.lancamentos;
  }, [
    // Restaurar é substituir: o que havia no servidor sai antes de o
    // arquivo entrar, senão sobrariam lançamentos antigos misturados.
    ...apagar('lancamentos', `usuario=eq.${usuarioId}`),
    ...apagar('contas', `usuario=eq.${usuarioId}`),
    ...apagar('categorias', `usuario=eq.${usuarioId}`),
    ...enviarCategorias(pronto.categorias),
    ...enviarContas(pronto.contas),
    ...enviarLancamentos(pronto.lancamentos),
  ]);
  return { ok: true, total: estado.lancamentos.length };
}


export function apagarTudo() {
  mutar((e) => Object.assign(e, estadoVazio()), [
    ...apagar('lancamentos', `usuario=eq.${usuarioId}`),
    ...apagar('contas', `usuario=eq.${usuarioId}`),
    ...apagar('categorias', `usuario=eq.${usuarioId}`),
  ]);
}
