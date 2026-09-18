/* =========================================================================
   Claro, escuro, ou o que o aparelho estiver usando.

   Três opções e não duas, porque "seguir o aparelho" é a resposta certa para
   quem já configurou o celular para escurecer à noite: o app acompanha sem
   ninguém precisar lembrar de trocar.

   A escolha é deste APARELHO, como a tranca — não da conta. Faz sentido
   usar claro no computador do trabalho e escuro no celular à noite.
   ========================================================================= */

const CHAVE = 'caderneta.tema';

export const TEMAS = [
  { id: 'sistema', nome: 'Automático' },
  { id: 'claro', nome: 'Claro' },
  { id: 'escuro', nome: 'Escuro' },
];

let escolhido = 'sistema';

export function temaAtual() {
  return escolhido;
}

/** A cor que a barra do navegador e do celular assume — precisa combinar
 *  com o topo do app, senão fica uma faixa clara acima de uma tela escura. */
function corDoTopo() {
  return getComputedStyle(document.documentElement).getPropertyValue('--tinta').trim() || '#14261d';
}

function aplicar() {
  const raiz = document.documentElement;

  // Sem atributo, quem decide é o `@media` do CSS, que lê o aparelho.
  if (escolhido === 'sistema') raiz.removeAttribute('data-tema');
  else raiz.setAttribute('data-tema', escolhido);

  const marca = document.querySelector('meta[name="theme-color"]');
  if (marca) marca.setAttribute('content', corDoTopo());
}

export function definir(tema) {
  escolhido = TEMAS.some((t) => t.id === tema) ? tema : 'sistema';
  try {
    localStorage.setItem(CHAVE, escolhido);
  } catch {
    // Modo anônimo: vale só para esta sessão, e tudo bem.
  }
  aplicar();
}

export function iniciar() {
  try {
    escolhido = localStorage.getItem(CHAVE) || 'sistema';
  } catch {
    escolhido = 'sistema';
  }
  aplicar();

  // Com "Automático", trocar o tema do celular troca o do app na hora, sem
  // precisar fechar e abrir.
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => { if (escolhido === 'sistema') aplicar(); });
  }
}
