/**
 * Saleem — Ozempic funnel: lead intake + call-centre console
 * ──────────────────────────────────────────────────────────
 * One Apps Script project, bound to a Google Sheet, doing two jobs:
 *
 *   doPost  — the public landing page submits assessments here.
 *   doGet   — serves Admin.html, the call-centre console, to staff only.
 *
 * Because those two need different access levels, deploy the project TWICE.
 * Same code, same Sheet, two URLs:
 *
 *   1. "Intake"  — Deploy → New deployment → Web app
 *                  Execute as: Me   |   Who has access: Anyone
 *                  Put this /exec URL in CONFIG.endpoint in index.html.
 *
 *   2. "Console" — Deploy → New deployment → Web app
 *                  Execute as: Me   |   Who has access: Anyone with a Google Account
 *                  Give this /exec URL to the call centre. Add their addresses
 *                  to ALLOWED_EMAILS below.
 *
 * The console refuses anyone not on ALLOWED_EMAILS, so even the public Intake
 * URL will not hand out patient data.
 *
 * Redeploy note: after editing this file you must Deploy → Manage deployments
 * → edit → New version, or the live URLs keep running the old code.
 */

/* ═══════════════ SETTINGS ═══════════════ */

// Staff who may open the console. Lower-case. Leave empty and nobody gets in.
// Add the rest of the call centre here, one per line.
var ALLOWED_EMAILS = [
  'muhammed.lak@saleemapp.com',
];

// Fallback for accounts Apps Script can't identify (common outside Workspace):
// open the console as  <console-url>?key=YOUR-SECRET  . Empty = disabled.
// This is a shared secret in a URL, not real authentication — prefer ALLOWED_EMAILS.
var ACCESS_KEY = '';

// Email address for new-lead alerts. Empty = no alerts.
// Only fires for hot leads and for anyone who declared a contraindication,
// so it won't flood you. Set to '' to switch off.
var NOTIFY = 'muhammed.lak@saleemapp.com';

// Where the landing page lives. Used in alert emails, and to spot leads that
// arrived from somewhere unexpected. NOT a security control — the value comes
// from the browser, so anyone can send anything. It only surfaces surprises in
// the execution log.
var SITE_URL = 'https://saleem-novo.netlify.app/';

var SHEET_NAME = 'Leads';

var COLUMNS = [
  'id', 'ts', 'lang', 'name', 'phone', 'whatsapp', 'area',
  'age', 'sex', 'height_cm', 'weight_kg', 'bmi',
  'condition', 'safety', 'band', 'hot',
  'program', 'price_iqd', 'url',
  'status', 'notes', 'updated_at', 'updated_by'
];

// Columns the console is allowed to write. Everything else is what the patient
// submitted and must not be editable from a browser.
var EDITABLE = ['status', 'notes'];

var STATUSES = ['new', 'called', 'no_answer', 'booked', 'not_eligible', 'declined'];

/* ═══════════════ INTAKE (public) ═══════════════ */

function doPost(e) {
  // Pressing Run in the editor calls this with no request, so there's no form
  // data to read. That's not a fault — doPost only ever runs when the landing
  // page submits. Use testSetup() below to check the script by hand.
  if (!e || !e.postData) {
    return json_({ ok: false, error: 'doPost runs when the landing page submits a form. ' +
                                     'To test from the editor, run testSetup instead.' });
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);

    var lead = JSON.parse(e.postData.contents);
    var sheet = getSheet_();

    lead.id = Utilities.getUuid().slice(0, 8);
    lead.status = 'new';
    lead.notes = '';

    if (SITE_URL && lead.url && lead.url.indexOf(SITE_URL.replace(/\/$/, '')) !== 0) {
      console.warn('lead arrived from an unexpected page: ' + lead.url);
    }

    sheet.appendRow(COLUMNS.map(function (key) { return flatten_(lead[key]); }));
    notify_(lead);

    return json_({ ok: true, id: lead.id });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

/* ═══════════════ CONSOLE (staff only) ═══════════════ */

function doGet(e) {
  if (!isStaff_(e)) {
    return HtmlService.createHtmlOutput(
      '<div style="font:16px/1.6 system-ui;padding:40px;max-width:34em;margin:auto;color:#0F2438">' +
      '<h2 style="font-size:20px">Not authorised</h2>' +
      '<p>This console is limited to Saleem staff. You are signed in as <b>' +
      (currentEmail_() || 'nobody') + '</b>.</p>' +
      '<p style="color:#5E7488;font-size:14px">If that is the wrong account, sign out of other ' +
      'Google accounts and open the link again. Otherwise ask an admin to add you.</p></div>'
    ).setTitle('Saleem — not authorised');
  }
  var page;
  try {
    page = HtmlService.createTemplateFromFile('Admin');
  } catch (err) {
    // Raw message is "No HTML file named Admin was found", which doesn't say
    // what to do about it. The usual cause is typing "Admin.html" when adding
    // the file — Apps Script appends the extension, giving Admin.html.html.
    return HtmlService.createHtmlOutput(
      '<div style="font:16px/1.7 system-ui;padding:40px;max-width:36em;margin:auto;color:#0F2438">' +
      '<h2 style="font-size:20px;margin-bottom:12px">The console page is missing</h2>' +
      '<p>This script has no HTML file called <b>Admin</b>. In the Apps Script editor:</p>' +
      '<ol><li>In the file list on the left, click <b>+</b> → <b>HTML</b></li>' +
      '<li>Name it <b>Admin</b> — no <code>.html</code>, the editor adds that itself. ' +
      'The file list should end up showing <code>Admin.html</code>, not <code>Admin.html.html</code>.</li>' +
      '<li>Delete the placeholder content, paste in Admin.html, and Save</li>' +
      '<li><b>Deploy → Manage deployments → pencil → Version: New version → Deploy</b><br>' +
      '<span style="color:#5E7488;font-size:14px">Saving alone does not update a live deployment.</span></li>' +
      '</ol></div>'
    ).setTitle('سليم — setup incomplete');
  }
  page.accessKey = (!isAllowlisted_() && e && e.parameter) ? (e.parameter.key || '') : '';
  return page.evaluate()
    .setTitle('سليم — لوحة المتابعة')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function currentEmail_() {
  try { return (Session.getActiveUser().getEmail() || '').toLowerCase(); }
  catch (err) { return ''; }
}

function isAllowlisted_() {
  var email = currentEmail_();
  if (!email) return false;
  return ALLOWED_EMAILS.some(function (a) { return String(a).toLowerCase() === email; });
}

function isStaff_(e) {
  if (isAllowlisted_()) return true;
  return !!(ACCESS_KEY && e && e.parameter && e.parameter.key === ACCESS_KEY);
}

/** Called from Admin.html via google.script.run. Runs server-side, so the
 *  allowlist is enforced here too — not just at page load. */
function apiGetLeads(key) {
  assertStaff_(key);
  var rows = getSheet_().getDataRange().getValues();
  if (rows.length < 2) return { leads: [], statuses: STATUSES };

  var head = rows[0];
  var leads = rows.slice(1).map(function (row) {
    var o = {};
    head.forEach(function (key, i) { o[key] = row[i]; });
    o.ts = o.ts instanceof Date ? o.ts.toISOString() : String(o.ts || '');
    o.safety = String(o.safety || '').split(',').map(function (x) { return x.trim(); })
                 .filter(function (x) { return x; });
    o.hot = String(o.hot) === 'yes' || o.hot === true;
    o.whatsapp = String(o.whatsapp) === 'yes' || o.whatsapp === true;
    o.status = o.status || 'new';
    return o;
  });
  leads.reverse();                                   // newest first
  return { leads: leads, statuses: STATUSES, me: currentEmail_() };
}

function apiUpdateLead(id, patch, key) {
  assertStaff_(key);
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var sheet = getSheet_();
    var rows = sheet.getDataRange().getValues();
    var head = rows[0];
    var idCol = head.indexOf('id');
    if (idCol === -1) throw new Error('no id column');

    for (var r = 1; r < rows.length; r++) {
      if (String(rows[r][idCol]) !== String(id)) continue;

      EDITABLE.forEach(function (key) {
        if (!(key in patch)) return;
        var c = head.indexOf(key);
        if (c === -1) return;
        var v = patch[key];
        if (key === 'status' && STATUSES.indexOf(v) === -1) return;   // ignore junk
        sheet.getRange(r + 1, c + 1).setValue(v);
      });
      setIfPresent_(sheet, head, r, 'updated_at', new Date().toISOString());
      setIfPresent_(sheet, head, r, 'updated_by', currentEmail_());
      return { ok: true };
    }
    throw new Error('lead not found: ' + id);
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

/** google.script.run carries no request object, so a console running in key mode
 *  passes the key back with every call — otherwise anyone able to reach the
 *  script could read patient data without it. */
function assertStaff_(key) {
  if (isAllowlisted_()) return;
  if (ACCESS_KEY && key === ACCESS_KEY) return;
  throw new Error('Not authorised.');
}

function setIfPresent_(sheet, head, r, key, value) {
  var c = head.indexOf(key);
  if (c !== -1) sheet.getRange(r + 1, c + 1).setValue(value);
}

/* ═══════════════ CHECK YOUR SETUP ═══════════════ */

/**
 * Safe to run from the editor. Pick "testSetup" in the function dropdown and
 * press Run. It creates the sheet headers, writes a dummy lead so you can see
 * a row appear, and prints who the console will let in.
 *
 * Delete the test row from the Sheet afterwards — it's marked TEST.
 */
function testSetup() {
  var sheet = getSheet_();
  Logger.log('Sheet ready: "%s" (%s columns)', sheet.getName(), COLUMNS.length);

  var lead = {
    id: 'TEST-' + Utilities.getUuid().slice(0, 4),
    ts: new Date().toISOString(), lang: 'ar',
    name: 'TEST — احذف هذا الصف', phone: '07700000000', whatsapp: true,
    area: 'baghdad_karkh', age: 40, sex: 'male',
    height_cm: 175, weight_kg: 95, bmi: 31.0,
    condition: 'yes', safety: [], band: 'Likely', hot: true,
    program: 'ozempic', price_iqd: '', url: SITE_URL,
    status: 'new', notes: ''
  };
  sheet.appendRow(COLUMNS.map(function (key) { return flatten_(lead[key]); }));
  Logger.log('Test row written — check the Sheet, then delete that row.');

  Logger.log('Console access: %s', ALLOWED_EMAILS.join(', ') || '(nobody — ALLOWED_EMAILS is empty)');
  Logger.log('You are: %s', currentEmail_() || '(Apps Script cannot see your address — use ACCESS_KEY)');
  Logger.log('Alerts to: %s', NOTIFY || '(off)');
  Logger.log('Site: %s', SITE_URL);
  Logger.log('All good. Now deploy: Deploy > New deployment > Web app.');
}

/* ═══════════════ SHARED ═══════════════ */

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

function flatten_(v) {
  if (Array.isArray(v)) return v.join(', ');
  if (v === true) return 'yes';
  if (v === false) return 'no';
  return (v === null || v === undefined) ? '' : v;
}

function notify_(lead) {
  if (!NOTIFY) return;
  var flagged = lead.safety && lead.safety.length;
  if (!flagged && !lead.hot) return;

  var subject = flagged
    ? '⚠️ Ozempic lead needs clinical review — ' + lead.name
    : '🔥 Hot Ozempic lead — ' + lead.name;

  MailApp.sendEmail(NOTIFY, subject,
    'Name:      ' + lead.name + '\n' +
    'Phone:     ' + lead.phone + (lead.whatsapp ? '  (prefers WhatsApp)' : '') + '\n' +
    'Area:      ' + lead.area + '\n' +
    'Age/Sex:   ' + lead.age + ' / ' + lead.sex + '\n' +
    'BMI:       ' + lead.bmi + '  (' + lead.height_cm + ' cm, ' + lead.weight_kg + ' kg)\n' +
    'Band:      ' + lead.band + '\n' +
    'Condition: ' + lead.condition + '\n' +
    'Safety:    ' + (flagged ? lead.safety.join(', ') : 'none declared') + '\n\n' +
    (flagged ? 'This lead declared a contraindication. Route to a clinician, not a sales close.\n\n' : '') +
    'From: ' + SITE_URL + '\n' +
    'Open the console to call them back.\n');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
