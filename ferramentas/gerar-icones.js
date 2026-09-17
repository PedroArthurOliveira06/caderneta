/* =========================================================================
   Gera os ícones PNG do aplicativo sem depender de nenhum programa externo:
   desenha os pixels na mão e monta o PNG com o zlib que já vem no Node.

   Rode com:  node ferramentas/gerar-icones.js

   O desenho é a marca da Caderneta: fundo tinta, três barras nas cores dos
   bancos — a mesma ideia da faixa de saldos da tela inicial.
   ========================================================================= */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const FUNDO = [0x16, 0x27, 0x1f];
const BARRAS = [
  [0x1c, 0x5f, 0xc4], // azul
  [0x5f, 0x2d, 0xa8], // roxo
  [0x8a, 0x54, 0x06], // âmbar
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

/** pixels: função (x, y) -> [r, g, b] */
function montarPNG(lado, pixels) {
  const linhas = [];
  for (let y = 0; y < lado; y++) {
    const linha = Buffer.alloc(1 + lado * 3); // 1 byte de filtro + RGB
    for (let x = 0; x < lado; x++) {
      const [r, g, b] = pixels(x, y);
      linha[1 + x * 3] = r;
      linha[2 + x * 3] = g;
      linha[3 + x * 3] = b;
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
  const margem = Math.round(lado * 0.24);
  const largura = lado - margem * 2;
  const altura = Math.round(lado * 0.105);
  const espaco = Math.round(lado * 0.068);
  const bloco = altura * 3 + espaco * 2;
  const topo = Math.round((lado - bloco) / 2);
  const canto = Math.round(altura / 2);

  return (x, y) => {
    for (let i = 0; i < 3; i++) {
      const y0 = topo + i * (altura + espaco);
      if (y < y0 || y >= y0 + altura) continue;
      // A barra do meio é mais curta: dá ritmo à marca e sugere valores
      // diferentes em cada banco, que é a ideia do app.
      const fim = margem + (i === 1 ? Math.round(largura * 0.62) : largura);
      if (x < margem || x >= fim) continue;

      // Cantos arredondados nas pontas da barra.
      const dx = Math.min(x - margem, fim - 1 - x);
      const dy = Math.min(y - y0, y0 + altura - 1 - y);
      if (dx < canto && dy < canto) {
        const distancia = Math.hypot(canto - dx, canto - dy);
        if (distancia > canto) continue;
      }
      return BARRAS[i];
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

/* O SVG é o mesmo desenho, para a aba do navegador em qualquer tamanho. */
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#16271f"/>
  <rect x="123" y="150" width="266" height="54" rx="27" fill="#1c5fc4"/>
  <rect x="123" y="239" width="165" height="54" rx="27" fill="#5f2da8"/>
  <rect x="123" y="328" width="266" height="54" rx="27" fill="#8a5406"/>
</svg>
`;
writeFileSync(join(RAIZ, 'icons', 'icone.svg'), svg);
console.log('icons/icone.svg');
