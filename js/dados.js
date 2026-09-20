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
import { simplificar } from './formato.js';

const CHAVE = 'caderneta.v1';
const VERSAO = 1;

/**
 * Cores de identidade das contas. Cor aqui SIGNIFICA de qual banco é o
 * dinheiro — não é decoração.
 *
 * Cada cor é o NOME de uma variável do CSS, não um código fixo. É isso que
 * permite ela ter uma versão para o tema claro e outra para o escuro: um
 * amarelo claro some no branco, e um roxo escuro some no preto. As duas
 * versões estão em css/styles.css, junto das outras cores do app.
 *
 * Verde e vermelho continuam fora da lista, de propósito: no app inteiro
 * eles já querem dizer "entrou" e "saiu".
 */
export const CORES_CONTA = [
  { id: 'amarelo', nome: 'Amarelo' },
  { id: 'azul', nome: 'Azul' },
  { id: 'laranja', nome: 'Laranja' },
  { id: 'roxo', nome: 'Roxo escuro' },
  { id: 'roxo-claro', nome: 'Roxo claro' },
  { id: 'turquesa', nome: 'Turquesa' },
  { id: 'magenta', nome: 'Magenta' },
  { id: 'ardosia', nome: 'Ardósia' },
];

/* Contas criadas antes desta lista guardaram nomes que não existem mais.
   Traduzir é mais seguro que renomear no banco de todo mundo. */
const APELIDOS = { ambar: 'amarelo', petroleo: 'turquesa' };

export function corValida(id) {
  const traduzido = APELIDOS[id] || id;
  return CORES_CONTA.some((c) => c.id === traduzido) ? traduzido : 'azul';
}

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

/** "Itaú" e "itau" são o mesmo banco para quem digita. */
const semAcento = simplificar;

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
    recorrentes: [],
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
  pronto.recorrentes = Array.isArray(dados.recorrentes) ? dados.recorrentes : [];
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

  const [contas, categorias, lancamentos, recorrentes] = await Promise.all([
    servidor.listar('contas', 'select=*&order=ordem'),
    servidor.listar('categorias', 'select=*&order=nome'),
    servidor.listar('lancamentos', 'select=*&order=data.desc'),
    servidor.listar('recorrentes', 'select=*&order=dia'),
  ]);

  const doServidor = mapear.estadoParaApp({ contas, categorias, lancamentos, recorrentes });

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

const enviarRecorrentes = (lista) =>
  [{ op: 'upsert', tabela: 'recorrentes', linhas: lista.map((r) => mapear.recorrenteParaBanco(r, usuarioId)) }];

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

/**
 * O dia do mês em que a fatura é debitada. Preso entre 1 e 28 porque dia 29,
 * 30 ou 31 não existe em todo mês — e um lembrete que some em fevereiro é
 * pior que um lembrete com data aproximada.
 */
function diaValido(dia) {
  const n = Math.round(Number(dia));
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 28) : 10;
}

export function salvarConta(dados) {
  let salva;
  mutar((e) => {
    if (dados.id) {
      const alvo = e.contas.find((c) => c.id === dados.id);
      if (alvo) Object.assign(alvo, dados, { diaVencimento: diaValido(dados.diaVencimento) });
      salva = alvo;
    } else {
      salva = {
        id: id(),
        nome: dados.nome,
        cor: corValida(dados.cor || CORES_CONTA[e.contas.length % CORES_CONTA.length].id),
        tipo: tipoValido(dados.tipo),
        saldoInicial: dados.saldoInicial || 0,
        diaVencimento: diaValido(dados.diaVencimento),
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

/* --------------------- gastos que se repetem --------------------------- */

/**
 * Um gasto (ou entrada) que volta todo mês no mesmo dia: assinatura, curso
 * mensal, mesada.
 *
 * O que ele NÃO é: compra parcelada. Parcela tem fim e valor já dividido, e
 * para isso existe o campo "parcelas" do lançamento. Misturar os dois faria
 * o Spotify acabar na 12ª vez, ou o curso cobrar para sempre.
 *
 * `desde` guarda o mês do cadastro e não muda numa edição: é o que impede o
 * app de oferecer meses passados que a pessoa já lançou de outro jeito.
 */
export function salvarRecorrente(dados) {
  let salvo;
  mutar((e) => {
    if (dados.id) {
      const alvo = e.recorrentes.find((r) => r.id === dados.id);
      if (alvo) Object.assign(alvo, dados, { dia: diaDoMes(dados.dia), desde: alvo.desde });
      salvo = alvo;
    } else {
      salvo = {
        id: id(),
        descricao: String(dados.descricao || '').trim(),
        valor: Math.abs(dados.valor || 0),
        dia: diaDoMes(dados.dia),
        tipo: dados.tipo === 'entrada' ? 'entrada' : 'saida',
        contaId: dados.contaId || null,
        categoriaId: dados.categoriaId || null,
        natureza: dados.natureza || null,
        desde: dados.desde || chaveDoMesDeHoje(),
        ativo: true,
      };
      e.recorrentes.push(salvo);
    }
  }, () => (salvo ? enviarRecorrentes([salvo]) : []));
  return salvo;
}

/** Entre 1 e 31; qual mês tem esse dia, quem resolve é o cálculo. */
function diaDoMes(dia) {
  const n = Math.round(Number(dia));
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 31) : 1;
}

function chaveDoMesDeHoje() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0')].join('-');
}

export function recorrente(recorrenteId) {
  return estado.recorrentes.find((r) => r.id === recorrenteId) || null;
}

/**
 * Apagar o cadastro NÃO apaga os lançamentos que já saíram dele: aquele
 * dinheiro saiu de verdade, e sumir com ele mudaria saldos do passado.
 */
export function removerRecorrente(recorrenteId) {
  mutar((e) => { e.recorrentes = e.recorrentes.filter((r) => r.id !== recorrenteId); },
    apagar('recorrentes', 'id=eq.' + recorrenteId));
}

/**
 * Transforma os pendentes do mês em lançamentos de verdade.
 *
 * Recebe o que `calculos.recorrentesPendentes` devolveu — cada item já traz a
 * data certa daquele mês — e marca cada lançamento com `recorrenteId`, que é
 * como o aviso sabe, no mês seguinte, o que já foi feito.
 */
export function lancarRecorrentes(pendentes) {
  const agora = new Date().toISOString();
  const novos = pendentes.map(({ recorrente: r, data }) => ({
    id: id(),
    criadoEm: agora,
    data,
    tipo: r.tipo === 'entrada' ? 'entrada' : 'saida',
    valor: Math.abs(r.valor || 0),
    contaId: r.contaId,
    contaDestinoId: null,
    categoriaId: r.categoriaId || null,
    descricao: r.descricao || '',
    natureza: r.natureza || null,
    recorrenteId: r.id,
  }));

  if (!novos.length) return 0;
  mutar((e) => { e.lancamentos.push(...novos); }, enviarLancamentos(novos));
  return novos.length;
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
export function adicionarLancamentos(lista, contasPedidas = []) {
  const novasContas = [];
  const ajustadas = [];
  const novos = [];
  const agora = new Date().toISOString();

  /* O arquivo pode trazer as contas descritas — com tipo e saldo inicial.
     É o que permite criar a caixinha já com o valor guardado e acertar o
     ponto de partida de cada banco sem ninguém digitar número nenhum. */
  for (const pedida of contasPedidas) {
    const procurado = semAcento(pedida.nome);
    const existente = estado.contas.find((c) => semAcento(c.nome) === procurado);
    if (existente) {
      const mudancas = {};
      if (pedida.saldoInicial !== undefined && pedida.saldoInicial !== existente.saldoInicial) {
        mudancas.saldoInicial = pedida.saldoInicial;
      }
      if (pedida.cor && corValida(pedida.cor) !== existente.cor) {
        mudancas.cor = corValida(pedida.cor);
      }
      if (Object.keys(mudancas).length) ajustadas.push({ ...existente, ...mudancas });
      continue;
    }
    const posicao = estado.contas.length + novasContas.length;
    novasContas.push({
      id: id(),
      nome: String(pedida.nome).trim(),
      cor: corValida(pedida.cor || CORES_CONTA[posicao % CORES_CONTA.length].id),
      tipo: pedida.tipo === 'cartao' || pedida.tipo === 'reserva' ? pedida.tipo : 'conta',
      saldoInicial: pedida.saldoInicial || 0,
      ordem: posicao,
    });
  }

  /* Acha a conta pelo nome, criando se for preciso. Vive aqui dentro porque
     depende das contas que este mesmo laço acabou de criar. */
  const acharOuCriar = (nome) => {
    const procurado = semAcento(nome);
    const achada = estado.contas.find((c) => semAcento(c.nome) === procurado)
      || novasContas.find((c) => semAcento(c.nome) === procurado);
    if (achada) return achada;

    const posicao = estado.contas.length + novasContas.length;
    const nova = {
      id: id(),
      nome: String(nome || 'Sem banco').trim(),
      cor: CORES_CONTA[posicao % CORES_CONTA.length].id,
      tipo: /cart[aã]o/i.test(nome || '') ? 'cartao' : 'conta',
      saldoInicial: 0,
      ordem: posicao,
    };
    novasContas.push(nova);
    return nova;
  };

  for (const item of lista) {
    const conta = acharOuCriar(item.banco);
    // Pagar a fatura é transferência, não gasto: o arquivo diz para onde o
    // dinheiro foi, e sem isso o mesmo valor seria contado duas vezes — uma
    // nas compras do cartão, outra na saída do banco.
    const ehTransferencia = item.tipo === 'transferencia' && item.bancoDestino;
    const destino = ehTransferencia ? acharOuCriar(item.bancoDestino) : null;

    novos.push({
      id: id(),
      criadoEm: agora,
      data: item.data,
      tipo: ehTransferencia ? 'transferencia' : (item.tipo === 'entrada' ? 'entrada' : 'saida'),
      valor: Math.abs(item.valor || 0),
      contaId: conta.id,
      contaDestinoId: destino ? destino.id : null,
      categoriaId: null,
      descricao: item.descricao || '',
      // Só o cartão usa; em banco fica nulo.
      natureza: item.natureza === 'corrente' || item.natureza === 'esporadico' ? item.natureza : null,
    });
  }

  mutar((e) => {
    e.contas.push(...novasContas);
    for (const a of ajustadas) {
      const alvo = e.contas.find((c) => c.id === a.id);
      if (alvo) Object.assign(alvo, a);
    }
    e.lancamentos.push(...novos);
    e.configurado = true;
  }, () => [
    // As contas sobem antes: o banco recusa um lançamento que aponte para
    // uma conta que ainda não existe lá.
    ...(novasContas.length || ajustadas.length ? enviarContas([...novasContas, ...ajustadas]) : []),
    ...enviarLancamentos(novos),
  ]);

  return {
    lancamentos: novos.length,
    contasCriadas: novasContas.map((c) => c.nome),
    contasAjustadas: ajustadas.map((c) => c.nome),
  };
}

/**
 * Muda a data de lançamentos que já existem.
 *
 * Existe por um caso concreto e recorrente: a fatura do cartão que chega em
 * setembro é de compras feitas em agosto. Lançadas em setembro, elas mentem
 * sobre os dois meses — incham um e esvaziam o outro. Corrigir quinze datas
 * à mão no celular ninguém faz.
 *
 * A regra é deliberadamente estreita — data exata, banco e tipo — para não
 * pegar nada além do que foi pedido.
 */
export function moverLancamentos(regras) {
  const movidos = [];

  mutar((e) => {
    for (const regra of regras) {
      const conta = e.contas.find((c) => semAcento(c.nome) === semAcento(regra.banco));
      if (!conta) continue;

      for (const l of e.lancamentos) {
        if (l.data !== regra.de) continue;
        if (l.contaId !== conta.id) continue;
        if (regra.tipo && l.tipo !== regra.tipo) continue;
        l.data = regra.para;
        movidos.push(l);
      }
    }
  }, () => (movidos.length ? enviarLancamentos(movidos) : []));

  return { movidos: movidos.length };
}

/** Quantos lançamentos uma regra pegaria — para poder avisar antes. */
export function contarParaMover(regras) {
  return regras.reduce((total, regra) => {
    const conta = estado.contas.find((c) => semAcento(c.nome) === semAcento(regra.banco));
    if (!conta) return total;
    return total + estado.lancamentos.filter((l) => l.data === regra.de
      && l.contaId === conta.id
      && (!regra.tipo || l.tipo === regra.tipo)).length;
  }, 0);
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
