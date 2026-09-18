/* =========================================================================
   Guarda o PIN sem guardar o PIN.

   O que fica salvo não é "1234": é o resultado de embaralhar "1234" com um
   sorteio aleatório, 210 mil vezes seguidas. Do resultado não dá para voltar
   ao número. Na hora de conferir, o app refaz a mesma conta com o que a
   pessoa digitou e compara os resultados.

   Por que as 210 mil repetições: um PIN de 4 dígitos tem só 10 mil
   combinações possíveis — um computador testaria todas num piscar de olhos.
   Cada repetição custa tempo, e esse custo multiplica por 10 mil para quem
   tentar adivinhar na força bruta. Vira meia hora de trabalho em vez de um
   segundo.

   Honestamente: isto **não** é um cofre. Quem tiver o aparelho desbloqueado
   e souber mexer em navegador consegue contornar, porque o programa inteiro
   roda no aparelho da pessoa. Serve para o que foi pedido — impedir que
   alguém que pegue seu celular destravado abra o app e veja seus gastos.
   O app diz isso em voz alta na tela de Ajustes.
   ========================================================================= */

const ITERACOES = 210000;
const TAMANHO_SAL = 16;
const TAMANHO_CHAVE = 32;

const paraHex = (buffer) => [...new Uint8Array(buffer)]
  .map((b) => b.toString(16).padStart(2, '0'))
  .join('');

const deHex = (hex) => new Uint8Array(
  (hex.match(/.{1,2}/g) || []).map((par) => parseInt(par, 16))
);

async function embaralhar(pin, sal, iteracoes) {
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: sal, iterations: iteracoes, hash: 'SHA-256' },
    base,
    TAMANHO_CHAVE * 8
  );
  return paraHex(bits);
}

/** Transforma o PIN no que será guardado. */
export async function criarSegredo(pin) {
  const sal = crypto.getRandomValues(new Uint8Array(TAMANHO_SAL));
  return {
    sal: paraHex(sal),
    iteracoes: ITERACOES,
    resultado: await embaralhar(pin, sal, ITERACOES),
  };
}

/** Confere um PIN digitado contra o que foi guardado. */
export async function conferir(pin, segredo) {
  if (!segredo || !segredo.sal || !segredo.resultado) return false;
  const tentativa = await embaralhar(pin, deHex(segredo.sal), segredo.iteracoes || ITERACOES);
  return iguais(tentativa, segredo.resultado);
}

/**
 * Compara sempre percorrendo tudo, sem sair no primeiro caractere diferente.
 * Uma comparação que desiste cedo demora tempos diferentes conforme o quanto
 * acertou, e esse tempo conta em voz alta quantos caracteres estão certos.
 */
function iguais(a, b) {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) {
    diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferenca === 0;
}

/** Só dígitos, de 4 a 8. Devolve a mensagem do problema, ou vazio se estiver bom. */
export function problemaNoPin(pin) {
  if (!/^\d*$/.test(pin)) return 'O PIN só pode ter números.';
  if (pin.length < 4) return 'O PIN precisa ter pelo menos 4 números.';
  if (pin.length > 8) return 'O PIN pode ter no máximo 8 números.';
  if (/^(\d)\1+$/.test(pin)) return 'Esse PIN é fácil demais: são todos iguais.';
  if ('0123456789'.includes(pin) || '9876543210'.includes(pin)) {
    return 'Esse PIN é fácil demais: são números em sequência.';
  }
  return '';
}
