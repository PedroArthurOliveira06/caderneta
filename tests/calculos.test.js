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
