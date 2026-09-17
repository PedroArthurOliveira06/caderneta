/* =========================================================================
   Service worker: é o que faz o app abrir sem internet e poder ser
   instalado na tela de início do celular.

   Estratégia: "usa o cache e atualiza atrás". A tela abre na hora, a partir
   do que já está guardado, e a versão nova é baixada em segundo plano para
   a próxima abertura. Para um app de uso diário isso vale mais que esperar
   a rede a cada toque.

   AO PUBLICAR UMA VERSÃO NOVA: troque o número do VERSAO abaixo. É o que
   diz ao celular para jogar fora o cache antigo.
   ========================================================================= */

const VERSAO = 'caderneta-v1';

const ARQUIVOS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/dados.js',
  './js/calculos.js',
  './js/formato.js',
  './js/telas.js',
  './js/ui.js',
  './manifest.webmanifest',
  './icons/icone.svg',
  './icons/icone-192.png',
  './icons/icone-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSAO)
      .then((cache) => cache.addAll(ARQUIVOS))
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

  // Só cuidamos de leitura da própria origem. A fonte do Google, por
  // exemplo, o navegador resolve sozinho — e sem internet o app cai no
  // tipo do sistema, o que é aceitável.
  if (requisicao.method !== 'GET') return;
  if (new URL(requisicao.url).origin !== self.location.origin) return;

  evento.respondWith(
    caches.match(requisicao).then((guardado) => {
      const daRede = fetch(requisicao)
        .then((resposta) => {
          if (resposta && resposta.ok) {
            const copia = resposta.clone();
            caches.open(VERSAO).then((cache) => cache.put(requisicao, copia));
          }
          return resposta;
        })
        .catch(() => guardado);

      return guardado || daRede;
    })
  );
});
