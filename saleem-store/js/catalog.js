/* Saleem Store — the catalog, shared by index.html, supplies.html and admin.html.
 *
 *   SaleemCatalog.load()        the product list to show, from (in order):
 *                               the admin's unpublished draft (only with ?preview=1),
 *                               the Google Sheet (config.catalogUrl), the last copy of
 *                               the Sheet this browser saw, then data/products.js
 *   SaleemCatalog.photo(p, w)   the product's uploaded photo, else a Bing placeholder
 *   SaleemCatalog.serialize()   writes data/products.js in its one-line-per-product form
 *   SaleemCatalog.kv            a small IndexedDB key/value store (the admin draft)
 */
(function () {
  'use strict';
  const CFG = Object.assign({ catalogUrl: '', webPhotos: true }, window.SALEEM_CONFIG || {});
  const BUNDLED = window.SALEEM_DATA || { departments: [], products: [] };
  const SERVICES = ['doctor', 'nursing', 'physio', 'lab', 'direct'];
  const STATUSES = ['available', 'out', 'hidden'];

  /* ── IndexedDB key/value. Every call resolves, even where IndexedDB is blocked. ── */
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      try {
        const r = indexedDB.open('saleem-store', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
    return dbp;
  }
  const kv = {
    async get(k) {
      try {
        const d = await db();
        return await new Promise((res, rej) => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      } catch (e) { return undefined; }
    },
    async set(k, v) {
      const d = await db();
      return new Promise((res, rej) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    },
    async del(k) {
      try {
        const d = await db();
        return await new Promise(res => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(k); tx.oncomplete = () => res(); tx.onerror = () => res(); });
      } catch (e) {}
    },
  };

  /* ── one product, with every field present and the right type ── */
  const num = v => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[^\d.]/g, '')); return isFinite(n) && n > 0 ? Math.round(n) : null; };
  function clean(p) {
    const services = Array.isArray(p.services) ? p.services : String(p.services || '').split(/[,;]/);
    return {
      id: Math.floor(Number(p.id)),
      tier: [1, 2, 3].includes(Number(p.tier)) ? Number(p.tier) : 2,
      dept: String(p.dept || ''), sub: String(p.sub || ''),
      rent: p.rent === true || p.rent === 'yes', refill: p.refill === true || p.refill === 'yes', b2b: p.b2b === true || p.b2b === 'yes',
      services: services.map(s => String(s).trim()).filter(s => SERVICES.includes(s)),
      en: String(p.en || ''), ar: String(p.ar || ''), whyEn: String(p.whyEn || ''), whyAr: String(p.whyAr || ''),
      price: num(p.price), rentPrice: num(p.rentPrice),
      status: STATUSES.includes(p.status) ? p.status : 'available',
      img: String(p.img || ''),
    };
  }

  function bing(name, w) {
    return 'https://tse1.mm.bing.net/th?q=' + encodeURIComponent(name + ' medical supply product white background') +
           '&w=' + w + '&h=' + Math.round(w * 0.75) + '&c=7&rs=1&p=0&dpr=1.5&pid=1.7&mkt=en-US&adlt=strict';
  }
  // uploaded photo first; the Bing search is only ever a placeholder
  function photo(p, w) {
    if (p.img) return { src: p.img, placeholder: false };
    return { src: CFG.webPhotos && p.en ? bing(p.en, w) : '', placeholder: true };
  }

  /* ── the Sheet: fetched fresh, remembered for when it can't be reached ── */
  const CACHE_KEY = 'saleem-store:sheet-cache';
  function remember(j) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ products: j.products, version: j.version, updatedAt: j.updatedAt })); } catch (e) {} }
  function recall() { try { const j = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); return j && Array.isArray(j.products) && j.products.length ? j : null; } catch (e) { return null; } }

  async function fetchSheet(url, ms) {
    const ctl = 'AbortController' in window ? new AbortController() : null;
    const timer = setTimeout(() => ctl && ctl.abort(), ms);
    try {
      const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'action=catalog', { signal: ctl && ctl.signal, cache: 'no-store' });
      const j = await r.json();
      if (!j || !j.ok || !Array.isArray(j.products)) throw new Error((j && j.error) || 'bad catalog');
      return j;
    } finally { clearTimeout(timer); }
  }

  const visible = list => list.map(clean).filter(p => p.id > 0 && p.status !== 'hidden');

  /**
   * opts.preview  show the admin draft if there is one
   * opts.onUpdate called later with a fresher catalog when the Sheet answers after
   *               we've already returned a remembered copy
   */
  async function load(opts) {
    opts = opts || {};
    const base = { departments: BUNDLED.departments, source: 'file', updatedAt: null };
    if (opts.preview) {
      const d = await kv.get('draft');
      if (d && Array.isArray(d.products)) return Object.assign({}, base, { products: visible(d.products), source: 'draft', updatedAt: d.updatedAt });
    }
    if (CFG.catalogUrl) {
      const cached = recall();
      const live = fetchSheet(CFG.catalogUrl, cached ? 15000 : 7000).then(j => { remember(j); return j; });
      if (cached) {
        live.then(j => { if (opts.onUpdate && j.version !== cached.version) opts.onUpdate(Object.assign({}, base, { products: visible(j.products), source: 'sheet', updatedAt: j.updatedAt })); })
            .catch(e => console.warn('Saleem catalog: Sheet unreachable, showing the remembered copy.', e));
        return Object.assign({}, base, { products: visible(cached.products), source: 'cache', updatedAt: cached.updatedAt });
      }
      try {
        const j = await live;
        return Object.assign({}, base, { products: visible(j.products), source: 'sheet', updatedAt: j.updatedAt });
      } catch (e) { console.warn('Saleem catalog: Sheet unreachable, using data/products.js.', e); }
    }
    return Object.assign({}, base, { products: visible(BUNDLED.products) });
  }

  /* ── data/products.js, in the same shape it's checked in with ── */
  const HEADER = `/* Saleem Store — the one product list.
 *
 * Every page reads this file: index.html (the shop), supplies.html (the internal
 * buying list) and admin.html (where it's edited). Edit products in admin.html —
 * it writes this file for you — or by hand here.
 *
 * departments  how the shop is organised for customers: by what the patient
 *              needs, each with sub-tabs. Order here is the order on screen.
 * products     one line per item.
 *   id         stable — order links and saved baskets point at it; never reuse one
 *   tier       buying priority, internal only. 1 = the care plan breaks without it,
 *              2 = useful, 3 = bonus. The shop uses it to sort, never shows it.
 *   dept/sub   where the item sits in the shop (keys from departments below)
 *   rent       can be rented as well as bought
 *   refill     can be sent monthly as a refill
 *   b2b        clinics only — sold by quote, never from store stock
 *   services   which Saleem visits create the need:
 *              doctor · nursing · physio · lab · direct (customers order it themselves)
 *   price      optional, IQD. Shown when set; otherwise "price on WhatsApp"
 *   rentPrice  optional, IQD per month
 *   status     optional: "out" (shown, can't be ordered) or "hidden" (not shown)
 *   img        optional photo: a path like assets/products/23.webp, or a URL.
 *              Empty = a Bing reference thumbnail as a placeholder.
 */
`;
  const ORDER = ['id', 'tier', 'dept', 'sub', 'rent', 'refill', 'b2b', 'services', 'en', 'ar', 'whyEn', 'whyAr', 'price', 'rentPrice', 'status', 'img'];
  function serialize(departments, products) {
    const q = s => JSON.stringify(s);
    const deps = departments.map(d =>
      `  {key:${q(d.key)},icon:${q(d.icon)},en:${q(d.en)},ar:${q(d.ar)},blurbEn:${q(d.blurbEn)},blurbAr:${q(d.blurbAr)},\n   subs:[${d.subs.map(s => `{key:${q(s.key)},en:${q(s.en)},ar:${q(s.ar)}}`).join(',')}]},`).join('\n');
    const rows = products.map(clean).map(p => {
      const o = {};
      ORDER.forEach(k => {
        // optional fields stay out of the file until they're used
        if ((k === 'price' || k === 'rentPrice') && p[k] == null) return;
        if (k === 'status' && p.status === 'available') return;
        if (k === 'img' && !p.img) return;
        o[k] = p[k];
      });
      return '  ' + JSON.stringify(o) + ',';
    }).join('\n');
    return `${HEADER}window.SALEEM_DATA = {\ndepartments: [\n${deps}\n],\nproducts: [\n${rows}\n]\n};\n`;
  }

  window.SaleemCatalog = { config: CFG, bundled: BUNDLED, SERVICES, STATUSES, clean, load, photo, bing, serialize, kv };
})();
