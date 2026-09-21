import test from 'node:test';
import assert from 'node:assert/strict';
import * as mapear from '../js/mapear.js';

const USUARIO = '11111111-1111-1111-1111-111111111111';

test('conta vai e volta sem perder nada', () => {
  const original = {
    id: 'c1', nome: 'Banco do Brasil', cor: 'azul',
    tipo: 'conta', saldoInicial: 248050, diaVencimento: 10, ordem: 0,
  };
  const volta = mapear.contaParaApp(mapear.contaParaBanco(original, USUARIO));
  assert.deepEqual(volta, original);
});

test('cartão mantém o tipo e a dívida negativa na ida e na volta', () => {
  const cartao = {
    id: 'c2', nome: 'Cartão BB', cor: 'ardosia',
    tipo: 'cartao', saldoInicial: -35740, diaVencimento: 5, ordem: 3,
  };
  const noBanco = mapear.contaParaBanco(cartao, USUARIO);
  assert.equal(noBanco.tipo, 'cartao');
  assert.equal(noBanco.saldo_inicial, -35740); // dívida continua negativa
  assert.equal(noBanco.dia_vencimento, 5);
  assert.deepEqual(mapear.contaParaApp(noBanco), cartao);
});

// Contas gravadas antes de o lembrete existir não têm o campo. Sem um padrão
// aqui, elas voltariam do servidor com `diaVencimento: undefined` e o aviso
// da fatura nunca apareceria para elas.
test('conta antiga, sem dia de vencimento, assume o dia 10', () => {
  const doBanco = {
    id: 'c3', nome: 'Cartão antigo', cor: 'azul',
    tipo: 'cartao', saldo_inicial: -1000, ordem: 1,
  };
  assert.equal(mapear.contaParaApp(doBanco).diaVencimento, 10);
});

test('lançamento simples vai e volta', () => {
  const gasto = {
    id: 'l1', data: '2026-09-18', tipo: 'saida', valor: 14290,
    contaId: 'c1', contaDestinoId: null, categoriaId: 'cat1',
    descricao: 'Feira da semana', criadoEm: '2026-09-18T12:00:00Z',
  };
  assert.deepEqual(mapear.lancamentoParaApp(mapear.lancamentoParaBanco(gasto, USUARIO)), gasto);
});

test('parcelamento sobrevive à ida e volta', () => {
  const parcela = {
    id: 'l2', data: '2026-10-08', tipo: 'saida', valor: 4899,
    contaId: 'cc', contaDestinoId: null, categoriaId: 'cat2',
    descricao: 'Geladeira', criadoEm: '2026-09-08T12:00:00Z',
    grupo: 'g1', parcela: 2, parcelasTotal: 10,
  };
  assert.deepEqual(mapear.lancamentoParaApp(mapear.lancamentoParaBanco(parcela, USUARIO)), parcela);
});

test('lançamento sem parcelamento não ganha campos de parcela', () => {
  const app = mapear.lancamentoParaApp({
    id: 'l3', data: '2026-09-18', tipo: 'saida', valor: 100,
    conta_id: 'c1', conta_destino_id: null, categoria_id: null,
    descricao: '', grupo: null, parcela: null, parcelas_total: null,
  });
  assert.ok(!('grupo' in app), 'não inventa grupo');
  assert.ok(!('parcelasTotal' in app), 'não inventa parcelasTotal');
  // É isso que mantém funcionando as comparações do tipo `parcelasTotal > 1`.
  assert.equal(app.parcelasTotal > 1, false);
});

test('transferência leva destino e não leva categoria', () => {
  const linha = mapear.lancamentoParaBanco({
    id: 'l4', data: '2026-09-17', tipo: 'transferencia', valor: 20000,
    contaId: 'c1', contaDestinoId: 'cc', categoriaId: 'sobra-do-formulario',
    descricao: '',
  }, USUARIO);
  assert.equal(linha.conta_destino_id, 'cc');
  assert.equal(linha.categoria_id, null, 'categoria não faz sentido em transferência');
});

test('gasto não leva destino, mesmo com sobra do formulário', () => {
  const linha = mapear.lancamentoParaBanco({
    id: 'l5', data: '2026-09-17', tipo: 'saida', valor: 5000,
    contaId: 'c1', contaDestinoId: 'sobra-do-formulario', categoriaId: 'cat1',
    descricao: '',
  }, USUARIO);
  assert.equal(linha.conta_destino_id, null);
  assert.equal(linha.categoria_id, 'cat1');
});

test('valor negativo que escape vira positivo antes de ir ao banco', () => {
  // O banco tem `check (valor >= 0)`: o sinal é do tipo, não do número.
  const linha = mapear.lancamentoParaBanco({
    id: 'l6', data: '2026-09-17', tipo: 'saida', valor: -5000, contaId: 'c1',
  }, USUARIO);
  assert.equal(linha.valor, 5000);
});

/* --------------- backup antigo virando dados de conta -------------------- */

test('backup do modo local ganha ids novos sem perder as ligações', () => {
  let n = 0;
  const novoId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

  // Ids no formato antigo, de antes de existir conta no servidor.
  const backup = {
    contas: [{ id: 'bb1', nome: 'Banco do Brasil' }, { id: 'cc1', nome: 'Cartão BB' }],
    categorias: [{ id: 'mer1', nome: 'Mercado', tipo: 'saida' }],
    lancamentos: [
      { id: 'l1', contaId: 'bb1', categoriaId: 'mer1', contaDestinoId: null },
      { id: 'l2', tipo: 'transferencia', contaId: 'bb1', contaDestinoId: 'cc1', categoriaId: null },
      { id: 'l3', contaId: 'cc1', categoriaId: 'mer1', grupo: 'g1', parcela: 1, parcelasTotal: 3 },
    ],
  };

  const r = mapear.renomearIds(backup, novoId);
  const [bb, cc] = r.contas.map((c) => c.id);
  const mercado = r.categorias[0].id;

  // O essencial: quem apontava para a conta continua apontando para ELA.
  assert.equal(r.lancamentos[0].contaId, bb);
  assert.equal(r.lancamentos[1].contaId, bb);
  assert.equal(r.lancamentos[1].contaDestinoId, cc);
  assert.equal(r.lancamentos[2].contaId, cc);
  assert.equal(r.lancamentos[0].categoriaId, mercado);
  assert.equal(r.lancamentos[2].categoriaId, mercado);

  // Nenhum id antigo sobreviveu, e todos viraram uuid.
  const todos = [...r.contas, ...r.categorias, ...r.lancamentos].map((x) => x.id);
  assert.ok(todos.every((v) => /^[0-9a-f-]{36}$/.test(v)), 'todos viraram uuid');
  assert.ok(!todos.includes('bb1'));

  // O grupo de parcelas também é renomeado, e de forma consistente.
  assert.notEqual(r.lancamentos[2].grupo, 'g1');
  assert.ok(/^[0-9a-f-]{36}$/.test(r.lancamentos[2].grupo));
});

test('backup que já tem uuid é restaurado sobre as mesmas linhas', () => {
  const uuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const r = mapear.renomearIds({
    contas: [{ id: uuid, nome: 'Itaú' }],
    categorias: [],
    lancamentos: [{ id: 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee', contaId: uuid }],
  }, () => 'NAO-DEVERIA-SER-USADO');

  assert.equal(r.contas[0].id, uuid, 'id válido não é trocado');
  assert.equal(r.lancamentos[0].contaId, uuid);
});

test('o estado inteiro chega ordenado por conta', () => {
  const estado = mapear.estadoParaApp({
    contas: [
      { id: 'b', nome: 'Nubank', cor: 'roxo', tipo: 'conta', saldo_inicial: 0, ordem: 1 },
      { id: 'a', nome: 'Banco do Brasil', cor: 'azul', tipo: 'conta', saldo_inicial: 100, ordem: 0 },
    ],
    categorias: [{ id: 'x', nome: 'Mercado', tipo: 'saida' }],
    lancamentos: [],
  });
  assert.deepEqual(estado.contas.map((c) => c.nome), ['Banco do Brasil', 'Nubank']);
});

test('gasto que se repete vai e volta sem perder nada', () => {
  const original = {
    id: 'r1', descricao: 'Spotify', valor: 1290, dia: 16, tipo: 'saida',
    contaId: 'c2', categoriaId: 'cat1', natureza: 'corrente',
    desde: '2026-09', ativo: true,
  };
  const volta = mapear.recorrenteParaApp(mapear.recorrenteParaBanco(original, USUARIO));
  assert.deepEqual(volta, original);
});

// A marca que diz de qual gasto repetido o lançamento nasceu tem de
// atravessar o servidor; sem ela, o aviso ofereceria de novo no mês seguinte
// o que já foi lançado.
test('a marca do gasto repetido atravessa a ida e a volta', () => {
  const gasto = {
    id: 'l9', data: '2026-09-16', tipo: 'saida', valor: 1290,
    contaId: 'c2', contaDestinoId: null, categoriaId: 'cat1',
    descricao: 'Spotify', criadoEm: '2026-09-16T12:00:00.000Z',
    natureza: 'corrente', recorrenteId: 'r1',
  };
  const noBanco = mapear.lancamentoParaBanco(gasto, USUARIO);
  assert.equal(noBanco.recorrente_id, 'r1');
  assert.equal(mapear.lancamentoParaApp(noBanco).recorrenteId, 'r1');

  // Lançamento normal não ganha a chave à toa.
  const semMarca = mapear.lancamentoParaApp(mapear.lancamentoParaBanco(
    { ...gasto, recorrenteId: undefined }, USUARIO));
  assert.equal('recorrenteId' in semMarca, false);
});

test('a cor da categoria vai e volta, e a ausência dela não vira invenção', () => {
  const comCor = { id: 'cat9', nome: 'Alimentação', tipo: 'saida', cor: 'turquesa' };
  assert.deepEqual(
    mapear.categoriaParaApp(mapear.categoriaParaBanco(comCor, USUARIO)), comCor);

  // Categoria antiga, sem cor guardada: continua sem. Quem decide o que
  // mostrar no lugar é a tela, não o servidor.
  const semCor = { id: 'cat8', nome: 'Lazer', tipo: 'saida', cor: null };
  assert.equal(mapear.categoriaParaBanco(semCor, USUARIO).cor, null);
  assert.equal(mapear.categoriaParaApp({ id: 'cat8', nome: 'Lazer', tipo: 'saida' }).cor, null);
});

test('restaurar backup não solta o gasto que se repete do banco dele', () => {
  const novoId = (() => { let n = 0; return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`; })();
  const r = mapear.renomearIds({
    contas: [{ id: 'bb1', nome: 'Cartão BB' }],
    categorias: [{ id: 'cat1', nome: 'Assinaturas' }],
    lancamentos: [{ id: 'l1', contaId: 'bb1', categoriaId: 'cat1', recorrenteId: 'r1' }],
    recorrentes: [{ id: 'r1', descricao: 'Spotify', dia: 16, contaId: 'bb1', categoriaId: 'cat1' }],
  }, novoId);

  // Sem isto o Spotify voltava apontando para um banco que não existe mais.
  assert.equal(r.recorrentes[0].contaId, r.contas[0].id);
  assert.equal(r.recorrentes[0].categoriaId, r.categorias[0].id);
  assert.notEqual(r.recorrentes[0].id, 'r1');

  // E o lançamento que ele gerou continua sabendo de quem veio, senão o app
  // cobraria o Spotify de novo num mês já pago.
  assert.equal(r.lancamentos[0].recorrenteId, r.recorrentes[0].id);
});
