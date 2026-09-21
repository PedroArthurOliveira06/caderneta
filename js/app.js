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
// Leitura direta do cálculo puro, como já se faz com formato.js: a fila de
// classificação é uma pergunta de dados, e quem responde qual grupo vem
// agora é aqui, porque "o que foi pulado" é estado de tela.
import * as calc from './calculos.js';
import * as conta from './conta.js';
import * as tranca from './tranca.js';
import * as tema from './tema.js';
import { interpretar, explicar, atalhosFrequentes, categoriaProvavel } from './interpretar.js';
import { el, trocar, hexDaConta, recado, baixarArquivo, nomeComData } from './ui.js';
import { VERSAO_APP } from './configuracao.js';

const hoje = fmt.hojeISO();
const visao = {
  ano: Number(hoje.slice(0, 4)),
  mes: Number(hoje.slice(5, 7)),
  tela: 'extrato',
  filtroContaId: null,
  busca: null,
};

const $ = (id) => document.getElementById(id);

/* ============================= arranque ================================ */

async function iniciar() {
  // Depois de uma atualização forçada, tira o parâmetro da barra de
  // endereço: ele serviu para furar o cache e não precisa ficar aparecendo.
  const etapaDaAtualizacao = Number(
    new URLSearchParams(location.search).get('atualizado')) || 0;
  // O parâmetro serviu para furar o cache; não precisa ficar aparecendo.
  if (etapaDaAtualizacao) history.replaceState(null, '', location.pathname);

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
  ligarDialogoRecorrente();
  ligarClassificador();
  ligarAjustes();
  registrarServiceWorker();

  // Quando a internet volta, o que ficou na fila sobe sozinho.
  window.addEventListener('online', () => {
    dados.tentarEscoar();
    mostrarEstadoDoEnvio();
  });
  window.addEventListener('offline', mostrarEstadoDoEnvio);

  ligarAvisoDeVersao(etapaDaAtualizacao);

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
 *   'deslogado'  -> entrar ou criar conta
 *   'nova-senha' -> chegou pelo link do e-mail, vai escolher senha
 *   'pendente'   -> esperando liberação
 *   'local'      -> sem conta, só neste aparelho
 *   'aprovado'   -> conta liberada, sincronizando
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
  const novaSenha = !naTranca && situacaoDaConta === 'nova-senha';
  const pendente = !naTranca && situacaoDaConta === 'pendente';
  const usandoApp = !naTranca && !entrada && !pendente && !novaSenha;

  $('tela-entrada').hidden = !entrada;
  $('tela-nova-senha').hidden = !novaSenha;
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
      el('span', { class: 'banco-inicial__cor', estilo: { background: hexDaConta({ cor: cor.id }) } }),
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
  ligarBusca();
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
      visao.busca = null;
      pintar();
      window.scrollTo({ top: 0 });
    });
  });

  $('botao-lancar').addEventListener('click', () => abrirLancamento(null));
}

/**
 * Abrir, digitar e fechar a busca.
 *
 * Fechar devolve o mês que estava aberto, intacto: quem procurou uma coisa
 * quase sempre quer voltar para onde estava, não para hoje.
 */
function abrirBusca() {
  visao.busca = '';
  $('campo-busca').value = '';
  pintar();
  $('campo-busca').focus();
  window.scrollTo({ top: 0 });
}

function ligarBusca() {
  const campo = $('campo-busca');

  $('fechar-busca').addEventListener('click', fecharBusca);

  campo.addEventListener('input', () => {
    visao.busca = campo.value;
    pintar();
  });

  // Enter no celular fecha o teclado e deixa o resultado à vista; sem isto o
  // formulário recarregaria a página e a busca se perderia.
  $('barra-busca').addEventListener('submit', (evento) => {
    evento.preventDefault();
    campo.blur();
  });

  campo.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') fecharBusca();
  });
}

function fecharBusca() {
  visao.busca = null;
  $('campo-busca').value = '';
  pintar();
}

function mudarMes(passo) {
  Object.assign(visao, fmt.deslocarMes(visao.ano, visao.mes, passo));
  pintar();
}

/* ============================= pintura ================================= */

function pintar() {
  const estado = dados.obter();
  if (!estado.configurado || !estado.contas.length) return;

  const buscando = visao.busca !== null && visao.tela === 'extrato';

  $('rotulo-mes').textContent = fmt.mesPorExtenso(visao.ano, visao.mes);
  const mesCorrente = `${visao.ano}-${String(visao.mes).padStart(2, '0')}` === fmt.chaveMes(hoje);
  $('ir-para-hoje').hidden = mesCorrente || buscando;

  // Buscando, o mês sai da barra: os achados vêm de meses diferentes, e um
  // título dizendo "Setembro" em cima de um gasto de março seria mentira.
  $('mes-anterior').hidden = buscando;
  $('mes-proximo').hidden = buscando;
  $('barra-mes-centro').hidden = buscando;
  $('barra-busca').hidden = !buscando;

  // O painel de saldos e o campo de lançar saem de cena: um responde sobre o
  // mês, o outro cria lançamento. Nenhum dos dois é o que se quer no meio de
  // uma busca, e os dois roubam a tela inteira do celular.
  $('painel-saldos').hidden = buscando;
  $('aviso-fatura').hidden = buscando;
  $('aviso-recorrentes').hidden = buscando;
  $('lancamento-rapido').hidden = buscando;

  $('tela-extrato').hidden = visao.tela !== 'extrato';
  $('tela-resumo').hidden = visao.tela !== 'resumo';
  $('tela-ajustes').hidden = visao.tela !== 'ajustes';
  // Só no Extrato. O Resumo é tela de leitura, e ali o botão flutuante
  // ficava por cima dos próprios números que a pessoa foi ler.
  $('botao-lancar').hidden = visao.tela !== 'extrato' || buscando;
  $('dica-rapida').hidden = buscando || jaAprendeu() || Boolean($('texto-rapido').value.trim());
  if (buscando) $('leitura-rapida').hidden = true;
  mostrarEstadoDoEnvio();

  const contexto = {
    ano: visao.ano,
    mes: visao.mes,
    filtroContaId: visao.filtroContaId,
    aoFiltrar: (id) => { visao.filtroContaId = id; pintar(); },
    aoTocarConta: (id) => { visao.filtroContaId = visao.filtroContaId === id ? null : id; pintar(); },
    aoTocarLancamento: (id) => abrirLancamento(id),
    aoEditarConta: (id) => abrirConta(id),
    hoje,
    aoPagarFatura: (fatura) => pagarFatura(fatura),
    aoEditarCategoria: (id) => editarCategoria(id),
    aoEditarRecorrente: (id) => abrirRecorrente(id),
    aoLancarRecorrentes: (pendentes) => lancarRecorrentes(pendentes),
    aoBuscar: () => abrirBusca(),
    aoClassificar: () => abrirClassificador(),
    termo: visao.busca,
  };

  if (visao.tela === 'extrato' && buscando) {
    // O filtro de banco continua à vista de propósito: se ele estiver ligado,
    // a busca obedece a ele, e esconder isso faria o resultado parecer errado.
    telas.pintarFiltro(estado, contexto);
    telas.pintarBusca(estado, contexto);
  } else if (visao.tela === 'extrato') {
    telas.pintarSaldos(estado, contexto);
    telas.pintarAvisoDeFatura(estado, contexto);
    telas.pintarAvisoDeRecorrentes(estado, contexto);
    telas.pintarFiltro(estado, contexto);
    telas.pintarExtrato(estado, contexto);
  } else if (visao.tela === 'resumo') {
    telas.pintarAvisoDeClassificar(estado, contexto);
    telas.pintarAcimaDoNormal(estado, contexto);
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

/* A dica de escrever "ontem" ensina uma vez. Depois de algumas dezenas de
   lançamentos ela virou só duas linhas entre você e o extrato. */
function jaAprendeu() {
  return dados.obter().lancamentos.length >= 20;
}

/**
 * Completa a leitura com a categoria que o histórico já ensinou.
 *
 * Só quando a leitura não trouxe nenhuma: escrever "alimentação 45" continua
 * mandando mais que o palpite. E o palpite aparece na linha de leitura antes
 * de salvar, para ninguém ser categorizado sem ver.
 */
function comCategoriaAprendida(lido) {
  if (lido.categoriaId || !lido.descricao) return lido;
  const palpite = categoriaProvavel(dados.obter(), lido.descricao, lido.tipo);
  return palpite ? { ...lido, categoriaId: palpite } : lido;
}

function ligarLancamentoRapido() {
  const campo = $('texto-rapido');
  const leitura = $('leitura-rapida');

  campo.addEventListener('input', () => {
    $('dica-rapida').hidden = Boolean(campo.value.trim()) || jaAprendeu();
    if (!campo.value.trim()) {
      leitura.hidden = true;
      return;
    }
    const lido = comCategoriaAprendida(interpretar(campo.value, contextoDeLeitura()));
    leitura.classList.toggle('rapido__leitura--erro', !lido.entendido);
    leitura.textContent = lido.entendido
      ? `${fmt.moeda(lido.valor)} · ${explicar({ ...lido, contaId: lido.contaId || contaPadrao() }, contextoDeLeitura())}`
      : 'Falta o valor. Escreva, por exemplo: mercado 45';
    leitura.hidden = false;
  });

  $('lancamento-rapido').addEventListener('submit', (evento) => {
    evento.preventDefault();
    const lido = comCategoriaAprendida(interpretar(campo.value, contextoDeLeitura()));

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
    $('dica-rapida').hidden = jaAprendeu();
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

  // Ao sair do campo do nome, e não a cada letra: no meio de "Mercado" a
  // palavra ainda é "Merc", e uma categoria piscando enquanto se digita
  // distrai mais do que ajuda.
  $('lancamento-descricao').addEventListener('blur', sugerirCategoria);

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
/**
 * Preenche a categoria com o que o histórico ensinou — e só quando o campo
 * está vazio. Escolha feita por ele nunca é sobrescrita, nem ao abrir um
 * lançamento antigo para corrigir outra coisa.
 */
function sugerirCategoria() {
  const seletor = $('lancamento-categoria');
  if (seletor.value || tipoEmEdicao === 'transferencia') return;

  const palpite = categoriaProvavel(
    dados.obter(), $('lancamento-descricao').value.trim(), tipoEmEdicao);

  if (palpite && [...seletor.options].some((o) => o.value === palpite)) {
    seletor.value = palpite;
  }
}

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

/** As categorias daquele tipo, em qualquer seletor que peça. */
function preencherSeletorDeCategorias(seletor, tipo, selecionado) {
  const anterior = selecionado || seletor.value;
  const lista = dados.categoriasDe(tipo);
  trocar(seletor, [
    el('option', { value: '', texto: 'Sem categoria' }),
    ...lista.map((c) => el('option', { value: c.id, selected: c.id === anterior, texto: c.nome })),
  ]);
}

function preencherCategorias(tipo, selecionado) {
  preencherSeletorDeCategorias($('lancamento-categoria'), tipo, selecionado);
}

/**
 * Abre o lançamento da fatura já preenchido: banco, cartão, valor e dia.
 *
 * Pagar fatura é sempre a mesma transferência, com números que o app já
 * conhece. Fazer a pessoa redigitar o que está escrito na tela acima seria
 * pedir para ela errar um centavo.
 *
 * A data é a do vencimento, não a de hoje — e se ela já passou, é a de hoje:
 * um pagamento atrasado aconteceu quando aconteceu.
 */
function pagarFatura(fatura) {
  const bancos = dados.obter().contas
    .filter((c) => dados.tipoDaConta(c) === 'conta')
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

  abrirLancamento(null, {
    tipo: 'transferencia',
    contaId: bancos.length ? bancos[0].id : '',
    contaDestinoId: fatura.conta.id,
    valor: fatura.falta,
    data: fatura.vencimento > hoje ? hoje : fatura.vencimento,
    descricao: `Fatura do ${fatura.conta.nome}`,
  });
}

function abrirLancamento(lancamentoId, pronto) {
  const dialogo = $('dialogo-lancamento');
  const existente = lancamentoId ? dados.lancamento(lancamentoId) : null;

  tipoEmEdicao = existente ? existente.tipo : (pronto ? pronto.tipo : 'saida');
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
    // Lançamento novo começa sem categoria. O <select> guardava sozinho a do
    // lançamento anterior — herança do navegador, não escolha de ninguém — e
    // isso fazia a sugestão pelo nome nunca ter vez, porque ela só preenche
    // campo vazio.
    $('lancamento-categoria').value = '';
    $('lancamento-valor').value = pronto ? fmt.valor(pronto.valor) : '';
    $('lancamento-data').value = pronto ? pronto.data : hoje;
    $('lancamento-descricao').value = pronto ? pronto.descricao : '';
    if (pronto) {
      // Depois do aplicarTipo de propósito: é ele que revela o campo de
      // destino e que escolhe um destino qualquer para não repetir a origem.
      if (pronto.contaId) $('lancamento-conta').value = pronto.contaId;
      $('lancamento-destino').value = pronto.contaDestinoId;
    } else if (visao.filtroContaId) {
      $('lancamento-conta').value = visao.filtroContaId;
    }
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
      diaVencimento: Number($('conta-vencimento').value),
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
  $('campo-vencimento').hidden = !cartao;
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
  $('conta-vencimento').value = String((conta && conta.diaVencimento) || 10);
  $('excluir-conta').hidden = !conta;

  aplicarTipoConta();
  pintarCores();
  $('dialogo-conta').showModal();
}

function pintarCores() {
  trocar($('cores-conta'), dados.CORES_CONTA.map((cor) => el('button', {
    type: 'button',
    class: `cor${cor.id === corEscolhida ? ' cor--escolhida' : ''}`,
    estilo: { background: hexDaConta({ cor: cor.id }) },
    'aria-label': cor.nome,
    'aria-pressed': String(cor.id === corEscolhida),
    onclick: () => { corEscolhida = cor.id; pintarCores(); },
  })));
}

/* ======================== classificar em lote ========================== */

/* Quais grupos foram pulados nesta sessão. Não fica guardado: pular é "agora
   não", não "nunca" — no dia seguinte a pergunta volta. */
let pulados = new Set();

function ligarClassificador() {
  $('dialogo-classificar')
    .querySelector('[data-fechar-classificar]')
    .addEventListener('click', () => $('dialogo-classificar').close());

  $('classificar-pular').addEventListener('click', () => {
    const grupo = grupoAtual();
    if (grupo) pulados.add(grupo.chave);
    mostrarProximoGrupo();
  });
}

function filaDeClassificacao() {
  return calc.paraClassificar(dados.obter()).filter((g) => !pulados.has(g.chave));
}

function grupoAtual() {
  return filaDeClassificacao()[0] || null;
}

function abrirClassificador() {
  pulados = new Set();
  if (!grupoAtual()) {
    recado('Não há nada sem categoria.');
    return;
  }
  mostrarProximoGrupo();
  $('dialogo-classificar').showModal();
}

/**
 * Desenha o grupo da vez. Escolher uma categoria classifica o grupo inteiro
 * e já traz o próximo — sem confirmar, sem fechar e reabrir. É o que faz uma
 * fila de 154 lançamentos caber em uma dúzia de toques.
 */
function mostrarProximoGrupo() {
  const fila = filaDeClassificacao();
  const grupo = fila[0];

  if (!grupo) {
    $('dialogo-classificar').close();
    recado(pulados.size ? 'Por hoje é isso. Os pulados voltam depois.' : 'Tudo classificado.');
    return;
  }

  const estado = dados.obter();
  const quantos = grupo.itens.length;
  const contas = [...new Set(grupo.itens.map((l) => {
    const c = estado.contas.find((x) => x.id === l.contaId);
    return c ? c.nome : null;
  }).filter(Boolean))];

  const datas = grupo.itens.map((l) => l.data).sort();
  const periodo = datas[0] === datas[datas.length - 1]
    ? fmt.dataLonga(datas[0])
    : `${fmt.dataLonga(datas[0])} a ${fmt.dataLonga(datas[datas.length - 1])}`;

  $('classificar-contagem').textContent = `${fila.length} ${fila.length === 1 ? 'restante' : 'restantes'}`;
  $('classificar-nome').textContent = grupo.rotulo;
  $('classificar-meta').textContent = [
    quantos === 1 ? '1 lançamento' : `${quantos} lançamentos`,
    fmt.moeda(grupo.valor),
    contas.join(', '),
    periodo,
  ].filter(Boolean).join(' · ');

  $('classificar-pergunta').textContent = grupo.tipo === 'entrada'
    ? 'De onde veio esse dinheiro?'
    : 'Em que categoria isso entra?';

  trocar($('classificar-categorias'), dados.categoriasDe(grupo.tipo).map((c) => el('button', {
    class: 'pilula',
    type: 'button',
    texto: c.nome,
    onclick: () => {
      const quantos = dados.classificarLancamentos(grupo.itens.map((l) => l.id), c.id);
      recado(quantos === 1
        ? `1 lançamento em ${c.nome}.`
        : `${quantos} lançamentos em ${c.nome}.`);
      mostrarProximoGrupo();
    },
  })));
}

/* ==================== gastos que se repetem ============================ */

let tipoRecorrenteEmEdicao = 'saida';
let naturezaRecorrenteEmEdicao = 'corrente';

function ligarDialogoRecorrente() {
  const dialogo = $('dialogo-recorrente');

  dialogo.querySelector('[data-fechar]').addEventListener('click', () => dialogo.close());
  aplicarMascaraDeValor($('recorrente-valor'));

  dialogo.querySelectorAll('[data-tipo-recorrente]').forEach((botao) => {
    botao.addEventListener('click', () => {
      tipoRecorrenteEmEdicao = botao.dataset.tipoRecorrente;
      aplicarTipoRecorrente();
    });
  });

  dialogo.querySelectorAll('[data-natureza-recorrente]').forEach((botao) => {
    botao.addEventListener('click', () => {
      naturezaRecorrenteEmEdicao = botao.dataset.naturezaRecorrente;
      pintarNaturezaRecorrente();
    });
  });

  $('recorrente-conta').addEventListener('change', aplicarTipoRecorrente);

  $('excluir-recorrente').addEventListener('click', () => {
    const alvo = dados.recorrente($('recorrente-id').value);
    if (!alvo) return;
    if (!confirm(`Parar de repetir "${alvo.descricao}"? O que já foi lançado continua no extrato.`)) return;
    dados.removerRecorrente(alvo.id);
    dialogo.close();
    recado('Não vai mais se repetir.');
  });

  $('form-recorrente').addEventListener('submit', (evento) => {
    const descricao = $('recorrente-descricao').value.trim();
    const valor = Math.abs(fmt.paraCentavos($('recorrente-valor').value));
    if (!descricao || !valor) {
      evento.preventDefault();
      if (!valor) recado('Falta o valor.');
      return;
    }

    const conta = dados.conta($('recorrente-conta').value);
    dados.salvarRecorrente({
      id: $('recorrente-id').value || undefined,
      descricao,
      valor,
      dia: Number($('recorrente-dia').value),
      tipo: tipoRecorrenteEmEdicao,
      contaId: $('recorrente-conta').value,
      categoriaId: $('recorrente-categoria').value || null,
      // Só faz sentido em gasto de cartão; nos outros vai vazio, não com
      // sobra do que ficou marcado no formulário.
      natureza: tipoRecorrenteEmEdicao === 'saida' && dados.ehCartao(conta)
        ? naturezaRecorrenteEmEdicao
        : null,
    });
    recado('Guardado. Vou avisar quando chegar o dia.');
  });
}

function aplicarTipoRecorrente() {
  const dialogo = $('dialogo-recorrente');
  const entrada = tipoRecorrenteEmEdicao === 'entrada';

  dialogo.querySelectorAll('[data-tipo-recorrente]').forEach((b) =>
    b.classList.toggle('segmento--ativo', b.dataset.tipoRecorrente === tipoRecorrenteEmEdicao));

  $('rotulo-recorrente-conta').textContent = entrada ? 'Cai em qual banco' : 'Banco ou cartão';

  const conta = dados.conta($('recorrente-conta').value);
  const noCartao = !entrada && dados.ehCartao(conta);
  $('campo-recorrente-natureza').hidden = !noCartao;
  if (noCartao) pintarNaturezaRecorrente();

  preencherSeletorDeCategorias($('recorrente-categoria'),
    entrada ? 'entrada' : 'saida', $('recorrente-categoria').value);
}

function pintarNaturezaRecorrente() {
  $('dialogo-recorrente').querySelectorAll('[data-natureza-recorrente]').forEach((b) =>
    b.classList.toggle('segmento--ativo', b.dataset.naturezaRecorrente === naturezaRecorrenteEmEdicao));
}

function abrirRecorrente(recorrenteId) {
  const r = recorrenteId ? dados.recorrente(recorrenteId) : null;

  tipoRecorrenteEmEdicao = r ? r.tipo : 'saida';
  // Quase tudo que se repete no cartão é corrente — é a definição da palavra.
  naturezaRecorrenteEmEdicao = r && r.natureza === 'esporadico' ? 'esporadico' : 'corrente';

  $('dialogo-recorrente-titulo').textContent = r ? r.descricao : 'Gasto que se repete';
  $('recorrente-id').value = r ? r.id : '';
  $('recorrente-descricao').value = r ? r.descricao : '';
  $('recorrente-valor').value = r ? fmt.valor(r.valor) : '';
  $('recorrente-dia').value = String(r ? r.dia : 1);
  $('excluir-recorrente').hidden = !r;
  $('ajuda-excluir-recorrente').hidden = !r;

  preencherContas($('recorrente-conta'), r ? r.contaId : undefined);
  aplicarTipoRecorrente();
  if (r && r.categoriaId) $('recorrente-categoria').value = r.categoriaId;

  $('dialogo-recorrente').showModal();
  if (!r) $('recorrente-descricao').focus();
}

function lancarRecorrentes(pendentes) {
  const quantos = dados.lancarRecorrentes(pendentes);
  if (!quantos) return;
  recado(quantos === 1 ? 'Lançado.' : `${quantos} lançados.`);
}

/* ============================= ajustes ================================= */

function ligarAjustes() {
  $('nova-conta').addEventListener('click', () => abrirConta(null));
  $('novo-recorrente').addEventListener('click', () => abrirRecorrente(null));

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

  const lista = (Array.isArray(dados_) ? dados_ : dados_.lancamentos) || [];
  const contas = Array.isArray(dados_.contas) ? dados_.contas : [];
  const mover = Array.isArray(dados_.mover) ? dados_.mover : [];

  // Um arquivo só com contas é legítimo: serve para acertar saldo inicial e
  // criar uma caixinha sem mexer em lançamento nenhum.
  if (!lista.length && !contas.length && !mover.length) {
    recado('Não encontrei nada para fazer nesse arquivo.');
    return;
  }

  const invalidos = lista.filter((l) => !/^\d{4}-\d{2}-\d{2}$/.test(String(l.data)) || !(l.valor > 0));
  if (invalidos.length) {
    recado(`${invalidos.length} linhas estão sem data ou sem valor. Nada foi importado.`);
    return;
  }

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

  const movidos = mover.length ? dados.moverLancamentos(mover).movidos : 0;
  const r = dados.adicionarLancamentos(lista, contas);

  const partes = [];
  if (r.lancamentos) partes.push(`${r.lancamentos} lançamentos adicionados.`);
  if (movidos) partes.push(`${movidos} lançamentos mudaram de data.`);
  if (!r.lancamentos && !movidos) partes.push('Bancos acertados.');
  if (r.contasCriadas.length) partes.push(`Criei: ${r.contasCriadas.join(', ')}.`);
  if (r.contasAjustadas.length) partes.push(`Ajustei: ${r.contasAjustadas.join(', ')}.`);
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

/* ========================= aviso de versão nova ========================= */

/**
 * Pergunta ao servidor se há versão mais nova e oferece recarregar.
 *
 * Existe porque "lembre de puxar a tela para atualizar" não é resposta: o
 * dono do app ficou três vezes com uma versão velha sem saber. O service
 * worker já busca pela rede primeiro, mas isso só vale quando a página
 * recarrega — e um app instalado fica aberto por dias.
 *
 * O aviso não interrompe nada: é uma faixa no rodapé que dá para ignorar.
 */
function ligarAvisoDeVersao(etapa = 0) {
  $('atualizar-agora').addEventListener('click', forcarAtualizacao);
  $('forcar-atualizacao').addEventListener('click', forcarAtualizacao);

  conferirVersao(etapa);
  // Ao voltar para o app depois de um tempo fora, pergunta de novo.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) conferirVersao();
  });
}

/**
 * Joga fora tudo o que está guardado no aparelho e busca de novo.
 *
 * Recarregar sozinho não basta: o navegador tem o cache dele, o service
 * worker tem o cache dele, e um app instalado pode ficar dias sem recarregar
 * de verdade. Isto apaga os dois caches, desliga o service worker e volta
 * com um endereço que nenhum deles conhece — assim não sobra de onde servir
 * coisa velha.
 *
 * Nada disso toca nos lançamentos: eles ficam noutra gaveta (localStorage),
 * e na conta do servidor.
 */
/**
 * Joga fora o que está guardado e busca de novo — em DUAS etapas.
 *
 * Duas, e não por capricho. Enquanto o service worker comanda a página, todo
 * pedido passa por ele, inclusive um pedido que diz "ignore o cache do
 * navegador" — que então nunca chega ao cache do navegador. Foi o que fez o
 * botão prometer e não cumprir: ele limpava o que alcançava, recarregava, e
 * o navegador devolvia os mesmos arquivos de dez minutos atrás.
 *
 * Etapa 1, aqui: apaga o que dá, desliga o service worker e recarrega. Essa
 * carga ainda vem velha, e tudo bem — o que importa é que ela chega SEM
 * ninguém no meio do caminho.
 *
 * Etapa 2, no arranque seguinte: agora sim o "ignore o cache" chega ao
 * destino. Renova os arquivos e recarrega uma última vez.
 *
 * Nada disso toca nos lançamentos: eles ficam noutra gaveta, e na conta.
 */
async function forcarAtualizacao() {
  recado('Buscando versão nova…');
  try {
    if (window.caches) {
      const chaves = await caches.keys();
      await Promise.all(chaves.map((c) => caches.delete(c)));
    }
    if (navigator.serviceWorker) {
      const registros = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registros.map((r) => r.unregister()));
    }
  } catch (erro) {
    console.warn('Não deu para limpar tudo:', erro);
  }
  location.replace(`${location.pathname}?atualizado=1&t=${Date.now()}`);
}

/** Força o navegador a rebuscar no servidor tudo o que esta página carregou. */
async function renovarArquivos() {
  await Promise.all(arquivosCarregados().map((url) =>
    fetch(url, { cache: 'reload' }).catch(() => {})));
}

/**
 * Tudo o que esta página carregou da nossa própria origem.
 *
 * Vem do navegador, não de uma lista escrita à mão: uma lista à mão fica
 * para trás no dia em que um arquivo novo é criado, e o esquecido seria
 * justamente o que continuaria velho.
 */
function arquivosCarregados() {
  const urls = new Set([location.origin + location.pathname]);
  try {
    for (const item of performance.getEntriesByType('resource')) {
      if (item.name.startsWith(location.origin)) urls.add(item.name);
    }
  } catch {
    // Navegador sem essa medição: sobra o essencial, logo abaixo.
  }
  for (const caminho of ['index.html', 'css/styles.css', 'js/app.js']) {
    urls.add(new URL(caminho, location.href).href);
  }
  return [...urls];
}

async function conferirVersao(etapa = 0) {
  try {
    const resposta = await fetch('versao.json', { cache: 'no-store' });
    if (!resposta.ok) return;
    const { versao } = await resposta.json();
    const diferente = Boolean(versao) && versao !== VERSAO_APP;

    // A segunda etapa da atualização. A página está livre do service worker
    // agora, então é aqui que renovar os arquivos finalmente funciona.
    if (diferente && etapa === 1) {
      recado('Quase lá…');
      await renovarArquivos();
      location.replace(`${location.pathname}?atualizado=2&t=${Date.now()}`);
      return;
    }

    $('tem-versao-nova').hidden = !diferente;
    $('versao-servidor').textContent = !diferente
      ? 'Esta é a versão mais nova.'
      : etapa >= 2
        // Tentamos as duas etapas e ele continua velho. Dizer "existe versão
        // nova" e calar seria deixá-lo tocando um botão que não resolve.
        ? `No servidor já existe a versão de ${versao}, mas este aparelho ainda `
          + 'está guardando a antiga com força. Feche o app e abra daqui a dez '
          + 'minutos: some sozinho.'
        : `No servidor já existe a versão de ${versao}.`;
  } catch {
    // Sem internet não há o que conferir, e isso não é problema.
  }
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
