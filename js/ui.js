/* =========================================================================
   Peças de interface reaproveitadas. Nada aqui conhece regra de negócio.

   Todo texto vindo do usuário (nome de banco, descrição) entra por
   textContent, nunca por innerHTML — é o que impede que uma descrição
   digitada como "<img onerror=...>" vire código rodando na página.
   ========================================================================= */

import { corValida } from './dados.js';

/** el('div', {class: 'x', onclick: fn}, ['texto', outroNo]) */
/* Desenho vetorial vive noutro dicionário de nomes que o resto do HTML, e o
   `createElement` comum cria uma caixa vazia com o nome certo e nenhum
   desenho dentro. É silencioso: não dá erro, só não aparece nada. */
const ESPACO_SVG = 'http://www.w3.org/2000/svg';
const TAGS_SVG = new Set(['svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon']);

export function el(tag, props = {}, filhos = []) {
  const no = TAGS_SVG.has(tag)
    ? document.createElementNS(ESPACO_SVG, tag)
    : document.createElement(tag);
  for (const [chave, valor] of Object.entries(props)) {
    if (valor === null || valor === undefined || valor === false) continue;
    // setAttribute e não `no.className`: em SVG a propriedade className é só
    // de leitura, e atribuir nela não faz nada — de novo em silêncio.
    if (chave === 'class') no.setAttribute('class', valor);
    else if (chave === 'texto') no.textContent = valor;
    else if (chave === 'estilo') Object.assign(no.style, valor);
    else if (chave.startsWith('on')) no.addEventListener(chave.slice(2), valor);
    else if (chave === 'dados') for (const [k, v] of Object.entries(valor)) no.dataset[k] = v;
    else no.setAttribute(chave, valor === true ? '' : valor);
  }
  for (const filho of [].concat(filhos)) {
    if (filho === null || filho === undefined || filho === false) continue;
    no.append(typeof filho === 'string' || typeof filho === 'number' ? String(filho) : filho);
  }
  return no;
}

export function trocar(alvo, ...conteudo) {
  alvo.replaceChildren(...conteudo.flat().filter(Boolean));
}

/**
 * A cor de uma conta é uma variável do CSS, não um código fixo — é assim que
 * ela troca sozinha entre o tema claro e o escuro.
 */
export function hexDaCor(corId) {
  return `var(--conta-${corValida(corId)})`;
}

export function hexDaConta(conta) {
  return conta ? hexDaCor(conta.cor) : 'var(--linha-forte)';
}

/** Mensagem curta de confirmação. Some sozinha; nunca segura o usuário. */
let timerRecado;
export function recado(texto) {
  const caixa = document.getElementById('recado');
  caixa.textContent = texto;
  caixa.hidden = false;
  clearTimeout(timerRecado);
  timerRecado = setTimeout(() => { caixa.hidden = true; }, 2600);
}

export function vazio(titulo, texto) {
  return el('div', { class: 'vazio' }, [
    el('p', { class: 'vazio__titulo', texto: titulo }),
    el('p', { class: 'vazio__texto', texto }),
  ]);
}

/** Dispara o download de um arquivo gerado na hora, sem servidor. */
export function baixarArquivo(nome, conteudo, tipo) {
  const blob = new Blob([conteudo], { type: `${tipo};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: nome });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Nome de arquivo com a data de hoje: caderneta-backup-2026-09-17.json */
export function nomeComData(prefixo, extensao) {
  const d = new Date();
  const data = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
  return `${prefixo}-${data}.${extensao}`;
}
