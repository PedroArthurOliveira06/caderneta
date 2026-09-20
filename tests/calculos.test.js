import test from 'node:test';
import assert from 'node:assert/strict';
import * as calc from '../js/calculos.js';
import * as fmt from '../js/formato.js';

/* Cenário usado em quase todos os testes: três bancos, um mês de movimento.
   Valores em centavos. */
function cenario() {
  return {
    contas: [
      { id: 'a', nome: 'Banco A', cor: 'azul', saldoInicial: 100000, ordem: 0 },
      { id: 'b', nome: 'Banco B', cor: 'verde', saldoInicial: 50000, ordem: 1 },
      { id: 'c', nome: 'Banco C', cor: 'roxo', saldoInicial: 0, ordem: 2 },
    ],
    categorias: [
      { id: 'mercado', nome: 'Mercado', tipo: 'saida' },
      { id: 'casa', nome: 'Casa', tipo: 'saida' },
      { id: 'salario', nome: 'Salário', tipo: 'entrada' },
    ],
    lancamentos: [
      { id: '1', data: '2026-09-05', tipo: 'entrada', valor: 320000, contaId: 'a', categoriaId: 'salario' },
      { id: '2', data: '2026-09-07', tipo: 'saida', valor: 14290, contaId: 'a', categoriaId: 'mercado' },
      { id: '3', data: '2026-09-10', tipo: 'saida', valor: 21000, contaId: 'b', categoriaId: 'casa' },
      { id: '4', data: '2026-09-12', tipo: 'transferencia', valor: 100000, contaId: 'a', contaDestinoId: 'c' },
      { id: '5', data: '2026-09-15', tipo: 'saida', valor: 8710, contaId: 'c', categoriaId: 'mercado' },
      { id: '6', data: '2026-10-02', tipo: 'saida', valor: 50000, contaId: 'a', categoriaId: 'casa' },
    ],
  };
}

test('saldo de cada conta soma o saldo inicial e os movimentos', () => {
  const e = cenario();
  // A: 1000 + 3200 (salário) − 142,90 (mercado) − 1000 (transferiu) = 3057,10
  assert.equal(calc.saldoDaConta(e, 'a', '2026-09-30'), 305710);
  // B: 500 − 210 = 290
  assert.equal(calc.saldoDaConta(e, 'b', '2026-09-30'), 29000);
  // C: 0 + 1000 (recebeu) − 87,10 = 912,90
  assert.equal(calc.saldoDaConta(e, 'c', '2026-09-30'), 91290);
});

test('o saldo respeita a data de corte e ignora o futuro', () => {
  const e = cenario();
  // Em 30/09 a compra de 500,00 de outubro ainda não pode ter descontado.
  assert.equal(calc.saldoDaConta(e, 'a', '2026-09-30'), 305710);
  assert.equal(calc.saldoDaConta(e, 'a', '2026-10-31'), 255710);
});

test('transferência entre bancos não conta como gasto do mês', () => {
  const e = cenario();
  const t = calc.totaisDoMes(e, 2026, 9);
  assert.equal(t.entrou, 320000);
  // 142,90 + 210 + 87,10 = 440. Os 1000 transferidos NÃO entram aqui.
  assert.equal(t.saiu, 44000);
  assert.equal(t.sobrou, 276000);
});

test('transferência aparece no extrato das duas contas envolvidas', () => {
  const e = cenario();
  const daA = calc.lancamentosDoMes(e, 2026, 9, 'a').map((l) => l.id);
  const daC = calc.lancamentosDoMes(e, 2026, 9, 'c').map((l) => l.id);
  assert.ok(daA.includes('4'), 'sai da conta A');
  assert.ok(daC.includes('4'), 'entra na conta C');
});

test('o total geral não muda quando o dinheiro só troca de banco', () => {
  const e = cenario();
  const antes = calc.saldos(e, '2026-09-11').total;
  const depois = calc.saldos(e, '2026-09-12').total;
  assert.equal(antes, depois);
});

test('o extrato vem do mais recente para o mais antigo e só do mês pedido', () => {
  const e = cenario();
  const ids = calc.lancamentosDoMes(e, 2026, 9).map((l) => l.id);
  assert.deepEqual(ids, ['5', '4', '3', '2', '1']);
});

test('gasto por categoria ordena pelo maior e calcula a fatia', () => {
  const e = cenario();
  const linhas = calc.porCategoria(e, 2026, 9);
  assert.equal(linhas[0].categoria.nome, 'Mercado'); // 142,90 + 87,10 = 230
  assert.equal(linhas[0].valor, 23000);
  assert.equal(linhas[1].valor, 21000);
  assert.equal(Math.round(linhas[0].fatia * 100), 52);
});

/* ------------------------- cartão de crédito ---------------------------- */

/* O mesmo cenário, mais um cartão de crédito: uma compra de 500 no crédito e
   um pagamento parcial de 300 da fatura, saindo do Banco do Brasil. */
function cenarioComCartao() {
  const e = cenario();
  e.contas.push({ id: 'cc', nome: 'Cartão BB', cor: 'ardosia', tipo: 'cartao', saldoInicial: 0, ordem: 3 });
  e.lancamentos.push(
    { id: '7', data: '2026-09-09', tipo: 'saida', valor: 50000, contaId: 'cc', categoriaId: 'casa' },
    { id: '8', data: '2026-09-20', tipo: 'transferencia', valor: 30000, contaId: 'a', contaDestinoId: 'cc' }
  );
  return e;
}

test('comprar no crédito não mexe no saldo do banco', () => {
  const semCartao = calc.saldoDaConta(cenario(), 'a', '2026-09-19');
  const comCartao = calc.saldoDaConta(cenarioComCartao(), 'a', '2026-09-19');
  // Dia 19: a compra de 500 no crédito já aconteceu, o pagamento (dia 20)
  // ainda não. O saldo do BB tem de ser exatamente o mesmo dos dois lados.
  assert.equal(comCartao, semCartao);
});

test('a fatura em aberto é a soma do que foi comprado menos o que foi pago', () => {
  const e = cenarioComCartao();
  assert.equal(calc.faturaEmAberto(e, '2026-09-19'), 50000);
  assert.equal(calc.faturaEmAberto(e, '2026-09-30'), 20000); // 500 − 300 pagos
  assert.equal(calc.saldoDaConta(e, 'cc', '2026-09-30'), -20000);
});

test('pagar a fatura tira do banco e abate a dívida, sem virar gasto', () => {
  const e = cenarioComCartao();
  const antes = calc.saldoDaConta(e, 'a', '2026-09-19');
  const depois = calc.saldoDaConta(e, 'a', '2026-09-20');
  assert.equal(depois, antes - 30000);
  // A compra de 500 no crédito é gasto do mês; o pagamento da fatura não —
  // senão os mesmos 300 seriam contados duas vezes.
  assert.equal(calc.totaisDoMes(e, 2026, 9).saiu, 44000 + 50000);
});

test('o total dos bancos não inclui a dívida do cartão', () => {
  const e = cenarioComCartao();
  const bancos = calc.saldos(e, '2026-09-30', 'conta');
  const cartoes = calc.saldos(e, '2026-09-30', 'cartao');
  assert.equal(bancos.linhas.length, 3);
  assert.equal(cartoes.linhas.length, 1);
  // Bancos: 3057,10 − 300 pagos + 290 + 912,90 = 3960,00
  assert.equal(bancos.total, 396000);
  assert.equal(cartoes.total, -20000);
});

test('conta gravada antes dos cartões existirem continua sendo banco', () => {
  const e = cenario(); // nenhuma conta tem o campo `tipo`
  assert.equal(calc.tipoDaConta(e.contas[0]), 'conta');
  assert.equal(calc.saldos(e, '2026-09-30', 'conta').linhas.length, 3);
  assert.equal(calc.faturaEmAberto(e, '2026-09-30'), 0);
});

test('fatura paga a mais não vira dívida negativa', () => {
  const e = cenarioComCartao();
  e.lancamentos.push({ id: '9', data: '2026-09-25', tipo: 'transferencia', valor: 90000, contaId: 'a', contaDestinoId: 'cc' });
  assert.equal(calc.saldoDaConta(e, 'cc', '2026-09-30'), 70000); // crédito a favor
  assert.equal(calc.faturaEmAberto(e, '2026-09-30'), 0);
});

test('a fatura fica em aberto desde a compra até o dia do débito', () => {
  // O ciclo real do cartão: compra-se num mês, paga-se no seguinte. Lançar a
  // compra no mês do pagamento incha um mês e esvazia o outro — os dois
  // passam a mentir.
  const e = cenario();
  e.contas.push({ id: 'cc', nome: 'Cartão BB', tipo: 'cartao', saldoInicial: 0, ordem: 3 });
  e.lancamentos = [
    { id: 'c1', data: '2026-08-12', tipo: 'saida', valor: 40000, contaId: 'cc' },
    { id: 'c2', data: '2026-08-25', tipo: 'saida', valor: 25229, contaId: 'cc' },
    { id: 'p', data: '2026-09-10', tipo: 'transferencia', valor: 65229, contaId: 'a', contaDestinoId: 'cc' },
  ];

  assert.equal(calc.faturaEmAberto(e, '2026-08-31'), 65229, 'em agosto ele deve');
  assert.equal(calc.faturaEmAberto(e, '2026-09-09'), 65229, 'na véspera ainda deve');
  assert.equal(calc.faturaEmAberto(e, '2026-09-10'), 0, 'no dia do débito, quitada');

  // O gasto conta em AGOSTO, quando aconteceu. Setembro só vê a transferência,
  // que não é gasto.
  assert.equal(calc.totaisDoMes(e, 2026, 8).saiu, 65229);
  assert.equal(calc.totaisDoMes(e, 2026, 9).saiu, 0);
});

/* ------------------------ a fatura que vai vencer ----------------------- */

/* Compras em agosto (652,29) que vencem no dia 10 de setembro. */
function cenarioDeFatura() {
  const e = cenario();
  e.contas.push({ id: 'cc', nome: 'Cartão BB', tipo: 'cartao', saldoInicial: 0, ordem: 3, diaVencimento: 10 });
  e.lancamentos = [
    { id: 'c1', data: '2026-08-12', tipo: 'saida', valor: 40000, contaId: 'cc' },
    { id: 'c2', data: '2026-08-25', tipo: 'saida', valor: 25229, contaId: 'cc' },
  ];
  return e;
}

test('a fatura pendente é a que fechou no fim do mês passado', () => {
  const f = calc.faturaAVencer(cenarioDeFatura(), 'cc', '2026-09-03');
  assert.equal(f.fechamento, '2026-08-31');
  assert.equal(f.vencimento, '2026-09-10');
  assert.equal(f.devido, 65229);
  assert.equal(f.falta, 65229);
});

test('compra feita depois do fechamento é da PRÓXIMA fatura', () => {
  const e = cenarioDeFatura();
  e.lancamentos.push({ id: 'c3', data: '2026-09-02', tipo: 'saida', valor: 9900, contaId: 'cc' });

  // Os 99,00 de setembro não podem inflar a fatura que vence dia 10.
  assert.equal(calc.faturaAVencer(e, 'cc', '2026-09-03').falta, 65229);
});

test('pagar zera o aviso, e pagar a menos deixa o que falta', () => {
  const e = cenarioDeFatura();
  e.lancamentos.push({ id: 'p', data: '2026-09-10', tipo: 'transferencia', valor: 65229, contaId: 'a', contaDestinoId: 'cc' });

  assert.equal(calc.faturaAVencer(e, 'cc', '2026-09-09').falta, 65229, 'na véspera ainda falta');
  assert.equal(calc.faturaAVencer(e, 'cc', '2026-09-10').falta, 0, 'pago no dia');
  assert.deepEqual(calc.faturasAVencer(e, '2026-09-10'), [], 'e o aviso some');

  const parcial = cenarioDeFatura();
  parcial.lancamentos.push({ id: 'p', data: '2026-09-05', tipo: 'transferencia', valor: 20000, contaId: 'a', contaDestinoId: 'cc' });
  assert.equal(calc.faturaAVencer(parcial, 'cc', '2026-09-06').falta, 45229);
});

test('pagamento anterior ao fechamento não é contado duas vezes', () => {
  const e = cenarioDeFatura();
  // Pagou 200 ainda em agosto: isso já abateu o saldo daquela data.
  e.lancamentos.push({ id: 'p', data: '2026-08-28', tipo: 'transferencia', valor: 20000, contaId: 'a', contaDestinoId: 'cc' });

  const f = calc.faturaAVencer(e, 'cc', '2026-09-03');
  assert.equal(f.devido, 45229, 'o adiantamento já está no saldo do fechamento');
  assert.equal(f.pago, 0, 'e não conta de novo como pagamento da fatura');
  assert.equal(f.falta, 45229);
});

test('o vencimento acompanha o mês em que se está olhando', () => {
  const e = cenarioDeFatura();
  assert.equal(calc.faturaAVencer(e, 'cc', '2026-09-25').vencimento, '2026-09-10');
  // Em fevereiro o mês anterior é janeiro, com 31 dias.
  assert.equal(calc.faturaAVencer(e, 'cc', '2027-02-05').fechamento, '2027-01-31');
  // E em março, fevereiro — que tem 28 em ano normal.
  assert.equal(calc.faturaAVencer(e, 'cc', '2027-03-05').fechamento, '2027-02-28');
});

test('dia de vencimento fora do calendário é puxado para um que existe', () => {
  const e = cenarioDeFatura();
  e.contas.find((c) => c.id === 'cc').diaVencimento = 31;
  // Dia 31 não existe em todo mês. Uma data que some é pior que uma
  // aproximada, então ela é limitada a 28.
  assert.equal(calc.faturaAVencer(e, 'cc', '2026-09-03').vencimento, '2026-09-28');
});

test('conta que não é cartão não tem fatura', () => {
  assert.equal(calc.faturaAVencer(cenarioDeFatura(), 'a', '2026-09-03'), null);
});

/* --------------------- caixinha e natureza do gasto --------------------- */

test('caixinha é dinheiro seu, mas fora do que dá para gastar hoje', () => {
  const e = cenario();
  e.contas.push({ id: 'cx', nome: 'Caixinha do Nubank', tipo: 'reserva', saldoInicial: 0, ordem: 3 });
  // Guardar 800 do Nubank na caixinha é transferência: o total não muda,
  // mas o disponível cai e o guardado sobe.
  e.lancamentos.push({ id: 'g1', data: '2026-09-20', tipo: 'transferencia', valor: 80000, contaId: 'b', contaDestinoId: 'cx' });

  const bancos = calc.saldos(e, '2026-09-30', 'conta');
  const guardado = calc.saldos(e, '2026-09-30', 'reserva');

  assert.equal(bancos.linhas.length, 3, 'a caixinha não entra na lista dos bancos');
  assert.equal(guardado.total, 80000);
  // Banco B tinha 290,00 e guardou 800? Não cabe — fica negativo, e o app
  // mostra isso em vez de esconder.
  assert.equal(calc.saldoDaConta(e, 'b', '2026-09-30'), 29000 - 80000);
  // Guardar não é gasto.
  assert.equal(calc.totaisDoMes(e, 2026, 9).saiu, 44000);
});

test('a fatura se divide em corrente e esporádico — e só a do cartão', () => {
  const e = cenario();
  e.contas.push({ id: 'cc', nome: 'Cartão BB', tipo: 'cartao', saldoInicial: 0, ordem: 3 });
  e.lancamentos = [
    { id: '1', data: '2026-09-05', tipo: 'saida', valor: 4500, contaId: 'cc', natureza: 'corrente' },
    { id: '2', data: '2026-09-06', tipo: 'saida', valor: 1290, contaId: 'cc', natureza: 'corrente' },
    { id: '3', data: '2026-09-07', tipo: 'saida', valor: 20000, contaId: 'cc', natureza: 'esporadico' },
    // Gasto em conta corrente NÃO entra nessa divisão: a pergunta é da
    // fatura, não da vida inteira.
    { id: '4', data: '2026-09-08', tipo: 'saida', valor: 99900, contaId: 'a', natureza: 'corrente' },
  ];

  const r = calc.porNatureza(e, 2026, 9);
  assert.equal(r.corrente, 5790);
  assert.equal(r.esporadico, 20000);
  assert.equal(r.total, 25790, 'o gasto do banco ficou de fora');
  assert.equal(Math.round(r.fatiaCorrente * 100), 22);
});

test('gasto de cartão sem rótulo conta como esporádico', () => {
  // Dizer que algo se repete todo mês é uma afirmação; na dúvida, não se faz.
  assert.equal(calc.naturezaDoLancamento({ natureza: 'corrente' }), 'corrente');
  assert.equal(calc.naturezaDoLancamento({}), 'esporadico');
  assert.equal(calc.naturezaDoLancamento(null), 'esporadico');
});

/* ---------------------------- parcelamento ------------------------------ */

test('parcela quebrada não perde nem inventa centavo', () => {
  // 100,00 em 3x: 33,333... não existe em dinheiro. O resto vai na primeira.
  const p = fmt.dividirEmParcelas(10000, 3);
  assert.deepEqual(p, [3334, 3333, 3333]);
  assert.equal(p.reduce((a, b) => a + b, 0), 10000);

  // A soma tem de fechar exata para qualquer valor e qualquer número de vezes.
  for (const total of [10000, 48990, 1, 99999, 123457]) {
    for (const vezes of [2, 3, 6, 7, 10, 12, 24]) {
      const soma = fmt.dividirEmParcelas(total, vezes).reduce((a, b) => a + b, 0);
      assert.equal(soma, total, `${total} em ${vezes}x`);
    }
  }
});

test('parcela de 489,90 em 10x dá exatamente 48,99', () => {
  assert.deepEqual(new Set(fmt.dividirEmParcelas(48990, 10)), new Set([4899]));
});

test('parcela cai no último dia quando o mês de destino é mais curto', () => {
  assert.equal(fmt.somarMeses('2026-01-31', 1), '2026-02-28'); // não 03/03
  assert.equal(fmt.somarMeses('2028-01-31', 1), '2028-02-29'); // bissexto
  assert.equal(fmt.somarMeses('2026-03-31', 1), '2026-04-30');
  assert.equal(fmt.somarMeses('2026-09-15', 3), '2026-12-15');
  assert.equal(fmt.somarMeses('2026-11-20', 3), '2027-02-20'); // vira o ano
});

test('a fatura só mostra as parcelas que já venceram', () => {
  const e = cenario();
  e.contas.push({ id: 'cc', nome: 'Cartão BB', tipo: 'cartao', saldoInicial: 0, ordem: 3 });
  // Geladeira de 489,90 em 10x, a partir de setembro.
  fmt.dividirEmParcelas(48990, 10).forEach((valor, i) => {
    e.lancamentos.push({
      id: `p${i}`,
      data: fmt.somarMeses('2026-09-08', i),
      tipo: 'saida',
      valor,
      contaId: 'cc',
      categoriaId: 'casa',
      grupo: 'g1',
      parcela: i + 1,
      parcelasTotal: 10,
    });
  });

  // Em setembro, só a 1ª parcela pesou — não os 489,90 inteiros.
  assert.equal(calc.faturaEmAberto(e, '2026-09-30'), 4899);
  assert.equal(calc.faturaEmAberto(e, '2026-11-30'), 4899 * 3);
  assert.equal(calc.faturaEmAberto(e, '2027-06-30'), 48990); // todas as 10

  // E cada mês carrega só a SUA parcela no "saiu" — nunca a compra inteira.
  // Outubro já tinha uma saída de 500,00 no cenário base, então o total do
  // mês é ela mais uma única parcela de 48,99.
  assert.equal(calc.totaisDoMes(e, 2026, 10).saiu, 50000 + 4899);
  assert.equal(calc.totaisDoMes(e, 2026, 11).saiu, 4899);
});

test('dinheiro digitado em qualquer formato vira o mesmo inteiro', () => {
  assert.equal(fmt.paraCentavos('1.234,56'), 123456);
  assert.equal(fmt.paraCentavos('1234,56'), 123456);
  assert.equal(fmt.paraCentavos('1234.56'), 123456);
  assert.equal(fmt.paraCentavos('R$ 89'), 8900);
  assert.equal(fmt.paraCentavos(''), 0);
  assert.equal(fmt.paraCentavos('abc'), 0);
});

test('centavos somam sem o erro de ponto flutuante', () => {
  // Em float, 0.1 + 0.2 !== 0.3. Em centavos, 10 + 20 === 30, sempre.
  const soma = [10, 20, 30, 1, 1, 1].reduce((a, b) => a + b, 0);
  assert.equal(soma, 63);
  // O separador que o pt-BR põe depois do "R$" é espaço fixo (U+00A0), não
  // espaço comum. Some no visual, mas quebra comparação de texto e busca —
  // por isso o teste é explícito quanto a ele.
  assert.equal(fmt.moeda(soma), 'R$ 0,63');
});

test('a data não escorrega um dia por causa de fuso horário', () => {
  assert.equal(fmt.dataCurta('2026-09-17'), '17/09');
  assert.equal(fmt.paraData('2026-09-17').getDate(), 17);
  assert.equal(fmt.dataLonga('2026-01-01'), '1 de janeiro');
});

test('título de mês começa com maiúscula; data no meio da frase, não', () => {
  // A regra do português é mês em minúscula — mas só dentro de uma frase.
  // "Setembro de 2026" é o título da tela, e título começa com maiúscula.
  assert.equal(fmt.mesPorExtenso(2026, 9), 'Setembro de 2026');
  assert.equal(fmt.mesCurto(9), 'Set');
  assert.equal(fmt.diaDaSemana('2026-09-17'), 'Qui');
  assert.equal(fmt.dataLonga('2026-09-17'), '17 de setembro');
});

test('virada de ano ao navegar entre meses', () => {
  assert.deepEqual(fmt.deslocarMes(2026, 1, -1), { ano: 2025, mes: 12 });
  assert.deepEqual(fmt.deslocarMes(2026, 12, 1), { ano: 2027, mes: 1 });
});

test('fevereiro de ano bissexto termina no dia 29', () => {
  assert.equal(fmt.limitesDoMes(2028, 2).fim, '2028-02-29');
  assert.equal(fmt.limitesDoMes(2026, 2).fim, '2026-02-28');
});

/* =========================== busca no extrato =========================== */

/* Cenário próprio: a busca só prova o que promete se os achados estiverem
   espalhados por meses diferentes e escritos com acento. */
function paraBuscar() {
  return {
    contas: [
      { id: 'bb', nome: 'Banco do Brasil', tipo: 'conta', saldoInicial: 0, ordem: 0 },
      { id: 'nu', nome: 'Nubank', tipo: 'conta', saldoInicial: 0, ordem: 1 },
      { id: 'cbb', nome: 'Cartão BB', tipo: 'cartao', saldoInicial: 0, ordem: 2 },
    ],
    categorias: [
      { id: 'alim', nome: 'Alimentação', tipo: 'saida' },
      { id: 'saude', nome: 'Saúde', tipo: 'saida' },
    ],
    lancamentos: [
      { id: '1', data: '2026-03-14', tipo: 'saida', valor: 4590, contaId: 'nu', categoriaId: 'alim', descricao: 'iFood' },
      { id: '2', data: '2026-07-02', tipo: 'saida', valor: 18000, contaId: 'bb', categoriaId: 'saude', descricao: 'Veterinário' },
      { id: '3', data: '2026-09-08', tipo: 'saida', valor: 4590, contaId: 'cbb', categoriaId: 'alim', descricao: 'iFood' },
      { id: '4', data: '2026-09-10', tipo: 'transferencia', valor: 57050, contaId: 'bb', contaDestinoId: 'cbb', descricao: 'Fatura do Cartão BB' },
      { id: '5', data: '2026-09-11', tipo: 'entrada', valor: 200000, contaId: 'bb', descricao: 'Ajuda da família' },
    ],
  };
}

// O motivo de a busca existir: quem procura não lembra o mês.
test('a busca atravessa os meses, do mais recente para o mais antigo', () => {
  const achados = calc.buscar(paraBuscar(), 'ifood');
  assert.deepEqual(achados.map((l) => l.data), ['2026-09-08', '2026-03-14']);
});

test('acento e maiúscula não atrapalham quem digita com pressa', () => {
  const e = paraBuscar();
  assert.equal(calc.buscar(e, 'veterinario').length, 1);
  assert.equal(calc.buscar(e, 'VETERINÁRIO').length, 1);
  assert.equal(calc.buscar(e, 'alimentacao').length, 2); // acha pela categoria
  assert.equal(calc.buscar(e, 'família').length, 1);
});

// Duas palavras estreitam o resultado mesmo vindo de pedaços diferentes do
// lançamento: uma da descrição, outra do nome do banco.
test('cada palavra pode vir de um pedaço diferente do lançamento', () => {
  const e = paraBuscar();
  assert.deepEqual(calc.buscar(e, 'ifood nubank').map((l) => l.id), ['1']);
  assert.deepEqual(calc.buscar(e, 'ifood cartão').map((l) => l.id), ['3']);
  assert.equal(calc.buscar(e, 'ifood veterinário').length, 0);
});

test('o valor escrito e a data também são procuráveis', () => {
  const e = paraBuscar();
  assert.equal(calc.buscar(e, '45,90').length, 2);
  assert.deepEqual(calc.buscar(e, '10/09').map((l) => l.id), ['4']);
});

// Buscar com um banco filtrado tem de continuar respeitando o filtro, senão
// a tela mostraria lançamento de um banco que a pessoa acabou de excluir.
test('a busca respeita o banco filtrado, inclusive como destino', () => {
  const e = paraBuscar();
  assert.deepEqual(calc.buscar(e, 'ifood', 'nu').map((l) => l.id), ['1']);
  // A fatura sai do BB e entra no cartão: o cartão a vê como destino.
  assert.deepEqual(calc.buscar(e, 'fatura', 'cbb').map((l) => l.id), ['4']);
});

test('busca vazia ou só com espaços não devolve o histórico inteiro', () => {
  const e = paraBuscar();
  assert.deepEqual(calc.buscar(e, ''), []);
  assert.deepEqual(calc.buscar(e, '   '), []);
  assert.deepEqual(calc.buscar(e, undefined), []);
});

// O total do que foi achado obedece à mesma regra do mês: a transferência
// aparece na lista, porque é um lançamento de verdade, mas não entra nem em
// "entrou" nem em "saiu".
test('o total do que foi achado deixa a transferência de fora', () => {
  const e = paraBuscar();
  const achados = calc.buscar(e, 'cartão bb'); // pega a compra e a fatura
  assert.equal(achados.length, 2);
  assert.deepEqual(calc.totaisDe(achados), {
    entrou: 0, saiu: 4590, sobrou: -4590, quantidade: 2,
  });
});

// A linha do extrato e a busca leem o mesmo rótulo. Se cada uma tivesse o
// seu, procurar por "fatura" não acharia a linha escrita "Pagamento da
// fatura" — e ninguém teria como adivinhar o porquê.
test('o rótulo mostrado na tela é o mesmo que a busca procura', () => {
  const e = paraBuscar();
  const fatura = e.lancamentos.find((l) => l.id === '4');
  fatura.descricao = '';   // como o app grava quando ninguém escreve nada

  assert.equal(calc.rotuloDoLancamento(e, fatura), 'Pagamento da fatura');
  assert.deepEqual(calc.buscar(e, 'fatura').map((l) => l.id), ['4']);

  // Sem descrição e sem cartão no destino, o nome é o do mundo real também.
  const entreBancos = { id: '9', data: '2026-05-01', tipo: 'transferencia', valor: 100, contaId: 'bb', contaDestinoId: 'nu', descricao: '' };
  assert.equal(calc.rotuloDoLancamento(e, entreBancos), 'Transferência entre bancos');

  // Gasto sem descrição se chama pela categoria, e é por ela que se acha.
  const semDescricao = { id: '8', data: '2026-05-02', tipo: 'saida', valor: 900, contaId: 'bb', categoriaId: 'saude', descricao: '' };
  assert.equal(calc.rotuloDoLancamento(e, semDescricao), 'Saúde');
});

/* ====================== gastos que se repetem =========================== */

function comRecorrentes() {
  return {
    contas: [
      { id: 'cbb', nome: 'Cartão BB', tipo: 'cartao', saldoInicial: 0, ordem: 0 },
    ],
    categorias: [{ id: 'ass', nome: 'Assinaturas', tipo: 'saida' }],
    recorrentes: [
      { id: 'apple', descricao: 'Apple', valor: 1990, dia: 15, contaId: 'cbb', categoriaId: 'ass', tipo: 'saida', natureza: 'corrente', desde: '2026-09', ativo: true },
      { id: 'spotify', descricao: 'Spotify', valor: 1290, dia: 16, contaId: 'cbb', categoriaId: 'ass', tipo: 'saida', natureza: 'corrente', desde: '2026-09', ativo: true },
    ],
    lancamentos: [],
  };
}

test('o gasto que se repete só aparece depois que o dia chega', () => {
  const e = comRecorrentes();
  // Dia 14: nenhum dos dois chegou ainda.
  assert.equal(calc.recorrentesPendentes(e, 2026, 9, '2026-09-14').length, 0);
  // Dia 15: só a Apple.
  assert.deepEqual(
    calc.recorrentesPendentes(e, 2026, 9, '2026-09-15').map((p) => p.recorrente.id),
    ['apple']
  );
  // Dia 19: os dois, na ordem em que caem.
  assert.deepEqual(
    calc.recorrentesPendentes(e, 2026, 9, '2026-09-19').map((p) => p.recorrente.id),
    ['apple', 'spotify']
  );
});

// O que marca "já lançado" é o recorrenteId, não o nome nem o valor: o dia em
// que o Spotify subir de preço, comparar por valor passaria a oferecer de novo
// um gasto que já está lá.
test('o que já foi lançado no mês some do aviso, mesmo com o valor corrigido', () => {
  const e = comRecorrentes();
  e.lancamentos.push({
    id: 'x', data: '2026-09-16', tipo: 'saida', valor: 1390,
    contaId: 'cbb', categoriaId: 'ass', descricao: 'Spotify', recorrenteId: 'spotify',
  });
  assert.deepEqual(
    calc.recorrentesPendentes(e, 2026, 9, '2026-09-19').map((p) => p.recorrente.id),
    ['apple']
  );
});

// Lançar em setembro não pode apagar o aviso de outubro: são meses diferentes.
test('lançar num mês não marca o mês seguinte como resolvido', () => {
  const e = comRecorrentes();
  e.lancamentos.push({
    id: 'x', data: '2026-09-15', tipo: 'saida', valor: 1990,
    contaId: 'cbb', descricao: 'Apple', recorrenteId: 'apple',
  });
  assert.equal(calc.recorrentesPendentes(e, 2026, 9, '2026-10-20').length, 1); // só o Spotify
  assert.equal(calc.recorrentesPendentes(e, 2026, 10, '2026-10-20').length, 2); // os dois de novo
});

// Cadastrar hoje não pode fazer o app oferecer os meses anteriores: aquele
// dinheiro, se saiu, já está lançado de outro jeito.
test('mês anterior ao cadastro não oferece nada', () => {
  const e = comRecorrentes();
  assert.equal(calc.recorrentesPendentes(e, 2026, 8, '2026-09-19').length, 0);
  assert.equal(calc.recorrentesPendentes(e, 2026, 3, '2026-09-19').length, 0);
});

test('desligar um gasto que se repete o tira do aviso sem apagar o histórico', () => {
  const e = comRecorrentes();
  e.recorrentes[0].ativo = false;
  assert.deepEqual(
    calc.recorrentesPendentes(e, 2026, 9, '2026-09-19').map((p) => p.recorrente.id),
    ['spotify']
  );
});

// Um cartão excluído deixaria o lançamento órfão, apontando para um id que
// não existe mais — e o saldo de ninguém mudaria.
test('gasto apontando para conta que não existe mais não é oferecido', () => {
  const e = comRecorrentes();
  e.contas = [];
  assert.equal(calc.recorrentesPendentes(e, 2026, 9, '2026-09-19').length, 0);
});

test('dia 31 cai no último dia dos meses que não têm 31', () => {
  const r = { dia: 31 };
  assert.equal(calc.dataDoRecorrente(r, 2026, 1), '2026-01-31');
  assert.equal(calc.dataDoRecorrente(r, 2026, 4), '2026-04-30');
  assert.equal(calc.dataDoRecorrente(r, 2026, 2), '2026-02-28');
  assert.equal(calc.dataDoRecorrente(r, 2028, 2), '2028-02-29'); // bissexto
});

test('o total por mês soma só os que estão ligados, e só os gastos', () => {
  const e = comRecorrentes();
  assert.equal(calc.totalDosRecorrentes(e), 3280); // 19,90 + 12,90
  e.recorrentes[1].ativo = false;
  assert.equal(calc.totalDosRecorrentes(e), 1990);
  e.recorrentes.push({ id: 's', descricao: 'Salário', valor: 500000, dia: 5, contaId: 'cbb', tipo: 'entrada', ativo: true });
  assert.equal(calc.totalDosRecorrentes(e), 1990); // entrada não é gasto
});
