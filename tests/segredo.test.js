import test from 'node:test';
import assert from 'node:assert/strict';
import { criarSegredo, conferir, problemaNoPin } from '../js/segredo.js';

test('o PIN digitado não fica guardado em lugar nenhum', async () => {
  const segredo = await criarSegredo('4729');
  const tudo = JSON.stringify(segredo);
  assert.ok(!tudo.includes('4729'), 'o número não pode aparecer no que é salvo');
  assert.ok(segredo.resultado.length === 64, 'o que sobra é um resultado de tamanho fixo');
});

test('o PIN certo abre e o errado não', async () => {
  const segredo = await criarSegredo('4729');
  assert.equal(await conferir('4729', segredo), true);
  assert.equal(await conferir('4728', segredo), false);
  assert.equal(await conferir('', segredo), false);
  assert.equal(await conferir('47290', segredo), false);
});

test('o mesmo PIN gera resultados diferentes em aparelhos diferentes', async () => {
  // O sorteio (sal) é o que impede montar uma tabela de "resultado -> PIN"
  // que sirva para todo mundo: o mesmo 4729 vira coisas diferentes.
  const a = await criarSegredo('4729');
  const b = await criarSegredo('4729');
  assert.notEqual(a.sal, b.sal);
  assert.notEqual(a.resultado, b.resultado);
  // E cada um continua abrindo com o próprio PIN.
  assert.equal(await conferir('4729', a), true);
  assert.equal(await conferir('4729', b), true);
});

test('segredo corrompido ou ausente não abre por acidente', async () => {
  assert.equal(await conferir('4729', null), false);
  assert.equal(await conferir('4729', {}), false);
  assert.equal(await conferir('4729', { sal: 'aa' }), false);
});

test('PIN fraco é recusado, com o motivo dito', () => {
  assert.equal(problemaNoPin('4729'), '');
  assert.equal(problemaNoPin('271086'), '');
  assert.match(problemaNoPin('123'), /pelo menos 4/);
  assert.match(problemaNoPin('123456789'), /no máximo 8/);
  assert.match(problemaNoPin('1111'), /todos iguais/);
  assert.match(problemaNoPin('1234'), /sequência/);
  assert.match(problemaNoPin('4321'), /sequência/);
  assert.match(problemaNoPin('12a4'), /só pode ter números/);
});

test('conferir um PIN demora o bastante para desencorajar tentativa e erro', async () => {
  const segredo = await criarSegredo('4729');
  const antes = Date.now();
  await conferir('0000', segredo);
  const gasto = Date.now() - antes;
  // Não é sobre o número exato: é sobre não ser instantâneo. Testar todas as
  // 10 mil combinações de um PIN de 4 dígitos precisa custar tempo de verdade.
  assert.ok(gasto > 20, `conferir levou ${gasto}ms — rápido demais para segurar força bruta`);
});

// O tamanho é o que faz a tela saber a hora de entrar sozinha. Sem ele o app
// chutava 4, e quem escolheu 5 ou mais levava "PIN errado" no meio da
// digitação — com o que já tinha digitado apagado junto.
test('o segredo guarda quantos números o PIN tem, e nunca quais', async () => {
  const guardado = await criarSegredo('198427');

  assert.equal(guardado.tamanho, 6);
  // O PIN não pode aparecer em lugar nenhum do que foi salvo.
  assert.equal(JSON.stringify(guardado).includes('198427'), false);
  assert.equal(await conferir('198427', guardado), true);
  // Meio PIN é PIN errado, e continua sendo.
  assert.equal(await conferir('1984', guardado), false);
});

test('PIN de quatro também tem o tamanho registrado', async () => {
  const guardado = await criarSegredo('1984');
  assert.equal(guardado.tamanho, 4);
  assert.equal(await conferir('1984', guardado), true);
});
