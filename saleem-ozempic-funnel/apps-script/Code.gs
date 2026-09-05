/**
 * Saleem — Ozempic funnel lead receiver
 * ─────────────────────────────────────
 * Google Apps Script bound to a Google Sheet. Receives one lead per form
 * submission and appends it as a row.
 *
 * SETUP (5 minutes, no server, no cost)
 *  1. Create a Google Sheet. Extensions → Apps Script.
 *  2. Delete the placeholder code, paste this file, Save.
 *  3. Deploy → New deployment → type "Web app".
 *       Execute as:        Me
 *       Who has access:    Anyone            ← required; the page is public
 *  4. Copy the /exec URL it gives you into CONFIG.endpoint in index.html.
 *  5. Submit a test lead and confirm a row appears.
 *
 * Redeploy note: after editing this file you must Deploy → Manage deployments
 * → edit → New version, or the live URL keeps running the old code.
 *
 * The page posts text/plain on purpose — Apps Script does not answer the CORS
 * preflight that an application/json POST triggers. The body is still JSON.
 */

var SHEET_NAME = 'Leads';

var COLUMNS = [
  'ts', 'lang', 'name', 'phone', 'whatsapp', 'area',
  'age', 'sex', 'height_cm', 'weight_kg', 'bmi',
  'condition', 'safety', 'band', 'hot',
  'program', 'price_iqd', 'url'
];

function doPost(e) {
  var lock = LockService.getScriptLock();       // two submits at once must not collide
  try {
    lock.waitLock(20000);

    var lead = JSON.parse(e.postData.contents);
    var sheet = getSheet_();

    sheet.appendRow(COLUMNS.map(function (key) {
      var v = lead[key];
      if (Array.isArray(v)) return v.join(', ');   // safety[] -> "type1, pancreatitis"
      if (v === true)  return 'yes';
      if (v === false) return 'no';
      return (v === null || v === undefined) ? '' : v;
    }));

    // A lead with a safety flag, or a hot lead, is worth a nudge.
    notify_(lead);

    return json_({ ok: true });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

function doGet() {
  return json_({ ok: true, note: 'Saleem Ozempic lead endpoint. POST leads here.' });
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS);
    sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Email alerts. Set NOTIFY to an address to turn them on; leave it empty and
 * nothing is sent. Safety-flagged leads must not sit in a queue — those go to
 * a clinician, not a closer.
 */
var NOTIFY = '';

function notify_(lead) {
  if (!NOTIFY) return;
  var flagged = lead.safety && lead.safety.length;
  if (!flagged && !lead.hot) return;

  var subject = flagged
    ? '⚠️ Ozempic lead needs clinical review — ' + lead.name
    : '🔥 Hot Ozempic lead — ' + lead.name;

  var body =
    'Name:     ' + lead.name + '\n' +
    'Phone:    ' + lead.phone + (lead.whatsapp ? '  (prefers WhatsApp)' : '') + '\n' +
    'Area:     ' + lead.area + '\n' +
    'Age/Sex:  ' + lead.age + ' / ' + lead.sex + '\n' +
    'BMI:      ' + lead.bmi + '  (' + lead.height_cm + ' cm, ' + lead.weight_kg + ' kg)\n' +
    'Band:     ' + lead.band + '\n' +
    'Condition:' + lead.condition + '\n' +
    'Safety:   ' + (flagged ? lead.safety.join(', ') : 'none declared') + '\n\n' +
    (flagged
      ? 'This lead declared a contraindication. Route to a clinician, not a sales close.\n'
      : '');

  MailApp.sendEmail(NOTIFY, subject, body);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
