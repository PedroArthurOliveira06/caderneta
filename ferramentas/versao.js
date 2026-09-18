/* =========================================================================
   Carimba a versão em sw.js e em js/configuracao.js.

       npm run versao

   Por que existe: o service worker precisa de um nome novo de cache a cada
   publicação, senão os celulares continuam servindo os arquivos antigos.
   Isso estava escrito como instrução para eu seguir à mão — e eu esqueci
   sete publicações seguidas, até o dono do app perguntar por que o link não
   atualizava.

   Instrução que depende de memória humana é um defeito esperando a hora.
   Virou comando.
   ========================================================================= */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const agora = new Date();
const d = (n) => String(n).padStart(2, '0');
const carimbo = `${agora.getFullYear()}-${d(agora.getMonth() + 1)}-${d(agora.getDate())}-${d(agora.getHours())}${d(agora.getMinutes())}`;
const legivel = `${d(agora.getDate())}/${d(agora.getMonth() + 1)}/${agora.getFullYear()}, ${d(agora.getHours())}:${d(agora.getMinutes())}`;

function trocar(arquivo, regex, novo) {
  const caminho = join(RAIZ, arquivo);
  const antes = readFileSync(caminho, 'utf8');
  if (!regex.test(antes)) {
    console.error(`  ! não achei a linha da versão em ${arquivo}`);
    process.exitCode = 1;
    return;
  }
  writeFileSync(caminho, antes.replace(regex, novo));
  console.log(`  ${arquivo}`);
}

console.log(`Carimbando versão ${carimbo}`);

trocar('sw.js', /const VERSAO = '[^']*';/, `const VERSAO = 'caderneta-${carimbo}';`);
trocar('js/configuracao.js', /export const VERSAO_APP = '[^']*';/, `export const VERSAO_APP = '${legivel}';`);

/* Um arquivo minúsculo que o app consulta para saber se há versão nova.
   Separado do resto de propósito: é o único que precisa ser buscado sempre
   pela rede, e sendo pequeno isso não custa nada. */
writeFileSync(join(RAIZ, 'versao.json'), `${JSON.stringify({ versao: legivel })}\n`);
console.log('  versao.json');

console.log('Pronto. Agora é só commitar e publicar.');
