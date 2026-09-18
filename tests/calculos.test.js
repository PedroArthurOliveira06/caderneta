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

test('virada de ano ao navegar entre meses', () => {
  assert.deepEqual(fmt.deslocarMes(2026, 1, -1), { ano: 2025, mes: 12 });
  assert.deepEqual(fmt.deslocarMes(2026, 12, 1), { ano: 2027, mes: 1 });
});

test('fevereiro de ano bissexto termina no dia 29', () => {
  assert.equal(fmt.limitesDoMes(2028, 2).fim, '2028-02-29');
  assert.equal(fmt.limitesDoMes(2026, 2).fim, '2026-02-28');
});
