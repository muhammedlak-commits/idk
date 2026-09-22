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
 *   action "resend"   — they lost the download; serves the same PDF again
 *                       rather than making a second contract.
 *
 *   action "signed"   — the doctor signs. Drawing on the page or sending a
 *                       photo of a signature rebuilds the contract with that
 *                       image stamped into every {{sig}}; signing the PDF by
 *                       hand and sending it back files their file as-is.
 *                       Either way the row is updated and the team emailed.
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

// Who gets told when a doctor registers or signs. One address per line.
// Leave a line empty and it is skipped; leave both empty and no mail is sent
// at all (testSetup says so out loud rather than failing quietly).
var NOTIFY = [
  '',    // ← first inbox
  ''     // ← second inbox
];

// Where the landing page lives. Only used in alert emails and to flag
// submissions arriving from an unexpected page in the execution log.
var SITE_URL = '';

var SHEET_NAME = 'Doctors';

var COLUMNS = [
  'id', 'req_key', 'ts', 'name', 'phone', 'specialty', 'workplace', 'city',
  'contract_file', 'contract_id', 'signed_file', 'signed_id',
  'signed_at', 'sign_method', 'status', 'notes', 'url'
];

// Biggest signature image we accept, in megabytes. A drawn signature is a few
// KB; the allowance is for a photographed one straight off a phone camera.
var MAX_SIG_MB = 8;

// Biggest signed contract we accept. A scan or four phone photos of the pages
// run bigger than a signature, so this is roomier.
var MAX_DOC_MB = 15;

// Printed size of the signature in the contract, in points (3:1, matching
// the signature pad on the page).
var SIG_W = 165, SIG_H = 55;

var ALLOWED_SIG_TYPES = ['image/png', 'image/jpeg', 'image/heic', 'image/webp'];
var ALLOWED_DOC_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/heic', 'image/webp'];

/* ═══════════════ INTAKE (public) ═══════════════ */

function doPost(e) {
  // Pressing Run in the editor calls this with no request, so there's nothing
  // to read. That's not a fault — doPost only runs when the page submits.
  // Use testSetup() below to check the script by hand.
  if (!e || !e.postData) {
    return json_({ ok: false, error: 'doPost runs when the landing page submits. ' +
                                     'To test from the editor, run testSetup instead.' });
  }

  try {
    var req = JSON.parse(e.postData.contents);

    if (SITE_URL && req.url && req.url.indexOf(SITE_URL.replace(/\/$/, '')) !== 0) {
      console.warn('submission arrived from an unexpected page: ' + req.url);
    }

    // No lock out here. Building a contract takes the best part of ten
    // seconds, and holding a script-wide lock across it means an SMS burst
    // queues every doctor behind the one in front until the web app gives up.
    // Each action takes a short lock only where it actually needs one.
    if (req.action === 'register') return json_(register_(req));
    if (req.action === 'resend')   return json_(resend_(req));
    if (req.action === 'status')   return json_(status_(req));
    if (req.action === 'signed')   return json_(signed_(req));
    return json_({ ok: false, error: 'unknown action: ' + req.action });

  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/**
 * Doctor submitted their details → build their contract and hand it back.
 *
 * The row is claimed under a short lock; the contract — a Doc copy, a PDF
 * export and a Drive write, the best part of ten seconds — is built after the
 * lock is released, so concurrent registrations do not queue behind each other.
 * A retry finds the claimed row by its request key and either replays the
 * finished contract or resumes building one, never appending a second row.
 */
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

  var reqKey = String(req.reqKey || '').trim();
  var sheet, head, row, fresh = false;

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    sheet = getSheet_();
    head  = headers_(sheet);
    row   = reqKey ? rowByReqKey_(sheet, head, reqKey) : -1;

    if (row === -1) {
      appendByHeader_(sheet, {
        id: Utilities.getUuid().slice(0, 8),
        req_key: reqKey,
        ts: new Date().toISOString(),
        name: name,
        phone: String(req.phone).trim(),
        specialty: String(req.specialty || '').trim(),
        workplace: String(req.workplace || '').trim(),
        city: String(req.city || '').trim(),
        contract_file: '', contract_id: '',
        signed_file: '', signed_id: '', sign_method: '', signed_at: '',
        status: 'registered', notes: '',
        url: String(req.url || '')
      });
      row = sheet.getLastRow();
      fresh = true;
    }
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }

  var get = function (k) {
    var c = head.indexOf(k);
    return c === -1 ? '' : String(sheet.getRange(row, c + 1).getValue() || '');
  };
  var id = get('id');

  // Already built on an earlier attempt whose reply never arrived.
  var priorFile = get('contract_id');
  if (priorFile) {
    var f = DriveApp.getFileById(priorFile);
    console.info('replayed register for req_key ' + reqKey);
    return { ok: true, id: id, replayed: true, fileName: f.getName(),
             pdfBase64: Utilities.base64Encode(f.getBlob().getBytes()) };
  }

  var built = buildContract_({ id: id, name: get('name') },
                             new Date(get('ts') || Date.now()));
  setCell_(sheet, head, row, 'contract_file', built.file.getName());
  setCell_(sheet, head, row, 'contract_id',   built.file.getId());

  if (fresh) {
    notifyRegistered_({ name: get('name'), phone: get('phone'),
                        specialty: get('specialty'), workplace: get('workplace'),
                        city: get('city'), id: id });
  }

  return { ok: true, id: id, fileName: built.file.getName(),
           pdfBase64: Utilities.base64Encode(built.bytes) };
}

/** Row index for a request key, or -1. */
function rowByReqKey_(sheet, head, reqKey) {
  var col = head.indexOf('req_key');
  if (col === -1 || sheet.getLastRow() < 2) return -1;
  var keys = sheet.getRange(2, col + 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0]) === reqKey) return i + 2;
  }
  return -1;
}

/** An earlier register with this key, replayed. */
function byReqKey_(reqKey) {
  var sheet = getSheet_(), head = headers_(sheet);
  var row = rowByReqKey_(sheet, head, reqKey);
  if (row === -1) return null;

  var get = function (k) {
    var c = head.indexOf(k);
    return c === -1 ? '' : String(sheet.getRange(row, c + 1).getValue() || '');
  };
  var fileId = get('contract_id');
  if (!fileId) return null;                       // claimed but not built yet
  var file = DriveApp.getFileById(fileId);
  return {
    ok: true, id: get('id'), replayed: true,
    fileName: file.getName(),
    pdfBase64: Utilities.base64Encode(file.getBlob().getBytes())
  };
}

/**
 * Did my request actually land? Asked by the page when a response never
 * arrived, so a dropped connection is not mistaken for a failed write.
 * Reads only — safe to call as often as needed.
 */
function status_(req) {
  var sheet = getSheet_(), head = headers_(sheet);
  var id = String(req.id || '').trim();
  var reqKey = String(req.reqKey || '').trim();

  if (!id && reqKey) {
    var prior = byReqKey_(reqKey);
    if (!prior) return { ok: true, exists: false };
    return { ok: true, exists: true, signed: false, id: prior.id,
             fileName: prior.fileName, pdfBase64: prior.pdfBase64 };
  }

  var row = id ? findRow_(sheet, head, id) : -1;
  if (row === -1) return { ok: true, exists: false };
  var c = head.indexOf('signed_at');
  var signedAt = c === -1 ? '' : String(sheet.getRange(row, c + 1).getValue() || '');
  return { ok: true, exists: true, signed: !!signedAt, id: id };
}

/** Doctor came back and needs their contract again. Serves the PDF that was
 *  already generated, so no second row and no second contract. */
function resend_(req) {
  var id = String(req.id || '').trim();
  if (!id) return { ok: false, error: 'معرّف الطلب مفقود' };

  var sheet = getSheet_(), head = headers_(sheet);
  var row = findRow_(sheet, head, id);
  if (row === -1) return { ok: false, code: 'not_found', error: 'لم نلگه الطلب.' };

  var fileId = String(sheet.getRange(row, head.indexOf('contract_id') + 1).getValue() || '');
  if (!fileId) return { ok: false, error: 'العقد غير متوفر. راجع فريق سليم.' };

  var file = DriveApp.getFileById(fileId);
  return {
    ok: true, id: id,
    fileName: file.getName(),
    pdfBase64: Utilities.base64Encode(file.getBlob().getBytes())
  };
}

/* ═══════════════ SIGNATURE ═══════════════ */

/**
 * Doctor signed. Three routes arrive here and all end in one signed PDF on the
 * row:
 *
 *   mode "draw"  — signature drawn on the page
 *   mode "photo" — photograph of a signature
 *       both send an image, and the contract is rebuilt from the template with
 *       that image stamped into every {{sig}}. The doctor never re-uploads the
 *       contract, because the script already has everything needed to make it.
 *
 *   mode "pdf"   — doctor signed the downloaded contract by hand and sends it
 *       back. Nothing is stamped; their file is filed as the signed copy.
 *
 * The contract is regenerated rather than edited: the copy made at
 * registration was exported to PDF and trashed, so there is no editable
 * contract in Drive for anyone to alter afterwards. Name and date come from
 * the row, so the signed copy carries exactly what the doctor was shown.
 */
function signed_(req) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); return signedLocked_(req); }
  finally { try { lock.releaseLock(); } catch (ignored) {} }
}

function signedLocked_(req) {
  var id = String(req.id || '').trim();
  if (!id)         return { ok: false, error: 'معرّف الطلب مفقود' };
  if (!req.agreed) return { ok: false, error: 'لازم تأكد قراءتك للعقد قبل التوقيع' };

  var mode = String(req.mode || 'draw');
  if (['draw', 'photo', 'pdf'].indexOf(mode) === -1) {
    return { ok: false, error: 'طريقة توقيع غير معروفة.' };
  }

  var sheet = getSheet_(), head = headers_(sheet);
  var row = findRow_(sheet, head, id);
  if (row === -1) return { ok: false, code: 'not_found',
                           error: 'لم نلگه الطلب. حدّث الصفحة وحاول مرة ثانية.' };

  var cell = function (key) {
    var c = head.indexOf(key);
    return c === -1 ? '' : String(sheet.getRange(row, c + 1).getValue() || '');
  };
  if (cell('signed_at')) return { ok: false, code: 'already_signed',
                                  error: 'هذا العقد موقّع مسبقاً.' };

  var out = (mode === 'pdf') ? fileSignedUpload_(req, cell)
                             : stampSignedCopy_(req, cell, id);
  if (!out.ok) return out;

  setCell_(sheet, head, row, 'signed_file', out.file.getName());
  setCell_(sheet, head, row, 'signed_id',   out.file.getId());
  setCell_(sheet, head, row, 'signed_at',   new Date().toISOString());
  setCell_(sheet, head, row, 'sign_method', mode);
  setCell_(sheet, head, row, 'status',      'signed');
  notifySigned_(cell('name'), id, out.file, mode);

  // Only the stamped routes can hand back a contract; on the pdf route the
  // doctor already has the file they just sent.
  var res = { ok: true, id: id, mode: mode };
  if (out.bytes) {
    res.fileName  = out.file.getName();
    res.pdfBase64 = Utilities.base64Encode(out.bytes);
  }
  return res;
}

/** "draw" / "photo" — rebuild the contract with the signature stamped in. */
function stampSignedCopy_(req, cell, id) {
  if (!req.sigB64) return { ok: false, error: 'التوقيع مفقود' };

  var type = String(req.mimeType || 'image/png');
  if (ALLOWED_SIG_TYPES.indexOf(type) === -1) {
    return { ok: false, error: 'صيغة التوقيع غير مدعومة.' };
  }
  var bytes = Utilities.base64Decode(req.sigB64);
  if (bytes.length > MAX_SIG_MB * 1024 * 1024) {
    return { ok: false, error: 'حجم الصورة كبير. الحد الأقصى ' + MAX_SIG_MB + ' ميغابايت.' };
  }

  var built = buildContract_({ id: id, name: cell('name') },
                             new Date(cell('ts') || Date.now()),
                             Utilities.newBlob(bytes, type, 'signature'));
  return { ok: true, file: built.file, bytes: built.bytes };
}

/** "pdf" — the doctor signed the contract by hand and sent it back. */
function fileSignedUpload_(req, cell) {
  if (!req.fileB64) return { ok: false, error: 'الملف مفقود' };

  var type = String(req.mimeType || 'application/pdf');
  if (ALLOWED_DOC_TYPES.indexOf(type) === -1) {
    return { ok: false, error: 'نوع الملف غير مدعوم. أرسل PDF أو صورة واضحة.' };
  }
  var bytes = Utilities.base64Decode(req.fileB64);
  if (bytes.length > MAX_DOC_MB * 1024 * 1024) {
    return { ok: false, error: 'حجم الملف كبير. الحد الأقصى ' + MAX_DOC_MB + ' ميغابايت.' };
  }

  var ext  = type === 'application/pdf' ? 'pdf' : type.split('/')[1];
  var name = 'عقد سليم موقّع - ' + (cell('name') || 'طبيب') + ' - ' + cell('id') + '.' + ext;
  var file = folder_().createFile(Utilities.newBlob(bytes, type, name));
  return { ok: true, file: file, bytes: null };
}

/* ═══════════════ CONTRACT BUILDING ═══════════════ */

/**
 * Copy the contract Doc, substitute the doctor's details, export as PDF.
 * The intermediate Doc is trashed — only the PDF is kept, so nobody can
 * later edit a contract that has already gone out.
 */
function buildContract_(doctor, when, sigBlob) {
  var folder = folder_();
  var copy = DriveApp.getFileById(TEMPLATE_DOC_ID)
                     .makeCopy('__building ' + doctor.id, folder);
  try {
    var doc = DocumentApp.openById(copy.getId());
    var body = doc.getBody();
    body.replaceText('\\{\\{name\\}\\}', doctor.name);
    body.replaceText('\\{\\{day\\}\\}',  arabicDay_(when));
    body.replaceText('\\{\\{date\\}\\}', Utilities.formatDate(when, tz_(), 'yyyy/MM/dd'));

    // Unsigned copy: leave the signature slots blank rather than printing the
    // placeholder, so the doctor reads a clean contract.
    if (sigBlob) { stampSignature_(body, sigBlob); }
    else         { body.replaceText('\\{\\{sig\\}\\}', ''); }

    doc.saveAndClose();

    // Re-fetch rather than reuse the handle from makeCopy: exporting through
    // a stale File reference has been known to miss the edits just made,
    // which would ship a contract with {{name}} still in it.
    var pdf = DriveApp.getFileById(copy.getId()).getAs('application/pdf');
    pdf.setName('عقد سليم' + (sigBlob ? ' موقّع' : '') +
                ' - ' + doctor.name + ' - ' + doctor.id + '.pdf');
    var stored = folder.createFile(pdf);
    return { file: stored, bytes: pdf.getBytes() };
  } finally {
    try { DriveApp.getFileById(copy.getId()).setTrashed(true); } catch (ignored) {}
  }
}

/** Replace every {{sig}} in the document with the signature image.
 *  Each pass deletes the placeholder it just handled, so the loop drains. */
function stampSignature_(body, blob) {
  var placed = 0, found;
  while ((found = body.findText('\\{\\{sig\\}\\}')) !== null && placed < 20) {
    var text  = found.getElement().asText();
    text.deleteText(found.getStartOffset(), found.getEndOffsetInclusive());
    var parent = text.getParent();
    if (parent.getType() === DocumentApp.ElementType.PARAGRAPH) {
      var img = parent.asParagraph().appendInlineImage(blob);
      img.setWidth(SIG_W).setHeight(SIG_H);
    }
    placed++;
  }
  if (!placed) console.warn('no {{sig}} placeholder in the template — nothing stamped');
  return placed;
}

var ARABIC_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function arabicDay_(d) {
  return ARABIC_DAYS[Number(Utilities.formatDate(d, tz_(), 'u')) % 7];
}

function tz_() {
  return Session.getScriptTimeZone() || 'Asia/Baghdad';
}

/* ═══════════════ NOTIFICATIONS ═══════════════ */

/** Everyone on NOTIFY who is actually filled in. */
function recipients_() {
  return (NOTIFY || []).map(function (a) { return String(a || '').trim(); })
                       .filter(function (a) { return a.length > 0; });
}

function mail_(subject, body) {
  var to = recipients_();
  if (!to.length) return;
  // One call, not one per inbox — each round trip is a second the doctor waits.
  try { MailApp.sendEmail(to.join(','), subject, body); }
  catch (err) { console.error('could not mail ' + to.join(',') + ': ' + err); }
}

function notifyRegistered_(d) {
  mail_('🩺 طبيب جديد سجّل — ' + d.name,
    'الاسم:       ' + d.name + '\n' +
    'الهاتف:      ' + d.phone + '\n' +
    'الاختصاص:    ' + (d.specialty || '—') + '\n' +
    'مكان العمل:  ' + (d.workplace || '—') + '\n' +
    'المدينة:     ' + (d.city || '—') + '\n' +
    'المعرّف:     ' + d.id + '\n\n' +
    'انبعث له العقد. بانتظار التوقيع.\n');
}

var SIGN_METHOD_AR = {
  draw : 'وقّع بإصبعه داخل الصفحة',
  photo: 'رفع صورة توقيعه',
  pdf  : 'وقّع العقد بخط اليد ورفعه'
};

function notifySigned_(name, id, file, mode) {
  mail_('✅ عقد موقّع — ' + name,
    'الطبيب: ' + name + '\n' +
    'المعرّف: ' + id + '\n' +
    'الطريقة: ' + (SIGN_METHOD_AR[mode] || mode) + '\n' +
    'العقد الموقّع: ' + file.getUrl() + '\n');
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
      ['{{name}}', '{{day}}', '{{date}}', '{{sig}}'].forEach(function (p) {
        Logger.log('   %s %s', text.indexOf(p) !== -1 ? '✓ found' : '✗ MISSING', p);
      });
    } catch (err) {
      Logger.log('✗ Cannot open TEMPLATE_DOC_ID: %s', err);
    }
  }

  Logger.log('Contracts filed in: %s', folder_().getName());
  var to = recipients_();
  Logger.log(to.length ? 'Alerts to: ' + to.join(', ')
                       : '✗ NOTIFY is empty — nobody will be told about new doctors.');
  Logger.log('Max signature image: %s MB | max signed contract: %s MB',
             MAX_SIG_MB, MAX_DOC_MB);
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
    return sheet;
  }

  // A sheet written by an older version is short a column or two. Appending
  // what is missing beats asking anyone to delete the tab and lose the rows —
  // and rows are written by header name below, so column order never matters.
  var head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var missing = COLUMNS.filter(function (c) { return head.indexOf(c) === -1; });
  if (missing.length) {
    sheet.getRange(1, head.length + 1, 1, missing.length)
         .setValues([missing]).setFontWeight('bold');
    console.info('added columns: ' + missing.join(', '));
  }
  return sheet;
}

/** Write a record under whatever headers the sheet actually has. */
function appendByHeader_(sheet, record) {
  var head = headers_(sheet);
  sheet.appendRow(head.map(function (k) { return flatten_(record[k]); }));
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
