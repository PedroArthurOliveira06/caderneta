/* =========================================================================
   Confere se a versão foi carimbada antes de publicar.

       node ferramentas/conferir-versao.js

   O carimbo vive em três lugares que precisam concordar: o nome do cache no
   sw.js, a versão que o app mostra em Ajustes, e o versao.json que o app
   consulta para saber se existe versão nova.

   Se eles discordarem, o estrago é silencioso: os celulares continuam
   servindo a cópia velha, ninguém é avisado, e a pessoa acha que o app parou
   de receber melhorias. Já aconteceu — sete publicações seguidas.

   Roda sozinho no GitHub a cada envio.
   ========================================================================= */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (arquivo) => readFileSync(join(RAIZ, arquivo), 'utf8');

const problemas = [];

const noSw = (ler('sw.js').match(/const VERSAO = 'caderneta-([^']+)'/) || [])[1];
const noApp = (ler('js/configuracao.js').match(/VERSAO_APP = '([^']+)'/) || [])[1];
const noArquivo = JSON.parse(ler('versao.json')).versao;

if (!noSw) problemas.push('sw.js não tem a linha do VERSAO');
if (!noApp) problemas.push('js/configuracao.js não tem a linha do VERSAO_APP');
if (!noArquivo) problemas.push('versao.json está sem o campo versao');

/* O sw.js guarda "2026-09-18-1437" e o app guarda "18/09/2026, 14:37".
   São formatos diferentes de propósito — um é nome de cache, o outro é para
   uma pessoa ler. Comparar exige traduzir um para o outro. */
if (noSw && noApp) {
  const [ano, mes, dia, hora] = noSw.split('-');
  const esperado = `${dia}/${mes}/${ano}, ${hora.slice(0, 2)}:${hora.slice(2)}`;
  if (esperado !== noApp) {
    problemas.push(`sw.js diz ${esperado} mas o app diz ${noApp}`);
  }
}

if (noApp && noArquivo && noApp !== noArquivo) {
  problemas.push(`o app diz ${noApp} mas o versao.json diz ${noArquivo}`);
}

if (problemas.length) {
  console.error('A versão não está carimbada direito:\n');
  problemas.forEach((p) => console.error('  - ' + p));
  console.error('\nRode `npm run versao` e faça o commit de novo.');
  process.exit(1);
}

console.log(`Versão carimbada e consistente: ${noApp}`);
