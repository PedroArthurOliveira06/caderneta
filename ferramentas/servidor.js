/* =========================================================================
   Servidor local para testar o app antes de publicar. Sem dependências.

       npm run dev      ->  http://localhost:4173

   Existe só para desenvolvimento: no GitHub Pages quem serve os arquivos é
   o próprio GitHub. Um servidor é necessário porque o app usa módulos
   JavaScript, e o navegador se recusa a carregá-los via file:// — abrir o
   index.html com dois cliques mostraria uma página em branco.
   ========================================================================= */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = Number(process.env.PORTA || 4173);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

createServer(async (req, resposta) => {
  const caminho = decodeURIComponent(new URL(req.url, 'http://local').pathname);

  // normalize() + a checagem de prefixo impedem que um pedido como
  // /../../senhas.txt escape da pasta do projeto.
  const alvo = normalize(join(RAIZ, caminho === '/' ? 'index.html' : caminho));
  if (!alvo.startsWith(RAIZ)) {
    resposta.writeHead(403).end('Fora do projeto');
    return;
  }

  try {
    const info = await stat(alvo);
    const arquivo = info.isDirectory() ? join(alvo, 'index.html') : alvo;
    const conteudo = await readFile(arquivo);
    resposta.writeHead(200, {
      'Content-Type': TIPOS[extname(arquivo)] || 'application/octet-stream',
      'Cache-Control': 'no-store', // durante o desenvolvimento, nada de cache
    });
    resposta.end(conteudo);
  } catch {
    resposta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    resposta.end('Arquivo não encontrado');
  }
}).listen(PORTA, () => {
  console.log(`Caderneta rodando em http://localhost:${PORTA}`);
});
