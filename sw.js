/* =========================================================================
   Service worker: é o que faz o app abrir sem internet e poder ser
   instalado na tela de início do celular.

   ESTRATÉGIA: rede primeiro, cópia guardada como rede de segurança.

   A versão anterior fazia o contrário — servia a cópia e buscava a nova
   atrás — e o efeito era que o app SEMPRE mostrava a versão anterior:
   cada abertura entregava o que tinha sido baixado na abertura passada.
   Para um app que recebe melhorias toda semana, isso é um defeito, não uma
   otimização. Alguns milissegundos a mais valem menos que ver o que é
   verdade.

   Sem internet, tudo continua funcionando: a cópia guardada assume.

   A versão abaixo é escrita por `npm run versao`, que roda antes de cada
   publicação. Ela não é mantida à mão de propósito: quando dependia de eu
   lembrar, eu esqueci sete vezes seguidas.
   ========================================================================= */

const VERSAO = 'caderneta-2026-09-23-0841';

const ARQUIVOS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/calculos.js',
  './js/conta.js',
  './js/configuracao.js',
  './js/dados.js',
  './js/formato.js',
  './js/interpretar.js',
  './js/mapear.js',
  './js/segredo.js',
  './js/servidor.js',
  './js/telas.js',
  './js/tema.js',
  './js/tranca.js',
  './js/ui.js',
  './manifest.webmanifest',
  './icons/icone.svg',
  './icons/icone-192.png',
  './icons/icone-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSAO)
      // Um por um com `reload`, e não `addAll`: o `addAll` aceita o que
      // estiver no cache do navegador, e o service worker novo nasceria
      // guardando os arquivos da versão anterior.
      .then((cache) => Promise.all(ARQUIVOS.map(async (caminho) => {
        const resposta = await fetch(new Request(caminho, { cache: 'reload' }));
        if (resposta.ok) await cache.put(caminho, resposta);
      })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(
        chaves.filter((c) => c !== VERSAO).map((c) => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const requisicao = evento.request;

  // Só cuidamos de leitura da própria origem. O Supabase e a fonte do Google
  // o navegador resolve sozinho — e o app já sabe se virar sem eles.
  if (requisicao.method !== 'GET') return;
  if (new URL(requisicao.url).origin !== self.location.origin) return;
  // O arquivo de versão precisa ser sempre o do servidor: guardá-lo seria
  // perguntar à cópia velha se existe versão nova.
  if (new URL(requisicao.url).pathname.endsWith('/versao.json')) return;

  evento.respondWith((async () => {
    try {
      // `no-cache` não quer dizer "não guarde": quer dizer "pergunte ao
      // servidor se mudou antes de usar o que está guardado". Sem isto, a
      // estratégia de rede primeiro era mentira por dez minutos a cada
      // publicação — o GitHub manda o navegador guardar os arquivos por esse
      // tempo, e o `fetch` daqui era atendido pelo cache do navegador sem
      // nunca tocar na rede. O app baixava a si mesmo, velho, e achava que
      // tinha atualizado.
      //
      // Não custa download: quando nada mudou o servidor responde "igual" em
      // uma linha, e o navegador entrega o que já tinha.
      const resposta = await fetch(new Request(requisicao.url, {
        cache: 'no-cache',
        credentials: 'same-origin',
      }));

      if (resposta && resposta.ok) {
        const cache = await caches.open(VERSAO);
        cache.put(requisicao, resposta.clone());
        return resposta;
      }

      // Servidor respondeu, mas respondeu errado (404, 500, página de erro do
      // GitHub). Isso não é o app: é o endereço fora do ar. A cópia guardada
      // é mais útil que uma tela de erro — e foi exatamente o que faltou
      // quando a publicação caiu.
      const copia = await caches.match(requisicao);
      return copia || resposta;
    } catch (erro) {
      const guardado = await caches.match(requisicao);
      if (guardado) return guardado;

      // Abrindo o app sem rede e sem esta página guardada: a tela inicial
      // serve, porque o app é uma página só.
      if (requisicao.mode === 'navigate') {
        const inicial = await caches.match('./index.html');
        if (inicial) return inicial;
      }
      throw erro;
    }
  })());
});
