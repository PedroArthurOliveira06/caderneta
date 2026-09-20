/* =========================================================================
   Testes de js/dados.js — a fila de envio, a importação e o "mover".

   Este é o arquivo que mais pode causar prejuízo: ele decide o que é
   gravado, o que é somado e o que muda de data. Estava sem teste porque
   fala com o navegador; resolve-se com um localStorage de mentira, montado
   antes de o módulo ser carregado.

   Tudo aqui roda no modo local (sem conta), que é o mesmo caminho de
   gravação — o modo servidor só acrescenta a fila de envio por cima.
   ========================================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';

/* Um localStorage de mentira, suficiente para o que dados.js usa. */
const guardado = new Map();
globalThis.localStorage = {
  getItem: (k) => (guardado.has(k) ? guardado.get(k) : null),
  setItem: (k, v) => guardado.set(k, String(v)),
  removeItem: (k) => guardado.delete(k),
  clear: () => guardado.clear(),
  get length() { return guardado.size; },
};
globalThis.alert = () => {};

const dados = await import('../js/dados.js');

/* Cada teste começa de um app vazio, com os três bancos dele. */
function comecarDoZero() {
  guardado.clear();
  dados.apagarTudo();
  dados.definirContasIniciais([
    { nome: 'Banco do Brasil', saldoInicial: 17065, cor: 'amarelo' },
    { nome: 'Nubank', saldoInicial: 0, cor: 'roxo' },
    { nome: 'Itaú', saldoInicial: 0, cor: 'laranja' },
  ]);
}

const acharConta = (nome) => dados.obter().contas.find((c) => c.nome === nome);

/* ------------------------- importar acrescentando ----------------------- */

test('importar soma ao que já existe, sem apagar nada', () => {
  comecarDoZero();
  dados.salvarLancamento({ data: '2026-09-01', tipo: 'saida', valor: 5000, contaId: acharConta('Nubank').id });

  const r = dados.adicionarLancamentos([
    { data: '2026-08-01', tipo: 'saida', valor: 1000, banco: 'Nubank', descricao: 'Pão' },
    { data: '2026-08-02', tipo: 'entrada', valor: 2000, banco: 'Nubank', descricao: 'Troco' },
  ]);

  assert.equal(r.lancamentos, 2);
  assert.equal(dados.obter().lancamentos.length, 3, 'o que já existia continua lá');
  assert.deepEqual(r.contasCriadas, [], 'Nubank já existia');
});

test('banco é achado pelo nome mesmo com acento e caixa diferentes', () => {
  comecarDoZero();
  dados.adicionarLancamentos([
    { data: '2026-08-01', tipo: 'saida', valor: 1000, banco: 'ITAU' },
    { data: '2026-08-02', tipo: 'saida', valor: 1000, banco: 'itaú' },
    { data: '2026-08-03', tipo: 'saida', valor: 1000, banco: '  Itau  ' },
  ]);

  // As três grafias são o MESMO banco. Criar três "Itaú" partiria o saldo
  // em pedaços sem ninguém perceber.
  assert.equal(dados.obter().contas.length, 3);
  const itau = acharConta('Itaú');
  assert.equal(dados.obter().lancamentos.filter((l) => l.contaId === itau.id).length, 3);
});

test('banco que não existe é criado, e o app diz quais criou', () => {
  comecarDoZero();
  const r = dados.adicionarLancamentos([
    { data: '2026-08-01', tipo: 'saida', valor: 1000, banco: 'Cartão BB' },
    { data: '2026-08-02', tipo: 'saida', valor: 1000, banco: 'Inter' },
  ]);

  assert.deepEqual(r.contasCriadas, ['Cartão BB', 'Inter']);
  // "Cartão" no nome vira cartão de crédito sozinho: é o que o nome diz.
  assert.equal(acharConta('Cartão BB').tipo, 'cartao');
  assert.equal(acharConta('Inter').tipo, 'conta');
});

test('o arquivo pode declarar contas, com tipo, saldo e cor', () => {
  comecarDoZero();
  const r = dados.adicionarLancamentos([], [
    { nome: 'Caixinha do Nubank', tipo: 'reserva', saldoInicial: 138463, cor: 'roxo-claro' },
    { nome: 'Banco do Brasil', saldoInicial: 99999, cor: 'azul' },
  ]);

  const caixinha = acharConta('Caixinha do Nubank');
  assert.equal(caixinha.tipo, 'reserva');
  assert.equal(caixinha.saldoInicial, 138463);
  assert.equal(caixinha.cor, 'roxo-claro');

  // Conta que já existia é AJUSTADA, não duplicada.
  assert.equal(dados.obter().contas.filter((c) => c.nome === 'Banco do Brasil').length, 1);
  assert.equal(acharConta('Banco do Brasil').saldoInicial, 99999);
  assert.deepEqual(r.contasAjustadas, ['Banco do Brasil']);
  assert.equal(r.lancamentos, 0, 'nenhum lançamento foi criado');
});

test('conta que não muda nada não entra na lista de ajustadas', () => {
  comecarDoZero();
  const r = dados.adicionarLancamentos([], [
    { nome: 'Banco do Brasil', saldoInicial: 17065, cor: 'amarelo' },
  ]);
  assert.deepEqual(r.contasAjustadas, [], 'já estava assim');
});

test('o arquivo pode trazer transferência, com os dois lados', () => {
  comecarDoZero();
  dados.adicionarLancamentos([
    {
      data: '2026-09-10', tipo: 'transferencia', valor: 65229,
      banco: 'Banco do Brasil', bancoDestino: 'Cartão BB', descricao: 'Pagamento da fatura',
    },
  ]);

  const l = dados.obter().lancamentos.at(-1);
  assert.equal(l.tipo, 'transferencia');
  assert.equal(l.contaId, acharConta('Banco do Brasil').id);
  assert.equal(l.contaDestinoId, acharConta('Cartão BB').id);
});

test('transferência sem destino vira saída comum, não transferência quebrada', () => {
  comecarDoZero();
  dados.adicionarLancamentos([
    { data: '2026-09-10', tipo: 'transferencia', valor: 100, banco: 'Nubank' },
  ]);
  const l = dados.obter().lancamentos.at(-1);
  assert.equal(l.tipo, 'saida');
  assert.equal(l.contaDestinoId, null);
});

/* ------------------------------- mover ---------------------------------- */

test('mover troca a data só de quem a regra descreve', () => {
  comecarDoZero();
  dados.adicionarLancamentos([
    { data: '2026-09-01', tipo: 'saida', valor: 100, banco: 'Cartão BB', descricao: 'Compra 1' },
    { data: '2026-09-01', tipo: 'saida', valor: 200, banco: 'Cartão BB', descricao: 'Compra 2' },
    { data: '2026-09-01', tipo: 'saida', valor: 300, banco: 'Nubank', descricao: 'Outro banco' },
    { data: '2026-09-02', tipo: 'saida', valor: 400, banco: 'Cartão BB', descricao: 'Outro dia' },
  ]);

  const regra = [{ banco: 'Cartão BB', tipo: 'saida', de: '2026-09-01', para: '2026-08-01' }];
  assert.equal(dados.contarParaMover(regra), 2, 'avisa antes quantos vai mexer');

  const r = dados.moverLancamentos(regra);
  assert.equal(r.movidos, 2);

  const porDescricao = (d) => dados.obter().lancamentos.find((l) => l.descricao === d);
  assert.equal(porDescricao('Compra 1').data, '2026-08-01');
  assert.equal(porDescricao('Compra 2').data, '2026-08-01');
  assert.equal(porDescricao('Outro banco').data, '2026-09-01', 'banco diferente não se move');
  assert.equal(porDescricao('Outro dia').data, '2026-09-02', 'dia diferente não se move');
});

test('mover com banco inexistente não faz nada, em vez de estourar', () => {
  comecarDoZero();
  const r = dados.moverLancamentos([{ banco: 'Banco Fantasma', de: '2026-09-01', para: '2026-08-01' }]);
  assert.equal(r.movidos, 0);
});

/* ----------------------------- parcelamento ----------------------------- */

test('parcelas nascem numeradas, no mesmo grupo, e somam o total', () => {
  comecarDoZero();
  const conta = acharConta('Nubank').id;
  const grupo = dados.salvarParcelas([
    { data: '2026-09-01', tipo: 'saida', valor: 3334, contaId: conta, descricao: 'Fone' },
    { data: '2026-10-01', tipo: 'saida', valor: 3333, contaId: conta, descricao: 'Fone' },
    { data: '2026-11-01', tipo: 'saida', valor: 3333, contaId: conta, descricao: 'Fone' },
  ]);

  const parcelas = dados.parcelasDoGrupo(grupo);
  assert.equal(parcelas.length, 3);
  assert.deepEqual(parcelas.map((p) => p.parcela), [1, 2, 3]);
  assert.ok(parcelas.every((p) => p.parcelasTotal === 3));
  assert.equal(parcelas.reduce((s, p) => s + p.valor, 0), 10000);
});

test('apagar a compra parcelada leva todas as parcelas, e só elas', () => {
  comecarDoZero();
  const conta = acharConta('Nubank').id;
  dados.salvarLancamento({ data: '2026-09-01', tipo: 'saida', valor: 500, contaId: conta, descricao: 'Avulso' });
  const grupo = dados.salvarParcelas([
    { data: '2026-09-01', tipo: 'saida', valor: 100, contaId: conta },
    { data: '2026-10-01', tipo: 'saida', valor: 100, contaId: conta },
  ]);

  dados.removerGrupo(grupo);
  assert.equal(dados.obter().lancamentos.length, 1);
  assert.equal(dados.obter().lancamentos[0].descricao, 'Avulso');
});

/* ------------------------ gravar e voltar a ler -------------------------- */

test('o que foi gravado volta igual depois de fechar e abrir', () => {
  comecarDoZero();
  dados.salvarLancamento({
    data: '2026-09-18', tipo: 'saida', valor: 4500,
    contaId: acharConta('Nubank').id, descricao: 'Mercado',
  });

  const antes = JSON.stringify(dados.obter());
  dados.carregar(); // é o que acontece ao abrir o app de novo
  assert.equal(JSON.stringify(dados.obter()), antes);
});

test('dado corrompido no navegador não derruba o app', () => {
  comecarDoZero();
  localStorage.setItem('caderneta.v1', '{isso não é json');
  // Não pode estourar: o app precisa abrir para a pessoa conseguir
  // restaurar um backup.
  assert.doesNotThrow(() => dados.carregar());
});

/* ------------------------------- backup --------------------------------- */

test('restaurar backup substitui tudo e renomeia os ids antigos', () => {
  comecarDoZero();
  const backup = JSON.stringify({
    contas: [{ id: 'antigo1', nome: 'Banco Velho', cor: 'azul', saldoInicial: 500, ordem: 0 }],
    categorias: [{ id: 'cat1', nome: 'Mercado', tipo: 'saida' }],
    lancamentos: [{ id: 'l1', data: '2026-01-01', tipo: 'saida', valor: 100, contaId: 'antigo1', categoriaId: 'cat1' }],
  });

  const r = dados.importarJSON(backup);
  assert.ok(r.ok);
  assert.equal(dados.obter().contas.length, 1, 'substituiu, não somou');
  assert.equal(dados.obter().contas[0].nome, 'Banco Velho');

  // Os ids viram uuid, e o lançamento continua apontando para a conta certa.
  const conta = dados.obter().contas[0];
  assert.match(conta.id, /^[0-9a-f-]{36}$/);
  assert.equal(dados.obter().lancamentos[0].contaId, conta.id);
});

test('arquivo que não é backup é recusado com explicação', () => {
  comecarDoZero();
  const quantos = dados.obter().contas.length;

  assert.equal(dados.importarJSON('nem json').ok, false);
  assert.match(dados.importarJSON('{"qualquer":1}').erro, /não parece um backup/);
  assert.equal(dados.obter().contas.length, quantos, 'nada foi tocado');
});

/* -------------------- gastos que se repetem ---------------------------- */

test('gasto que se repete nasce com o mês do cadastro e o dia preso em 1–31', () => {
  comecarDoZero();
  const bb = acharConta('Banco do Brasil');

  const salvo = dados.salvarRecorrente({
    descricao: '  Spotify  ', valor: -1290, dia: 99, contaId: bb.id,
  });

  assert.equal(salvo.descricao, 'Spotify');   // aparado
  assert.equal(salvo.valor, 1290);            // sempre positivo
  assert.equal(salvo.dia, 31);                // preso no teto
  assert.equal(salvo.ativo, true);
  assert.match(salvo.desde, /^\d{4}-\d{2}$/);
  assert.equal(dados.obter().recorrentes.length, 1);
});

// Editar não pode reescrever o mês de início: se reescrevesse, corrigir o
// valor do Spotify em dezembro faria o app oferecer dezembro inteiro de novo.
test('editar não mexe no mês a partir do qual ele vale', () => {
  comecarDoZero();
  const bb = acharConta('Banco do Brasil');
  const salvo = dados.salvarRecorrente({ descricao: 'Spotify', valor: 1290, dia: 16, contaId: bb.id });
  salvo.desde = '2026-01';   // como se tivesse sido cadastrado em janeiro

  dados.salvarRecorrente({ id: salvo.id, descricao: 'Spotify', valor: 1390, dia: 16, contaId: bb.id, desde: '2030-12' });

  const depois = dados.recorrente(salvo.id);
  assert.equal(depois.valor, 1390);
  assert.equal(depois.desde, '2026-01');
});

test('lançar os pendentes cria lançamentos marcados, na data de cada um', () => {
  comecarDoZero();
  const cartao = dados.salvarConta({ nome: 'Cartão BB', tipo: 'cartao', saldoInicial: 0 });
  const bb = acharConta('Banco do Brasil');
  const apple = dados.salvarRecorrente({ descricao: 'Apple', valor: 1990, dia: 15, contaId: bb.id, natureza: 'corrente' });
  const spotify = dados.salvarRecorrente({ descricao: 'Spotify', valor: 1290, dia: 16, contaId: bb.id });

  const quantos = dados.lancarRecorrentes([
    { recorrente: apple, data: '2026-09-15' },
    { recorrente: spotify, data: '2026-09-16' },
  ]);

  assert.equal(quantos, 2);
  const lista = dados.obter().lancamentos;
  assert.equal(lista.length, 2);
  assert.deepEqual(lista.map((l) => l.data), ['2026-09-15', '2026-09-16']);
  assert.deepEqual(lista.map((l) => l.recorrenteId), [apple.id, spotify.id]);
  assert.deepEqual(lista.map((l) => l.tipo), ['saida', 'saida']);
  assert.equal(lista[0].natureza, 'corrente');
});

// Apagar o cadastro não pode apagar o passado: aquele dinheiro saiu.
test('parar de repetir não mexe no que já foi lançado', () => {
  comecarDoZero();
  const bb = acharConta('Banco do Brasil');
  const r = dados.salvarRecorrente({ descricao: 'Apple', valor: 1990, dia: 15, contaId: bb.id });
  dados.lancarRecorrentes([{ recorrente: r, data: '2026-09-15' }]);

  const antes = dados.obter().lancamentos.length;
  dados.removerRecorrente(r.id);

  assert.equal(dados.obter().recorrentes.length, 0);
  assert.equal(dados.obter().lancamentos.length, antes);
  assert.equal(dados.obter().lancamentos[0].recorrenteId, r.id);
});
