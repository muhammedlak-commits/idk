/**
 * Saleem Store — catalog, partner stores and orders backend
 * ─────────────────────────────────────────────────────────
 * One Apps Script project, bound to a Google Sheet with four tabs (created for you):
 *
 *   Products  the product list. Staff can edit it by hand — the column names match
 *             the admin portal's bulk-upload spreadsheet.
 *   Stores    the partner stores and their commission %.
 *   Site      shop settings, kits and banners (JSON, written by the admin portal).
 *   Orders    every order sent from the shop, with commission worked out per line.
 *
 *   doGet   ?action=catalog       public. Products + settings the shop shows.
 *                                 Commission and store contacts are never in it.
 *   doGet   ?action=status&id=&phone=   public. One order's status, for the shop's tracking
 *                                 page. Needs the order number AND the last 4 digits of
 *                                 the phone it was sent from; answers nothing else.
 *   doPost  {action:'order'}      public. The shop logs an order as it opens WhatsApp.
 *   doPost  {action, code, ...}   the admin portal. Every other action needs ADMIN_CODE.
 *
 * Deploy once: Deploy → New deployment → Web app
 *              Execute as: Me   |   Who has access: Anyone
 * Put the /exec URL in config.js → catalogUrl. See SETUP.md.
 *
 * Redeploy note: after editing this file, Deploy → Manage deployments → edit →
 * New version, or the live URL keeps running the old code.
 */

/* ═══════════════ SETTINGS ═══════════════ */

// The admin portal's code. Checked here, on Google's side — the check inside
// admin.html only decides whether to show the page. Change both together.
var ADMIN_CODE = '335500';

// After this many wrong codes in a row, every admin action is refused for
// LOCK_MINUTES. A 6-digit code is guessable without it.
var MAX_FAILS = 8;
var LOCK_MINUTES = 15;

// The public order log is open to anyone with the URL; this caps how fast it fills.
var MAX_ORDERS_PER_10_MIN = 60;

var PHOTO_FOLDER = 'Saleem Store photos';    // created in your Drive on the first upload

// Same names, same order as the admin portal's spreadsheet (js/admin-lib.js).
var COLUMNS = [
  'id', 'name_en', 'name_ar', 'department', 'section', 'tier',
  'buy_price_iqd', 'rent_price_iqd_month', 'rentable', 'monthly_refill', 'clinic_only',
  'services', 'status', 'why_en', 'why_ar', 'photo_url', 'store', 'commission_pct', 'deposit_iqd'
];
var STORE_COLUMNS = ['id', 'name_en', 'name_ar', 'area', 'commission_pct', 'phone', 'contact', 'notes', 'active'];
var ORDER_COLUMNS = ['id', 'created_at', 'status', 'name', 'phone', 'area', 'address', 'clinic', 'payment', 'notes', 'lang',
                     'remind', 'remind_on', 'reminded_at', 'items', 'est_total_iqd', 'commission_iqd', 'staff_note', 'lines_json', 'updated_at'];
var ORDER_STATUSES = ['new', 'confirmed', 'onway', 'delivered', 'cancelled'];

// The public status lookup is open to anyone with the URL; this caps how fast it can be tried.
var MAX_STATUS_PER_10_MIN = 300;
var SERVICES = ['doctor', 'nursing', 'physio', 'lab', 'direct'];

/* ═══════════════ PUBLIC ═══════════════ */

function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'status') {
    try { return json_(orderStatus_(e.parameter.id, e.parameter.phone)); }
    catch (err) { console.error(err); return json_({ ok: false, error: String(err.message || err) }); }
  }
  try {
    var products = readProducts_().filter(function (p) { return p.status !== 'hidden'; }).map(publicProduct_);
    var site = readSite_();
    site.stores = readStores_().filter(function (s) { return s.on; }).map(function (s) { return { id: s.id, en: s.en, ar: s.ar, area: s.area, on: true }; });
    return json_({ ok: true, products: products, site: site, version: version_([products, site]), updatedAt: updatedAt_() });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  if (!e || !e.postData) {
    return json_({ ok: false, error: 'doPost runs when the shop or admin portal sends something. To test from the editor, run testSetup instead.' });
  }
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Bad request' }); }

  var lock = LockService.getScriptLock();
  try {
    if (req.action === 'order') {                  // the only action without the code
      lock.waitLock(20000);
      return json_(logOrder_(req.order || {}));
    }
    checkCode_(req.code);
    lock.waitLock(20000);
    switch (req.action) {
      case 'login':
        return json_({ ok: true });
      case 'list':
        return json_({ ok: true, products: readProducts_(), stores: readStores_(), site: readSite_(), updatedAt: updatedAt_() });
      case 'save':                                   // upsert products by id
        return json_({ ok: true, products: save_(req.products || [], false), updatedAt: touch_() });
      case 'replaceAll':                             // the admin's "copy everything into the Sheet"
        if (req.stores) saveStores_(req.stores);
        if (req.site) writeSite_(req.site);
        return json_({ ok: true, products: save_(req.products || [], true), stores: readStores_(), site: readSite_(), updatedAt: touch_() });
      case 'delete':
        return json_({ ok: true, products: remove_(req.ids || []), updatedAt: touch_() });
      case 'photo':
        var p = photo_(req.id, req.dataUrl);
        touch_();
        return json_({ ok: true, product: p, url: p.img });
      case 'upload':                                 // any other image (banners)
        return json_({ ok: true, url: upload_(req.dataUrl, req.name || 'image') });
      case 'saveStores':
        saveStores_(req.stores || []);
        return json_({ ok: true, stores: readStores_(), updatedAt: touch_() });
      case 'saveSite':
        writeSite_(req.site || {});
        return json_({ ok: true, site: readSite_(), updatedAt: touch_() });
      case 'orders':
        return json_({ ok: true, orders: readOrders_() });
      case 'updateOrder':
        return json_({ ok: true, order: updateOrder_(req.id, req.patch || {}) });
      default:
        return json_({ ok: false, error: 'Unknown action: ' + req.action });
    }
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

function checkCode_(code) {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('fails') || 0);
  if (fails >= MAX_FAILS) throw new Error('Too many wrong codes. Try again in ' + LOCK_MINUTES + ' minutes.');
  if (String(code || '') !== String(ADMIN_CODE)) {
    cache.put('fails', String(fails + 1), LOCK_MINUTES * 60);
    throw new Error('Wrong code.');
  }
  cache.remove('fails');
}

/* ═══════════════ SHEETS ═══════════════ */

function sheet_(name, columns) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(columns);
    sheet.getRange(1, 1, 1, columns.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}
function getSheet_() { return sheet_('Products', COLUMNS); }

// header → column index, so staff can reorder columns or add their own
function headerMap_(head, columns, required) {
  var m = {};
  head.forEach(function (h, i) { var k = String(h).trim().toLowerCase(); if (columns.indexOf(k) !== -1 && !(k in m)) m[k] = i; });
  (required || []).forEach(function (k) { if (!(k in m)) throw new Error('A sheet is missing its "' + k + '" column heading.'); });
  return m;
}

// rewrite a sheet from objects keyed by column name, keeping columns staff added
function writeRows_(sheet, columns, rows, keyCol, replace) {
  var values = sheet.getDataRange().getValues();
  var head = values[0], m = headerMap_(head, columns, [keyCol]);
  columns.forEach(function (k) { if (!(k in m)) { m[k] = head.length; head.push(k); } });
  var width = head.length;
  var grid = [head].concat(replace ? [] : values.slice(1)).map(function (r) { while (r.length < width) r.push(''); return r; });
  var rowOf = {};
  for (var r = 1; r < grid.length; r++) { var key = String(grid[r][m[keyCol]]); if (key) rowOf[key] = r; }
  rows.forEach(function (cells) {
    var r = rowOf[String(cells[keyCol])];
    if (r === undefined) { r = grid.length; grid.push(new Array(width).fill('')); rowOf[String(cells[keyCol])] = r; }
    columns.forEach(function (k) { if (k in cells) grid[r][m[k]] = cells[k]; });
  });
  if (replace) sheet.clearContents();
  sheet.getRange(1, 1, grid.length, width).setValues(grid);
  sheet.getRange(1, 1, 1, width).setFontWeight('bold');
}

/* ═══════════════ PRODUCTS ═══════════════ */

function readProducts_() {
  var values = getSheet_().getDataRange().getValues();
  if (values.length < 2) return [];
  var m = headerMap_(values[0], COLUMNS, ['id', 'name_en']), out = [];
  for (var r = 1; r < values.length; r++) {
    var p = fromRow_(values[r], m);
    if (p) out.push(p);
  }
  return out;
}

var YES = ['yes', 'y', 'true', '1', 'x', 'نعم'];
function yes_(v) { return v === true || YES.indexOf(String(v).trim().toLowerCase()) !== -1; }
function money_(v) { var n = Number(String(v).replace(/[^\d.]/g, '')); return v !== '' && v != null && isFinite(n) && n > 0 ? Math.round(n) : null; }
function pct_(v) { if (v === '' || v == null) return null; var n = Number(String(v).replace(/[^\d.]/g, '')); return isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null; }

// a hand-typed row is read forgivingly; a row without an id or a name is skipped
function fromRow_(row, m) {
  var get = function (k) { return k in m ? row[m[k]] : ''; };
  var id = Math.floor(Number(get('id')));
  var en = String(get('name_en')).trim(), ar = String(get('name_ar')).trim();
  if (!(id > 0) || (!en && !ar)) return null;
  var status = String(get('status')).trim().toLowerCase().replace(/\s+/g, '_');
  return {
    id: id, en: en, ar: ar,
    dept: String(get('department')).trim(), sub: String(get('section')).trim(),
    tier: [1, 2, 3].indexOf(Number(get('tier'))) !== -1 ? Number(get('tier')) : 2,
    price: money_(get('buy_price_iqd')), rentPrice: money_(get('rent_price_iqd_month')), deposit: money_(get('deposit_iqd')),
    rent: yes_(get('rentable')), refill: yes_(get('monthly_refill')), b2b: yes_(get('clinic_only')),
    services: String(get('services')).split(/[,;|\/]/).map(function (s) { return s.trim().toLowerCase(); })
                .filter(function (s) { return SERVICES.indexOf(s) !== -1; }),
    status: status === 'hidden' ? 'hidden' : (status === 'out_of_stock' || status === 'out') ? 'out' : 'available',
    whyEn: String(get('why_en')), whyAr: String(get('why_ar')),
    img: String(get('photo_url')).trim(), store: String(get('store')).trim(),
    commission: pct_(get('commission_pct'))
  };
}
function publicProduct_(p) { var o = {}; for (var k in p) if (k !== 'commission') o[k] = p[k]; return o; }

function toCells_(p) {
  return {
    id: p.id, name_en: p.en, name_ar: p.ar, department: p.dept, section: p.sub, tier: p.tier,
    buy_price_iqd: p.price || '', rent_price_iqd_month: p.rentPrice || '', deposit_iqd: p.deposit || '',
    rentable: p.rent ? 'yes' : 'no', monthly_refill: p.refill ? 'yes' : 'no', clinic_only: p.b2b ? 'yes' : 'no',
    services: p.services.join(', '),
    status: p.status === 'out' ? 'out_of_stock' : p.status,
    why_en: p.whyEn, why_ar: p.whyAr, photo_url: p.img, store: p.store,
    commission_pct: p.commission == null ? '' : p.commission
  };
}

// what the browser sends is checked and trimmed before it reaches the Sheet
function str_(v, n) { return String(v == null ? '' : v).slice(0, n); }
function clean_(p) {
  var id = Math.floor(Number(p && p.id));
  if (!(id > 0)) throw new Error('Every product needs a positive whole-number id.');
  var img = str_(p.img, 500);
  if (img && !/^(https:\/\/|assets\/)/.test(img)) throw new Error('Product ' + id + ': photos must be https:// links — upload the photo through the portal.');
  return {
    id: id, en: str_(p.en, 200), ar: str_(p.ar, 200), dept: str_(p.dept, 40), sub: str_(p.sub, 40),
    tier: [1, 2, 3].indexOf(Number(p.tier)) !== -1 ? Number(p.tier) : 2,
    price: money_(p.price == null ? '' : p.price), rentPrice: money_(p.rentPrice == null ? '' : p.rentPrice), deposit: money_(p.deposit == null ? '' : p.deposit),
    rent: p.rent === true, refill: p.refill === true, b2b: p.b2b === true,
    services: (p.services || []).filter(function (x) { return SERVICES.indexOf(x) !== -1; }),
    status: ['available', 'out', 'hidden'].indexOf(p.status) !== -1 ? p.status : 'available',
    whyEn: str_(p.whyEn, 1000), whyAr: str_(p.whyAr, 1000), img: img,
    store: str_(p.store, 40), commission: pct_(p.commission)
  };
}

/** replace=false: update the rows these ids are on, add the rest. replace=true: the Sheet becomes exactly this list. */
function save_(list, replace) {
  writeRows_(getSheet_(), COLUMNS, list.map(clean_).map(toCells_), 'id', replace);
  return readProducts_();
}

function remove_(ids) {
  var drop = {}; ids.forEach(function (i) { drop[Math.floor(Number(i))] = true; });
  var sheet = getSheet_(), values = sheet.getDataRange().getValues(), m = headerMap_(values[0], COLUMNS, ['id']);
  for (var r = values.length - 1; r >= 1; r--) {
    if (drop[Math.floor(Number(values[r][m.id]))]) sheet.deleteRow(r + 1);
  }
  return readProducts_();
}

/* ═══════════════ PARTNER STORES ═══════════════ */

function readStores_() {
  var values = sheet_('Stores', STORE_COLUMNS).getDataRange().getValues();
  if (values.length < 2) return [];
  var m = headerMap_(values[0], STORE_COLUMNS, ['id']), out = [];
  for (var r = 1; r < values.length; r++) {
    var g = function (k) { return k in m ? values[r][m[k]] : ''; };
    var id = String(g('id')).trim(); if (!id) continue;
    out.push({ id: id, en: String(g('name_en')).trim(), ar: String(g('name_ar')).trim(), area: String(g('area')).trim(),
               commission: pct_(g('commission_pct')) || 0, phone: String(g('phone')).trim(), contact: String(g('contact')).trim(),
               notes: String(g('notes')), on: String(g('active')) === '' || yes_(g('active')) });
  }
  return out;
}
// the admin always sends the whole list, so this replaces the tab
function saveStores_(list) {
  var rows = list.map(function (s) {
    var id = str_(s.id, 40).trim(); if (!id) throw new Error('Every store needs an id.');
    return { id: id, name_en: str_(s.en, 120), name_ar: str_(s.ar, 120), area: str_(s.area, 120), commission_pct: pct_(s.commission) || 0,
             phone: str_(s.phone, 40), contact: str_(s.contact, 120), notes: str_(s.notes, 1000), active: s.on === false ? 'no' : 'yes' };
  });
  writeRows_(sheet_('Stores', STORE_COLUMNS), STORE_COLUMNS, rows, 'id', true);
}

/* ═══════════════ SITE: settings, kits, banners ═══════════════ */

function readSite_() {
  var values = sheet_('Site', ['key', 'json']).getDataRange().getValues(), out = {};
  for (var r = 1; r < values.length; r++) {
    var k = String(values[r][0]).trim();
    if (['settings', 'kits', 'banners'].indexOf(k) === -1) continue;
    try { out[k] = JSON.parse(values[r][1]); } catch (err) { console.warn('Site: bad JSON in "' + k + '"'); }
  }
  return out;
}
function writeSite_(patch) {
  var rows = [];
  ['settings', 'kits', 'banners'].forEach(function (k) {
    if (!(k in patch)) return;
    var s = JSON.stringify(patch[k]);
    if (s.length > 45000) throw new Error('Too much in "' + k + '" for one cell. Use photo links rather than pasted images.');
    if (/data:image/.test(s)) throw new Error('Upload images through the portal first; "' + k + '" still holds one inline.');
    rows.push({ key: k, json: s });
  });
  writeRows_(sheet_('Site', ['key', 'json']), ['key', 'json'], rows, 'key', false);
}

/* ═══════════════ ORDERS ═══════════════ */

function settings_() {
  var s = readSite_().settings || {};
  return { tiers: (s.clinics && s.clinics.on !== false && s.clinics.bulkOn !== false && s.clinics.tiers) || [],
           days: (s.reminders && Number(s.reminders.days)) || 30, remindOn: !(s.reminders && s.reminders.on === false) };
}
function linePrice_(p, mode, qty, tiers) {
  var unit = mode === 'rent' ? p.rentPrice : (mode === 'buy' || mode === 'refill') ? p.price : null;
  if (!unit) return null;
  var off = 0;
  if (mode !== 'rent') tiers.forEach(function (t) { if (qty >= Number(t.min) && Number(t.pct) > 0) off = Number(t.pct); });
  return { unit: unit, off: off, total: Math.round(unit * qty * (1 - off / 100)) };
}
// commission on one line: the item's own % if it has one, else its store's
function commissionOf_(line) { return line.total ? Math.round(line.total * (line.pct || 0) / 100) : 0; }

function logOrder_(o) {
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get('orders10') || 0);
  if (n >= MAX_ORDERS_PER_10_MIN) return { ok: false, error: 'busy' };
  cache.put('orders10', String(n + 1), 600);

  var id = str_(o.id, 20);
  if (!/^S-[A-Z0-9]{4,10}$/.test(id)) return { ok: false, error: 'bad order id' };
  var sheet = sheet_('Orders', ORDER_COLUMNS);
  var existing = sheet.getDataRange().getValues().some(function (r, i) { return i && String(r[0]) === id; });
  if (existing) return { ok: true, id: id, duplicate: true };

  var products = {}; readProducts_().forEach(function (p) { products[p.id] = p; });
  var stores = {}; readStores_().forEach(function (s) { stores[s.id] = s; });
  var cfg = settings_();
  var lines = (o.lines || []).slice(0, 80).map(function (l) {
    var p = products[Math.floor(Number(l.id))]; if (!p) return null;
    var mode = ['buy', 'rent', 'refill', 'quote'].indexOf(l.mode) !== -1 ? l.mode : 'buy';
    var qty = Math.max(1, Math.min(99, Math.floor(Number(l.qty)) || 1));
    var lp = linePrice_(p, mode, qty, cfg.tiers), st = stores[p.store];
    var line = { id: p.id, name: p.en || p.ar, store: p.store, storeName: st ? (st.en || st.ar) : '', mode: mode, qty: qty,
                 unit: lp ? lp.unit : null, off: lp ? lp.off : 0, total: lp ? lp.total : null,
                 pct: p.commission != null ? p.commission : (st ? st.commission : 0) };
    line.commission = commissionOf_(line);
    return line;
  }).filter(Boolean);
  if (!lines.length) return { ok: false, error: 'no known products' };

  var now = new Date(), remind = !!o.remind && cfg.remindOn && lines.some(function (l) { return l.mode === 'refill'; });
  var row = orderCells_({ id: id, created_at: now.toISOString(), status: 'new', name: str_(o.name, 120), phone: str_(o.phone, 20).replace(/[^\d+]/g, ''),
    area: str_(o.area, 120), address: str_(o.addr, 300), clinic: str_(o.clinic, 160), payment: str_(o.payment, 20), notes: str_(o.notes, 1000),
    lang: o.lang === 'en' ? 'en' : 'ar', remind: remind ? 'yes' : 'no',
    remind_on: remind ? new Date(now.getTime() + cfg.days * 86400000).toISOString().slice(0, 10) : '', reminded_at: '', staff_note: '' }, lines);
  sheet.appendRow(ORDER_COLUMNS.map(function (k) { return row[k] == null ? '' : row[k]; }));
  return { ok: true, id: id };
}

function orderCells_(base, lines) {
  base.items = lines.map(function (l) { return l.qty + '× ' + l.name + ' (' + l.mode + ')' + (l.storeName ? ' — ' + l.storeName : ''); }).join('; ');
  base.est_total_iqd = lines.reduce(function (a, l) { return a + (l.total || 0); }, 0) || '';
  base.commission_iqd = lines.reduce(function (a, l) { return a + (l.commission || 0); }, 0) || '';
  base.lines_json = JSON.stringify(lines);
  base.updated_at = new Date().toISOString();
  return base;
}

function readOrders_() {
  var values = sheet_('Orders', ORDER_COLUMNS).getDataRange().getValues();
  if (values.length < 2) return [];
  var m = headerMap_(values[0], ORDER_COLUMNS, ['id']), out = [];
  for (var r = 1; r < values.length; r++) {
    var o = {};
    ORDER_COLUMNS.forEach(function (k) { var v = k in m ? values[r][m[k]] : ''; o[k] = v instanceof Date ? v.toISOString() : v; });
    if (!o.id) continue;
    try { o.lines = JSON.parse(o.lines_json || '[]'); } catch (err) { o.lines = []; }
    delete o.lines_json;
    o.remind = yes_(o.remind);
    o.remind_on = String(o.remind_on || '').slice(0, 10);
    out.push(o);
  }
  return out.reverse().slice(0, 1000);   // newest first
}

/** What the customer may see about their own order: status, dates and the items. Nothing
 *  else, and only when the phone's last 4 digits match — an order number alone is not enough. */
function orderStatus_(id, phone) {
  var cache = CacheService.getScriptCache(), n = Number(cache.get('status10') || 0);
  if (n >= MAX_STATUS_PER_10_MIN) return { ok: false, error: 'busy' };
  cache.put('status10', String(n + 1), 600);
  id = str_(id, 20).trim().toUpperCase();
  var last4 = String(phone || '').replace(/\D/g, '').slice(-4);
  if (!/^S-[A-Z0-9]{4,10}$/.test(id) || last4.length !== 4) return { ok: false, error: 'bad request' };
  var o = readOrders_().filter(function (x) { return String(x.id).toUpperCase() === id; })[0];
  if (!o || String(o.phone).replace(/\D/g, '').slice(-4) !== last4) return { ok: true, found: false };
  return { ok: true, found: true, id: o.id, status: o.status || 'new', created_at: o.created_at, updated_at: o.updated_at || o.created_at,
           lines: (o.lines || []).map(function (l) { return { id: l.id, mode: l.mode, qty: l.qty, total: l.total }; }) };
}

/** patch: { status, staff_note, reminded: true, lines: [{ unit, pct }] by position } */
function updateOrder_(id, patch) {
  var sheet = sheet_('Orders', ORDER_COLUMNS), values = sheet.getDataRange().getValues(), m = headerMap_(values[0], ORDER_COLUMNS, ['id']);
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][m.id]) !== String(id)) continue;
    var row = {}; ORDER_COLUMNS.forEach(function (k) { row[k] = k in m ? values[r][m[k]] : ''; });
    var lines = []; try { lines = JSON.parse(row.lines_json || '[]'); } catch (err) {}
    if (patch.status && ORDER_STATUSES.indexOf(patch.status) !== -1) row.status = patch.status;
    if ('staff_note' in patch) row.staff_note = str_(patch.staff_note, 1000);
    if (patch.reminded) row.reminded_at = new Date().toISOString();
    if (Array.isArray(patch.lines)) patch.lines.forEach(function (pl, i) {
      var l = lines[i]; if (!l || !pl) return;
      if ('unit' in pl) { l.unit = money_(pl.unit); l.total = l.unit ? Math.round(l.unit * l.qty * (1 - (l.off || 0) / 100)) : null; }
      if ('pct' in pl) l.pct = pct_(pl.pct) || 0;
      l.commission = commissionOf_(l);
    });
    var cells = orderCells_(row, lines);
    writeRows_(sheet, ORDER_COLUMNS, [cells], 'id', false);
    return readOrders_().filter(function (o) { return o.id === String(id); })[0];
  }
  throw new Error('No order ' + id);
}

/* ═══════════════ PHOTOS ═══════════════ */

function photo_(id, dataUrl) {
  var product = readProducts_().filter(function (p) { return p.id === Math.floor(Number(id)); })[0];
  if (!product) throw new Error('No product with id ' + id + ' in the Sheet. Save the product first.');
  var old = product.img;
  product.img = upload_(dataUrl, 'product-' + product.id);
  trashOld_(old);
  save_([product], false);
  return product;
}

function upload_(dataUrl, name) {
  var match = /^data:(image\/(?:webp|jpeg|png));base64,(.+)$/.exec(String(dataUrl || ''));
  if (!match) throw new Error('Images must be uploaded as WebP, JPEG or PNG.');
  if (match[2].length > 6 * 1024 * 1024) throw new Error('That image is too large (the portal shrinks them; is this an old browser?).');
  var ext = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }[match[1]];
  var blob = Utilities.newBlob(Utilities.base64Decode(match[2]), match[1], str_(name, 60).replace(/[^\w-]/g, '-') + '.' + ext);
  var file = getFolder_().createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    file.setTrashed(true);
    throw new Error('Google Drive won’t share files publicly from this account (a Workspace policy), so shoppers ' +
                    'couldn’t see the image. Use a personal Google account for this script, or paste image links instead.');
  }
  return 'https://lh3.googleusercontent.com/d/' + file.getId();
}

// the image it replaces, if this script uploaded it
function trashOld_(url) {
  var old = /lh3\.googleusercontent\.com\/d\/([\w-]+)/.exec(url || '');
  if (!old) return;
  try { var f = DriveApp.getFileById(old[1]); if (isIn_(f, getFolder_())) f.setTrashed(true); } catch (ignored) {}
}

function getFolder_() {
  var it = DriveApp.getFoldersByName(PHOTO_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(PHOTO_FOLDER);
}

function isIn_(file, folder) {
  var parents = file.getParents();
  while (parents.hasNext()) if (parents.next().getId() === folder.getId()) return true;
  return false;
}

/* ═══════════════ CHECK YOUR SETUP ═══════════════ */

/**
 * Safe to run from the editor: pick "testSetup" in the function dropdown, press Run.
 * Creates the four tabs, checks Drive access, and says what the shop will see.
 */
function testSetup() {
  getSheet_(); sheet_('Stores', STORE_COLUMNS); sheet_('Site', ['key', 'json']); sheet_('Orders', ORDER_COLUMNS);
  var products = readProducts_();
  Logger.log('Tabs ready: Products, Stores, Site, Orders.');
  Logger.log('%s products (%s visible in the shop), %s partner stores, %s orders.', products.length,
             products.filter(function (p) { return p.status !== 'hidden'; }).length, readStores_().length, readOrders_().length);
  if (!products.length) Logger.log('Empty — open the admin portal → Publish → "Copy everything into the Sheet".');
  Logger.log('Photo folder: "%s"', getFolder_().getName());
  Logger.log('Admin code is set: %s', ADMIN_CODE ? 'yes' : 'NO — set ADMIN_CODE');
  Logger.log('All good. Now deploy: Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).');
}

/* ═══════════════ SHARED ═══════════════ */

function touch_() {
  var now = new Date().toISOString();
  PropertiesService.getScriptProperties().setProperty('updatedAt', now);
  return now;
}
function updatedAt_() { return PropertiesService.getScriptProperties().getProperty('updatedAt') || ''; }

// changes whenever what the shop shows does — including hand edits in the Sheet
function version_(x) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(x), Utilities.Charset.UTF_8));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
