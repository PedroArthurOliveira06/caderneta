/* =========================================================================
   A tranca do app: um PIN na abertura.

   É uma tranca de porta, não um cofre — e o app diz isso com essas palavras
   nos Ajustes. Ela impede que alguém que pegue seu celular já destravado
   abra a Caderneta e veja seus gastos. Não impede quem entende de navegador,
   porque o programa todo roda no aparelho de quem usa.

   A tranca é deste APARELHO, não da conta: cada celular ou computador tem o
   seu PIN, ou nenhum.
   ========================================================================= */

import { criarSegredo, conferir, problemaNoPin } from './segredo.js';
import { el, trocar, recado } from './ui.js';

const CHAVE = 'caderneta.tranca';
const MINUTOS_ATE_TRANCAR = 5;
const ERROS_ATE_ESPERAR = 5;

const $ = (id) => document.getElementById(id);

let segredo = null;
let trancado = false;
let modo = 'abrir';       // 'abrir' | 'definir' | 'confirmar'
let digitado = '';
let primeiroPin = '';
let erros = 0;
let esperarAte = 0;
let saiuDaTelaEm = 0;
let aoDestravar = () => {};
let aoSairPelaConta = null;

/* ------------------------------ estado ---------------------------------- */

export function existe() {
  return Boolean(segredo);
}

export function estaTrancado() {
  return trancado;
}

export function carregar() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    segredo = bruto ? JSON.parse(bruto) : null;
  } catch {
    segredo = null;
  }
  trancado = Boolean(segredo);
  return segredo;
}

function guardar(novo) {
  segredo = novo;
  try {
    if (novo) localStorage.setItem(CHAVE, JSON.stringify(novo));
    else localStorage.removeItem(CHAVE);
  } catch {
    recado('Não deu para salvar a tranca neste navegador.');
  }
}

/* ----------------------------- arranque --------------------------------- */

export function iniciar({ aoAbrir, aoSair }) {
  aoDestravar = aoAbrir || (() => {});
  aoSairPelaConta = aoSair;

  carregar();
  montarTeclado();

  $('esqueci-pin').addEventListener('click', esqueci);

  // Teclado físico, para quem usa no computador.
  document.addEventListener('keydown', (evento) => {
    if (!trancado || $('tela-tranca').hidden) return;
    if (/^\d$/.test(evento.key)) digitar(evento.key);
    else if (evento.key === 'Backspace') apagar();
    else if (evento.key === 'Enter') confirmar();
  });

  // Voltar ao app depois de um tempo fora tranca de novo. Sem isto, a tranca
  // só valeria na primeira abertura do dia e não protegeria nada.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      saiuDaTelaEm = Date.now();
      return;
    }
    const fora = (Date.now() - saiuDaTelaEm) / 60000;
    if (segredo && !trancado && saiuDaTelaEm && fora >= MINUTOS_ATE_TRANCAR) {
      trancar();
    }
  });
}

export function trancar() {
  if (!segredo) return;
  trancado = true;
  modo = 'abrir';
  digitado = '';
  aoDestravar();
}

/* ------------------------------- telas ---------------------------------- */

export function pintar() {
  const titulos = {
    abrir: 'Digite seu PIN',
    definir: 'Escolha um PIN',
    confirmar: 'Digite de novo para confirmar',
  };
  $('tranca-titulo').textContent = titulos[modo];
  $('esqueci-pin').hidden = modo !== 'abrir';

  const minimo = modo === 'abrir' ? Math.max(digitado.length, 4) : 4;
  const quantos = Math.max(minimo, digitado.length);

  trocar($('tranca-pontos'), Array.from({ length: quantos }, (_, i) => el('span', {
    class: `ponto${i < digitado.length ? ' ponto--cheio' : ''}`,
  })));

  $('tranca-confirmar').disabled = digitado.length < 4;
}

function montarTeclado() {
  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'apagar'];

  trocar($('teclado'), teclas.map((tecla) => {
    if (!tecla) return el('span');
    if (tecla === 'apagar') {
      return el('button', {
        class: 'tecla tecla--apagar', type: 'button', 'aria-label': 'Apagar',
        onclick: apagar,
      }, ['⌫']);
    }
    return el('button', { class: 'tecla', type: 'button', texto: tecla, onclick: () => digitar(tecla) });
  }));

  $('tranca-confirmar').addEventListener('click', confirmar);
}

function digitar(numero) {
  if (digitado.length >= 8) return;
  digitado += numero;
  $('tranca-erro').hidden = true;
  pintar();
  // No modo de abrir, quem tem PIN de 4 já entra sem apertar mais nada.
  if (modo === 'abrir' && segredo && digitado.length === 4) confirmar();
}

function apagar() {
  digitado = digitado.slice(0, -1);
  pintar();
}

function mostrarErro(mensagem) {
  const caixa = $('tranca-erro');
  caixa.textContent = mensagem;
  caixa.hidden = false;
  digitado = '';
  pintar();
}

async function confirmar() {
  if (digitado.length < 4) return;

  if (modo === 'definir') {
    const problema = problemaNoPin(digitado);
    if (problema) {
      mostrarErro(problema);
      return;
    }
    primeiroPin = digitado;
    digitado = '';
    modo = 'confirmar';
    pintar();
    return;
  }

  if (modo === 'confirmar') {
    if (digitado !== primeiroPin) {
      modo = 'definir';
      primeiroPin = '';
      mostrarErro('Os dois não bateram. Vamos de novo.');
      return;
    }
    guardar(await criarSegredo(primeiroPin));
    primeiroPin = '';
    digitado = '';
    trancado = false;
    // Diz "neste aparelho" porque é justamente o que se esquece: quem liga a
    // tranca no computador acha que ligou na conta, e o celular — que é o
    // aparelho que sai de casa — continua abrindo sem pedir nada.
    recado('Tranca ligada neste aparelho. Nos outros, precisa ligar de novo.');
    aoDestravar();
    return;
  }

  /* modo 'abrir' */
  if (Date.now() < esperarAte) {
    mostrarErro(`Espere ${Math.ceil((esperarAte - Date.now()) / 1000)} segundos.`);
    return;
  }

  if (await conferir(digitado, segredo)) {
    erros = 0;
    digitado = '';
    trancado = false;
    aoDestravar();
    return;
  }

  erros += 1;
  if (erros >= ERROS_ATE_ESPERAR) {
    // A espera cresce a cada rodada de erros: incomoda pouco quem só
    // esqueceu, e muito quem está tentando adivinhar.
    const segundos = 30 * Math.pow(2, Math.floor(erros / ERROS_ATE_ESPERAR) - 1);
    esperarAte = Date.now() + segundos * 1000;
    mostrarErro(`PIN errado. Espere ${segundos} segundos para tentar de novo.`);
    return;
  }
  mostrarErro('PIN errado.');
}

/* ---------------------------- esqueci o PIN ------------------------------ */

function esqueci() {
  if (aoSairPelaConta && aoSairPelaConta.temConta()) {
    if (!confirm('Para destravar sem o PIN, você sai da conta e entra de novo com a sua senha. Seus lançamentos estão guardados na conta e voltam depois. Continuar?')) return;
    guardar(null);
    trancado = false;
    aoSairPelaConta.sair();
    return;
  }

  alert(
    'Sem conta, o PIN é a única chave deste aparelho: não há como destravar sem ele.\n\n'
    + 'A saída seria apagar os dados daqui, e o que não estiver num backup se perde.\n\n'
    + 'Se você lembrar do PIN, entre e crie uma conta em Ajustes — aí a senha vira o seu caminho de volta.'
  );
}

/* --------------------------- ligar e desligar ---------------------------- */

export function comecarADefinir() {
  modo = 'definir';
  digitado = '';
  primeiroPin = '';
  trancado = true;
  $('tranca-erro').hidden = true;
  aoDestravar();
}

export function remover() {
  guardar(null);
  trancado = false;
  recado('Tranca removida.');
}
