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
import { el, trocar, hexDaCor, recado, baixarArquivo, nomeComData } from './ui.js';

const hoje = fmt.hojeISO();
const visao = {
  ano: Number(hoje.slice(0, 4)),
  mes: Number(hoje.slice(5, 7)),
  tela: 'extrato',
  filtroContaId: null,
};

const $ = (id) => document.getElementById(id);

/* ============================= arranque ================================ */

function iniciar() {
  dados.carregar();
  dados.assinar(() => pintar());

  ligarBoasVindas();
  ligarNavegacao();
  ligarDialogoLancamento();
  ligarDialogoConta();
  ligarAjustes();
  registrarServiceWorker();

  mostrarTelaCerta();
}

function mostrarTelaCerta() {
  const estado = dados.obter();
  const pronto = estado.configurado && estado.contas.length > 0;
  $('boas-vindas').hidden = pronto;
  $('app').hidden = !pronto;
  if (pronto) pintar();
  else montarCamposBancos();
}

/* ========================== primeiro acesso ============================ */

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
        value: atuais[i] || '',
        'data-campo': 'nome',
      }),
      el('input', {
        type: 'text',
        inputmode: 'decimal',
        placeholder: 'saldo hoje',
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
  }
}

/* ======================= diálogo de lançamento ========================= */

let tipoEmEdicao = 'saida';

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

  aplicarMascaraDeValor($('lancamento-valor'));

  // Trocar o banco de origem não pode deixar os dois lados iguais.
  $('lancamento-conta').addEventListener('change', () => {
    if (tipoEmEdicao === 'transferencia') garantirDestinoDiferente();
  });

  $('excluir-lancamento').addEventListener('click', () => {
    const id = $('lancamento-id').value;
    if (!id) return;
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
  $('rotulo-conta').textContent = transferencia ? 'De qual banco' : 'Banco';

  // Transferir de um banco para ele mesmo não existe, e o app recusaria na
  // hora de salvar. Então já abre apontando para outro banco.
  if (transferencia) garantirDestinoDiferente();

  preencherCategorias(transferencia ? 'saida' : tipoEmEdicao);
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
  $('dialogo-titulo').textContent = existente ? 'Editar lançamento' : 'Novo lançamento';
  $('lancamento-id').value = existente ? existente.id : '';
  $('excluir-lancamento').hidden = !existente;

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

  dialogo.showModal();
  if (!existente) $('lancamento-valor').focus();
}

/* ========================= diálogo de conta ============================ */

let corEscolhida = dados.CORES_CONTA[0].id;

function ligarDialogoConta() {
  const dialogo = $('dialogo-conta');

  dialogo.querySelectorAll('[data-fechar]').forEach((b) =>
    b.addEventListener('click', () => dialogo.close()));

  aplicarMascaraDeValor($('conta-saldo'));

  $('excluir-conta').addEventListener('click', () => {
    const id = $('conta-id').value;
    if (!dados.podeRemoverConta(id)) {
      recado('Este banco tem lançamentos. Apague-os antes, ou apenas renomeie o banco.');
      return;
    }
    if (!confirm('Excluir este banco?')) return;
    dados.removerConta(id);
    dialogo.close();
    recado('Banco excluído.');
  });

  $('form-conta').addEventListener('submit', (evento) => {
    const nome = $('conta-nome').value.trim();
    if (!nome) {
      evento.preventDefault();
      return;
    }
    dados.salvarConta({
      id: $('conta-id').value || undefined,
      nome,
      cor: corEscolhida,
      saldoInicial: fmt.paraCentavos($('conta-saldo').value),
    });
    recado('Banco salvo.');
  });
}

function abrirConta(contaId) {
  const conta = contaId ? dados.conta(contaId) : null;
  corEscolhida = conta ? conta.cor : dados.CORES_CONTA[dados.obter().contas.length % dados.CORES_CONTA.length].id;

  $('dialogo-conta-titulo').textContent = conta ? 'Editar banco' : 'Novo banco';
  $('conta-id').value = conta ? conta.id : '';
  $('conta-nome').value = conta ? conta.nome : '';
  $('conta-saldo').value = conta && conta.saldoInicial ? fmt.valor(conta.saldoInicial) : '';
  $('excluir-conta').hidden = !conta;

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
