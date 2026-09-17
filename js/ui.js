/* =========================================================================
   Peças de interface reaproveitadas. Nada aqui conhece regra de negócio.

   Todo texto vindo do usuário (nome de banco, descrição) entra por
   textContent, nunca por innerHTML — é o que impede que uma descrição
   digitada como "<img onerror=...>" vire código rodando na página.
   ========================================================================= */

import { CORES_CONTA } from './dados.js';

/** el('div', {class: 'x', onclick: fn}, ['texto', outroNo]) */
export function el(tag, props = {}, filhos = []) {
  const no = document.createElement(tag);
  for (const [chave, valor] of Object.entries(props)) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (chave === 'class') no.className = valor;
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

export function hexDaCor(corId) {
  return (CORES_CONTA.find((c) => c.id === corId) || CORES_CONTA[0]).hex;
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
