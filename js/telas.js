/* =========================================================================
   Desenho das três telas. Cada função recebe o estado e o mês em foco e
   redesenha o seu pedaço. Sem estado próprio — quem guarda "que mês estou
   vendo" é o app.js.
   ========================================================================= */

import * as fmt from './formato.js';
import * as calc from './calculos.js';
import { el, trocar, hexDaConta, vazio } from './ui.js';

/* ========================= painel de saldos ============================ */

export function pintarSaldos(estado, contexto) {
  const alvo = document.getElementById('painel-saldos');
  const { ano, mes, filtroContaId, aoTocarConta } = contexto;
  const { fim } = fmt.limitesDoMes(ano, mes);

  // Bancos e cartões são lidos separados de propósito: um diz quanto existe,
  // o outro quanto se deve. Misturar num número só esconde as duas respostas.
  const { linhas, total } = calc.saldos(estado, fim, 'conta');
  const cartoes = calc.saldos(estado, fim, 'cartao');
  const fatura = calc.faturaEmAberto(estado, fim);
  const totais = calc.totaisDoMes(estado, ano, mes, filtroContaId);

  // Só saldos positivos entram na proporção da faixa: um saldo negativo não
  // tem "largura" de dinheiro guardado, e somá-lo distorceria as fatias.
  const somaPositiva = linhas.reduce((s, l) => s + Math.max(l.saldo, 0), 0);

  const hoje = fmt.hojeISO();
  const ehMesCorrente = fmt.chaveMes(hoje) === `${ano}-${String(mes).padStart(2, '0')}`;

  trocar(alvo,
    el('p', {
      class: 'painel-saldos__rotulo',
      texto: ehMesCorrente ? 'Saldo de hoje' : `Saldo no fim de ${fmt.mesPorExtenso(ano, mes)}`,
    }),
    el('p', {
      class: `painel-saldos__total${total < 0 ? ' painel-saldos__total--negativo' : ''}`,
      texto: fmt.moeda(total),
    }),

    somaPositiva > 0
      ? el('div', { class: 'faixa', 'aria-hidden': 'true' },
          linhas
            .filter((l) => l.saldo > 0)
            .map((l) => el('span', {
              class: 'faixa__parte',
              estilo: { background: hexDaConta(l.conta), flexGrow: String(l.saldo) },
            })))
      : el('div', { class: 'faixa', 'aria-hidden': 'true' }),

    el('div', { class: 'saldos-contas' },
      linhas.map((l) => el('button', {
        class: 'saldo-conta',
        type: 'button',
        onclick: () => aoTocarConta(l.conta.id),
      }, [
        el('span', { class: 'saldo-conta__spine', estilo: { background: hexDaConta(l.conta) } }),
        el('span', { class: 'saldo-conta__nome', texto: l.conta.nome }),
        el('span', {
          class: `saldo-conta__valor${l.saldo < 0 ? ' saldo-conta__valor--negativo' : ''}`,
          texto: fmt.moeda(l.saldo),
        }),
      ]))),

    cartoes.linhas.length ? blocoCartoes(cartoes, fatura, total, contexto) : null,

    el('div', { class: 'mes-resumo' }, [
      el('div', { class: 'mes-resumo__item' }, [
        el('p', { class: 'mes-resumo__rotulo', texto: 'Entrou no mês' }),
        el('p', { class: 'mes-resumo__valor mes-resumo__valor--entrada', texto: fmt.moeda(totais.entrou) }),
      ]),
      el('div', { class: 'mes-resumo__item' }, [
        el('p', { class: 'mes-resumo__rotulo', texto: 'Saiu no mês' }),
        el('p', { class: 'mes-resumo__valor mes-resumo__valor--saida', texto: fmt.moeda(totais.saiu) }),
      ]),
    ]),
  );
}

/**
 * O que se deve no cartão. Fica embaixo dos bancos e visualmente mais quieto:
 * é dinheiro que ainda vai sair, não dinheiro que existe.
 *
 * O saldo de um cartão é negativo, então a dívida mostrada é o mesmo número
 * com o sinal virado. Se ficar positivo, é fatura paga a mais — dito com
 * essas palavras, e não como "dívida de −R$ 70,00".
 */
function blocoCartoes(cartoes, fatura, totalNosBancos, contexto) {
  const { aoTocarConta } = contexto;

  return el('div', { class: 'cartoes' }, [
    el('p', { class: 'cartoes__rotulo', texto: cartoes.linhas.length > 1 ? 'Cartões de crédito' : 'Cartão de crédito' }),

    el('div', { class: 'saldos-contas' }, cartoes.linhas.map((l) => el('button', {
      class: 'saldo-conta',
      type: 'button',
      onclick: () => aoTocarConta(l.conta.id),
    }, [
      el('span', { class: 'saldo-conta__spine', estilo: { background: hexDaConta(l.conta) } }),
      el('span', { class: 'item__corpo' }, [
        el('span', { class: 'saldo-conta__nome', texto: l.conta.nome }),
        el('span', {
          class: 'item__detalhe',
          texto: l.saldo > 0 ? 'Pago a mais' : 'Fatura em aberto',
        }),
      ]),
      el('span', {
        class: `saldo-conta__valor${l.saldo < 0 ? ' saldo-conta__valor--negativo' : ''}`,
        texto: fmt.moeda(Math.abs(l.saldo)),
      }),
    ]))),

    // A pergunta que o cartão cria: "desse dinheiro que aparece no banco,
    // quanto é realmente meu?". Sem isso, o saldo do topo engana para cima.
    fatura > 0
      ? el('p', { class: 'cartoes__sobra' }, [
          'Pagando a fatura agora, sobram ',
          el('strong', {
            class: totalNosBancos - fatura < 0 ? 'cartoes__sobra--negativa' : '',
            texto: fmt.moeda(totalNosBancos - fatura),
          }),
        ])
      : null,
  ]);
}

/* ============================= filtro ================================== */

export function pintarFiltro(estado, contexto) {
  const alvo = document.getElementById('filtro-contas');
  const { filtroContaId, aoFiltrar } = contexto;

  const pilula = (rotulo, id, cor) => el('button', {
    class: `pilula${filtroContaId === id ? ' pilula--ativa' : ''}`,
    type: 'button',
    onclick: () => aoFiltrar(id),
  }, [
    cor ? el('span', { class: 'pilula__ponto', estilo: { background: cor } }) : null,
    rotulo,
  ]);

  trocar(alvo,
    pilula('Todos os bancos', null, null),
    [...estado.contas]
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
      .map((c) => pilula(c.nome, c.id, hexDaConta(c))),
  );
}

/* ============================= extrato ================================= */

export function pintarExtrato(estado, contexto) {
  const alvo = document.getElementById('lista-extrato');
  const { ano, mes, filtroContaId, aoTocarLancamento } = contexto;
  const lista = calc.lancamentosDoMes(estado, ano, mes, filtroContaId);

  if (!lista.length) {
    trocar(alvo, vazio(
      'Nenhum lançamento neste mês',
      filtroContaId
        ? 'Nada foi movimentado neste banco no mês. Toque em "Todos os bancos" para ver o resto.'
        : 'Toque em Lançar para registrar o primeiro gasto ou entrada.'
    ));
    return;
  }

  trocar(alvo, calc.agruparPorDia(lista).map((grupo) => {
    // O total do dia é o efeito real no bolso: transferência entre bancos
    // não soma nem subtrai, porque o dinheiro continua sendo seu.
    const doDia = grupo.itens.reduce((s, l) => {
      if (l.tipo === 'entrada') return s + l.valor;
      if (l.tipo === 'saida') return s - l.valor;
      return s;
    }, 0);

    return el('section', { class: 'dia' }, [
      el('header', { class: 'dia__cabecalho' }, [
        el('span', { texto: `${fmt.dataLonga(grupo.data)}, ${fmt.diaDaSemana(grupo.data)}` }),
        doDia !== 0 ? el('span', { class: 'dia__total', texto: fmt.comSinal(doDia) }) : null,
      ]),
      el('div', { class: 'dia__itens' }, grupo.itens.map((l) => linhaDoExtrato(estado, l, aoTocarLancamento))),
    ]);
  }));
}

function linhaDoExtrato(estado, l, aoTocar) {
  const conta = estado.contas.find((c) => c.id === l.contaId);
  const destino = estado.contas.find((c) => c.id === l.contaDestinoId);
  const categoria = estado.categorias.find((c) => c.id === l.categoriaId);

  let titulo;
  let detalhe;
  let valorTexto;
  let classeValor;

  if (l.tipo === 'transferencia') {
    // Transferir para um cartão tem um nome só no mundo real: pagar a fatura.
    // Chamar isso de "transferência" no extrato seria linguagem de sistema.
    const pagaFatura = calc.tipoDaConta(destino) === 'cartao';
    titulo = l.descricao || (pagaFatura ? 'Pagamento da fatura' : 'Transferência entre bancos');
    detalhe = `${conta ? conta.nome : '—'} → ${destino ? destino.nome : '—'}`;
    valorTexto = fmt.moeda(l.valor);
    classeValor = 'item__valor--transferencia';
  } else {
    titulo = l.descricao || (categoria ? categoria.nome : 'Sem categoria');
    const partes = [conta ? conta.nome : 'Banco removido'];
    if (l.descricao && categoria) partes.unshift(categoria.nome);
    // "3/10" vem antes do resto: numa compra parcelada é a informação que a
    // pessoa procura primeiro ao passar o olho no extrato.
    if (l.parcelasTotal > 1) partes.unshift(`${l.parcela}/${l.parcelasTotal}`);
    detalhe = partes.join(' · ');
    valorTexto = l.tipo === 'entrada' ? fmt.comSinal(l.valor) : fmt.comSinal(-l.valor);
    classeValor = l.tipo === 'entrada' ? 'item__valor--entrada' : 'item__valor--saida';
  }

  return el('button', { class: 'item', type: 'button', onclick: () => aoTocar(l.id) }, [
    el('span', { class: 'item__spine', estilo: { background: hexDaConta(conta) } }),
    el('span', { class: 'item__corpo' }, [
      el('span', { class: 'item__titulo', texto: titulo }),
      el('span', { class: 'item__detalhe', texto: detalhe }),
    ]),
    el('span', { class: `item__valor ${classeValor}`, texto: valorTexto }),
  ]);
}

/* ============================== resumo ================================= */

export function pintarResumo(estado, contexto) {
  const { ano, mes, filtroContaId } = contexto;
  const totais = calc.totaisDoMes(estado, ano, mes, filtroContaId);

  trocar(document.getElementById('resumo-topo'),
    el('div', { class: 'bloco' }, [
      el('h2', { class: 'bloco__titulo', texto: `O mês de ${fmt.mesPorExtenso(ano, mes)}` }),
      el('div', { class: 'mes-resumo' }, [
        el('div', { class: 'mes-resumo__item' }, [
          el('p', { class: 'mes-resumo__rotulo', texto: 'Entrou' }),
          el('p', { class: 'mes-resumo__valor mes-resumo__valor--entrada', texto: fmt.moeda(totais.entrou) }),
        ]),
        el('div', { class: 'mes-resumo__item' }, [
          el('p', { class: 'mes-resumo__rotulo', texto: 'Saiu' }),
          el('p', { class: 'mes-resumo__valor mes-resumo__valor--saida', texto: fmt.moeda(totais.saiu) }),
        ]),
        el('div', { class: 'mes-resumo__item' }, [
          el('p', { class: 'mes-resumo__rotulo', texto: 'Sobrou' }),
          el('p', {
            class: `mes-resumo__valor${totais.sobrou < 0 ? ' mes-resumo__valor--saida' : ''}`,
            texto: fmt.moeda(totais.sobrou),
          }),
        ]),
        el('div', { class: 'mes-resumo__item' }, [
          el('p', { class: 'mes-resumo__rotulo', texto: 'Lançamentos' }),
          el('p', { class: 'mes-resumo__valor', texto: String(totais.quantidade) }),
        ]),
      ]),
    ]));

  /* ---- gasto por categoria ---- */
  const categorias = calc.porCategoria(estado, ano, mes, filtroContaId);
  const maior = categorias.length ? categorias[0].valor : 0;

  trocar(document.getElementById('resumo-categorias'),
    el('div', { class: 'bloco' }, [
      el('h2', { class: 'bloco__titulo', texto: 'Para onde foi o dinheiro' }),
      categorias.length
        ? el('div', {}, categorias.map((linha) => el('div', { class: 'barra-categoria' }, [
            el('div', { class: 'barra-categoria__topo' }, [
              el('span', { class: 'barra-categoria__nome' }, [
                linha.categoria.nome,
                el('span', { class: 'barra-categoria__fatia', texto: `${Math.round(linha.fatia * 100)}%` }),
              ]),
              el('span', { class: 'barra-categoria__valor', texto: fmt.moeda(linha.valor) }),
            ]),
            el('div', { class: 'barra-categoria__trilho' }, [
              el('div', {
                class: 'barra-categoria__preenchimento',
                estilo: { width: `${maior ? (linha.valor / maior) * 100 : 0}%` },
              }),
            ]),
          ])))
        : vazio('Sem gastos neste mês', 'Quando houver gastos, eles aparecem aqui ranqueados por categoria.'),
    ]));

  /* ---- gasto por banco ---- */
  const contas = calc.porConta(estado, ano, mes);
  const maiorConta = Math.max(...contas.map((c) => c.valor), 0);

  trocar(document.getElementById('resumo-contas'),
    el('div', { class: 'bloco' }, [
      el('h2', { class: 'bloco__titulo', texto: 'Quanto saiu de cada banco' }),
      el('div', {}, contas.map((linha) => el('div', { class: 'barra-categoria' }, [
        el('div', { class: 'barra-categoria__topo' }, [
          el('span', { class: 'barra-categoria__nome', texto: linha.conta.nome }),
          el('span', { class: 'barra-categoria__valor', texto: fmt.moeda(linha.valor) }),
        ]),
        el('div', { class: 'barra-categoria__trilho' }, [
          el('div', {
            class: 'barra-categoria__preenchimento',
            estilo: {
              width: `${maiorConta ? (linha.valor / maiorConta) * 100 : 0}%`,
              background: hexDaConta(linha.conta),
            },
          }),
        ]),
      ]))),
    ]));

  /* ---- evolução ---- */
  const meses = calc.evolucao(estado, ano, mes, 6);
  const teto = Math.max(...meses.flatMap((m) => [m.entrou, m.saiu]), 1);

  trocar(document.getElementById('resumo-evolucao'),
    el('div', { class: 'bloco' }, [
      el('h2', { class: 'bloco__titulo', texto: 'Últimos seis meses' }),
      el('div', { class: 'evolucao' }, meses.map((m, i) => el('div', { class: 'evolucao__mes' }, [
        el('div', { class: 'evolucao__colunas' }, [
          el('span', {
            class: 'evolucao__coluna evolucao__coluna--entrada',
            estilo: { height: `${(m.entrou / teto) * 100}%` },
            title: `Entrou ${fmt.moeda(m.entrou)}`,
          }),
          el('span', {
            class: 'evolucao__coluna evolucao__coluna--saida',
            estilo: { height: `${(m.saiu / teto) * 100}%` },
            title: `Saiu ${fmt.moeda(m.saiu)}`,
          }),
        ]),
        el('span', {
          class: `evolucao__rotulo${i === meses.length - 1 ? ' evolucao__rotulo--atual' : ''}`,
          texto: fmt.mesCurto(m.mes),
        }),
      ]))),
      el('div', { class: 'legenda' }, [
        el('span', { class: 'legenda__item' }, [
          el('span', { class: 'legenda__marca', estilo: { background: 'var(--entrada-viva)' } }), 'Entrou',
        ]),
        el('span', { class: 'legenda__item' }, [
          el('span', { class: 'legenda__marca', estilo: { background: 'var(--saida-viva)' } }), 'Saiu',
        ]),
      ]),
    ]));
}

/* ============================= ajustes ================================= */

/** A linha de apoio nos Ajustes: um banco tem saldo, um cartão tem fatura. */
function descricaoDaConta(estado, conta) {
  const saldo = calc.saldoDaConta(estado, conta.id);
  if (calc.tipoDaConta(conta) !== 'cartao') return `Saldo hoje ${fmt.moeda(saldo)}`;
  return saldo > 0
    ? `Cartão · pago a mais ${fmt.moeda(saldo)}`
    : `Cartão · fatura em aberto ${fmt.moeda(-saldo)}`;
}

export function pintarAjustes(estado, contexto) {
  const { aoEditarConta, aoEditarCategoria } = contexto;

  trocar(document.getElementById('ajustes-contas'),
    [...estado.contas]
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
      .map((conta) => el('button', {
        class: 'linha-ajuste',
        type: 'button',
        onclick: () => aoEditarConta(conta.id),
      }, [
        el('span', { class: 'linha-ajuste__spine', estilo: { background: hexDaConta(conta) } }),
        el('span', { class: 'linha-ajuste__corpo' }, [
          el('span', { class: 'linha-ajuste__nome', texto: conta.nome }),
          el('span', {
            class: 'linha-ajuste__meta',
            texto: descricaoDaConta(estado, conta),
          }),
        ]),
        el('span', { class: 'linha-ajuste__acao', texto: 'Editar' }),
      ])));

  const ordenadas = [...estado.categorias].sort((a, b) =>
    a.tipo === b.tipo ? a.nome.localeCompare(b.nome, 'pt-BR') : (a.tipo === 'saida' ? -1 : 1));

  trocar(document.getElementById('ajustes-categorias'),
    ordenadas.map((cat) => el('button', {
      class: 'linha-ajuste',
      type: 'button',
      onclick: () => aoEditarCategoria(cat.id),
    }, [
      el('span', { class: 'linha-ajuste__spine', estilo: { background: 'var(--linha-forte)' } }),
      el('span', { class: 'linha-ajuste__corpo' }, [
        el('span', { class: 'linha-ajuste__nome', texto: cat.nome }),
        el('span', { class: 'linha-ajuste__meta', texto: cat.tipo === 'entrada' ? 'Entrada' : 'Gasto' }),
      ]),
      el('span', { class: 'linha-ajuste__acao', texto: 'Renomear' }),
    ])));
}
