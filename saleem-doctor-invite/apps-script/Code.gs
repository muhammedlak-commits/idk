/**
 * Saleem — Doctor invite: contract intake
 * ───────────────────────────────────────
 * One Apps Script project, bound to a Google Sheet, handling the whole
 * contract round trip for the doctor-recruitment landing page:
 *
 *   action "register" — the doctor submits their details. The script copies
 *                       the contract Google Doc, fills in their name and the
 *                       date, exports it as PDF and hands it straight back in
 *                       the response. Nothing is shared publicly: the PDF
 *                       travels inside the JSON, so there is no Drive link
 *                       anyone could guess.
 *
 *   action "signed"   — the doctor uploads the signed copy. It lands in the
 *                       Drive folder next to their generated contract, the
 *                       Sheet row is updated, and the team gets an email.
 *
 * Deploy ONCE, as the public intake:
 *   Deploy → New deployment → Web app
 *   Execute as: Me   |   Who has access: Anyone
 *   Put the /exec URL in CONFIG.endpoint in index.html.
 *
 * Redeploy note: after editing this file you must Deploy → Manage deployments
 * → edit → New version, or the live URL keeps running the old code.
 */

/* ═══════════════ SETTINGS ═══════════════ */

// The contract, as a Google Doc (not a PDF). Copy the doc id out of its URL:
// docs.google.com/document/d/<THIS BIT>/edit
// The doc must contain the placeholders {{name}}, {{day}} and {{date}} —
// see SETUP.md. Leave empty and registration is refused with a clear error
// rather than sending doctors an unfilled contract.
var TEMPLATE_DOC_ID = '';

// Drive folder that generated and signed contracts are filed into.
// Empty = the script's own root Drive folder.
var OUTPUT_FOLDER_ID = '';

// Who gets told when a doctor registers or returns a signed contract.
// Empty = no email.
var NOTIFY = 'muhammed.lak@saleemapp.com';

// Where the landing page lives. Only used in alert emails and to flag
// submissions arriving from an unexpected page in the execution log.
var SITE_URL = '';

var SHEET_NAME = 'Doctors';

var COLUMNS = [
  'id', 'ts', 'name', 'phone', 'specialty', 'workplace', 'city',
  'contract_file', 'contract_id', 'signed_file', 'signed_at', 'status', 'notes', 'url'
];

// Biggest signed upload we accept, in megabytes. A phone photo of four pages
// is comfortably under this; the limit stops a stray video killing the script.
var MAX_UPLOAD_MB = 10;

var ALLOWED_UPLOAD_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic'];

/* ═══════════════ INTAKE (public) ═══════════════ */

function doPost(e) {
  // Pressing Run in the editor calls this with no request, so there's nothing
  // to read. That's not a fault — doPost only runs when the page submits.
  // Use testSetup() below to check the script by hand.
  if (!e || !e.postData) {
    return json_({ ok: false, error: 'doPost runs when the landing page submits. ' +
                                     'To test from the editor, run testSetup instead.' });
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var req = JSON.parse(e.postData.contents);

    if (SITE_URL && req.url && req.url.indexOf(SITE_URL.replace(/\/$/, '')) !== 0) {
      console.warn('submission arrived from an unexpected page: ' + req.url);
    }

    if (req.action === 'register') return json_(register_(req));
    if (req.action === 'resend')   return json_(resend_(req));
    if (req.action === 'signed')   return json_(signed_(req));
    return json_({ ok: false, error: 'unknown action: ' + req.action });

  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

/** Doctor submitted their details → build their contract and hand it back. */
function register_(req) {
  var name = String(req.name || '').trim();
  if (!name)      return { ok: false, error: 'الاسم مطلوب' };
  if (!req.phone) return { ok: false, error: 'رقم الهاتف مطلوب' };

  // The contract is an Arabic legal document. The page checks this too, but a
  // Latin name reaching the template puts the wrong script into الطرف الثاني,
  // so it is refused here as well rather than trusted from the browser.
  if (!/[\u0600-\u06FF]/.test(name) || /[A-Za-z]/.test(name)) {
    return { ok: false, error: 'اكتب الاسم بالحروف العربية.' };
  }
  if (name.length > 60) {
    return { ok: false, error: 'الاسم طويل جداً.' };
  }
  if (!TEMPLATE_DOC_ID) {
    return { ok: false, error: 'العقد غير مهيأ بعد. راجع فريق سليم.' };
  }

  var now = new Date();
  var doctor = {
    id: Utilities.getUuid().slice(0, 8),
    ts: now.toISOString(),
    name: name,
    phone: String(req.phone).trim(),
    specialty: String(req.specialty || '').trim(),
    workplace: String(req.workplace || '').trim(),
    city: String(req.city || '').trim(),
    contract_file: '',
    contract_id: '',
    signed_file: '',
    signed_at: '',
    status: 'registered',
    notes: '',
    url: String(req.url || '')
  };

  var built = buildContract_(doctor, now);
  doctor.contract_file = built.file.getName();
  doctor.contract_id   = built.file.getId();

  getSheet_().appendRow(COLUMNS.map(function (k) { return flatten_(doctor[k]); }));
  notifyRegistered_(doctor);

  return {
    ok: true,
    id: doctor.id,
    fileName: built.file.getName(),
    pdfBase64: Utilities.base64Encode(built.bytes)
  };
}

/** Doctor came back and needs their contract again. Serves the PDF that was
 *  already generated, so no second row and no second contract. */
function resend_(req) {
  var id = String(req.id || '').trim();
  if (!id) return { ok: false, error: 'معرّف الطلب مفقود' };

  var sheet = getSheet_(), head = headers_(sheet);
  var row = findRow_(sheet, head, id);
  if (row === -1) return { ok: false, error: 'لم نلگه الطلب.' };

  var fileId = String(sheet.getRange(row, head.indexOf('contract_id') + 1).getValue() || '');
  if (!fileId) return { ok: false, error: 'العقد غير متوفر. راجع فريق سليم.' };

  var file = DriveApp.getFileById(fileId);
  return {
    ok: true, id: id,
    fileName: file.getName(),
    pdfBase64: Utilities.base64Encode(file.getBlob().getBytes())
  };
}

/* ═══════════════ SIGNED UPLOAD ═══════════════ */

/** Doctor uploaded the signed contract → file it and tell the team. */
function signed_(req) {
  var id = String(req.id || '').trim();
  if (!id)          return { ok: false, error: 'معرّف الطلب مفقود' };
  if (!req.fileB64) return { ok: false, error: 'الملف مفقود' };

  var type = String(req.mimeType || 'application/pdf');
  if (ALLOWED_UPLOAD_TYPES.indexOf(type) === -1) {
    return { ok: false, error: 'نوع الملف غير مدعوم. أرسل PDF أو صورة.' };
  }

  var bytes = Utilities.base64Decode(req.fileB64);
  if (bytes.length > MAX_UPLOAD_MB * 1024 * 1024) {
    return { ok: false, error: 'حجم الملف كبير. الحد الأقصى ' + MAX_UPLOAD_MB + ' ميغابايت.' };
  }

  var sheet = getSheet_(), head = headers_(sheet);
  var row = findRow_(sheet, head, id);
  if (row === -1) return { ok: false, error: 'لم نلگه الطلب. حدّث الصفحة وحاول مرة ثانية.' };

  var name = String(sheet.getRange(row, head.indexOf('name') + 1).getValue() || 'doctor');
  var ext  = type === 'application/pdf' ? 'pdf' : type.split('/')[1];
  var blob = Utilities.newBlob(bytes, type, 'عقد موقّع - ' + name + ' - ' + id + '.' + ext);
  var file = folder_().createFile(blob);

  setCell_(sheet, head, row, 'signed_file', file.getName());
  setCell_(sheet, head, row, 'signed_at', new Date().toISOString());
  setCell_(sheet, head, row, 'status', 'signed');
  notifySigned_(name, id, file);

  return { ok: true, id: id };
}

/* ═══════════════ CONTRACT BUILDING ═══════════════ */

/**
 * Copy the contract Doc, substitute the doctor's details, export as PDF.
 * The intermediate Doc is trashed — only the PDF is kept, so nobody can
 * later edit a contract that has already gone out.
 */
function buildContract_(doctor, when) {
  var folder = folder_();
  var copy = DriveApp.getFileById(TEMPLATE_DOC_ID)
                     .makeCopy('__building ' + doctor.id, folder);
  try {
    var doc = DocumentApp.openById(copy.getId());
    var body = doc.getBody();
    body.replaceText('\\{\\{name\\}\\}', doctor.name);
    body.replaceText('\\{\\{day\\}\\}',  arabicDay_(when));
    body.replaceText('\\{\\{date\\}\\}', Utilities.formatDate(when, tz_(), 'yyyy/MM/dd'));
    doc.saveAndClose();

    var pdf = DriveApp.getFileById(copy.getId()).getAs('application/pdf');
    pdf.setName('عقد سليم - ' + doctor.name + ' - ' + doctor.id + '.pdf');
    var stored = folder.createFile(pdf);
    return { file: stored, bytes: pdf.getBytes() };
  } finally {
    try { DriveApp.getFileById(copy.getId()).setTrashed(true); } catch (ignored) {}
  }
}

var ARABIC_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function arabicDay_(d) {
  return ARABIC_DAYS[Number(Utilities.formatDate(d, tz_(), 'u')) % 7];
}

function tz_() {
  return Session.getScriptTimeZone() || 'Asia/Baghdad';
}

/* ═══════════════ NOTIFICATIONS ═══════════════ */

function notifyRegistered_(d) {
  if (!NOTIFY) return;
  MailApp.sendEmail(NOTIFY, '🩺 طبيب جديد سجّل — ' + d.name,
    'الاسم:       ' + d.name + '\n' +
    'الهاتف:      ' + d.phone + '\n' +
    'الاختصاص:    ' + (d.specialty || '—') + '\n' +
    'مكان العمل:  ' + (d.workplace || '—') + '\n' +
    'المدينة:     ' + (d.city || '—') + '\n' +
    'المعرّف:     ' + d.id + '\n\n' +
    'انبعث له العقد. بانتظار النسخة الموقّعة.\n');
}

function notifySigned_(name, id, file) {
  if (!NOTIFY) return;
  MailApp.sendEmail(NOTIFY, '✅ عقد موقّع وصل — ' + name,
    'الطبيب: ' + name + '\n' +
    'المعرّف: ' + id + '\n' +
    'الملف:  ' + file.getUrl() + '\n');
}

/* ═══════════════ CHECK YOUR SETUP ═══════════════ */

/**
 * Safe to run from the editor. Pick "testSetup" in the function dropdown and
 * press Run. It creates the sheet headers, checks the contract template, and
 * prints where everything is wired. It writes no rows and emails nobody.
 */
function testSetup() {
  var sheet = getSheet_();
  Logger.log('Sheet ready: "%s" (%s columns)', sheet.getName(), COLUMNS.length);

  if (!TEMPLATE_DOC_ID) {
    Logger.log('✗ TEMPLATE_DOC_ID is empty — registration will be refused. See SETUP.md.');
  } else {
    try {
      var doc = DocumentApp.openById(TEMPLATE_DOC_ID);
      var text = doc.getBody().getText();
      Logger.log('✓ Template: "%s"', doc.getName());
      ['{{name}}', '{{day}}', '{{date}}'].forEach(function (p) {
        Logger.log('   %s %s', text.indexOf(p) !== -1 ? '✓ found' : '✗ MISSING', p);
      });
    } catch (err) {
      Logger.log('✗ Cannot open TEMPLATE_DOC_ID: %s', err);
    }
  }

  Logger.log('Contracts filed in: %s', folder_().getName());
  Logger.log('Alerts to: %s', NOTIFY || '(off)');
  Logger.log('Max upload: %s MB', MAX_UPLOAD_MB);
  Logger.log('Now deploy: Deploy > New deployment > Web app (Anyone).');
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

function headers_(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

function findRow_(sheet, head, id) {
  var col = head.indexOf('id');
  if (col === -1 || sheet.getLastRow() < 2) return -1;
  var ids = sheet.getRange(2, col + 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) return i + 2;      // 1-based, past the header
  }
  return -1;
}

function setCell_(sheet, head, row, key, value) {
  var c = head.indexOf(key);
  if (c !== -1) sheet.getRange(row, c + 1).setValue(value);
}

function folder_() {
  if (!OUTPUT_FOLDER_ID) return DriveApp.getRootFolder();
  try { return DriveApp.getFolderById(OUTPUT_FOLDER_ID); }
  catch (err) {
    console.warn('OUTPUT_FOLDER_ID unusable, falling back to root: ' + err);
    return DriveApp.getRootFolder();
  }
}

function flatten_(v) {
  if (Array.isArray(v)) return v.join(', ');
  if (v === true) return 'yes';
  if (v === false) return 'no';
  return (v === null || v === undefined) ? '' : v;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
