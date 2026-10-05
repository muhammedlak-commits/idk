/* Saleem Store — the catalog, shared by index.html, supplies.html and admin.html.
 *
 *   SaleemCatalog.load()        products + site settings to show, from (in order):
 *                               the admin's unpublished draft (only with ?preview=1),
 *                               the Google Sheet (config.catalogUrl), the last copy of
 *                               the Sheet this browser saw, then data/products.js + data/site.js
 *   SaleemCatalog.photo(p, w)   the product's uploaded photo, else a Bing placeholder
 *   SaleemCatalog.serialize*()  write data/products.js, data/site.js, private/commercial.js
 *   SaleemCatalog.kv            a small IndexedDB key/value store (the admin draft)
 *
 * Commission is private. It lives in private/commercial.js (never deployed) or the
 * Sheet's private columns, and nothing here ever writes it into a public file.
 */
(function () {
  'use strict';
  const CFG = Object.assign({ catalogUrl: '', webPhotos: true }, window.SALEEM_CONFIG || {});
  const BUNDLED = window.SALEEM_DATA || { departments: [], products: [] };
  const SERVICES = ['doctor', 'nursing', 'physio', 'lab', 'direct'];
  const STATUSES = ['available', 'out', 'hidden'];

  // every payment method the shop knows; settings.payments switches each on or off
  const PAYMENTS = [
    { key: 'cod',      en: 'Cash on delivery',  ar: 'الدفع نقداً عند الاستلام' },
    { key: 'zaincash', en: 'ZainCash',          ar: 'زين كاش' },
    { key: 'qicard',   en: 'Qi Card',           ar: 'كي كارد' },
    { key: 'fastpay',  en: 'FastPay',           ar: 'فاست باي' },
    { key: 'card',     en: 'Card on delivery',  ar: 'بطاقة عند الاستلام' },
  ];
  // the product finder's situations; kits are tagged with these
  const SITUATIONS = [
    { key: 'surgery',   icon: 'brace',  en: 'After surgery or a fracture',      ar: 'بعد عملية أو كسر',           depts: ['mobility', 'supports', 'wound', 'bathroom'] },
    { key: 'bedridden', icon: 'bed',    en: 'Bedridden or can’t walk far',      ar: 'طريح الفراش أو ما يمشي هواية', depts: ['bedroom', 'continence', 'personal', 'mobility'] },
    { key: 'elderly',   icon: 'hand',   en: 'Elderly, or at risk of falling',   ar: 'كبير بالعمر أو معرّض للسقوط',  depts: ['bathroom', 'daily', 'mobility', 'monitoring'] },
    { key: 'diabetes',  icon: 'drop',   en: 'Diabetes',                         ar: 'السكري',                      depts: ['diabetes', 'monitoring', 'wound'] },
    { key: 'breathing', icon: 'lungs',  en: 'Breathing problems',               ar: 'مشاكل بالتنفس',               depts: ['breathing', 'monitoring'] },
    { key: 'baby',      icon: 'baby',   en: 'Pregnancy or a new baby',          ar: 'حمل أو طفل جديد',             depts: ['baby'] },
  ];

  /* ── site settings: every key always present, whatever an older file or the Sheet holds ── */
  const DEFAULT_SETTINGS = {
    publicUrl: '',
    delivery:  { on: true, en: 'Delivered in 1–2 days', ar: 'التوصيل خلال ١–٢ يوم', noteEn: 'By our delivery partner, across Baghdad', noteAr: 'عن طريق شركة التوصيل، داخل بغداد', feeIqd: null },
    payments:  { cod: true, zaincash: true, qicard: true, fastpay: false, card: false },
    rentals:   { on: true, minMonths: 1, depositEn: 'A refundable cash deposit may apply', depositAr: 'ممكن يكون في تأمين نقدي يرجعلك بعد الإرجاع', includedEn: 'Delivery and pickup', includedAr: 'التوصيل والاستلام' },
    nurse:     { on: true, whatsapp: CFG.whatsapp || '' },
    finder:    { on: true },
    kits:      { on: true },
    clinics:   { on: true, bulkOn: true, tiers: [{ min: 10, pct: 5 }, { min: 25, pct: 10 }] },
    reminders: { on: true, days: 30 },
    showStore: true,
  };
  const BUNDLED_SITE = window.SALEEM_SITE || {};
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  function merge(base, over) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    if (!isObj(over)) return out;
    for (const k in over) out[k] = isObj(base[k]) ? merge(base[k], over[k]) : over[k];
    return out;
  }
  const str = v => String(v == null ? '' : v);
  const num = v => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[^\d.]/g, '')); return isFinite(n) && n > 0 ? Math.round(n) : null; };
  const pct = v => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[^\d.]/g, '')); return isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null; };

  function cleanSite(s) {
    s = s || {};
    const settings = merge(DEFAULT_SETTINGS, s.settings || {});
    settings.clinics.tiers = (Array.isArray(settings.clinics.tiers) ? settings.clinics.tiers : [])
      .map(t => ({ min: Math.floor(Number(t.min)), pct: pct(t.pct) })).filter(t => t.min > 1 && t.pct > 0).sort((a, b) => a.min - b.min);
    settings.delivery.feeIqd = num(settings.delivery.feeIqd);
    settings.reminders.days = Math.max(7, Math.min(120, Math.floor(Number(settings.reminders.days)) || 30));
    settings.rentals.minMonths = Math.max(1, Math.floor(Number(settings.rentals.minMonths)) || 1);
    settings.nurse.whatsapp = str(settings.nurse.whatsapp).replace(/\D/g, '');
    const stores = (s.stores || []).map(x => ({ id: str(x.id), en: str(x.en), ar: str(x.ar), area: str(x.area), on: x.on !== false })).filter(x => x.id);
    const kits = (s.kits || []).map(k => ({
      id: str(k.id), on: k.on !== false, icon: str(k.icon || 'heart'),
      en: str(k.en), ar: str(k.ar), blurbEn: str(k.blurbEn), blurbAr: str(k.blurbAr),
      situations: (k.situations || []).filter(x => SITUATIONS.some(s2 => s2.key === x)),
      items: (k.items || []).map(i => ({ id: Math.floor(Number(i.id)), qty: Math.max(1, Math.min(99, Math.floor(Number(i.qty)) || 1)), mode: ['buy', 'rent', 'refill', 'quote'].includes(i.mode) ? i.mode : 'buy' })).filter(i => i.id > 0),
    })).filter(k => k.id);
    const banners = (s.banners || []).map(b => ({
      id: str(b.id), on: b.on !== false, img: str(b.img), link: str(b.link),
      en: str(b.en), ar: str(b.ar), textEn: str(b.textEn), textAr: str(b.textAr), ctaEn: str(b.ctaEn), ctaAr: str(b.ctaAr),
      start: /^\d{4}-\d{2}-\d{2}$/.test(b.start) ? b.start : '', end: /^\d{4}-\d{2}-\d{2}$/.test(b.end) ? b.end : '',
      theme: ['navy', 'orange', 'green'].includes(b.theme) ? b.theme : 'navy',
    })).filter(b => b.id);
    return { settings, stores, kits, banners };
  }
  // switched on, and today within its dates
  function liveBanners(site, today) {
    today = today || new Date().toISOString().slice(0, 10);
    return site.banners.filter(b => b.on && (!b.start || b.start <= today) && (!b.end || b.end >= today));
  }

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
  function clean(p) {
    const services = Array.isArray(p.services) ? p.services : String(p.services || '').split(/[,;]/);
    return {
      id: Math.floor(Number(p.id)),
      tier: [1, 2, 3].includes(Number(p.tier)) ? Number(p.tier) : 2,
      dept: str(p.dept), sub: str(p.sub),
      rent: p.rent === true || p.rent === 'yes', refill: p.refill === true || p.refill === 'yes', b2b: p.b2b === true || p.b2b === 'yes',
      services: services.map(s => String(s).trim()).filter(s => SERVICES.includes(s)),
      en: str(p.en), ar: str(p.ar), whyEn: str(p.whyEn), whyAr: str(p.whyAr),
      price: num(p.price), rentPrice: num(p.rentPrice), deposit: num(p.deposit),
      status: STATUSES.includes(p.status) ? p.status : 'available',
      img: str(p.img), store: str(p.store),
      // private: only the admin ever has it, and no public writer emits it
      commission: pct(p.commission),
    };
  }
  const publicProduct = p => { const o = clean(p); delete o.commission; return o; };

  function bing(name, w) {
    return 'https://tse1.mm.bing.net/th?q=' + encodeURIComponent(name + ' medical supply product white background') +
           '&w=' + w + '&h=' + Math.round(w * 0.75) + '&c=7&rs=1&p=0&dpr=1.5&pid=1.7&mkt=en-US&adlt=strict';
  }
  // uploaded photo first; the Bing search is only ever a placeholder
  function photo(p, w) {
    if (p.img) return { src: p.img, placeholder: false };
    return { src: CFG.webPhotos && p.en ? bing(p.en, w) : '', placeholder: true };
  }

  /* ── what an order line costs: unit price, bulk discount, line total ── */
  function linePrice(p, mode, qty, settings) {
    const unit = mode === 'rent' ? p.rentPrice : (mode === 'buy' || mode === 'refill') ? p.price : null;
    if (!unit) return null;
    let off = 0;
    const c = settings && settings.clinics;
    if (c && c.on && c.bulkOn && mode !== 'rent') c.tiers.forEach(t => { if (qty >= t.min) off = t.pct; });
    return { unit, off, total: Math.round(unit * qty * (1 - off / 100)) };
  }

  /* ── reorder links: 53.f.2_23.f.1 → [{id:53, mode:'refill', qty:2}, …] ── */
  const M = { buy: 'b', rent: 'r', refill: 'f', quote: 'q' }, MR = { b: 'buy', r: 'rent', f: 'refill', q: 'quote' };
  const encodeLines = lines => lines.map(l => `${l.id}.${M[l.mode] || 'b'}.${l.qty}`).join('_');
  const decodeLines = code => String(code || '').split('_').map(s => s.split('.')).filter(a => a.length === 3 && MR[a[1]])
    .map(a => ({ id: String(Math.floor(Number(a[0]))), mode: MR[a[1]], qty: Math.max(1, Math.min(99, Math.floor(Number(a[2])) || 1)) })).filter(l => Number(l.id) > 0);

  /* ── the Sheet: fetched fresh, remembered for when it can't be reached ── */
  const CACHE_KEY = 'saleem-store:sheet-cache';
  function remember(j) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ products: j.products, site: j.site, version: j.version, updatedAt: j.updatedAt })); } catch (e) {} }
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

  const visible = list => list.map(publicProduct).filter(p => p.id > 0 && p.status !== 'hidden');
  const pack = (products, site, source, updatedAt) => ({ departments: BUNDLED.departments, products: visible(products), site: cleanSite(site), source, updatedAt: updatedAt || null });

  /**
   * opts.preview  show the admin draft if there is one
   * opts.onUpdate called later with a fresher catalog when the Sheet answers after
   *               we've already returned a remembered copy
   */
  async function load(opts) {
    opts = opts || {};
    if (opts.preview) {
      const d = await kv.get('draft');
      if (d && Array.isArray(d.products)) return pack(d.products, d.site || BUNDLED_SITE, 'draft', d.updatedAt);
    }
    if (CFG.catalogUrl) {
      const cached = recall();
      const live = fetchSheet(CFG.catalogUrl, cached ? 15000 : 7000).then(j => { remember(j); return j; });
      if (cached) {
        live.then(j => { if (opts.onUpdate && j.version !== cached.version) opts.onUpdate(pack(j.products, j.site || BUNDLED_SITE, 'sheet', j.updatedAt)); })
            .catch(e => console.warn('Saleem catalog: Sheet unreachable, showing the remembered copy.', e));
        return pack(cached.products, cached.site || BUNDLED_SITE, 'cache', cached.updatedAt);
      }
      try {
        const j = await live;
        return pack(j.products, j.site || BUNDLED_SITE, 'sheet', j.updatedAt);
      } catch (e) { console.warn('Saleem catalog: Sheet unreachable, using data/products.js.', e); }
    }
    return pack(BUNDLED.products, BUNDLED_SITE, 'file');
  }

  /* ═══════════════ WRITERS ═══════════════ */
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
 *   deposit    optional, IQD — the refundable deposit on a rental
 *   status     optional: "out" (shown, can't be ordered) or "hidden" (not shown)
 *   img        optional photo: a path like assets/products/23.webp, or a URL.
 *              Empty = a Bing reference thumbnail as a placeholder.
 *   store      the partner store that supplies it (an id from data/site.js)
 *
 * Commission is NOT in this file — it's private (private/commercial.js).
 */
`;
  const ORDER = ['id', 'tier', 'dept', 'sub', 'rent', 'refill', 'b2b', 'services', 'en', 'ar', 'whyEn', 'whyAr', 'price', 'rentPrice', 'deposit', 'status', 'img', 'store'];
  function serialize(departments, products) {
    const q = s => JSON.stringify(s);
    const deps = departments.map(d =>
      `  {key:${q(d.key)},icon:${q(d.icon)},en:${q(d.en)},ar:${q(d.ar)},blurbEn:${q(d.blurbEn)},blurbAr:${q(d.blurbAr)},\n   subs:[${d.subs.map(s => `{key:${q(s.key)},en:${q(s.en)},ar:${q(s.ar)}}`).join(',')}]},`).join('\n');
    const rows = products.map(publicProduct).map(p => {
      const o = {};
      ORDER.forEach(k => {
        // optional fields stay out of the file until they're used
        if (['price', 'rentPrice', 'deposit'].includes(k) && p[k] == null) return;
        if (k === 'status' && p.status === 'available') return;
        if ((k === 'img' || k === 'store') && !p[k]) return;
        o[k] = p[k];
      });
      return '  ' + JSON.stringify(o) + ',';
    }).join('\n');
    return `${HEADER}window.SALEEM_DATA = {\ndepartments: [\n${deps}\n],\nproducts: [\n${rows}\n]\n};\n`;
  }

  function serializeSite(site) {
    const s = cleanSite(site), j = v => JSON.stringify(v);
    return `/* Saleem Store — everything about the shop that isn't a product, edited in admin.html.
 *
 * settings  the switches and texts: delivery promise, payment methods, rentals,
 *           ask-a-nurse, product finder, kits, clinics and bulk pricing, refill reminders
 * stores    the partner stores products come from — public details only. Their
 *           commission and contacts are in private/commercial.js, which is never published.
 * kits      ready-made bundles shown in the shop (items: product id, qty, buy/rent/refill)
 * banners   the home-page banners; each is one link. Dates are optional (YYYY-MM-DD).
 */
window.SALEEM_SITE = {
"settings": ${JSON.stringify(s.settings, null, 2)},
"stores": [
${s.stores.map(x => '  ' + j(x)).join(',\n')}
],
"kits": [
${s.kits.map(x => '  ' + j(x)).join(',\n')}
],
"banners": [
${s.banners.map(x => '  ' + j(x)).join(',\n')}
]
};
`;
  }

  // store contacts + commission, and per-product commission overrides
  function serializePrivate(stores, products) {
    const st = {}, ov = {};
    (stores || []).forEach(s => { st[s.id] = { commission: pct(s.commission) ?? 0, phone: str(s.phone), contact: str(s.contact), notes: str(s.notes) }; });
    (products || []).forEach(p => { const c = pct(p.commission); if (c != null) ov[p.id] = c; });
    return `/* Saleem Store — PRIVATE. Commission and partner-store contacts.
 * Read only by admin.html. Never deploy this folder (build-dist.sh leaves it out).
 *
 * stores      store id → { commission %, phone, contact, notes }
 * commission  product id → commission % that overrides its store's
 */
window.SALEEM_PRIVATE = {
"stores": ${JSON.stringify(st, null, 2)},
"commission": ${JSON.stringify(ov)}
};
`;
  }

  window.SaleemCatalog = {
    config: CFG, bundled: BUNDLED, bundledSite: BUNDLED_SITE, SERVICES, STATUSES, PAYMENTS, SITUATIONS, DEFAULT_SETTINGS,
    clean, publicProduct, cleanSite, liveBanners, linePrice, encodeLines, decodeLines, pct,
    load, photo, bing, serialize, serializeSite, serializePrivate, kv,
  };
})();
