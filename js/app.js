/* =========================================================================
   Amarração: guarda "que mês estou vendo", abre os diálogos, escuta botões
   e manda redesenhar. A regra de dependência é de mão única —

       app.js  ->  telas.js  ->  calculos.js / formato.js
       app.js  ->  dados.js

   cálculo nunca conhece tela, tela nunca grava dado.
   ========================================================================= */

import * as dados from './dados.js';
import * as fmt from './formato.js';
import * as telas from './telas.js';
import * as conta from './conta.js';
import * as tranca from './tranca.js';
import * as tema from './tema.js';
import { interpretar, explicar, atalhosFrequentes } from './interpretar.js';
import { el, trocar, hexDaConta, recado, baixarArquivo, nomeComData } from './ui.js';
import { VERSAO_APP } from './configuracao.js';

const hoje = fmt.hojeISO();
const visao = {
  ano: Number(hoje.slice(0, 4)),
  mes: Number(hoje.slice(5, 7)),
  tela: 'extrato',
  filtroContaId: null,
};

const $ = (id) => document.getElementById(id);

/* ============================= arranque ================================ */

async function iniciar() {
  // Antes de tudo: sem isso a tela pisca clara antes de escurecer.
  tema.iniciar();

  dados.carregar();
  dados.assinar(() => pintar());
  dados.definirAvisoDeFalha((erro) => recado(`O servidor recusou uma alteração: ${erro.message}`));

  tranca.iniciar({
    aoAbrir: () => mostrarTelaCerta(),
    aoSair: {
      temConta: () => dados.modoAtual() === 'servidor',
      sair: () => conta.sair(),
    },
  });

  ligarBoasVindas();
  ligarNavegacao();
  ligarLancamentoRapido();
  ligarDialogoLancamento();
  ligarDialogoConta();
  ligarAjustes();
  registrarServiceWorker();

  // Quando a internet volta, o que ficou na fila sobe sozinho.
  window.addEventListener('online', () => {
    dados.tentarEscoar();
    mostrarEstadoDoEnvio();
  });
  window.addEventListener('offline', mostrarEstadoDoEnvio);

  try {
    mostrarTelaCerta(await conta.iniciar(mostrarTelaCerta));
  } catch (erro) {
    // Falhar ao falar com o servidor não pode deixar a pessoa sem app.
    console.error(erro);
    mostrarTelaCerta(dados.obter().configurado ? 'local' : 'deslogado');
  }
}

/**
 * Decide qual das quatro telas de topo aparece. Chamada no arranque e sempre
 * que a situação da conta muda (entrar, sair, ser liberado).
 *
 *   'deslogado' -> entrar ou criar conta
 *   'pendente'  -> esperando liberação
 *   'local'     -> sem conta, só neste aparelho
 *   'aprovado'  -> conta liberada, sincronizando
 */
let situacaoDaConta = 'local';

function mostrarTelaCerta(situacao) {
  if (situacao) situacaoDaConta = situacao;

  const estado = dados.obter();
  const temBancos = estado.configurado && estado.contas.length > 0;

  // A tranca vem antes de tudo: nenhuma outra tela aparece atrás dela.
  const naTranca = tranca.estaTrancado();
  $('tela-tranca').hidden = !naTranca;

  const entrada = !naTranca && situacaoDaConta === 'deslogado';
  const pendente = !naTranca && situacaoDaConta === 'pendente';
  const usandoApp = !naTranca && !entrada && !pendente;

  $('tela-entrada').hidden = !entrada;
  $('tela-pendente').hidden = !pendente;
  $('boas-vindas').hidden = !(usandoApp && !temBancos);
  $('app').hidden = !(usandoApp && temBancos);

  if (naTranca) tranca.pintar();
  else if (usandoApp && temBancos) pintar();
  else if (usandoApp) montarCamposBancos();
}

/* ========================== primeiro acesso ============================ */

/* Os bancos do dono do app já vêm escritos: no celular, digitar três nomes
   é justamente o atrito que faz alguém desistir na primeira tela. São
   valores comuns de campo, não fixos — dá para apagar, trocar e adicionar. */
const BANCOS_SUGERIDOS = ['Banco do Brasil', 'Nubank', 'Itaú'];

function montarCamposBancos(quantidade = 3) {
  const alvo = $('campos-bancos');
  const atuais = [...alvo.querySelectorAll('input')].map((i) => i.value);

  trocar(alvo, Array.from({ length: quantidade }, (_, i) => {
    const cor = dados.CORES_CONTA[i % dados.CORES_CONTA.length];
    return el('div', { class: 'banco-inicial' }, [
      el('span', { class: 'banco-inicial__cor', estilo: { background: cor.hex } }),
      el('input', {
        type: 'text',
        placeholder: `Nome do ${i + 1}º banco`,
        maxlength: '28',
        'aria-label': `Nome do banco ${i + 1}`,
        value: atuais[i] ?? BANCOS_SUGERIDOS[i] ?? '',
        'data-campo': 'nome',
      }),
      el('input', {
        type: 'text',
        inputmode: 'decimal',
        placeholder: 'Saldo hoje',
        'aria-label': `Saldo atual do banco ${i + 1}`,
        'data-campo': 'saldo',
      }),
    ]);
  }));

  alvo.querySelectorAll('[data-campo="saldo"]').forEach(aplicarMascaraDeValor);
}

function ligarBoasVindas() {
  $('mais-banco').addEventListener('click', () => {
    montarCamposBancos($('campos-bancos').children.length + 1);
  });

  $('restaurar-backup').addEventListener('click', () => $('arquivo-backup').click());

  $('form-boas-vindas').addEventListener('submit', (evento) => {
    evento.preventDefault();
    const linhas = [...$('campos-bancos').children]
      .map((linha, i) => ({
        nome: linha.querySelector('[data-campo="nome"]').value.trim(),
        saldoInicial: fmt.paraCentavos(linha.querySelector('[data-campo="saldo"]').value),
        cor: dados.CORES_CONTA[i % dados.CORES_CONTA.length].id,
      }))
      .filter((c) => c.nome);

    if (!linhas.length) {
      recado('Dê um nome a pelo menos um banco.');
      return;
    }

    dados.definirContasIniciais(linhas);
    mostrarTelaCerta();
    recado('Pronto. Agora é só lançar.');
  });
}

/* ============================ navegação ================================ */

function ligarNavegacao() {
  $('mes-anterior').addEventListener('click', () => mudarMes(-1));
  $('mes-proximo').addEventListener('click', () => mudarMes(1));
  $('ir-para-hoje').addEventListener('click', () => {
    visao.ano = Number(hoje.slice(0, 4));
    visao.mes = Number(hoje.slice(5, 7));
    pintar();
  });

  document.querySelectorAll('.aba').forEach((aba) => {
    aba.addEventListener('click', () => {
      visao.tela = aba.dataset.tela;
      document.querySelectorAll('.aba').forEach((outra) => {
        const ativa = outra === aba;
        outra.classList.toggle('aba--ativa', ativa);
        if (ativa) outra.setAttribute('aria-current', 'page');
        else outra.removeAttribute('aria-current');
      });
      pintar();
      window.scrollTo({ top: 0 });
    });
  });

  $('botao-lancar').addEventListener('click', () => abrirLancamento(null));
}

function mudarMes(passo) {
  Object.assign(visao, fmt.deslocarMes(visao.ano, visao.mes, passo));
  pintar();
}

/* ============================= pintura ================================= */

function pintar() {
  const estado = dados.obter();
  if (!estado.configurado || !estado.contas.length) return;

  $('rotulo-mes').textContent = fmt.mesPorExtenso(visao.ano, visao.mes);
  const mesCorrente = `${visao.ano}-${String(visao.mes).padStart(2, '0')}` === fmt.chaveMes(hoje);
  $('ir-para-hoje').hidden = mesCorrente;

  $('tela-extrato').hidden = visao.tela !== 'extrato';
  $('tela-resumo').hidden = visao.tela !== 'resumo';
  $('tela-ajustes').hidden = visao.tela !== 'ajustes';
  $('botao-lancar').hidden = visao.tela === 'ajustes';
  mostrarEstadoDoEnvio();

  const contexto = {
    ano: visao.ano,
    mes: visao.mes,
    filtroContaId: visao.filtroContaId,
    aoFiltrar: (id) => { visao.filtroContaId = id; pintar(); },
    aoTocarConta: (id) => { visao.filtroContaId = visao.filtroContaId === id ? null : id; pintar(); },
    aoTocarLancamento: (id) => abrirLancamento(id),
    aoEditarConta: (id) => abrirConta(id),
    aoEditarCategoria: (id) => editarCategoria(id),
  };

  if (visao.tela === 'extrato') {
    telas.pintarSaldos(estado, contexto);
    telas.pintarFiltro(estado, contexto);
    telas.pintarExtrato(estado, contexto);
  } else if (visao.tela === 'resumo') {
    telas.pintarResumo(estado, contexto);
  } else {
    telas.pintarAjustes(estado, contexto);
    pintarAvisoDeBackup(estado);
    pintarBotoesDaTranca();
    $('versao-app').textContent = `Caderneta · versão de ${VERSAO_APP}`;
    conta.pintarAjustes();
  }
}

/**
 * Aviso discreto na barra do mês sobre o que ainda não subiu. Fica pequeno
 * de propósito: o lançamento já está salvo no aparelho, então isto é
 * informação de fundo — não um erro que peça ação.
 */
function mostrarEstadoDoEnvio() {
  const caixa = $('estado-envio');
  if (dados.modoAtual() !== 'servidor') {
    caixa.hidden = true;
    return;
  }

  const pendentes = dados.enviosPendentes();
  if (!navigator.onLine) {
    caixa.textContent = pendentes
      ? `Sem internet · ${pendentes} para enviar`
      : 'Sem internet · seus dados estão salvos aqui';
  } else if (pendentes) {
    caixa.textContent = `Enviando ${pendentes}…`;
  } else {
    caixa.hidden = true;
    return;
  }
  caixa.hidden = false;
}

/* ========================= lançar escrevendo =========================== */

/** O que o interpretador precisa saber do estado atual. */
function contextoDeLeitura() {
  return {
    contas: dados.obter().contas,
    categorias: dados.obter().categorias,
    hoje,
  };
}

/** Banco usado quando a frase não cita nenhum: o que está filtrado na tela,
 *  senão o primeiro banco cadastrado. Cartão não é padrão — a maior parte
 *  dos gastos do dia a dia sai da conta, não do crédito. */
function contaPadrao() {
  if (visao.filtroContaId) return visao.filtroContaId;
  const contas = dados.obter().contas;
  const banco = contas.find((c) => !dados.ehCartao(c));
  return (banco || contas[0] || {}).id || null;
}

function ligarLancamentoRapido() {
  const campo = $('texto-rapido');
  const leitura = $('leitura-rapida');

  campo.addEventListener('input', () => {
    $('dica-rapida').hidden = Boolean(campo.value.trim());
    if (!campo.value.trim()) {
      leitura.hidden = true;
      return;
    }
    const lido = interpretar(campo.value, contextoDeLeitura());
    leitura.classList.toggle('rapido__leitura--erro', !lido.entendido);
    leitura.textContent = lido.entendido
      ? `${fmt.moeda(lido.valor)} · ${explicar({ ...lido, contaId: lido.contaId || contaPadrao() }, contextoDeLeitura())}`
      : 'Falta o valor. Escreva, por exemplo: mercado 45';
    leitura.hidden = false;
  });

  $('lancamento-rapido').addEventListener('submit', (evento) => {
    evento.preventDefault();
    const lido = interpretar(campo.value, contextoDeLeitura());

    if (!lido.entendido) {
      recado('Escreva um valor. Por exemplo: mercado 45');
      campo.focus();
      return;
    }

    dados.salvarLancamento({
      tipo: lido.tipo,
      valor: lido.valor,
      data: lido.data,
      contaId: lido.contaId || contaPadrao(),
      categoriaId: lido.categoriaId,
      descricao: lido.descricao,
    });

    campo.value = '';
    leitura.hidden = true;
    $('dica-rapida').hidden = false;
    recado(`${lido.tipo === 'entrada' ? 'Entrada' : 'Gasto'} de ${fmt.moeda(lido.valor)} lançado.`);
  });
}

/* ======================= diálogo de lançamento ========================= */

let tipoEmEdicao = 'saida';
let naturezaEmEdicao = 'esporadico';

function ligarDialogoLancamento() {
  const dialogo = $('dialogo-lancamento');

  dialogo.querySelectorAll('[data-fechar]').forEach((b) =>
    b.addEventListener('click', () => dialogo.close()));

  dialogo.querySelectorAll('.segmento').forEach((botao) => {
    botao.addEventListener('click', () => {
      tipoEmEdicao = botao.dataset.tipo;
      aplicarTipo(dialogo);
    });
  });

  dialogo.querySelectorAll('[data-natureza]').forEach((botao) => {
    botao.addEventListener('click', () => {
      naturezaEmEdicao = botao.dataset.natureza;
      pintarNatureza();
    });
  });
  $('lancamento-conta').addEventListener('change', mostrarNaturezaSePrecisar);

  aplicarMascaraDeValor($('lancamento-valor'));

  trocar($('lancamento-parcelas'), Array.from({ length: 24 }, (_, i) => el('option', {
    value: String(i + 1),
    texto: i === 0 ? 'À vista' : `${i + 1}x`,
  })));

  $('dialogo-lancamento').querySelectorAll('.botao-data').forEach((botao) => {
    botao.addEventListener('click', () => {
      $('lancamento-data').value = fmt.somarDias(hoje, Number(botao.dataset.dia));
      pintarAtalhosDeData();
      mostrarContaDasParcelas();
    });
  });
  $('lancamento-data').addEventListener('change', pintarAtalhosDeData);

  $('lancamento-parcelas').addEventListener('change', mostrarContaDasParcelas);
  $('lancamento-valor').addEventListener('input', mostrarContaDasParcelas);
  $('lancamento-data').addEventListener('change', mostrarContaDasParcelas);

  // Trocar o banco de origem não pode deixar os dois lados iguais.
  $('lancamento-conta').addEventListener('change', () => {
    if (tipoEmEdicao === 'transferencia') garantirDestinoDiferente();
  });

  $('excluir-lancamento').addEventListener('click', () => {
    const id = $('lancamento-id').value;
    if (!id) return;
    const alvo = dados.lancamento(id);

    // Numa compra parcelada, apagar uma parcela só deixaria a compra pela
    // metade e o total errado. Apaga a compra inteira, dizendo isso.
    if (alvo && alvo.grupo && alvo.parcelasTotal > 1) {
      if (!confirm(`Isto apaga as ${alvo.parcelasTotal} parcelas desta compra, inclusive as que ainda vão vencer. Continuar?`)) return;
      dados.removerGrupo(alvo.grupo);
      dialogo.close();
      recado('Compra parcelada excluída.');
      return;
    }

    if (!confirm('Excluir este lançamento? Não dá para desfazer.')) return;
    dados.removerLancamento(id);
    dialogo.close();
    recado('Lançamento excluído.');
  });

  $('form-lancamento').addEventListener('submit', (evento) => {
    const valor = fmt.paraCentavos($('lancamento-valor').value);

    if (valor <= 0) {
      evento.preventDefault();
      recado('Informe um valor maior que zero.');
      $('lancamento-valor').focus();
      return;
    }

    const contaId = $('lancamento-conta').value;
    const destinoId = $('lancamento-destino').value;

    if (tipoEmEdicao === 'transferencia' && contaId === destinoId) {
      evento.preventDefault();
      recado('Escolha dois bancos diferentes.');
      return;
    }

    const registro = {
      id: $('lancamento-id').value || undefined,
      tipo: tipoEmEdicao,
      valor,
      data: $('lancamento-data').value,
      contaId,
      descricao: $('lancamento-descricao').value.trim(),
    };

    if (tipoEmEdicao === 'transferencia') {
      registro.contaDestinoId = destinoId;
      registro.categoriaId = null;
    } else {
      registro.contaDestinoId = null;
      registro.categoriaId = $('lancamento-categoria').value || null;
      // Só faz sentido guardar no cartão; em banco o campo fica vazio.
      registro.natureza = dados.ehCartao(dados.conta(contaId)) ? naturezaEmEdicao : null;
    }

    const vezes = Number($('lancamento-parcelas').value || 1);

    if (!registro.id && tipoEmEdicao === 'saida' && vezes > 1) {
      // Uma parcela por mês, a partir da data da compra. Cada uma é um
      // lançamento de verdade, com a sua própria data — é isso que faz cada
      // mês mostrar só o que vence nele, sem nenhuma conta especial depois.
      dados.salvarParcelas(fmt.dividirEmParcelas(valor, vezes).map((parte, i) => ({
        ...registro,
        id: undefined,
        valor: parte,
        data: fmt.somarMeses(registro.data, i),
      })));
      recado(`Lançado em ${vezes} parcelas.`);
      return;
    }

    dados.salvarLancamento(registro);
    recado(registro.id ? 'Lançamento atualizado.' : 'Lançado.');
  });
}

function aplicarTipo(dialogo) {
  dialogo.querySelectorAll('.segmento').forEach((b) =>
    b.classList.toggle('segmento--ativo', b.dataset.tipo === tipoEmEdicao));

  const transferencia = tipoEmEdicao === 'transferencia';
  $('campo-destino').hidden = !transferencia;
  $('campo-categoria').hidden = transferencia;
  $('rotulo-conta').textContent = transferencia ? 'De onde sai' : 'Banco ou cartão';

  // Parcelar só faz sentido em gasto, e só ao criar: editar uma parcela mexe
  // naquela parcela, não redivide a compra inteira.
  const editando = Boolean($('lancamento-id').value);
  $('campo-parcelas').hidden = tipoEmEdicao !== 'saida' || editando;
  if ($('campo-parcelas').hidden) $('ajuda-parcelas').hidden = true;
  else mostrarContaDasParcelas();

  pintarAtalhos(editando);
  mostrarNaturezaSePrecisar();

  // Transferir de um banco para ele mesmo não existe, e o app recusaria na
  // hora de salvar. Então já abre apontando para outro banco.
  if (transferencia) garantirDestinoDiferente();

  preencherCategorias(transferencia ? 'saida' : tipoEmEdicao);
}

/**
 * Mostra a conta feita antes de salvar: quanto fica cada parcela e quando cai
 * a última. Parcelamento é justamente onde a pessoa quer conferir a conta
 * antes de confirmar — e onde o centavo da divisão aparece.
 */
function mostrarContaDasParcelas() {
  const aviso = $('ajuda-parcelas');
  const vezes = Number($('lancamento-parcelas').value || 1);
  const total = fmt.paraCentavos($('lancamento-valor').value);
  const data = $('lancamento-data').value;

  if (vezes < 2 || total <= 0 || !data) {
    aviso.hidden = true;
    return;
  }

  const parcelas = fmt.dividirEmParcelas(total, vezes);
  const primeira = fmt.moeda(parcelas[0]);
  const demais = fmt.moeda(parcelas[vezes - 1]);
  const ultimaData = fmt.somarMeses(data, vezes - 1);

  aviso.textContent = parcelas[0] === parcelas[vezes - 1]
    ? `${vezes} parcelas de ${primeira}. A última cai em ${fmt.dataCurta(ultimaData)}/${ultimaData.slice(0, 4)}.`
    : `1ª de ${primeira} e as outras ${vezes - 1} de ${demais}. A última cai em ${fmt.dataCurta(ultimaData)}/${ultimaData.slice(0, 4)}.`;
  aviso.hidden = false;
}

/** Marca qual dos atalhos corresponde à data escolhida, inclusive quando ela
 *  veio do calendário ou de um lançamento antigo sendo editado. */
function pintarAtalhosDeData() {
  const atual = $('lancamento-data').value;
  $('dialogo-lancamento').querySelectorAll('.botao-data').forEach((botao) => {
    botao.classList.toggle('botao-data--ativo', fmt.somarDias(hoje, Number(botao.dataset.dia)) === atual);
  });
}

/**
 * "Corrente ou esporádico" só aparece quando o gasto é no cartão. Em conta
 * corrente essa pergunta não existe: gasto é gasto. Perguntar sempre seria
 * inventar uma decisão que ninguém precisa tomar.
 */
function mostrarNaturezaSePrecisar() {
  const conta = dados.conta($('lancamento-conta').value);
  const noCartao = tipoEmEdicao === 'saida' && dados.ehCartao(conta);
  $('campo-natureza').hidden = !noCartao;
  if (noCartao) pintarNatureza();
}

function pintarNatureza() {
  $('dialogo-lancamento').querySelectorAll('[data-natureza]').forEach((b) =>
    b.classList.toggle('segmento--ativo', b.dataset.natureza === naturezaEmEdicao));
}

function garantirDestinoDiferente() {
  const origem = $('lancamento-conta');
  const destino = $('lancamento-destino');
  if (destino.value !== origem.value) return;
  const outra = [...destino.options].find((o) => o.value !== origem.value);
  if (outra) destino.value = outra.value;
}

function preencherContas(seletor, selecionado) {
  const estado = dados.obter();
  trocar(seletor, [...estado.contas]
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    .map((c) => el('option', { value: c.id, selected: c.id === selecionado, texto: c.nome })));
}

function preencherCategorias(tipo, selecionado) {
  const seletor = $('lancamento-categoria');
  const anterior = selecionado || seletor.value;
  const lista = dados.categoriasDe(tipo);
  trocar(seletor, [
    el('option', { value: '', texto: 'Sem categoria' }),
    ...lista.map((c) => el('option', { value: c.id, selected: c.id === anterior, texto: c.nome })),
  ]);
}

function abrirLancamento(lancamentoId) {
  const dialogo = $('dialogo-lancamento');
  const existente = lancamentoId ? dados.lancamento(lancamentoId) : null;

  tipoEmEdicao = existente ? existente.tipo : 'saida';
  naturezaEmEdicao = existente && existente.natureza === 'corrente' ? 'corrente' : 'esporadico';
  $('dialogo-titulo').textContent = existente
    ? (existente.parcelasTotal > 1
        ? `Parcela ${existente.parcela} de ${existente.parcelasTotal}`
        : 'Editar lançamento')
    : 'Novo lançamento';
  $('lancamento-id').value = existente ? existente.id : '';
  $('lancamento-parcelas').value = '1';
  $('excluir-lancamento').hidden = !existente;
  $('excluir-lancamento').textContent = existente && existente.parcelasTotal > 1
    ? `Excluir as ${existente.parcelasTotal} parcelas`
    : 'Excluir lançamento';

  preencherContas($('lancamento-conta'), existente ? existente.contaId : undefined);
  preencherContas($('lancamento-destino'), existente ? existente.contaDestinoId : undefined);
  aplicarTipo(dialogo);

  if (existente) {
    $('lancamento-valor').value = fmt.valor(existente.valor);
    $('lancamento-data').value = existente.data;
    $('lancamento-descricao').value = existente.descricao || '';
    preencherCategorias(existente.tipo === 'entrada' ? 'entrada' : 'saida', existente.categoriaId);
  } else {
    $('lancamento-valor').value = '';
    $('lancamento-data').value = hoje;
    $('lancamento-descricao').value = '';
    if (visao.filtroContaId) $('lancamento-conta').value = visao.filtroContaId;
  }

  pintarAtalhosDeData();

  dialogo.showModal();
  if (!existente) $('lancamento-valor').focus();
}

/**
 * Atalhos para o que você repete. Só aparecem ao criar um gasto novo: numa
 * edição eles sobrescreveriam o que está sendo corrigido.
 */
function pintarAtalhos(editando) {
  const caixa = $('atalhos');
  const lista = editando || tipoEmEdicao !== 'saida'
    ? []
    : atalhosFrequentes(dados.obter(), 4);

  caixa.hidden = !lista.length;
  if (!lista.length) return;

  trocar(caixa, lista.map((atalho) => {
    const conta = dados.conta(atalho.contaId);
    return el('button', {
      class: 'atalho',
      type: 'button',
      onclick: () => {
        $('lancamento-valor').value = fmt.valor(atalho.ultimoValor);
        $('lancamento-conta').value = atalho.contaId;
        if (atalho.categoriaId) $('lancamento-categoria').value = atalho.categoriaId;
        $('lancamento-descricao').value = atalho.rotulo;
        mostrarContaDasParcelas();
      },
    }, [
      el('span', { class: 'atalho__ponto', estilo: { background: hexDaConta(conta) } }),
      atalho.rotulo,
      el('span', { class: 'atalho__valor', texto: fmt.moeda(atalho.ultimoValor) }),
    ]);
  }));
}

/* ========================= diálogo de conta ============================ */

let corEscolhida = dados.CORES_CONTA[0].id;
let tipoContaEmEdicao = 'conta';

function ligarDialogoConta() {
  const dialogo = $('dialogo-conta');

  dialogo.querySelectorAll('[data-fechar]').forEach((b) =>
    b.addEventListener('click', () => dialogo.close()));

  dialogo.querySelectorAll('[data-tipo-conta]').forEach((botao) => {
    botao.addEventListener('click', () => {
      tipoContaEmEdicao = botao.dataset.tipoConta;
      aplicarTipoConta();
    });
  });

  aplicarMascaraDeValor($('conta-saldo'));

  $('excluir-conta').addEventListener('click', () => {
    const id = $('conta-id').value;
    if (!dados.podeRemoverConta(id)) {
      recado(`Este ${palavraDaConta()} tem lançamentos. Apague-os antes, ou apenas renomeie.`);
      return;
    }
    if (!confirm(`Excluir este ${palavraDaConta()}?`)) return;
    dados.removerConta(id);
    dialogo.close();
    recado({ conta: 'Banco excluído.', cartao: 'Cartão excluído.', reserva: 'Caixinha excluída.' }[tipoContaEmEdicao]);
  });

  $('form-conta').addEventListener('submit', (evento) => {
    const nome = $('conta-nome').value.trim();
    if (!nome) {
      evento.preventDefault();
      return;
    }
    const informado = Math.abs(fmt.paraCentavos($('conta-saldo').value));

    dados.salvarConta({
      id: $('conta-id').value || undefined,
      nome,
      cor: corEscolhida,
      tipo: tipoContaEmEdicao,
      // No cartão a pessoa digita quanto DEVE, um número positivo; por dentro
      // isso é saldo negativo, que é o que faz pagar a fatura abater a dívida
      // usando a mesma conta de transferência dos bancos.
      saldoInicial: tipoContaEmEdicao === 'cartao' ? -informado : informado,
    });
    // Cada um tem o seu gênero: caixinha é salva, banco e cartão são salvos.
    recado({ conta: 'Banco salvo.', cartao: 'Cartão salvo.', reserva: 'Caixinha salva.' }[tipoContaEmEdicao]);
  });
}

/** A palavra certa para o que está sendo editado, usada nos avisos. */
function palavraDaConta() {
  if (tipoContaEmEdicao === 'cartao') return 'cartão';
  if (tipoContaEmEdicao === 'reserva') return 'caixinha';
  return 'banco';
}

/** Banco e cartão são a mesma tela com outras palavras — e sinal invertido. */
const PALAVRAS_DA_CONTA = {
  conta: {
    nome: 'Nome do banco',
    excluir: 'Excluir banco',
    saldo: 'Saldo inicial',
    ajuda: 'Quanto havia nesse banco quando você começou a usar a Caderneta.',
  },
  cartao: {
    nome: 'Nome do cartão',
    excluir: 'Excluir cartão',
    saldo: 'Quanto você já deve hoje',
    ajuda: 'O valor da fatura em aberto agora. Compras no crédito não descontam do saldo do banco; elas somam aqui, e saem do banco quando você paga a fatura.',
  },
  reserva: {
    nome: 'Nome da caixinha',
    excluir: 'Excluir caixinha',
    saldo: 'Quanto já tem guardado',
    ajuda: 'Dinheiro separado para um objetivo. Fica fora do saldo do topo de propósito: é seu, mas não é para gastar hoje. Para guardar mais, use Transferir do banco para a caixinha.',
  },
};

function aplicarTipoConta() {
  const cartao = tipoContaEmEdicao === 'cartao';
  const palavras = PALAVRAS_DA_CONTA[tipoContaEmEdicao] || PALAVRAS_DA_CONTA.conta;

  $('dialogo-conta').querySelectorAll('[data-tipo-conta]').forEach((b) =>
    b.classList.toggle('segmento--ativo', b.dataset.tipoConta === tipoContaEmEdicao));

  $('rotulo-conta-nome').textContent = palavras.nome;
  $('excluir-conta').textContent = palavras.excluir;
  $('rotulo-conta-saldo').textContent = palavras.saldo;
  $('ajuda-conta-saldo').textContent = palavras.ajuda;
}

function abrirConta(contaId) {
  const conta = contaId ? dados.conta(contaId) : null;
  corEscolhida = conta ? conta.cor : dados.CORES_CONTA[dados.obter().contas.length % dados.CORES_CONTA.length].id;
  tipoContaEmEdicao = dados.tipoDaConta(conta);

  const comoChamar = { conta: 'banco', cartao: 'cartão', reserva: 'caixinha' };
  $('dialogo-conta-titulo').textContent = conta
    ? `Editar ${comoChamar[dados.tipoDaConta(conta)]}`
    : 'Novo banco, cartão ou caixinha';
  $('conta-id').value = conta ? conta.id : '';
  $('conta-nome').value = conta ? conta.nome : '';
  // Sempre em módulo: a dívida do cartão é guardada negativa, mas quem digita
  // pensa "devo 500", não "tenho menos 500".
  $('conta-saldo').value = conta && conta.saldoInicial ? fmt.valor(Math.abs(conta.saldoInicial)) : '';
  $('excluir-conta').hidden = !conta;

  aplicarTipoConta();
  pintarCores();
  $('dialogo-conta').showModal();
}

function pintarCores() {
  trocar($('cores-conta'), dados.CORES_CONTA.map((cor) => el('button', {
    type: 'button',
    class: `cor${cor.id === corEscolhida ? ' cor--escolhida' : ''}`,
    estilo: { background: cor.hex },
    'aria-label': cor.nome,
    'aria-pressed': String(cor.id === corEscolhida),
    onclick: () => { corEscolhida = cor.id; pintarCores(); },
  })));
}

/* ============================= ajustes ================================= */

function ligarAjustes() {
  $('nova-conta').addEventListener('click', () => abrirConta(null));

  trocar($('escolha-tema'), tema.TEMAS.map((t) => el('button', {
    class: 'segmento',
    type: 'button',
    texto: t.nome,
    dados: { tema: t.id },
    onclick: () => { tema.definir(t.id); pintarEscolhaDoTema(); },
  })));
  pintarEscolhaDoTema();

  $('criar-pin').addEventListener('click', () => tranca.comecarADefinir());
  $('trocar-pin').addEventListener('click', () => tranca.comecarADefinir());
  $('remover-pin').addEventListener('click', () => {
    if (!confirm('Remover a tranca? O app passa a abrir direto neste aparelho.')) return;
    tranca.remover();
    pintarBotoesDaTranca();
  });

  $('form-nova-categoria').addEventListener('submit', (evento) => {
    evento.preventDefault();
    const nome = $('nome-categoria').value.trim();
    if (!nome) return;
    dados.salvarCategoria({ nome, tipo: $('tipo-categoria').value });
    $('nome-categoria').value = '';
    recado('Categoria criada.');
  });

  $('baixar-backup').addEventListener('click', () => {
    baixarArquivo(nomeComData('caderneta-backup', 'json'), dados.exportarJSON(), 'application/json');
    dados.registrarBackup();
    recado('Backup baixado. Guarde o arquivo em algum lugar seguro.');
  });

  $('baixar-csv').addEventListener('click', () => {
    baixarArquivo(nomeComData('caderneta-lancamentos', 'csv'), gerarCSV(dados.obter()), 'text/csv');
    recado('Planilha exportada.');
  });

  $('importar-backup').addEventListener('click', () => $('arquivo-backup').click());
  $('adicionar-arquivo').addEventListener('click', () => $('arquivo-adicionar').click());
  $('arquivo-adicionar').addEventListener('change', adicionarDeArquivo);

  $('arquivo-backup').addEventListener('change', async (evento) => {
    const arquivo = evento.target.files[0];
    if (!arquivo) return;
    const texto = await arquivo.text();
    evento.target.value = '';

    const atual = dados.obter();
    if (atual.lancamentos.length
      && !confirm(`Restaurar substitui os ${atual.lancamentos.length} lançamentos deste aparelho pelos do arquivo. Continuar?`)) {
      return;
    }

    const resultado = dados.importarJSON(texto);
    if (!resultado.ok) {
      recado(resultado.erro);
      return;
    }
    mostrarTelaCerta();
    recado(`Backup restaurado: ${resultado.total} lançamentos.`);
  });

  $('apagar-tudo').addEventListener('click', () => {
    if (!confirm('Apagar TODOS os bancos e lançamentos deste aparelho?')) return;
    if (!confirm('Tem certeza? Baixe um backup antes, se ainda não baixou.')) return;
    dados.apagarTudo();
    mostrarTelaCerta();
  });
}

/**
 * Renomear é o caso comum, então ele vem primeiro e sem menu. Esvaziar o
 * nome é o caminho para excluir — e a exclusão só passa se a categoria não
 * estiver em uso, senão lançamentos antigos ficariam órfãos.
 */
function editarCategoria(categoriaId) {
  const categoria = dados.categoria(categoriaId);
  if (!categoria) return;

  const resposta = prompt(
    `Novo nome para "${categoria.nome}".\nDeixe em branco para excluir a categoria.`,
    categoria.nome
  );
  if (resposta === null) return;

  const nome = resposta.trim();

  if (!nome) {
    if (!dados.podeRemoverCategoria(categoriaId)) {
      recado('Esta categoria já foi usada em lançamentos. Renomeie em vez de excluir.');
      return;
    }
    if (!confirm(`Excluir a categoria "${categoria.nome}"?`)) return;
    dados.removerCategoria(categoriaId);
    recado('Categoria excluída.');
    return;
  }

  dados.salvarCategoria({ id: categoriaId, nome, tipo: categoria.tipo });
  recado('Categoria renomeada.');
}

/**
 * Lê um arquivo de lançamentos e os acrescenta. Mostra antes o que vai
 * acontecer, mês a mês: importar 161 linhas às cegas é pedir para alguém se
 * arrepender depois.
 */
async function adicionarDeArquivo(evento) {
  const arquivo = evento.target.files[0];
  if (!arquivo) return;
  const texto = await arquivo.text();
  evento.target.value = '';

  let dados_;
  try {
    dados_ = JSON.parse(texto);
  } catch {
    recado('Esse arquivo não é um JSON válido.');
    return;
  }

  const lista = Array.isArray(dados_) ? dados_ : dados_.lancamentos;
  if (!Array.isArray(lista) || !lista.length) {
    recado('Não encontrei lançamentos nesse arquivo.');
    return;
  }

  const invalidos = lista.filter((l) => !/^\d{4}-\d{2}-\d{2}$/.test(String(l.data)) || !(l.valor > 0));
  if (invalidos.length) {
    recado(`${invalidos.length} linhas estão sem data ou sem valor. Nada foi importado.`);
    return;
  }

  const contas = Array.isArray(dados_.contas) ? dados_.contas : [];

  const porMes = new Map();
  for (const l of lista) {
    const chave = String(l.data).slice(0, 7);
    porMes.set(chave, (porMes.get(chave) || 0) + 1);
  }
  const meses = [...porMes.entries()].sort()
    .map(([m, n]) => `  ${m}: ${n} lançamentos`).join('\n');

  const sobreContas = contas.length
    ? '\n\nTambém vou acertar os bancos:\n' + contas
        .map((c) => `  ${c.nome}: saldo inicial ${fmt.moeda(c.saldoInicial || 0)}`).join('\n')
    : '';

  const pergunta = `Adicionar ${lista.length} lançamentos?\n\n${meses}${sobreContas}`
    + '\n\nOs lançamentos somam ao que já existe, sem apagar nada.';

  if (!confirm(pergunta)) return;

  const r = dados.adicionarLancamentos(lista, contas);
  const partes = [`${r.lancamentos} lançamentos adicionados.`];
  if (r.contasCriadas.length) partes.push(`Criei: ${r.contasCriadas.join(', ')}.`);
  if (r.saldosAjustados.length) partes.push(`Saldo inicial ajustado: ${r.saldosAjustados.join(', ')}.`);
  recado(partes.join(' '));
}

function pintarAvisoDeBackup(estado) {
  const caixa = $('estado-backup');
  const ultimo = estado.ultimoBackupEm;

  if (!estado.lancamentos.length) {
    caixa.hidden = true;
    return;
  }
  if (!ultimo) {
    caixa.textContent = 'Você ainda não baixou nenhum backup.';
    caixa.hidden = false;
    return;
  }

  const dias = Math.floor((Date.now() - new Date(ultimo).getTime()) / 86400000);
  if (dias >= 30) {
    caixa.textContent = `Seu último backup foi há ${dias} dias.`;
    caixa.hidden = false;
  } else {
    caixa.hidden = true;
  }
}

function pintarEscolhaDoTema() {
  $('escolha-tema').querySelectorAll('[data-tema]').forEach((b) =>
    b.classList.toggle('segmento--ativo', b.dataset.tema === tema.temaAtual()));
}

/** A tranca tem três botões, e só dois fazem sentido por vez. */
function pintarBotoesDaTranca() {
  const tem = tranca.existe();
  $('criar-pin').hidden = tem;
  $('trocar-pin').hidden = !tem;
  $('remover-pin').hidden = !tem;
}

/* ======================= exportação para planilha ====================== */

/**
 * CSV para abrir no Excel em português: separador ponto e vírgula, decimal
 * com vírgula e BOM no começo. Sem o BOM, o Excel do Windows lê o arquivo
 * como ANSI e os acentos viram "AlimentaÃ§Ã£o".
 */
function gerarCSV(estado) {
  const cabecalho = ['Data', 'Tipo', 'Valor', 'Banco', 'Banco destino', 'Categoria', 'Descrição'];
  const campo = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const rotuloTipo = { saida: 'Gasto', entrada: 'Entrada', transferencia: 'Transferência' };

  const linhas = [...estado.lancamentos]
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((l) => {
      const conta = estado.contas.find((c) => c.id === l.contaId);
      const destino = estado.contas.find((c) => c.id === l.contaDestinoId);
      const categoria = estado.categorias.find((c) => c.id === l.categoriaId);
      const sinal = l.tipo === 'saida' ? -1 : 1;
      return [
        fmt.paraData(l.data).toLocaleDateString('pt-BR'),
        rotuloTipo[l.tipo] || l.tipo,
        String((sinal * l.valor) / 100).replace('.', ','),
        conta ? conta.nome : '',
        destino ? destino.nome : '',
        categoria ? categoria.nome : '',
        l.descricao || '',
      ].map(campo).join(';');
    });

  return '﻿' + [cabecalho.map(campo).join(';'), ...linhas].join('\r\n');
}

/* ========================= máscara de valor ============================ */

/**
 * Digitação estilo caixa eletrônico: os dígitos entram pela direita, então
 * teclar 1-2-3-4 mostra 12,34. Sem isso, no celular a pessoa precisa achar
 * a vírgula no teclado numérico — que em muitos aparelhos nem aparece.
 */
function aplicarMascaraDeValor(campo) {
  campo.addEventListener('input', () => {
    const digitos = campo.value.replace(/\D/g, '').slice(0, 11);
    if (!digitos) {
      campo.value = '';
      return;
    }
    campo.value = fmt.valor(Number(digitos));
  });
}

/* =========================== offline (PWA) ============================= */

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  navigator.serviceWorker.register('sw.js').catch((erro) => {
    console.warn('Service worker não registrado:', erro);
  });
}

iniciar();
