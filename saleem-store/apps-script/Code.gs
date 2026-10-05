/**
 * Saleem Store — product catalog backend
 * ──────────────────────────────────────
 * One Apps Script project, bound to a Google Sheet. The Sheet's "Products" tab
 * is the product list: the shop reads it, the admin portal writes it, and staff
 * can also edit it by hand — the column names match the bulk-upload spreadsheet.
 *
 *   doGet   ?action=catalog       public. What the shop shows (hidden items left out).
 *   doPost  {action, code, ...}   the admin portal. Every write needs ADMIN_CODE.
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

// After this many wrong codes in a row, every admin write is refused for
// LOCK_MINUTES. A 6-digit code is guessable without it.
var MAX_FAILS = 8;
var LOCK_MINUTES = 15;

var SHEET_NAME = 'Products';
var PHOTO_FOLDER = 'Saleem Store photos';    // created in your Drive on the first upload

// Same names, same order as the admin portal's spreadsheet (js/admin-lib.js).
var COLUMNS = [
  'id', 'name_en', 'name_ar', 'department', 'section', 'tier',
  'buy_price_iqd', 'rent_price_iqd_month', 'rentable', 'monthly_refill', 'clinic_only',
  'services', 'status', 'why_en', 'why_ar', 'photo_url'
];
var SERVICES = ['doctor', 'nursing', 'physio', 'lab', 'direct'];

/* ═══════════════ PUBLIC ═══════════════ */

function doGet(e) {
  try {
    var all = readProducts_();
    var products = all.filter(function (p) { return p.status !== 'hidden'; });
    return json_({ ok: true, products: products, version: version_(products), updatedAt: updatedAt_() });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err.message || err) });
  }
}

/* ═══════════════ ADMIN ═══════════════ */

function doPost(e) {
  if (!e || !e.postData) {
    return json_({ ok: false, error: 'doPost runs when the admin portal saves. To test from the editor, run testSetup instead.' });
  }
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Bad request' }); }

  var lock = LockService.getScriptLock();
  try {
    checkCode_(req.code);
    lock.waitLock(20000);
    switch (req.action) {
      case 'login':
        return json_({ ok: true });
      case 'list':
        return json_({ ok: true, products: readProducts_(), updatedAt: updatedAt_() });
      case 'save':                                   // upsert by id
        return json_({ ok: true, products: save_(req.products || [], false), updatedAt: touch_() });
      case 'replaceAll':                             // the admin's "copy the catalog into the Sheet"
        return json_({ ok: true, products: save_(req.products || [], true), updatedAt: touch_() });
      case 'delete':
        return json_({ ok: true, products: remove_(req.ids || []), updatedAt: touch_() });
      case 'photo':
        var p = photo_(req.id, req.dataUrl);
        touch_();
        return json_({ ok: true, product: p, url: p.img });
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

/* ═══════════════ THE SHEET ═══════════════ */

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS);
    sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// header → column index, so staff can reorder columns or add their own
function headerMap_(head) {
  var m = {};
  head.forEach(function (h, i) { var k = String(h).trim().toLowerCase(); if (COLUMNS.indexOf(k) !== -1 && !(k in m)) m[k] = i; });
  ['id', 'name_en'].forEach(function (k) { if (!(k in m)) throw new Error('The Products sheet is missing its "' + k + '" column heading.'); });
  return m;
}

function readProducts_() {
  var values = getSheet_().getDataRange().getValues();
  if (values.length < 2) return [];
  var m = headerMap_(values[0]), out = [];
  for (var r = 1; r < values.length; r++) {
    var p = fromRow_(values[r], m);
    if (p) out.push(p);
  }
  return out;
}

var YES = ['yes', 'y', 'true', '1', 'x', 'نعم'];
function yes_(v) { return v === true || YES.indexOf(String(v).trim().toLowerCase()) !== -1; }
function money_(v) { var n = Number(String(v).replace(/[^\d.]/g, '')); return v !== '' && isFinite(n) && n > 0 ? Math.round(n) : null; }

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
    price: money_(get('buy_price_iqd')), rentPrice: money_(get('rent_price_iqd_month')),
    rent: yes_(get('rentable')), refill: yes_(get('monthly_refill')), b2b: yes_(get('clinic_only')),
    services: String(get('services')).split(/[,;|\/]/).map(function (s) { return s.trim().toLowerCase(); })
                .filter(function (s) { return SERVICES.indexOf(s) !== -1; }),
    status: status === 'hidden' ? 'hidden' : (status === 'out_of_stock' || status === 'out') ? 'out' : 'available',
    whyEn: String(get('why_en')), whyAr: String(get('why_ar')),
    img: String(get('photo_url')).trim()
  };
}

function toCells_(p) {
  return {
    id: p.id, name_en: p.en, name_ar: p.ar, department: p.dept, section: p.sub, tier: p.tier,
    buy_price_iqd: p.price || '', rent_price_iqd_month: p.rentPrice || '',
    rentable: p.rent ? 'yes' : 'no', monthly_refill: p.refill ? 'yes' : 'no', clinic_only: p.b2b ? 'yes' : 'no',
    services: p.services.join(', '),
    status: p.status === 'out' ? 'out_of_stock' : p.status,
    why_en: p.whyEn, why_ar: p.whyAr, photo_url: p.img
  };
}

// what the browser sends is checked and trimmed before it reaches the Sheet
function clean_(p) {
  var s = function (v, n) { return String(v == null ? '' : v).slice(0, n); };
  var id = Math.floor(Number(p && p.id));
  if (!(id > 0)) throw new Error('Every product needs a positive whole-number id.');
  var img = s(p.img, 500);
  if (img && !/^(https:\/\/|assets\/)/.test(img)) throw new Error('Product ' + id + ': photos must be https:// links — upload the photo through the portal.');
  return {
    id: id, en: s(p.en, 200), ar: s(p.ar, 200), dept: s(p.dept, 40), sub: s(p.sub, 40),
    tier: [1, 2, 3].indexOf(Number(p.tier)) !== -1 ? Number(p.tier) : 2,
    price: money_(p.price == null ? '' : p.price), rentPrice: money_(p.rentPrice == null ? '' : p.rentPrice),
    rent: p.rent === true, refill: p.refill === true, b2b: p.b2b === true,
    services: (p.services || []).filter(function (x) { return SERVICES.indexOf(x) !== -1; }),
    status: ['available', 'out', 'hidden'].indexOf(p.status) !== -1 ? p.status : 'available',
    whyEn: s(p.whyEn, 1000), whyAr: s(p.whyAr, 1000), img: img
  };
}

/** replace=false: update the rows these ids are on, add the rest. replace=true: the Sheet becomes exactly this list. */
function save_(list, replace) {
  var products = list.map(clean_);
  var sheet = getSheet_();
  var values = sheet.getDataRange().getValues();
  var head = values[0], m = headerMap_(head);
  COLUMNS.forEach(function (k) { if (!(k in m)) { m[k] = head.length; head.push(k); } });
  var width = head.length;
  var grid = [head].concat(replace ? [] : values.slice(1)).map(function (r) { while (r.length < width) r.push(''); return r; });
  var rowOf = {};
  for (var r = 1; r < grid.length; r++) { var id = Math.floor(Number(grid[r][m.id])); if (id > 0) rowOf[id] = r; }
  products.forEach(function (p) {
    var r = rowOf[p.id];
    if (r === undefined) { r = grid.length; grid.push(new Array(width).fill('')); rowOf[p.id] = r; }
    var cells = toCells_(p);
    COLUMNS.forEach(function (k) { grid[r][m[k]] = cells[k]; });
  });
  if (replace) sheet.clearContents();
  sheet.getRange(1, 1, grid.length, width).setValues(grid);
  sheet.getRange(1, 1, 1, width).setFontWeight('bold');
  return readProducts_();
}

function remove_(ids) {
  var drop = {}; ids.forEach(function (i) { drop[Math.floor(Number(i))] = true; });
  var sheet = getSheet_(), values = sheet.getDataRange().getValues(), m = headerMap_(values[0]);
  for (var r = values.length - 1; r >= 1; r--) {
    if (drop[Math.floor(Number(values[r][m.id]))]) sheet.deleteRow(r + 1);
  }
  return readProducts_();
}

/* ═══════════════ PHOTOS ═══════════════ */

function photo_(id, dataUrl) {
  var match = /^data:(image\/(?:webp|jpeg|png));base64,(.+)$/.exec(String(dataUrl || ''));
  if (!match) throw new Error('Photos must be uploaded as WebP, JPEG or PNG.');
  if (match[2].length > 4 * 1024 * 1024) throw new Error('That photo is too large (the portal shrinks them; is this an old browser?).');
  var product = readProducts_().filter(function (p) { return p.id === Math.floor(Number(id)); })[0];
  if (!product) throw new Error('No product with id ' + id + ' in the Sheet. Save the product first.');

  var ext = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }[match[1]];
  var blob = Utilities.newBlob(Utilities.base64Decode(match[2]), match[1], 'product-' + product.id + '.' + ext);
  var folder = getFolder_();
  var file = folder.createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    file.setTrashed(true);
    throw new Error('Google Drive won’t share files publicly from this account (a Workspace policy), so shoppers ' +
                    'couldn’t see the photo. Use a personal Google account for this script, or paste photo links instead.');
  }
  // the photo it replaces, if this script uploaded it
  var old = /lh3\.googleusercontent\.com\/d\/([\w-]+)/.exec(product.img || '');
  if (old) { try { var f = DriveApp.getFileById(old[1]); if (isIn_(f, folder)) f.setTrashed(true); } catch (ignored) {} }

  product.img = 'https://lh3.googleusercontent.com/d/' + file.getId();
  save_([product], false);
  return product;
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
 * Creates the Products headings, checks Drive access, and says what the shop will see.
 */
function testSetup() {
  var sheet = getSheet_();
  Logger.log('Sheet ready: "%s"', sheet.getName());
  var products = readProducts_();
  Logger.log('%s products in the Sheet (%s visible in the shop).', products.length,
             products.filter(function (p) { return p.status !== 'hidden'; }).length);
  if (!products.length) Logger.log('Empty — open the admin portal → Publish → "Copy the catalog into the Sheet".');
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

// changes whenever the list does — including hand edits in the Sheet
function version_(products) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(products), Utilities.Charset.UTF_8));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
