/* =========================================================================
   Testes de js/servidor.js — por ora, só a regra que decide se uma falha é
   passageira. Ela é pequena e parece óbvia, mas é a que separa "insistir"
   de "desistir", e desistir na hora errada perde lançamento.
   ========================================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ehFalhaTemporaria } from '../js/servidor.js';

test('sem internet é passageiro', () => {
  assert.equal(ehFalhaTemporaria({ semRede: true }), true);
});

test('falha sem status é passageira', () => {
  // O `fetch` nem chegou a voltar: não dá para saber se o servidor recusou.
  assert.equal(ehFalhaTemporaria(new Error('estourou')), true);
});

// É este o caso que custou caro: projeto pausado por inatividade não some do
// ar, ele RESPONDE — e responde com erro. Tratar como recusa fazia o app
// jogar fora a fila de envio e deslogar.
test('servidor fora do ar e projeto pausado são passageiros', () => {
  for (const status of [500, 502, 503, 540, 599]) {
    assert.equal(ehFalhaTemporaria({ status }), true, `status ${status}`);
  }
});

test('recusa do servidor NÃO é passageira', () => {
  // Entendeu o pedido e disse não. Insistir seria tentar para sempre.
  for (const status of [400, 401, 403, 404, 409, 422]) {
    assert.equal(ehFalhaTemporaria({ status }), false, `status ${status}`);
  }
});

test('erro nenhum não é falha', () => {
  assert.equal(ehFalhaTemporaria(null), false);
  assert.equal(ehFalhaTemporaria(undefined), false);
});
