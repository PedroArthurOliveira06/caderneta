import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretar, explicar, atalhosFrequentes, simplificar } from '../js/interpretar.js';

const CONTEXTO = {
  hoje: '2026-09-18',
  contas: [
    { id: 'bb', nome: 'Banco do Brasil' },
    { id: 'nu', nome: 'Nubank' },
    { id: 'it', nome: 'Itaú' },
    { id: 'cc', nome: 'Cartão BB', tipo: 'cartao' },
  ],
  categorias: [
    { id: 'mer', nome: 'Mercado', tipo: 'saida' },
    { id: 'ali', nome: 'Alimentação', tipo: 'saida' },
    { id: 'tra', nome: 'Transporte', tipo: 'saida' },
    { id: 'sal', nome: 'Salário', tipo: 'entrada' },
    { id: 'fam', nome: 'Ajuda da família', tipo: 'entrada' },
  ],
};

const ler = (texto) => interpretar(texto, CONTEXTO);

test('o caso mais curto que interessa: "mercado 45"', () => {
  const r = ler('mercado 45');
  assert.equal(r.valor, 4500);
  assert.equal(r.categoriaId, 'mer');
  assert.equal(r.tipo, 'saida');
  assert.equal(r.data, '2026-09-18');
  assert.equal(r.descricao, '');
  assert.ok(r.entendido);
});

test('a ordem das palavras não importa', () => {
  const a = ler('mercado 45');
  const b = ler('45 mercado');
  assert.equal(a.valor, b.valor);
  assert.equal(a.categoriaId, b.categoriaId);
});

test('acento e maiúscula não atrapalham quem digita com pressa', () => {
  assert.equal(ler('alimentacao 32').categoriaId, 'ali');
  assert.equal(ler('ALIMENTAÇÃO 32').categoriaId, 'ali');
  assert.equal(ler('itau 50').contaId, 'it');
  assert.equal(simplificar('Ajuda da família'), 'ajuda da familia');
});

test('centavos com vírgula ou ponto dão no mesmo', () => {
  assert.equal(ler('uber 23,50').valor, 2350);
  assert.equal(ler('uber 23.50').valor, 2350);
});

test('o banco citado pelo nome é reconhecido', () => {
  assert.equal(ler('mercado 45 nubank').contaId, 'nu');
  assert.equal(ler('mercado 45 banco do brasil').contaId, 'bb');
});

test('nome mais longo ganha: "Cartão BB" não vira "BB" solto', () => {
  const r = ler('geladeira 489,90 cartao bb');
  assert.equal(r.contaId, 'cc');
  assert.equal(r.descricao, 'Geladeira');
});

test('a categoria é quem revela que é entrada, sem a pessoa dizer', () => {
  const r = ler('salario 3200');
  assert.equal(r.tipo, 'entrada');
  assert.equal(r.valor, 320000);
  assert.equal(ler('ajuda da familia 500').tipo, 'entrada');
});

test('o "+" na frente força entrada mesmo sem categoria', () => {
  const r = ler('+ 120 devolucao');
  assert.equal(r.tipo, 'entrada');
  assert.equal(r.valor, 12000);
  assert.equal(ler('recebi 300 nubank').tipo, 'entrada');
});

test('"ontem" volta um dia, inclusive virando o mês', () => {
  assert.equal(ler('ontem farmacia 89').data, '2026-09-17');
  assert.equal(interpretar('ontem pao 8', { ...CONTEXTO, hoje: '2026-03-01' }).data, '2026-02-28');
  assert.equal(interpretar('ontem pao 8', { ...CONTEXTO, hoje: '2026-01-01' }).data, '2025-12-31');
});

test('data escrita como 12/09 é entendida', () => {
  const r = ler('12/09 luz 210 itau');
  assert.equal(r.data, '2026-09-12');
  assert.equal(r.contaId, 'it');
  assert.equal(r.valor, 21000);
  assert.equal(r.descricao, 'Luz');
});

test('data sem ano que cairia no futuro é lida como do ano passado', () => {
  // Em 18/09/2026, "20/12" quase sempre quer dizer dezembro passado.
  assert.equal(ler('20/12 presente 150').data, '2025-12-20');
  assert.equal(ler('20/12/2026 presente 150').data, '2026-12-20'); // com ano, obedece
});

test('o que sobra vira descrição, sem sobrar espaço solto', () => {
  const r = ler('mercado 45 feira da semana nubank');
  assert.equal(r.categoriaId, 'mer');
  assert.equal(r.contaId, 'nu');
  assert.equal(r.descricao, 'Feira da semana', 'a descrição volta com maiúscula');
});

test('sem valor, o app não finge que entendeu', () => {
  assert.equal(ler('mercado').entendido, false);
  assert.equal(ler('').entendido, false);
  assert.equal(ler('   ').entendido, false);
});

test('a explicação diz em português o que foi entendido', () => {
  const r = ler('12/09 mercado 45 nubank');
  assert.equal(explicar(r, CONTEXTO), 'Gasto · Mercado · Nubank · 12/09');
  assert.equal(explicar(ler('salario 3200'), CONTEXTO), 'Entrada · Salário');
});

/* ----------------------------- atalhos ---------------------------------- */

test('atalho só aparece para o que se repete', () => {
  const estado = {
    categorias: CONTEXTO.categorias,
    lancamentos: [
      { tipo: 'saida', descricao: 'Padaria', contaId: 'bb', categoriaId: 'ali', valor: 1200, data: '2026-09-01' },
      { tipo: 'saida', descricao: 'Padaria', contaId: 'bb', categoriaId: 'ali', valor: 1500, data: '2026-09-10' },
      { tipo: 'saida', descricao: 'Cinema', contaId: 'nu', categoriaId: 'ali', valor: 4000, data: '2026-09-05' },
      { tipo: 'entrada', descricao: 'Salário', contaId: 'bb', categoriaId: 'sal', valor: 320000, data: '2026-09-05' },
    ],
  };
  const atalhos = atalhosFrequentes(estado);
  assert.equal(atalhos.length, 1);
  assert.equal(atalhos[0].rotulo, 'Padaria');
  assert.equal(atalhos[0].vezes, 2);
  // O valor sugerido é o da última vez, não o da primeira.
  assert.equal(atalhos[0].ultimoValor, 1500);
});

test('parcelas da mesma compra não viram atalho', () => {
  const estado = {
    categorias: CONTEXTO.categorias,
    lancamentos: [
      // Uma geladeira em 3x parece "três vezes a mesma compra", mas é um ato
      // só — e o atalho copiaria o valor de uma parcela para um gasto avulso.
      { tipo: 'saida', descricao: 'Geladeira', contaId: 'cc', categoriaId: 'ali', valor: 33334, data: '2026-09-01', grupo: 'g', parcela: 1, parcelasTotal: 3 },
      { tipo: 'saida', descricao: 'Geladeira', contaId: 'cc', categoriaId: 'ali', valor: 33333, data: '2026-10-01', grupo: 'g', parcela: 2, parcelasTotal: 3 },
      { tipo: 'saida', descricao: 'Geladeira', contaId: 'cc', categoriaId: 'ali', valor: 33333, data: '2026-11-01', grupo: 'g', parcela: 3, parcelasTotal: 3 },
    ],
  };
  assert.deepEqual(atalhosFrequentes(estado), []);
});

test('o mesmo nome em bancos diferentes são atalhos diferentes', () => {
  const estado = {
    categorias: CONTEXTO.categorias,
    lancamentos: [
      { tipo: 'saida', descricao: 'Almoço', contaId: 'bb', categoriaId: 'ali', valor: 3000, data: '2026-09-01' },
      { tipo: 'saida', descricao: 'Almoço', contaId: 'bb', categoriaId: 'ali', valor: 3200, data: '2026-09-02' },
      { tipo: 'saida', descricao: 'Almoço', contaId: 'nu', categoriaId: 'ali', valor: 2800, data: '2026-09-03' },
      { tipo: 'saida', descricao: 'Almoço', contaId: 'nu', categoriaId: 'ali', valor: 2900, data: '2026-09-04' },
    ],
  };
  const atalhos = atalhosFrequentes(estado);
  assert.equal(atalhos.length, 2);
  assert.deepEqual(atalhos.map((a) => a.contaId).sort(), ['bb', 'nu']);
});
