// Service worker: permite usar la app sin conexión (por ejemplo, dentro del súper).
// - Archivos de la app: se sirven desde la caché al instante y se actualizan en segundo plano.
// - Precios (data/mercadona.json): primero la red, para tenerlos frescos; si no hay conexión, la copia guardada.
// La versión la cambia el despliegue de GitHub Actions en cada publicación, lo que limpia las cachés antiguas.

const VERSION = '__VERSION__';
const CACHE = `compra-sana-${VERSION}`;
const NUCLEO = [
  './', 'index.html', 'manifest.webmanifest', 'css/estilos.css',
  'js/app.js', 'js/motor.js', 'js/generador.js',
  'data/ingredientes.json', 'data/recetas.json', 'data/mercadona.json',
  'iconos/icono.svg', 'iconos/icono-192.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(NUCLEO.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(k => k.startsWith('compra-sana-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // fotos de Mercadona y demás: directo a la red
  if (url.pathname.endsWith('/data/mercadona.json')) e.respondWith(redPrimero(req));
  else e.respondWith(cachePrimero(req, e));
});

async function redPrimero(req) {
  const cache = await caches.open(CACHE);
  try {
    const resp = await fetch(req, { cache: 'no-cache' });
    if (resp.ok) await cache.put(req, resp.clone());
    return resp;
  } catch {
    return (await cache.match(req)) || Response.error();
  }
}

async function cachePrimero(req, evento) {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(req, { ignoreSearch: true });
  const red = fetch(req)
    .then(resp => { if (resp.ok) cache.put(req, resp.clone()); return resp; })
    .catch(() => null);
  if (guardada) {
    evento.waitUntil(red); // actualiza en segundo plano
    return guardada;
  }
  const resp = await red;
  if (resp) return resp;
  if (req.mode === 'navigate') return (await cache.match('./')) || (await cache.match('index.html'));
  return Response.error();
}
