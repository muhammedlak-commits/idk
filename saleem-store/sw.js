/* Saleem Store — offline support.
 *
 * The page, its scripts and the product list are kept in the browser, so the shop
 * opens straight away and still works on a weak connection or none.
 *   - the page, config and product list: network first (so updates arrive), the kept
 *     copy if the network is slow (2.5 s) or down
 *   - icons, fonts, the logo, uploaded photos: kept copy first, refreshed in the background
 *   - Bing placeholder photos and Drive photos: kept once seen, up to 300 of them
 *   - the Google Sheet (catalog and orders) is never cached here; js/catalog.js keeps its
 *     own copy of the catalog
 * Bump VERSION when this file changes, so old copies are cleared.
 */
const VERSION = 'v1';
const CORE = 'saleem-core-' + VERSION, IMGS = 'saleem-img-' + VERSION;
const PRECACHE = ['./', './index.html', './config.js', './js/catalog.js', './data/products.js', './data/site.js',
  './manifest.webmanifest', './assets/logo-saleem.png', './assets/icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CORE).then(c => Promise.all(PRECACHE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CORE && k !== IMGS).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const fresh = /\/(index\.html|config\.js|data\/[^/]+\.js|js\/[^/]+\.js|manifest\.webmanifest)?$/;
const photoHosts = /(^|\.)bing\.(com|net)$|^tse\d\.mm\.bing\.net$|googleusercontent\.com$/;

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin === location.origin) {
    if (req.mode === 'navigate' || fresh.test(url.pathname)) e.respondWith(networkFirst(req));
    else e.respondWith(keptFirst(req, CORE));
  } else if (req.destination === 'image' && photoHosts.test(url.hostname)) {
    e.respondWith(keptFirst(req, IMGS, 300));
  }
});

async function networkFirst(req) {
  const c = await caches.open(CORE);
  const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; });
  const slow = new Promise(res => setTimeout(res, 2500));
  try {
    const r = await Promise.race([net, slow.then(() => { throw new Error('slow'); })]);
    return r;
  } catch (err) {
    const kept = await c.match(req, { ignoreSearch: req.mode === 'navigate' }) || (req.mode === 'navigate' && await c.match('./index.html'));
    return kept || net;
  }
}

async function keptFirst(req, name, max) {
  const c = await caches.open(name), kept = await c.match(req);
  const net = fetch(req).then(async r => {
    if (r.ok || r.type === 'opaque') {
      await c.put(req, r.clone());
      if (max) { const keys = await c.keys(); if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map(k => c.delete(k))); }
    }
    return r;
  }).catch(() => kept);
  return kept || net;
}
