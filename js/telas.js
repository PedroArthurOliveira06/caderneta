/* =========================================================================
   Desenho das três telas. Cada função recebe o estado e o mês em foco e
   redesenha o seu pedaço. Sem estado próprio — quem guarda "que mês estou
   vendo" é o app.js.
   ========================================================================= */

import * as fmt from './formato.js';
import * as calc from './calculos.js';
import { el, trocar, hexDaConta, hexDaCategoria, vazio } from './ui.js';

/* ========================= painel de saldos ============================ */

export function pintarSaldos(estado, contexto) {
  const alvo = document.getElementById('painel-saldos');
  const { ano, mes, filtroContaId, aoTocarConta } = contexto;
  const { inicio, fim } = fmt.limitesDoMes(ano, mes);

  // O dia anterior ao primeiro do mês: é o saldo com que cada banco começou,
  // e ver de onde veio explica o número de hoje melhor que o número sozinho.
  const vespera = fmt.somarDias(inicio, -1);
  const antes = new Map(calc.saldos(estado, vespera).linhas.map((l) => [l.conta.id, l.saldo]));

  // Bancos e cartões são lidos separados de propósito: um diz quanto existe,
  // o outro quanto se deve. Misturar num número só esconde as duas respostas.
  const { linhas, total } = calc.saldos(estado, fim, 'conta');
  const reservas = calc.saldos(estado, fim, 'reserva');
  const cartoes = calc.saldos(estado, fim, 'cartao');
  const totais = calc.totaisDoMes(estado, ano, mes, filtroContaId);

  // Só saldos positivos entram na proporção da faixa: um saldo negativo não
  // tem "largura" de dinheiro guardado, e somá-lo distorceria as fatias.
  const somaPositiva = linhas.reduce((s, l) => s + Math.max(l.saldo, 0), 0);

  // O aviso de 'não confere' mora na própria linha do saldo, e não numa
  // faixa no topo: a tela tem de começar mostrando extrato, e um alerta
  // longe do número que ele acusa faz procurar.
  const naoConfere = new Map(calc.conferencias(estado, fmt.hojeISO())
    .filter((c) => c.ultima && c.diferenca !== 0)
    .map((c) => [c.conta.id, c.diferenca]));

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

    // Uma lista só. Antes a mesma pergunta — onde está o meu dinheiro —
    // era respondida em dois lugares: uma lista de bancos e dois ladrilhos
    // separados para a caixinha e a fatura. Quem lê tinha de juntar as duas
    // metades de cabeça, e a tela inicial acabava antes do primeiro
    // lançamento aparecer.
    el('div', { class: 'saldos-contas' }, [
      ...linhas.map((l) => linhaDeSaldo(l, null, aoTocarConta, antes.get(l.conta.id), naoConfere.get(l.conta.id))),

      // Uma frase explica os dois grupos de uma vez, no lugar de um rótulo
      // repetido em cada linha: o que vem abaixo dela existe, mas não entra
      // no número grande.
      reservas.linhas.length || cartoes.linhas.length
        ? el('p', { class: 'saldos-contas__corte', texto: 'Fora do saldo acima' })
        : null,

      // "De onde veio" só nos bancos, que foi o que ele pediu. Na caixinha o
      // saldo quase não muda, e no cartão o número já É o do mês — em nenhum
      // dos dois a comparação com o mês passado responde alguma coisa.
      ...reservas.linhas.map((l) => linhaDeSaldo(l, null, aoTocarConta, undefined, naoConfere.get(l.conta.id))),
      ...cartoes.linhas.map((l) => linhaDeSaldo(l, 'fatura', aoTocarConta)),
    ]),

    // Entrou e saiu viram uma linha, não duas caixas: o mês inteiro tem uma
    // tela só para ele, e repeti-lo aqui em tamanho de destaque fazia dois
    // números de apoio pesarem o mesmo que os saldos.
    el('p', { class: 'mes-linha' }, [
      el('span', { class: 'mes-linha__rotulo', texto: 'No mês' }),
      el('span', { class: 'mes-linha__entrada', texto: `+ ${fmt.moeda(totais.entrou)}` }),
      el('span', { class: 'mes-linha__saida', texto: `− ${fmt.moeda(totais.saiu)}` }),
    ]),
  );
}

/**
 * Uma linha da lista de saldos.
 *
 * `marca` nomeia o que o número é, e só o cartão precisa: sem ela,
 * "Cartão BB  R$ 275,62" leria como dinheiro que existe, e é o contrário —
 * é dívida. Por isso vem na cor de saída e com o valor em módulo: quem deve
 * 275 não pensa "tenho menos 275".
 *
 * A caixinha não leva marca. O saldo dela é saldo de verdade, o nome já diz
 * que é caixinha, e a frase acima do grupo já explicou por que ela está
 * separada. Um rótulo a mais ali só fazia o nome quebrar em duas linhas.
 */
function linhaDeSaldo(l, marca, aoTocarConta, saldoAntes, diferenca) {
  const deve = marca === 'fatura' && l.saldo < 0;
  const valor = deve ? -l.saldo : l.saldo;
  const mexeu = typeof saldoAntes === 'number' && saldoAntes !== l.saldo;

  return el('button', {
    class: 'saldo-conta',
    type: 'button',
    onclick: () => aoTocarConta(l.conta.id),
  }, [
    el('span', { class: 'saldo-conta__spine', estilo: { background: hexDaConta(l.conta) } }),
    el('span', { class: 'saldo-conta__corpo' }, [
      el('span', { class: 'saldo-conta__nome', texto: l.conta.nome }),
      // Só quando mudou. Repetir o mesmo número duas vezes na mesma linha
      // não conta nada, e num mês sem movimento seria só ruído.
      // A conferência vem na frente do 'começou o mês com': saber que o
      // número está errado importa mais do que saber de onde ele veio.
      diferenca
        ? el('span', {
            class: 'saldo-conta__antes saldo-conta__antes--alerta',
            texto: `não confere: ${fmt.moeda(Math.abs(diferenca))} `
              + `${diferenca > 0 ? 'a mais' : 'a menos'} que o banco`,
          })
        : mexeu
          ? el('span', {
              class: 'saldo-conta__antes',
              texto: `começou o mês com ${fmt.moeda(marca === 'fatura' ? -saldoAntes : saldoAntes)}`,
            })
          : null,
    ]),
    marca
      ? el('span', { class: 'saldo-conta__marca', texto: deve ? 'fatura' : marca })
      : null,
    el('span', {
      class: `saldo-conta__valor${deve || valor < 0 ? ' saldo-conta__valor--negativo' : ''}`,
      texto: fmt.moeda(valor),
    }),
  ]);
}

/**
 * O aviso da fatura que fechou e ainda não foi paga.
 *
 * Aparece só quando há o que pagar, e some sozinho quando o pagamento é
 * lançado. Um aviso que fica na tela mesmo resolvido vira paisagem, e aí
 * deixa de avisar qualquer coisa.
 *
 * O botão não abre uma tela para a pessoa preencher: ele já chega com banco,
 * valor e data prontos. Lembrar sem ajudar a resolver é só cobrança.
 */
export function pintarAvisoDeFatura(estado, contexto) {
  const alvo = document.getElementById('aviso-fatura');
  const { hoje, aoPagarFatura } = contexto;
  const pendentes = calc.faturasAVencer(estado, hoje);

  if (!pendentes.length) {
    trocar(alvo);
    return;
  }

  trocar(alvo, pendentes.map((f) => {
    const dias = fmt.diasEntre(hoje, f.vencimento);
    const atrasada = dias < 0;

    const quando = atrasada
      ? `Venceu dia ${fmt.dataCurta(f.vencimento)}`
      : dias === 0
        ? 'Vence hoje'
        : dias === 1
          ? 'Vence amanhã'
          : `Vence em ${dias} dias, no dia ${Number(f.vencimento.slice(-2))}`;

    return el('div', { class: `fatura${atrasada ? ' fatura--atrasada' : ''}` }, [
      el('div', { class: 'fatura__corpo' }, [
        el('p', { class: 'fatura__titulo', texto: `Fatura do ${f.conta.nome}` }),
        el('p', { class: 'fatura__valor', texto: fmt.moeda(f.falta) }),
        el('p', {
          class: 'fatura__quando',
          texto: f.pago > 0 ? `${quando} · já pagou ${fmt.moeda(f.pago)}` : quando,
        }),
      ]),
      el('button', {
        class: 'botao botao--principal',
        type: 'button',
        texto: 'Lançar pagamento',
        onclick: () => aoPagarFatura(f),
      }),
    ]);
  }));
}

/**
 * O aviso dos gastos que se repetem e ainda não entraram no mês.
 *
 * Um botão só para todos: quem tem Apple dia 15 e Spotify dia 16 não quer
 * dois toques por mês, quer zero. O toque existe porque lançar dinheiro
 * sozinho, sem ninguém mandar, é como um app passa a mentir quando uma
 * assinatura muda de preço ou é cancelada.
 */
export function pintarAvisoDeRecorrentes(estado, contexto) {
  const alvo = document.getElementById('aviso-recorrentes');
  const { ano, mes, hoje, aoLancarRecorrentes } = contexto;
  const pendentes = calc.recorrentesPendentes(estado, ano, mes, hoje);

  if (!pendentes.length) {
    trocar(alvo);
    return;
  }

  const total = pendentes.reduce((soma, p) => soma
    + (p.recorrente.tipo === 'entrada' ? 0 : p.recorrente.valor), 0);

  trocar(alvo, el('div', { class: 'repetem' }, [
    el('p', {
      class: 'repetem__titulo',
      texto: pendentes.length === 1
        ? 'Um gasto que se repete ainda não entrou'
        : `${pendentes.length} gastos que se repetem ainda não entraram`,
    }),

    el('ul', { class: 'repetem__lista' }, pendentes.map(({ recorrente: r, data }) => {
      const conta = estado.contas.find((c) => c.id === r.contaId);
      return el('li', { class: 'repetem__item' }, [
        el('span', { class: 'repetem__ponto', estilo: { background: hexDaConta(conta) } }),
        el('span', { class: 'repetem__nome', texto: r.descricao }),
        el('span', { class: 'repetem__dia', texto: `dia ${Number(data.slice(-2))}` }),
        el('span', {
          class: `repetem__valor${r.tipo === 'entrada' ? ' repetem__valor--entrada' : ''}`,
          texto: fmt.moeda(r.valor),
        }),
      ]);
    })),

    el('button', {
      class: 'botao botao--principal botao--largo',
      type: 'button',
      texto: pendentes.length === 1
        ? 'Lançar'
        : `Lançar os ${pendentes.length} (${fmt.moeda(total)})`,
      onclick: () => aoLancarRecorrentes(pendentes),
    }),
  ]));
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

  // A busca mora aqui, junto dos filtros, porque faz o mesmo serviço deles:
  // estreitar o que está à vista. E porque na barra do mês ela era o terceiro
  // botão de um lado só — o que empurrava o nome do mês 24px para fora do
  // centro em todas as abas.
  trocar(alvo,
    el('button', {
      class: 'pilula pilula--busca',
      type: 'button',
      'aria-label': 'Procurar em todo o histórico',
      onclick: () => contexto.aoBuscar(),
    }, [
      el('svg', { viewBox: '0 0 24 24', class: 'pilula__lupa', 'aria-hidden': 'true' }, [
        el('circle', { cx: '11', cy: '11', r: '6' }),
        el('path', { d: 'M15.5 15.5L20 20' }),
      ]),
      'Buscar',
    ]),
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

  // A lista inteira é tocável, mas nada dizia isso — e quem lança dois dias
  // depois precisa justamente disso para corrigir a data. A dica aparece só
  // enquanto o mês tem poucos lançamentos, que é quando ainda se aprende.
  const dica = lista.length <= 6
    ? el('p', { class: 'dica-extrato', texto: 'Toque em um lançamento para mudar valor, data ou banco.' })
    : null;

  trocar(alvo, [dica, ...calc.agruparPorDia(lista).map((grupo) => {
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
  })]);
}

/**
 * O resultado da busca, no lugar do extrato do mês.
 *
 * Mostra o ano em cada dia, coisa que o extrato do mês não precisa: aqui os
 * achados vêm de meses diferentes, e "14 de março" sem o ano é ambíguo assim
 * que o app tiver mais de um ano de histórico.
 *
 * O total vem em cima porque é o que quase sempre se quer saber: a pergunta
 * costuma ser "quanto eu já gastei com isso?", não "quais foram".
 */
export function pintarBusca(estado, contexto) {
  const alvo = document.getElementById('lista-extrato');
  const { termo, filtroContaId, aoTocarLancamento } = contexto;

  if (!String(termo || '').trim()) {
    trocar(alvo, vazio(
      'Procure em todo o histórico',
      'Serve o nome do gasto, a categoria, o banco, o valor ou a data — "ifood", "45,90", "10/09".'
    ));
    return;
  }

  const achados = calc.buscar(estado, termo, filtroContaId);

  if (!achados.length) {
    trocar(alvo, vazio(
      `Nada encontrado para "${termo.trim()}"`,
      filtroContaId
        ? 'Talvez esteja em outro banco: toque em "Todos os bancos" logo acima.'
        : 'Tente uma palavra só, ou parte dela.'
    ));
    return;
  }

  const totais = calc.totaisDe(achados);

  trocar(alvo, [
    el('div', { class: 'busca-total' }, [
      el('p', {
        class: 'busca-total__conta',
        texto: achados.length === 1 ? '1 lançamento' : `${achados.length} lançamentos`,
      }),
      el('div', { class: 'busca-total__numeros' }, [
        totais.saiu
          ? el('span', { class: 'busca-total__saida', texto: `− ${fmt.moeda(totais.saiu)}` })
          : null,
        totais.entrou
          ? el('span', { class: 'busca-total__entrada', texto: `+ ${fmt.moeda(totais.entrou)}` })
          : null,
      ]),
    ]),

    ...calc.agruparPorDia(achados).map((grupo) => el('section', { class: 'dia' }, [
      el('header', { class: 'dia__cabecalho' }, [
        el('span', { texto: `${fmt.dataLonga(grupo.data)} de ${grupo.data.slice(0, 4)}` }),
      ]),
      el('div', { class: 'dia__itens' },
        grupo.itens.map((l) => linhaDoExtrato(estado, l, aoTocarLancamento))),
    ])),
  ]);
}

function linhaDoExtrato(estado, l, aoTocar) {
  const conta = estado.contas.find((c) => c.id === l.contaId);
  const destino = estado.contas.find((c) => c.id === l.contaDestinoId);
  const categoria = estado.categorias.find((c) => c.id === l.categoriaId);

  let detalhe;
  let valorTexto;
  let classeValor;

  // O rótulo vem do calculos.js para a busca poder procurar exatamente o
  // texto que aparece aqui. Transferir para um cartão tem um nome só no mundo
  // real — pagar a fatura — e "transferência" seria linguagem de sistema.
  const titulo = calc.rotuloDoLancamento(estado, l);

  if (l.tipo === 'transferencia') {
    detalhe = `${conta ? conta.nome : '—'} → ${destino ? destino.nome : '—'}`;
    valorTexto = fmt.moeda(l.valor);
    classeValor = 'item__valor--transferencia';
  } else {
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

/**
 * O aviso de que há lançamentos sem categoria esperando.
 *
 * Mora no Resumo porque é lá que a falta dói: "Para onde foi o dinheiro" com
 * metade do mês em "Sem categoria" não responde nada. O aviso conta o
 * histórico inteiro, não só o mês — o buraco veio da importação da planilha
 * antiga, e ele está espalhado por todos os meses.
 */
/**
 * As categorias que fugiram da média dos meses anteriores.
 *
 * O texto diz os três números que sustentam a conta — quanto foi, quanto
 * costuma ser, e de quantos meses saiu essa média — porque um aviso que só
 * grita "está alto!" pede confiança cega. Com os números à vista, ele pode
 * ser conferido e discordado.
 *
 * E nenhum juízo: "acima do seu normal", não "você gastou demais". O app não
 * sabe se o mês tinha um aniversário dentro.
 */
export function pintarAcimaDoNormal(estado, contexto) {
  const alvo = document.getElementById('resumo-acima');
  const { ano, mes, hoje } = contexto;
  const achados = calc.categoriasAcimaDoNormal(estado, ano, mes);

  if (!achados.length) {
    trocar(alvo);
    return;
  }

  const emCurso = fmt.chaveMes(hoje) === `${ano}-${String(mes).padStart(2, '0')}`;

  trocar(alvo, el('div', { class: 'bloco' }, [
    el('h2', { class: 'bloco__titulo', texto: 'Acima do seu normal' }),

    ...achados.map((a) => el('div', { class: 'acima' }, [
      el('div', { class: 'acima__topo' }, [
        el('span', { class: 'acima__nome', texto: a.categoria.nome }),
        el('span', { class: 'acima__valor', texto: fmt.moeda(a.valor) }),
      ]),
      el('p', {
        class: 'acima__frase',
        texto: `${emCurso ? 'Já são' : 'Foram'} ${fmt.moeda(a.excesso)} a mais que a média de `
          + `${fmt.moeda(a.media)}, dos ${a.mesesComparados} meses anteriores em que houve esse gasto.`,
      }),
    ])),
  ]));
}

export function pintarAvisoDeClassificar(estado, contexto) {
  const alvo = document.getElementById('aviso-classificar');
  const quantos = calc.quantosSemCategoria(estado);

  if (!quantos) {
    trocar(alvo);
    return;
  }

  const grupos = calc.paraClassificar(estado).length;

  trocar(alvo, el('div', { class: 'bloco classificar-aviso' }, [
    el('p', { class: 'classificar-aviso__titulo', texto: quantos === 1
      ? 'Um lançamento ainda não tem categoria'
      : `${quantos} lançamentos ainda não têm categoria` }),
    el('p', { class: 'ajuda', texto: grupos === 1
      ? 'Sem categoria eles não aparecem em "Para onde foi o dinheiro".'
      : `Sem categoria eles não aparecem em "Para onde foi o dinheiro". Como se repetem pelo nome, são ${grupos} escolhas, não ${quantos}.` }),
    el('button', {
      class: 'botao botao--principal botao--largo',
      type: 'button',
      texto: 'Classificar agora',
      onclick: () => contexto.aoClassificar(),
    }),
  ]));
}

/**
 * Uma barra de categoria: nome, quanto, quanto isso é do total, e — quando
 * há com que comparar — o tanto que foge do normal dela.
 *
 * Ela é um BOTÃO porque o número de um mês não responde a pergunta que vem
 * logo depois: 'isso está subindo ou foi só este mês?'. Tocar abre os doze
 * meses daquela categoria.
 */
/** Quantos meses cabem entre o primeiro lançamento e o mês que está na tela. */
function mesesDeHistorico(estado, ano, mes, teto) {
  const primeiro = calc.primeiroMes(estado);
  if (!primeiro) return 1;
  const distancia = (ano * 12 + mes) - (primeiro.ano * 12 + primeiro.mes) + 1;
  return Math.max(1, Math.min(teto, distancia));
}

function barraDeCategoria(linha, maior, estado, contexto, tipo = 'saida') {
  const fora = linha.media !== null && linha.diferenca !== null
    // Menos que isso é oscilação de mês, não notícia: dizer '3% acima do
    // normal' em toda barra transformaria o aviso em decoração.
    && Math.abs(linha.diferenca) >= Math.max(2000, linha.media * 0.15);

  const acima = fora && linha.diferenca > 0;
  // Mais gasto OU menos entrada: nos dois casos sobrou menos dinheiro.
  const saiuMais = tipo === 'saida' ? acima : !acima;

  return el('button', {
    class: 'barra-categoria barra-categoria--tocavel',
    type: 'button',
    onclick: () => contexto.aoTocarCategoria && contexto.aoTocarCategoria(linha.categoriaId),
  }, [
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
        estilo: {
          width: `${maior ? (linha.valor / maior) * 100 : 0}%`,
          background: hexDaCategoria(linha.categoria, estado.categorias),
        },
      }),
    ]),
    fora
      ? el('span', {
          class: 'barra-categoria__normal barra-categoria__normal--'
            + (saiuMais ? 'saiu-mais' : 'entrou-mais'),
          texto: `${fmt.moeda(Math.abs(linha.diferenca))} ${acima ? 'acima' : 'abaixo'}`
            + ` do normal (${fmt.moeda(linha.media)})`,
        })
      : null,
  ]);
}

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

  /* ---- o que já estava comprometido antes do mês começar ---- */
  const natureza = calc.porNatureza(estado, ano, mes, filtroContaId);

  trocar(document.getElementById('resumo-natureza'), natureza.total
    ? el('div', { class: 'bloco' }, [
        el('h2', { class: 'bloco__titulo', texto: 'A fatura do cartão' }),

        el('div', { class: 'peso', 'aria-hidden': 'true' }, [
          el('span', {
            class: 'peso__parte peso__parte--frequente',
            estilo: { flexGrow: String(natureza.corrente || 0.0001) },
          }),
          el('span', {
            class: 'peso__parte peso__parte--esporadico',
            estilo: { flexGrow: String(natureza.esporadico || 0.0001) },
          }),
        ]),

        el('div', { class: 'peso-linhas' }, [
          linhaDoPeso('Corrente', natureza.corrente, natureza.total, 'frequente'),
          linhaDoPeso('Esporádico', natureza.esporadico, natureza.total, 'esporadico'),
        ]),

        el('p', { class: 'ajuda', texto: textoDoPeso(natureza) }),
      ])
    : null);

  /* ---- gasto por categoria ---- */
  const categorias = calc.comparadoComONormal(estado, ano, mes, filtroContaId);
  const maior = categorias.length ? categorias[0].valor : 0;

  trocar(document.getElementById('resumo-categorias'),
    el('div', { class: 'bloco' }, [
      el('h2', { class: 'bloco__titulo', texto: 'Para onde foi o dinheiro' }),
      categorias.length
        ? el('div', {}, categorias.map((linha) =>
            barraDeCategoria(linha, maior, estado, contexto)))
        : vazio('Sem gastos neste mês', 'Quando houver gastos, eles aparecem aqui ranqueados por categoria.'),
    ]));

  /* ---- de onde veio o dinheiro ---- */
  // O contrário do bloco de cima. Some quando não houve entrada no mês, em
  // vez de mostrar uma lista vazia: mês sem entrada é comum e não é notícia.
  const entradas = calc.comparadoComONormal(estado, ano, mes, filtroContaId, 'entrada');
  const maiorEntrada = entradas.length ? entradas[0].valor : 0;

  trocar(document.getElementById('resumo-entradas'), entradas.length
    ? el('div', { class: 'bloco' }, [
        el('h2', { class: 'bloco__titulo', texto: 'De onde veio o dinheiro' }),
        el('div', {}, entradas.map((linha) =>
          barraDeCategoria(linha, maiorEntrada, estado, contexto, 'entrada'))),
      ])
    : null);

  /* ---- gasto por banco ---- */
  // Conta sem gasto nenhum no mês sai da lista. A caixinha é o caso que
  // sempre acontece: dela não se gasta, se transfere — e ela ficava ali todo
  // mês exibindo um R$ 0,00 que não é resposta para pergunta nenhuma.
  const contas = calc.porConta(estado, ano, mes).filter((c) => c.valor > 0);
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

  /* ---- estou juntando ou torrando? ---- */
  // Precisa de pelo menos dois meses: um ponto sozinho não é tendência, é
  // um número, e o Extrato já mostra esse número melhor do que um gráfico.
  const patrimonio = calc.patrimonioPorMes(estado, ano, mes,
    mesesDeHistorico(estado, ano, mes, 12));
  const tetoPat = Math.max(...patrimonio.map((m) => m.total), 1);
  const primeiro = patrimonio[0];
  const ultimo = patrimonio[patrimonio.length - 1];
  const variacao = patrimonio.length > 1 ? ultimo.total - primeiro.total : null;

  trocar(document.getElementById('resumo-patrimonio'), patrimonio.length > 1
    ? el('div', { class: 'bloco' }, [
        el('h2', { class: 'bloco__titulo', texto: 'Quanto você tinha, mês a mês' }),

        el('div', { class: 'evolucao' }, patrimonio.map((m, i) => el('div', { class: 'evolucao__mes' }, [
          el('div', { class: 'evolucao__colunas evolucao__colunas--empilhada' }, [
            // Empilhado, e não lado a lado: guardado e disponível são partes
            // do MESMO dinheiro. Duas colunas separadas fariam parecer que
            // mandar para a caixinha some com o dinheiro de um lugar.
            el('span', {
              class: 'evolucao__coluna evolucao__coluna--guardado',
              estilo: { height: `${(Math.max(m.guardado, 0) / tetoPat) * 100}%` },
              title: `Guardado ${fmt.moeda(m.guardado)}`,
            }),
            el('span', {
              class: 'evolucao__coluna evolucao__coluna--disponivel',
              estilo: { height: `${(Math.max(m.disponivel, 0) / tetoPat) * 100}%` },
              title: `Disponível ${fmt.moeda(m.disponivel)}`,
            }),
          ]),
          el('span', {
            class: `evolucao__rotulo${i === patrimonio.length - 1 ? ' evolucao__rotulo--atual' : ''}`,
            texto: fmt.mesCurto(m.mes),
          }),
        ]))),

        el('div', { class: 'legenda' }, [
          el('span', { class: 'legenda__item' }, [
            el('span', { class: 'legenda__marca', estilo: { background: 'var(--disponivel)' } }), 'Disponível',
          ]),
          el('span', { class: 'legenda__item' }, [
            el('span', { class: 'legenda__marca', estilo: { background: 'var(--guardado)' } }), 'Guardado',
          ]),
        ]),

        el('p', { class: 'ajuda', texto: variacao === 0
          ? `Você tem hoje o mesmo que tinha em ${fmt.mesPorExtenso(primeiro.ano, primeiro.mes)}.`
          : variacao > 0
            ? `De ${fmt.mesPorExtenso(primeiro.ano, primeiro.mes)} para cá você juntou ${fmt.moeda(variacao)}.`
            : `De ${fmt.mesPorExtenso(primeiro.ano, primeiro.mes)} para cá você tem ${fmt.moeda(-variacao)} a menos.` }),

        el('p', { class: 'ajuda', texto: 'A fatura do cartão não entra aqui:'
          + ' ela é dívida de um mês, e faria o mês do vencimento dar um tranco'
          + ' que não é do seu dinheiro.' }),
      ])
    : null);

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

function linhaDoPeso(rotulo, valor, total, tipo) {
  return el('div', { class: 'peso-linha' }, [
    el('span', { class: `peso-linha__marca peso-linha__marca--${tipo}` }),
    el('span', { class: 'peso-linha__nome', texto: rotulo }),
    el('span', { class: 'peso-linha__fatia', texto: `${Math.round((valor / total) * 100)}%` }),
    el('span', { class: 'peso-linha__valor', texto: fmt.moeda(valor) }),
  ]);
}

/** A frase que traduz o gráfico. Um número sozinho não diz se é bom ou ruim. */
function textoDoPeso(natureza) {
  const fatia = Math.round(natureza.fatiaCorrente * 100);
  if (fatia >= 80) {
    return 'Quase toda a fatura é gasto corrente: ela vem parecida no mês que vem, sem você fazer nada.';
  }
  if (fatia >= 50) {
    return 'Mais da metade da fatura se repete todo mês. A outra parte é onde houve escolha.';
  }
  if (fatia >= 25) {
    return 'A maior parte da fatura foi de ocasião — é ela que faz o valor variar de um mês para o outro.';
  }
  return 'Quase toda a fatura foi de ocasião. No mês que vem ela tende a vir bem menor.';
}

/* ============================= ajustes ================================= */

/** A linha de apoio nos Ajustes: um banco tem saldo, um cartão tem fatura. */
function descricaoDaConta(estado, conta) {
  const saldo = calc.saldoDaConta(estado, conta.id);
  const tipo = calc.tipoDaConta(conta);

  if (tipo === 'reserva') return `Caixinha · guardado ${fmt.moeda(saldo)}`;
  if (tipo !== 'cartao') return `Saldo hoje ${fmt.moeda(saldo)}`;

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

  pintarConferenciasNosAjustes(estado, contexto);
  pintarRecorrentesNosAjustes(estado, contexto);

  // Gastos primeiro, depois as que servem aos dois, depois as entradas — do
  // mais comum para o menos, que é a ordem em que se procura.
  const ORDEM = { saida: 0, ambos: 1, entrada: 2 };
  const ordenadas = [...estado.categorias].sort((a, b) =>
    (ORDEM[a.tipo] ?? 0) - (ORDEM[b.tipo] ?? 0) || a.nome.localeCompare(b.nome, 'pt-BR'));

  const COMO_CHAMAR = { saida: 'Gasto', entrada: 'Entrada', ambos: 'Gasto e entrada' };

  trocar(document.getElementById('ajustes-categorias'),
    ordenadas.map((cat) => el('button', {
      class: 'linha-ajuste',
      type: 'button',
      onclick: () => aoEditarCategoria(cat.id),
    }, [
      el('span', { class: 'linha-ajuste__spine', estilo: { background: hexDaCategoria(cat, estado.categorias) } }),
      el('span', { class: 'linha-ajuste__corpo' }, [
        el('span', { class: 'linha-ajuste__nome', texto: cat.nome }),
        el('span', { class: 'linha-ajuste__meta', texto: COMO_CHAMAR[cat.tipo] || 'Gasto' }),
      ]),
      el('span', { class: 'linha-ajuste__acao', texto: 'Editar' }),
    ])));
}


/** A lista de gastos que se repetem, dentro dos Ajustes. */
function pintarRecorrentesNosAjustes(estado, contexto) {
  const { aoEditarRecorrente } = contexto;
  const lista = [...(estado.recorrentes || [])].sort((a, b) => a.dia - b.dia);
  const total = calc.totalDosRecorrentes(estado);

  document.getElementById('resumo-recorrentes').textContent = lista.length
    ? `Sai ${fmt.moeda(total)} por mês em gastos que se repetem.`
    : 'Nada cadastrado ainda.';

  trocar(document.getElementById('ajustes-recorrentes'),
    lista.map((r) => {
      const conta = estado.contas.find((c) => c.id === r.contaId);
      const partes = [`Dia ${r.dia}`, conta ? conta.nome : 'Banco removido'];
      if (r.ativo === false) partes.push('desligado');

      return el('button', {
        class: `linha-ajuste${r.ativo === false ? ' linha-ajuste--apagada' : ''}`,
        type: 'button',
        onclick: () => aoEditarRecorrente(r.id),
      }, [
        el('span', { class: 'linha-ajuste__spine', estilo: { background: hexDaConta(conta) } }),
        el('span', { class: 'linha-ajuste__corpo' }, [
          el('span', { class: 'linha-ajuste__nome', texto: r.descricao }),
          el('span', { class: 'linha-ajuste__meta', texto: partes.join(' · ') }),
        ]),
        el('span', {
          class: `linha-ajuste__acao${r.tipo === 'entrada' ? ' linha-ajuste__acao--entrada' : ''}`,
          texto: (r.tipo === 'entrada' ? '+' : '−') + ' ' + fmt.moeda(r.valor),
        }),
      ]);
    }));
}

/**
 * A lista de 'conferir com o banco': uma linha por conta, dizendo se bate.
 *
 * O texto da linha é a resposta inteira, sem precisar abrir nada: ou 'confere',
 * ou quanto está sobrando ou faltando. Um app que só diz 'conferido em 22/09'
 * obriga a pessoa a fazer a subtração de cabeça, que é justamente o trabalho
 * que ele deveria poupar.
 */
function pintarConferenciasNosAjustes(estado, contexto) {
  const { hoje, aoConferir } = contexto;

  trocar(document.getElementById('ajustes-conferencias'),
    calc.conferencias(estado, hoje).map((c) => {
      const bate = c.ultima && c.diferenca === 0;
      const meta = !c.ultima
        ? 'nunca conferido'
        : bate
          ? `confere — conferido ${fmt.dataCurta(c.ultima.data)}`
          : `o app tem ${fmt.moeda(Math.abs(c.diferenca))} `
            + `${c.diferenca > 0 ? 'a mais' : 'a menos'} que o banco`;

      return el('button', {
        class: 'linha-ajuste',
        type: 'button',
        onclick: () => aoConferir(c.conta.id),
      }, [
        el('span', { class: 'linha-ajuste__spine', estilo: { background: hexDaConta(c.conta) } }),
        el('span', { class: 'linha-ajuste__corpo' }, [
          el('span', { class: 'linha-ajuste__nome', texto: c.conta.nome }),
          el('span', {
            class: `linha-ajuste__meta${!bate && c.ultima ? ' linha-ajuste__meta--alerta' : ''}`,
            texto: meta,
          }),
        ]),
        el('span', { class: 'linha-ajuste__acao', texto: c.ultima ? 'Conferir' : 'Conferir' }),
      ]);
    }));
}

/**
 * Os últimos meses de uma categoria, desenhados dentro do diálogo.
 *
 * Responde a pergunta que a barra do mês não responde: se aquilo está
 * subindo com o tempo ou se foi só um mês ruim. A média fica marcada por uma
 * linha, porque 'alto' só quer dizer alguma coisa comparado a alguma coisa.
 */
export function pintarHistoricoDaCategoria(estado, categoriaId, contexto) {
  const { ano, mes, tipo = 'saida' } = contexto;
  const meses = calc.historicoDaCategoria(estado, categoriaId, ano, mes,
    mesesDeHistorico(estado, ano, mes, 12), tipo);
  const categoria = estado.categorias.find((c) => c.id === categoriaId);
  const nome = categoria ? categoria.nome : 'Sem categoria';

  const comGasto = meses.filter((m) => m.valor > 0);
  const media = comGasto.length
    ? Math.round(comGasto.reduce((s, m) => s + m.valor, 0) / comGasto.length)
    : 0;
  const teto = Math.max(...meses.map((m) => m.valor), 1);

  document.getElementById('dialogo-historico-titulo').textContent = nome;

  trocar(document.getElementById('historico-corpo'),
    el('div', { class: 'evolucao evolucao--alta' }, meses.map((m, i) => el('div', { class: 'evolucao__mes' }, [
      el('div', { class: 'evolucao__colunas' }, [
        el('span', {
          class: 'evolucao__coluna evolucao__coluna--categoria',
          estilo: {
            height: `${(m.valor / teto) * 100}%`,
            background: categoria ? hexDaCategoria(categoria, estado.categorias) : 'var(--linha-forte)',
          },
          title: `${fmt.mesCurto(m.mes)}: ${fmt.moeda(m.valor)}`,
        }),
      ]),
      el('span', {
        class: `evolucao__rotulo${i === meses.length - 1 ? ' evolucao__rotulo--atual' : ''}`,
        texto: fmt.mesCurto(m.mes),
      }),
    ]))),

    el('p', { class: 'ajuda', texto: media
      ? `Nos meses em que apareceu, a média é ${fmt.moeda(media)}.`
      : 'Sem gasto nenhum nestes meses.' }),

    // Mês sem gasto fica de fora da média de propósito: o exame que acontece
    // de três em três meses custa o que custa, não um terço disso.
    comGasto.length && comGasto.length < meses.length
      ? el('p', { class: 'ajuda', texto: `Apareceu em ${comGasto.length} dos ${meses.length} meses.`
          + ' Os meses sem gasto não entram na média.' })
      : null,
  );
}
