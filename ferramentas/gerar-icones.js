/* =========================================================================
   Gera os ícones PNG do aplicativo sem depender de nenhum programa externo:
   desenha os pixels na mão e monta o PNG com o zlib que já vem no Node.

   Rode com:  node ferramentas/gerar-icones.js

   O desenho é a marca da Caderneta: a letra C repartida em três pedaços,
   nas cores dos bancos.
   ========================================================================= */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const FUNDO = [0x16, 0x27, 0x1f];

/**
 * A marca é a letra C — de Caderneta — quebrada em três pedaços de tamanhos
 * diferentes, um para cada banco. Uma coisa só, repartida em três: é o app
 * inteiro num desenho.
 *
 * Aqui os pedaços viram ângulos, porque o PNG é pintado pixel a pixel. O
 * ângulo 0 fica às 3 horas e cresce no sentido do relógio; a abertura do C
 * é justamente o pedaço sem traço, em volta dos 0°.
 */
const PEDACOS = [
  { de: 42, ate: 158, cor: [0x1c, 0x5f, 0xc4] }, // azul
  { de: 170, ate: 228, cor: [0x5f, 0x2d, 0xa8] }, // roxo
  { de: 239, ate: 321, cor: [0x8a, 0x54, 0x06] }, // âmbar
];

/* ----------------------------- PNG cru --------------------------------- */

const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = TABELA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pedaco(tipo, dados) {
  const nome = Buffer.from(tipo, 'ascii');
  const corpo = Buffer.concat([nome, dados]);
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const verificacao = Buffer.alloc(4);
  verificacao.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tamanho, corpo, verificacao]);
}

/**
 * pixels: função (x, y) -> [r, g, b], com x e y podendo ser fracionários.
 *
 * Cada pixel é medido em 3x3 pontos e vira a média deles. Sem isso a curva
 * do C fica em degraus: a borda cai exatamente entre duas cores, e pintar
 * "sim ou não" não tem como representar meio pixel. A média é o que dá o
 * meio-termo — é o que todo programa de desenho faz por baixo.
 */
const AMOSTRAS = 3;

function montarPNG(lado, pixels) {
  const linhas = [];
  const passo = 1 / (AMOSTRAS + 1);

  for (let y = 0; y < lado; y++) {
    const linha = Buffer.alloc(1 + lado * 3); // 1 byte de filtro + RGB
    for (let x = 0; x < lado; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let i = 1; i <= AMOSTRAS; i++) {
        for (let j = 1; j <= AMOSTRAS; j++) {
          const cor = pixels(x + i * passo, y + j * passo);
          r += cor[0];
          g += cor[1];
          b += cor[2];
        }
      }
      const total = AMOSTRAS * AMOSTRAS;
      linha[1 + x * 3] = Math.round(r / total);
      linha[2 + x * 3] = Math.round(g / total);
      linha[3 + x * 3] = Math.round(b / total);
    }
    linhas.push(linha);
  }

  const cabecalho = Buffer.alloc(13);
  cabecalho.writeUInt32BE(lado, 0);
  cabecalho.writeUInt32BE(lado, 4);
  cabecalho[8] = 8;  // bits por canal
  cabecalho[9] = 2;  // cor verdadeira (RGB)

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco('IHDR', cabecalho),
    pedaco('IDAT', deflateSync(Buffer.concat(linhas), { level: 9 })),
    pedaco('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------------------- o desenho -------------------------------- */

function desenho(lado) {
  const centro = lado / 2;
  const raio = lado * 0.289;      // distância do centro ao meio do traço
  const meiaEspessura = lado * 0.0625;
  const grau = Math.PI / 180;

  // As pontas de cada pedaço são redondas. Cada uma é um círculo do tamanho
  // da espessura do traço, plantado no fim do arco.
  const pontas = PEDACOS.flatMap((p) => [p.de, p.ate].map((angulo) => ({
    x: centro + raio * Math.cos(angulo * grau),
    y: centro + raio * Math.sin(angulo * grau),
    cor: p.cor,
  })));

  return (x, y) => {
    const dx = x - centro;
    const dy = y - centro;
    const distancia = Math.hypot(dx, dy);

    if (Math.abs(distancia - raio) <= meiaEspessura) {
      const angulo = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
      for (const pedaco of PEDACOS) {
        if (angulo >= pedaco.de && angulo <= pedaco.ate) return pedaco.cor;
      }
    }

    for (const ponta of pontas) {
      if (Math.hypot(x - ponta.x, y - ponta.y) <= meiaEspessura) return ponta.cor;
    }

    return FUNDO;
  };
}

/* ----------------------------- execução -------------------------------- */

mkdirSync(join(RAIZ, 'icons'), { recursive: true });

for (const lado of [180, 192, 512]) {
  const arquivo = join(RAIZ, 'icons', `icone-${lado}.png`);
  writeFileSync(arquivo, montarPNG(lado, desenho(lado)));
  console.log(`icons/icone-${lado}.png`);
}

/* A mesma marca em SVG, para a aba do navegador e para a tela de abertura.
   Aqui os pedaços são traço com ponta redonda, medidos ao longo da linha em
   vez de em graus — é o jeito do SVG de dizer a mesma coisa. */
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#16271f"/>
  <g fill="none" stroke-width="64" stroke-linecap="round" transform="rotate(42 256 256)">
    <circle cx="256" cy="256" r="148" stroke="#1c5fc4" stroke-dasharray="300 630"/>
    <circle cx="256" cy="256" r="148" stroke="#5f2da8" stroke-dasharray="150 780" stroke-dashoffset="-330"/>
    <circle cx="256" cy="256" r="148" stroke="#8a5406" stroke-dasharray="212 718" stroke-dashoffset="-510"/>
  </g>
</svg>
`;
writeFileSync(join(RAIZ, 'icons', 'icone.svg'), svg);
console.log('icons/icone.svg');
