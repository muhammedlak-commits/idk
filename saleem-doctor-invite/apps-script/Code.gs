/**
 * Saleem — Doctor invite: contract intake
 * ───────────────────────────────────────
 * One Apps Script project, bound to a Google Sheet, handling the whole
 * contract round trip for the doctor-recruitment landing page:
 *
 *   action "register" — the doctor submits their details. The row is saved
 *                       and the team emailed; nothing else. The page shows the
 *                       contract text itself, so no document is built here and
 *                       the doctor is not kept waiting.
 *
 *   action "contract" — the doctor's own copy: the contract with their name
 *                       and the date filled in and the signature left blank.
 *                       Built the first time it is asked for, then served from
 *                       Drive. The PDF travels inside the JSON, so there is no
 *                       Drive link anyone could guess. ("resend" is the old
 *                       name, kept for pages still open on the previous build.)
 *
 *   action "signed"   — the doctor signs. The signature (a drawing, a photo,
 *                       or the whole contract signed by hand) is filed in
 *                       Drive and the row marked signed, and the page moves on.
 *                       The signed copy stays with the team: it is never sent
 *                       back to the page.
 *
 *   finishPending     — runs by itself every minute (installed by testSetup).
 *                       Stamps each new drawn or photographed signature into
 *                       the contract, files the signed PDF, and emails the
 *                       team. Doing this here rather than in "signed" is what
 *                       keeps the doctor from waiting ten seconds on it.
 *
 * Deploy ONCE, as the public intake:
 *   Deploy → New deployment → Web app
 *   Execute as: Me   |   Who has access: Anyone
 *   Put the /exec URL in CONFIG.endpoint in index.html.
 *
 * Once, from the editor: run testSetup and approve the permissions it asks
 * for. That installs the every-minute finishPending trigger.
 *
 * Redeploy note: after editing this file you must Deploy → Manage deployments
 * → edit → New version, or the live URL keeps running the old code.
 */

/* ═══════════════ SETTINGS ═══════════════ */

// Bumped whenever this file changes in a way the page depends on. Open the
// /exec URL in a browser to see which version is actually deployed — a
// deployment still serving an older one is the usual reason the page reports
// a failure the script has in fact handled.
var VERSION = '2026-09-24-c';

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
  'signed_at', 'sign_method', 'status', 'notes', 'url', 'signature_id'
];

// Biggest signature image we accept, in megabytes. A drawn signature is a few
// KB; the allowance is for a photographed one straight off a phone camera.
var MAX_SIG_MB = 8;

// Biggest signed contract we accept. A scan or four phone photos of the pages
// run bigger than a signature, so this is roomier.
var MAX_DOC_MB = 15;

// Printed size of the signature in the contract, in points. Must keep the
// signature pad's aspect ratio (2:1) or the stamped image comes out squashed.
var SIG_W = 160, SIG_H = 80;

var ALLOWED_SIG_TYPES = ['image/png', 'image/jpeg', 'image/heic', 'image/webp'];
var ALLOWED_DOC_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/heic', 'image/webp'];

/* ═══════════════ HEALTH CHECK ═══════════════ */

/**
 * Open the /exec URL in any browser and this answers. It exists so that
 * "is the new code deployed?" can be settled in two seconds instead of
 * inferred from the page's behaviour.
 *
 * Deliberately says nothing sensitive: no addresses, no document ids — only
 * whether each thing is configured.
 */
function doGet() {
  return json_({
    ok: true,
    version: VERSION,
    actions: ['register', 'contract', 'status', 'signed'],
    templateConfigured: !!TEMPLATE_DOC_ID,
    // false = testSetup has not been run since this version was pasted in;
    // signing still works, but falls back to building the PDF while the
    // doctor waits
    finishTrigger: triggerReady_(),
    notifyCount: recipients_().length,
    sheet: SHEET_NAME
  });
}

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
    // Each action takes a lock only where it actually needs one.
    if (req.action === 'register') return json_(register_(req));
    if (req.action === 'contract' ||
        req.action === 'resend')   return json_(contract_(req));
    if (req.action === 'status')   return json_(status_(req));
    if (req.action === 'signed')   return json_(signed_(req));
    return json_({ ok: false, error: 'unknown action: ' + req.action });

  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/**
 * Doctor submitted their details → save them and tell the team.
 *
 * Deliberately does no document work. Building a PDF from the Doc took most of
 * the ten-odd seconds this step used to take, and a reply that slow is what
 * made the page report failures that had in fact succeeded. The page renders
 * the contract text itself; the PDF is made later, only when it is needed.
 *
 * A retry finds the claimed row by its request key and replays it, never
 * appending a second row or sending a second email.
 */
function register_(req) {
  var name = String(req.name || '').trim();
  if (!name)      return { ok: false, error: 'الاسم مطلوب' };
  if (!req.phone) return { ok: false, error: 'رقم الهاتف مطلوب' };

  // The contract is an Arabic legal document. The page checks this too, but a
  // Latin name reaching the template puts the wrong script into الطرف الثاني,
  // so it is refused here as well rather than trusted from the browser.
  if (!/[؀-ۿ]/.test(name) || /[A-Za-z]/.test(name)) {
    return { ok: false, error: 'اكتب الاسم بالحروف العربية.' };
  }
  if (name.length > 60) {
    return { ok: false, error: 'الاسم طويل جداً.' };
  }
  if (!TEMPLATE_DOC_ID) {
    return { ok: false, error: 'العقد غير مهيأ بعد. راجع فريق سليم.' };
  }

  var reqKey = String(req.reqKey || '').trim();
  var sheet, head, row, fresh = false, record = null;

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    sheet = getSheet_();
    head  = headers_(sheet);
    row   = reqKey ? rowByReqKey_(sheet, head, reqKey) : -1;

    if (row === -1) {
      record = {
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
      };
      appendByHeader_(sheet, record);
      row = sheet.getLastRow();
      fresh = true;
    }
  } catch (err) {
    console.error('could not claim a row: ' + err);
    return { ok: false, code: 'busy', error: 'السيرفر مشغول حالياً. حاول مرة ثانية بعد لحظات.' };
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }

  var get = record
    ? function (k) { return String(record[k] || ''); }
    : function (k) {
        var c = head.indexOf(k);
        return c === -1 ? '' : String(sheet.getRange(row, c + 1).getValue() || '');
      };

  if (fresh) {
    notifyRegistered_({ name: get('name'), phone: get('phone'),
                        specialty: get('specialty'), workplace: get('workplace'),
                        city: get('city'), id: get('id') });
  } else {
    console.info('replayed register for req_key ' + reqKey);
  }

  var when = contractDates_(new Date(get('ts') || Date.now()));
  return { ok: true, id: get('id'), version: VERSION, replayed: !fresh,
           day: when.day, date: when.date };
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

/**
 * Did my request actually land? Asked by the page when a response never
 * arrived, so a dropped connection is not mistaken for a failed write.
 *
 * Deliberately tiny: it reports what exists and nothing more. An earlier
 * version returned the generated contract with it, which meant the probe read
 * a PDF out of Drive and pushed ~370KB back through the same slow redirect
 * that had just failed — so the check failed exactly when it was needed.
 */
function status_(req) {
  var sheet = getSheet_(), head = headers_(sheet);
  var id = String(req.id || '').trim();
  var reqKey = String(req.reqKey || '').trim();

  var row = id ? findRow_(sheet, head, id)
               : (reqKey ? rowByReqKey_(sheet, head, reqKey) : -1);
  if (row === -1) return { ok: true, version: VERSION, exists: false };

  var get = function (k) {
    var c = head.indexOf(k);
    return c === -1 ? '' : String(sheet.getRange(row, c + 1).getValue() || '');
  };
  // day and date let a page that lost the register reply still show the contract
  var when = contractDates_(new Date(get('ts') || Date.now()));
  return {
    ok: true,
    version: VERSION,
    exists: true,
    id: get('id'),
    signed: !!get('signed_at'),
    hasContract: !!get('contract_id'),
    day: when.day,
    date: when.date
  };
}

/**
 * The doctor's copy of the contract: their name and the date filled in, the
 * signature left blank. This is the only PDF the page ever receives — the
 * signed one stays with the team.
 *
 * Built the first time it is asked for and filed on the row, so asking again
 * (a second download, a retry after a lost reply) is a quick read from Drive
 * rather than another build. No lock: two first requests racing would only
 * leave one spare file in the folder, which is cheaper than making every
 * other doctor wait behind a ten-second build.
 */
function contract_(req) {
  var id = String(req.id || '').trim();
  if (!id) return { ok: false, error: 'معرّف الطلب مفقود' };

  var sheet = getSheet_(), head = headers_(sheet);
  var row = findRow_(sheet, head, id);
  if (row === -1) return { ok: false, code: 'not_found', error: 'لم نلگه الطلب.' };

  var get = function (k) {
    var c = head.indexOf(k);
    return c === -1 ? '' : String(sheet.getRange(row, c + 1).getValue() || '');
  };

  var fileId = get('contract_id');
  if (fileId) {
    try {
      var file = DriveApp.getFileById(fileId);
      if (!file.isTrashed()) {
        return { ok: true, id: id, fileName: file.getName(),
                 pdfBase64: Utilities.base64Encode(file.getBlob().getBytes()) };
      }
    } catch (gone) {
      console.warn('stored contract ' + fileId + ' is gone, rebuilding: ' + gone);
    }
  }

  var built = buildContract_({ id: id, name: get('name') },
                             new Date(get('ts') || Date.now()));
  setCell_(sheet, head, row, 'contract_file', built.file.getName());
  setCell_(sheet, head, row, 'contract_id',   built.file.getId());
  return { ok: true, id: id, fileName: built.file.getName(),
           pdfBase64: Utilities.base64Encode(built.bytes) };
}

/* ═══════════════ SIGNATURE ═══════════════ */

/**
 * Doctor signed. Three routes arrive here:
 *
 *   mode "draw"  — signature drawn on the page
 *   mode "photo" — photograph of a signature
 *       both send an image. It is filed in Drive and the row marked
 *       "signing"; finishPending then stamps it into every {{sig}} of a fresh
 *       copy of the contract. The doctor never re-uploads the contract,
 *       because the script already has everything needed to make it.
 *
 *   mode "pdf"   — doctor signed the downloaded contract by hand and sends it
 *       back. Their file is filed as the signed copy and the row marked
 *       "uploaded"; finishPending only has the email left to send.
 *
 * This reply used to wait for the stamped PDF to be built — the best part of
 * ten seconds with the doctor watching a spinner. Now it only files what
 * arrived, which is quick, and the rest happens in the background.
 *
 * The contract is built from the template rather than edited: every working
 * Doc is exported to PDF and trashed, so there is no editable contract in
 * Drive for anyone to alter afterwards. Name and date come from the row, so
 * the signed copy carries exactly what the doctor was shown.
 */
function signed_(req) {
  var res, lock = LockService.getScriptLock();
  try { lock.waitLock(30000); res = signedLocked_(req); }
  catch (err) {
    console.error('signing: ' + err);
    return { ok: false, code: 'busy', error: 'السيرفر مشغول حالياً. حاول مرة ثانية بعد لحظات.' };
  }
  finally { try { lock.releaseLock(); } catch (ignored) {} }

  var row = res._row;
  delete res._row;
  // No trigger to hand the work to (testSetup not run yet): finish it here,
  // slowly, rather than leave a signed contract nobody is told about.
  if (res.ok && row && !triggerReady_()) {
    console.warn('finishPending trigger missing — finishing inline. Run testSetup once.');
    var sheet = getSheet_();
    finishRow_(sheet, headers_(sheet), row);
  }
  return res;
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
                             : fileSignature_(req, cell);
  if (!out.ok) return out;

  if (mode === 'pdf') {
    setCell_(sheet, head, row, 'signed_file', out.file.getName());
    setCell_(sheet, head, row, 'signed_id',   out.file.getId());
  } else {
    setCell_(sheet, head, row, 'signature_id', out.file.getId());
  }
  setCell_(sheet, head, row, 'sign_method', mode);
  setCell_(sheet, head, row, 'signed_at',   new Date().toISOString());
  // written last: finishPending picks the row up by this, so everything it
  // needs must already be on the row
  setCell_(sheet, head, row, 'status', mode === 'pdf' ? 'uploaded' : 'signing');

  // The signed copy is the team's. The doctor's copy is the unsigned one from
  // contract_, so nothing is sent back here.
  return { ok: true, id: id, mode: mode, _row: row };
}

/** "draw" / "photo" — file the signature image for finishPending to stamp. */
function fileSignature_(req, cell) {
  if (!req.sigB64) return { ok: false, error: 'التوقيع مفقود' };

  var type = String(req.mimeType || 'image/png');
  if (ALLOWED_SIG_TYPES.indexOf(type) === -1) {
    return { ok: false, error: 'صيغة التوقيع غير مدعومة.' };
  }
  var bytes = Utilities.base64Decode(req.sigB64);
  if (bytes.length > MAX_SIG_MB * 1024 * 1024) {
    return { ok: false, error: 'حجم الصورة كبير. الحد الأقصى ' + MAX_SIG_MB + ' ميغابايت.' };
  }

  var name = 'توقيع - ' + (cell('name') || 'طبيب') + ' - ' + cell('id') + '.' + type.split('/')[1];
  var file = folder_().createFile(Utilities.newBlob(bytes, type, name));
  return { ok: true, file: file };
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
  return { ok: true, file: file };
}

/* ═══════════════ BACKGROUND FINISHING ═══════════════ */

/**
 * Runs every minute from the trigger testSetup installs. Picks up every row
 * a doctor has signed but the team has not yet been told about, stamps the
 * signature into the contract where there is one to stamp, and emails.
 *
 * Holds no script lock — a ten-second build under it would stall every
 * doctor registering meanwhile. A short-lived flag keeps two runs from
 * working the same rows if one overruns its minute.
 */
function finishPending() {
  var props = PropertiesService.getScriptProperties();
  var busyUntil = Number(props.getProperty('finishing_until') || 0);
  if (busyUntil > Date.now()) return;
  props.setProperty('finishing_until', String(Date.now() + 5 * 60 * 1000));

  var started = Date.now();
  try {
    var sheet = getSheet_(), head = headers_(sheet);
    var col = head.indexOf('status');
    if (col === -1 || sheet.getLastRow() < 2) return;
    var statuses = sheet.getRange(2, col + 1, sheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < statuses.length; i++) {
      var st = String(statuses[i][0]);
      if (st !== 'signing' && st !== 'uploaded') continue;
      if (Date.now() - started > 4 * 60 * 1000) break;      // the rest wait a minute
      finishRow_(sheet, head, i + 2);
    }
  } finally {
    props.deleteProperty('finishing_until');
  }
}

/** Finish one signed row: stamp if needed, mark it signed, tell the team. */
function finishRow_(sheet, head, row) {
  var cell = function (key) {
    var c = head.indexOf(key);
    return c === -1 ? '' : String(sheet.getRange(row, c + 1).getValue() || '');
  };
  var id = cell('id'), name = cell('name'), mode = cell('sign_method');
  var status = cell('status');

  if (status === 'uploaded') {
    setCell_(sheet, head, row, 'status', 'signed');
    notifySigned_(name, id, DriveApp.getFileById(cell('signed_id')), mode);
    return;
  }
  if (status !== 'signing') return;

  var sigId = cell('signature_id');
  try {
    var blob  = DriveApp.getFileById(sigId).getBlob();
    var built = buildContract_({ id: id, name: name },
                               new Date(cell('ts') || Date.now()), blob);
    setCell_(sheet, head, row, 'signed_file', built.file.getName());
    setCell_(sheet, head, row, 'signed_id',   built.file.getId());
    setCell_(sheet, head, row, 'status',      'signed');
    notifySigned_(name, id, built.file, mode);
  } catch (err) {
    // Marked failed rather than retried every minute forever. The signature
    // is safe in Drive and the email says where, so nothing is lost.
    console.error('could not stamp ' + id + ': ' + err);
    setCell_(sheet, head, row, 'status', 'stamp_failed');
    setCell_(sheet, head, row, 'notes',  String(err && err.message || err));
    var sigUrl = '';
    try { sigUrl = DriveApp.getFileById(sigId).getUrl(); } catch (ignored) {}
    mail_('⚠️ عقد موقّع بس ما انطبع التوقيع — ' + name,
      'الطبيب: ' + name + '\n' +
      'المعرّف: ' + id + '\n' +
      'الطبيب وقّع، بس ما كدرنا نطبع التوقيع بالعقد: ' + err + '\n' +
      'التوقيع: ' + (sigUrl || '(غير متوفر)') + '\n');
  }
}

/** Is the every-minute trigger installed? Cached, as the check is not free.
 *
 *  Never throws. Until the owner approves the trigger permission (by running
 *  testSetup in the editor), asking about triggers is refused outright — and
 *  that must not take the whole web app down with it. Unapproved simply
 *  means "no trigger", so signing finishes the slow way until it is sorted. */
function triggerReady_() {
  var cache = CacheService.getScriptCache();
  if (cache.get('finish_trigger') === 'yes') return true;
  try {
    var ok = ScriptApp.getProjectTriggers().some(function (t) {
      return t.getHandlerFunction() === 'finishPending';
    });
    if (ok) cache.put('finish_trigger', 'yes', 600);
    return ok;
  } catch (err) {
    console.warn('cannot check triggers — run testSetup in the editor and approve: ' + err);
    return false;
  }
}

/** Install (or reinstall) the every-minute finishPending trigger. */
function installTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'finishPending') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('finishPending').timeBased().everyMinutes(1).create();
  CacheService.getScriptCache().put('finish_trigger', 'yes', 600);
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
    var dates = contractDates_(when);
    body.replaceText('\\{\\{day\\}\\}',  dates.day);
    body.replaceText('\\{\\{date\\}\\}', dates.date);

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

/** The day and date printed in the contract. The page shows the same two
 *  strings, so they are worked out here once rather than guessed at in the
 *  browser, whose clock and time zone may be anything. */
function contractDates_(when) {
  return { day: arabicDay_(when), date: Utilities.formatDate(when, tz_(), 'yyyy/MM/dd') };
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
    'العقد معروض له بالصفحة. بانتظار التوقيع.\n');
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
 * press Run. It creates the sheet headers, checks the contract template,
 * installs the every-minute finishPending trigger, and prints where
 * everything is wired. It writes no rows and emails nobody.
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

  try {
    installTrigger_();
    Logger.log('✓ finishPending runs every minute — signed contracts are stamped ' +
               'and emailed within about a minute of signing.');
  } catch (err) {
    Logger.log('✗ Could not install the finishPending trigger: %s', err);
    Logger.log('  If no approval window appeared: Project Settings > tick ' +
               '"Show appsscript.json manifest file", open appsscript.json and ' +
               'delete its "oauthScopes" list (or add ' +
               '"https://www.googleapis.com/auth/script.scriptapp" to it), then run testSetup again.');
  }
  Logger.log('Now deploy: Deploy > Manage deployments > edit > New version.');
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
