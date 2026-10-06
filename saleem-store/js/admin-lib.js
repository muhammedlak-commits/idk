/* Saleem Store admin — files and bulk-upload rules. No dependencies.
 *
 *   zip / unzip           plain .zip (the publish bundle; .xlsx is a zip too)
 *   csvParse / csvWrite   CSV in, CSV out (UTF-8 with BOM, so Excel shows Arabic)
 *   xlsxRead / xlsxWrite  the first sheet of an .xlsx in, a formatted .xlsx out
 *   COLUMNS               the spreadsheet columns, shared with apps-script/Code.gs
 *   toRows                products → spreadsheet rows
 *   planImport            spreadsheet rows → what would change, row by row
 *   resizeImage           an uploaded photo → a ≤1000px WebP/JPEG data URL; with
 *                         { frame: true }, a 1000px square framed like every other product photo
 *
 * Written without libraries so the admin works offline and has nothing to keep
 * patched. Runs in the browser and in Node (for the tests).
 */
(function (root) {
  'use strict';
  const enc = new TextEncoder(), dec = new TextDecoder();
  const bytes = d => typeof d === 'string' ? enc.encode(d) : d;

  /* ═══════════════ ZIP ═══════════════ */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  // stored (uncompressed): images are already compressed, and it keeps this short
  function zip(files) {
    const parts = [], central = []; let offset = 0;
    const now = new Date(), dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1),
          dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (const f of files) {
      const name = enc.encode(f.name), data = bytes(f.data), crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
      c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const size = central.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, size, true); e.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
  }

  async function inflateRaw(b) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser can’t open compressed files. Save the sheet as CSV and upload that instead.');
    const s = new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function unzip(buf) {
    const u = new Uint8Array(buf), v = new DataView(u.buffer, u.byteOffset, u.byteLength), out = new Map();
    let e = -1;
    for (let i = u.length - 22; i >= Math.max(0, u.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('Not a zip file');
    let p = v.getUint32(e + 16, true);
    const n = v.getUint16(e + 10, true);
    for (let k = 0; k < n; k++) {
      if (v.getUint32(p, true) !== 0x02014b50) throw new Error('Damaged zip file');
      const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true),
            nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true), lo = v.getUint32(p + 42, true);
      const name = dec.decode(u.subarray(p + 46, p + 46 + nlen));
      const start = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true), data = u.subarray(start, start + csize);
      if (method === 0) out.set(name, data);
      else if (method === 8) out.set(name, await inflateRaw(data));
      p += 46 + nlen + xlen + clen;
    }
    return out;
  }

  /* ═══════════════ CSV ═══════════════ */
  function csvParse(text) {
    text = String(text).replace(/^﻿/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const delim = ['\t', ';', ','].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"' && cell === '') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function csvWrite(rows) {
    const c = v => { v = v == null ? '' : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return '﻿' + rows.map(r => r.map(c).join(',')).join('\r\n') + '\r\n';
  }

  /* ═══════════════ XLSX ═══════════════ */
  const xmlEsc = s => String(s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]))
                               .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const xmlUnesc = s => s.replace(/_x000[dD]_/g, '').replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1))
                 : { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[e.toLowerCase()]);
  const colName = i => { let s = ''; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
  const colIndex = ref => { let n = 0; for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

  async function xlsxRead(buf) {
    const files = await unzip(buf), txt = n => files.has(n) ? dec.decode(files.get(n)) : '';
    const wb = txt('xl/workbook.xml'), rels = txt('xl/_rels/workbook.xml.rels');
    if (!wb) throw new Error('This doesn’t look like an Excel workbook.');
    const firstSheet = /<(?:\w+:)?sheet\b[^>]*?r:id="([^"]+)"/.exec(wb);
    let path = 'xl/worksheets/sheet1.xml';
    if (firstSheet) {
      const re = new RegExp('<Relationship\\b[^>]*Id="' + firstSheet[1] + '"[^>]*>'), rel = re.exec(rels);
      const target = rel && /Target="([^"]+)"/.exec(rel[0]);
      if (target) path = target[1].startsWith('/') ? target[1].slice(1) : 'xl/' + target[1].replace(/^\.\//, '');
    }
    const shared = [];
    txt('xl/sharedStrings.xml').replace(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g, (m, si) => {
      let s = ''; si.replace(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g, (m2, t) => { s += xmlUnesc(t); });
      // phonetic hints (<rPh>) are not part of the text
      shared.push(s);
    });
    const sheet = txt(path); if (!sheet) throw new Error('The workbook’s first sheet is empty.');
    const rows = [];
    sheet.replace(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g, (m, attrs, inner) => {
      const ref = /\br="([A-Z]+)(\d+)"/.exec(attrs); if (!ref) return;
      const t = (/\bt="(\w+)"/.exec(attrs) || [])[1], r = +ref[2] - 1, c = colIndex(ref[1]);
      let val = '';
      if (inner) {
        if (t === 'inlineStr') inner.replace(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g, (m2, x) => { val += xmlUnesc(x); });
        else {
          const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner); val = v ? xmlUnesc(v[1]) : '';
          if (t === 's') val = shared[+val] || '';
          else if (t === 'b') val = val === '1' ? 'yes' : 'no';
          else if (!t || t === 'n') { const f = Number(val); if (isFinite(f) && val !== '') val = String(Math.round(f * 1e6) / 1e6); }
        }
      }
      (rows[r] = rows[r] || [])[c] = val;
    });
    return Array.from(rows, r => Array.from(r || [], x => x == null ? '' : x));
  }

  /** sheets: [{ name, rows, widths?, validations?: [{col, list}] }]; rows[0] is a bold, frozen header */
  function xlsxWrite(sheets) {
    const sheetXml = sh => {
      const cols = sh.widths ? '<cols>' + sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>' : '';
      const data = sh.rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((v, ci) => {
        const ref = colName(ci) + (ri + 1), s = ri === 0 ? ' s="1"' : '';
        if (v === '' || v == null) return '';
        if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
        return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
      }).join('') + '</row>').join('');
      const dv = (sh.validations || []).filter(x => x.list.join(',').length < 250);
      const dvXml = dv.length ? `<dataValidations count="${dv.length}">` + dv.map(x =>
        `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${colName(x.col)}2:${colName(x.col)}5000"><formula1>"${xmlEsc(x.list.join(','))}"</formula1></dataValidation>`).join('') + '</dataValidations>' : '';
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
        cols + '<sheetData>' + data + '</sheetData>' + dvXml + '</worksheet>';
    };
    const ns = 'http://schemas.openxmlformats.org';
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>' },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="${ns}/spreadsheetml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><sheets>` +
        sheets.map((s, i) => `<sheet name="${xmlEsc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${ns}/package/2006/relationships">` +
        sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="${ns}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${sheets.length + 1}" Type="${ns}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="${ns}/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF003260"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>` },
      ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
    ];
    return new Blob([zip(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ═══════════════ THE SPREADSHEET COLUMNS ═══════════════
   * Same names as the header row in apps-script/Code.gs's "Products" sheet.
   * Rules for every cell:
   *   blank → leave the product as it is (a new product gets the default)
   *   "-"   → clear it (prices, photo, services, descriptions)
   */
  const norm = s => String(s == null ? '' : s).trim().toLowerCase()
    .replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[\s_\-()/]+/g, ' ').trim();
  const YES = ['yes', 'y', 'true', '1', 'x', '✓', 'نعم', 'اي', 'ايه'], NO = ['no', 'n', 'false', '0', 'لا', 'كلا'];
  const SVC = { doctor: ['doctor', 'doctor visit', 'طبيب', 'زياره طبيب'], nursing: ['nursing', 'nurse', 'nursing visit', 'تمريض', 'ممرض'],
                physio: ['physio', 'physiotherapy', 'pt', 'علاج طبيعي'], lab: ['lab', 'lab visit', 'laboratory', 'مختبر', 'تحليل'],
                direct: ['direct', 'direct order', 'طلب مباشر'] };
  const STATUS = { available: ['available', 'in stock', 'متوفر', 'متاح'], out: ['out', 'out of stock', 'out_of_stock', 'unavailable', 'غير متوفر', 'نافذ'], hidden: ['hidden', 'hide', 'مخفي', 'اخفاء'] };
  const STATUS_OUT = { available: 'available', out: 'out_of_stock', hidden: 'hidden' };
  const pick = (map, v) => { const n = norm(v); for (const k in map) if (map[k].map(norm).includes(n)) return k; return null; };

  const COLUMNS = [
    { key: 'id',            field: 'id',        width: 7,  help: 'Leave empty for a new product. Never reuse an id.', ar: 'رقم المنتج' },
    { key: 'name_en',       field: 'en',        width: 32, help: 'Name in English', ar: 'الاسم بالإنكليزي' },
    { key: 'name_ar',       field: 'ar',        width: 32, help: 'Name in Arabic', ar: 'الاسم بالعربي' },
    { key: 'department',    field: 'dept',      width: 14, help: 'Department key (see the Departments sheet) or its name', ar: 'القسم' },
    { key: 'section',       field: 'sub',       width: 14, help: 'Section key within that department, or its name', ar: 'القسم الفرعي' },
    { key: 'tier',          field: 'tier',      width: 6,  help: '1 mandatory · 2 useful · 3 bonus (internal, sorts the shop)', ar: 'الأهمية' },
    { key: 'buy_price_iqd', field: 'price',     width: 14, help: 'Optional. Whole IQD, e.g. 45000. "-" clears it', ar: 'سعر الشراء' },
    { key: 'rent_price_iqd_month', field: 'rentPrice', width: 16, help: 'Optional. IQD per month', ar: 'سعر الإيجار الشهري' },
    { key: 'rentable',      field: 'rent',      width: 10, help: 'yes / no', ar: 'إيجار' },
    { key: 'monthly_refill', field: 'refill',   width: 12, help: 'yes / no', ar: 'توصيل شهري' },
    { key: 'clinic_only',   field: 'b2b',       width: 11, help: 'yes / no — quote only, belongs in the clinic department', ar: 'للعيادات فقط' },
    { key: 'services',      field: 'services',  width: 22, help: 'Any of: doctor, nursing, physio, lab, direct — comma separated', ar: 'الخدمات' },
    { key: 'status',        field: 'status',    width: 12, help: 'available / out_of_stock / hidden', ar: 'الحالة' },
    { key: 'why_en',        field: 'whyEn',     width: 50, help: 'Why a patient needs it, English', ar: 'السبب بالإنكليزي' },
    { key: 'why_ar',        field: 'whyAr',     width: 50, help: 'Why a patient needs it, Arabic', ar: 'السبب بالعربي' },
    { key: 'photo_url',     field: 'img',       width: 30, help: 'Optional https:// link to a photo. Blank keeps the current photo; "-" removes it', ar: 'رابط الصورة' },
    { key: 'store',         field: 'store',     width: 16, help: 'Partner store id or name (see the Stores sheet). "-" unassigns it', ar: 'المتجر الشريك' },
    { key: 'commission_pct', field: 'commission', width: 14, help: 'PRIVATE. Optional % that overrides the store’s commission for this item. "-" goes back to the store’s', ar: 'نسبة العمولة' },
    { key: 'deposit_iqd',   field: 'deposit',   width: 12, help: 'Optional refundable deposit on a rental, IQD', ar: 'التأمين' },
  ];
  const ALIASES = {};
  COLUMNS.forEach(c => [c.key, c.field, c.ar].forEach(a => { ALIASES[norm(a)] = c; }));
  const byKey = k => COLUMNS.find(c => c.key === k);
  Object.assign(ALIASES, { [norm('commission')]: byKey('commission_pct'), [norm('deposit')]: byKey('deposit_iqd'), [norm('supplier')]: byKey('store') });
  Object.assign(ALIASES, { [norm('name')]: COLUMNS[1], [norm('english name')]: COLUMNS[1], [norm('arabic name')]: COLUMNS[2], [norm('price')]: COLUMNS[6],
    [norm('rent price')]: COLUMNS[7], [norm('photo')]: COLUMNS[15], [norm('image')]: COLUMNS[15], [norm('dept')]: COLUMNS[3], [norm('sub')]: COLUMNS[4] });

  function toRows(products) {
    return [COLUMNS.map(c => c.key), ...products.map(p => COLUMNS.map(c => {
      const v = p[c.field];
      switch (c.field) {
        case 'rent': case 'refill': case 'b2b': return v ? 'yes' : 'no';
        case 'services': return (v || []).join(', ');
        case 'status': return STATUS_OUT[v] || 'available';
        case 'price': case 'rentPrice': case 'deposit': case 'commission': return v == null ? '' : v;
        case 'store': return v || '';
        // a photo uploaded in this browser can't ride in a cell; blank keeps it on re-upload
        case 'img': return /^data:/.test(v || '') ? '' : (v || '');
        default: return v == null ? '' : v;
      }
    }))];
  }

  /**
   * rows        array of arrays, header first (csvParse / xlsxRead output)
   * products    the current catalog
   * departments for checking department / section
   * → { columns, ignored, rows: [{ line, kind: new|update|same|error, id, name, changes, errors, warnings, product }], missing }
   */
  function planImport(rows, products, departments, stores) {
    stores = stores || [];
    rows = rows.filter(r => r && r.some(c => String(c == null ? '' : c).trim() !== ''));
    if (!rows.length) throw new Error('The file is empty.');
    const header = rows[0].map(h => ALIASES[norm(h)] || null);
    const ignored = rows[0].filter((h, i) => !header[i] && String(h).trim()).map(String);
    const cols = header.filter(Boolean);
    if (!cols.length) throw new Error('No recognised column headings in the first row. Download the template to see them.');
    if (!cols.some(c => ['id', 'name_en', 'name_ar'].includes(c.key))) throw new Error('The file needs an id or a name column to know which product each row is.');
    const byId = new Map(products.map(p => [p.id, p]));
    const byName = new Map(products.map(p => [norm(p.en), p]));
    const D = new Map(departments.map(d => [d.key, d]));
    const findDept = v => { const n = norm(v); return departments.find(d => [d.key, d.en, d.ar].some(x => norm(x) === n)); };
    const findStore = v => { const n = norm(v); return stores.find(s => [s.id, s.en, s.ar].some(x => norm(x) === n)); };
    const findSub = (d, v) => { const n = norm(v); return d && d.subs.find(s => [s.key, s.en, s.ar].some(x => norm(x) === n)); };
    const seen = new Set(), out = [];
    let nextId = Math.max(0, ...products.map(p => p.id)) + 1;

    rows.slice(1).forEach((r, i) => {
      const line = i + 2, errors = [], warnings = [], cell = {};
      header.forEach((c, j) => { if (c) cell[c.key] = String(r[j] == null ? '' : r[j]).trim(); });
      // which product is this row?
      let base = null, id = null;
      if ('id' in cell && cell.id !== '') {
        id = Number(cell.id);
        if (!Number.isInteger(id) || id <= 0) { errors.push(`id "${cell.id}" isn’t a whole number`); id = null; }
        else base = byId.get(id) || null;
      } else if (cell.name_en && byName.has(norm(cell.name_en))) { base = byName.get(norm(cell.name_en)); id = base.id; }
      if (id != null && seen.has(id)) errors.push(`id ${id} appears twice in the file`);

      const patch = {};
      const set = (field, v) => { patch[field] = v; };
      for (const c of COLUMNS) {
        if (!(c.key in cell) || c.key === 'id') continue;
        const v = cell[c.key];
        if (v === '') continue;                                    // blank: leave as is
        const clear = v === '-';
        switch (c.field) {
          case 'en': case 'ar':
            if (clear) errors.push(`${c.key} can’t be cleared`); else set(c.field, v); break;
          case 'whyEn': case 'whyAr': set(c.field, clear ? '' : v); break;
          case 'dept': {
            const d = findDept(v); if (d) set('dept', d.key); else errors.push(`no department "${v}" — use one of: ${departments.map(d => d.key).join(', ')}`); break;
          }
          case 'sub': patch._subRaw = v; break;                    // checked once the department is known
          case 'tier': { const n = Number(v); if ([1, 2, 3].includes(n)) set('tier', n); else errors.push(`tier must be 1, 2 or 3 (got "${v}")`); break; }
          case 'store': {
            if (clear) { set('store', ''); break; }
            const s = findStore(v); if (s) set('store', s.id); else errors.push(`no partner store "${v}"${stores.length ? ' — use one of: ' + stores.map(s => s.id).join(', ') : ' — add stores in the admin first'}`); break;
          }
          case 'commission': {
            if (clear) { set('commission', null); break; }
            const n = Number(v.replace(/[%\s]/g, '')); if (isFinite(n) && n >= 0 && n <= 100) set('commission', Math.round(n * 100) / 100); else errors.push(`commission_pct must be 0–100 (got "${v}")`); break;
          }
          case 'price': case 'rentPrice': case 'deposit': {
            if (clear) { set(c.field, null); break; }
            const n = Number(v.replace(/[,\s]|iqd|د\.?ع/gi, ''));
            if (isFinite(n) && n > 0) set(c.field, Math.round(n)); else errors.push(`${c.key} "${v}" isn’t a price in IQD`); break;
          }
          case 'rent': case 'refill': case 'b2b': {
            const n = norm(v); if (YES.includes(n)) set(c.field, true); else if (NO.includes(n)) set(c.field, false); else errors.push(`${c.key} must be yes or no (got "${v}")`); break;
          }
          case 'services': {
            if (clear) { set('services', []); break; }
            const list = v.split(/[,;|\/\n،]+/).map(s => s.trim()).filter(Boolean), keys = [];
            list.forEach(s => { const k = pick(SVC, s); if (k) { if (!keys.includes(k)) keys.push(k); } else errors.push(`unknown service "${s}" — use doctor, nursing, physio, lab or direct`); });
            set('services', keys); break;
          }
          case 'status': { const k = pick(STATUS, v); if (k) set('status', k); else errors.push(`status must be available, out_of_stock or hidden (got "${v}")`); break; }
          case 'img': {
            if (clear) { set('img', ''); break; }
            if (/^https:\/\/\S+$/i.test(v) || /^assets\/\S+$/.test(v)) set('img', v); else errors.push('photo_url must start with https://'); break;
          }
        }
      }
      const deptKey = patch.dept || (base && base.dept);
      if (patch._subRaw != null) {
        const s = findSub(D.get(deptKey), patch._subRaw);
        if (s) patch.sub = s.key; else if (deptKey) errors.push(`no section "${patch._subRaw}" in ${deptKey} — use one of: ${D.get(deptKey).subs.map(s => s.key).join(', ')}`);
        delete patch._subRaw;
      } else if (patch.dept && base && patch.dept !== base.dept) errors.push(`moved to ${patch.dept}, so it needs a section too`);

      const isNew = !base;
      if (isNew) {
        if (!patch.en && !patch.ar) errors.push('a new product needs a name');
        if (!patch.dept) errors.push('a new product needs a department');
        if (!patch.sub && patch.dept) errors.push('a new product needs a section');
      }
      const merged = Object.assign({ tier: 2, rent: false, refill: false, b2b: false, services: [], en: '', ar: '', whyEn: '', whyAr: '', price: null, rentPrice: null, deposit: null, status: 'available', img: '', store: '', commission: null },
                                   base || {}, patch);
      if (merged.b2b && merged.dept !== 'clinic') warnings.push('clinic-only items normally sit in the clinic department');
      if (!merged.b2b && merged.dept === 'clinic') warnings.push('items in the clinic department are normally clinic-only');
      if (merged.rentPrice && !merged.rent) warnings.push('has a rent price but isn’t marked rentable');
      if (!merged.en || !merged.ar) warnings.push(`missing the ${merged.en ? 'Arabic' : 'English'} name — the other one is shown instead`);

      if (!errors.length && isNew && id == null) id = nextId++;
      if (!errors.length && isNew && id != null && id >= nextId) nextId = id + 1;
      if (id != null) seen.add(id);
      merged.id = id;
      const changes = base ? Object.keys(patch).filter(k => JSON.stringify(patch[k]) !== JSON.stringify(base[k])) : [];
      out.push({ line, id, name: merged.en || merged.ar, errors, warnings, changes, product: merged, before: base,
                 kind: errors.length ? 'error' : isNew ? 'new' : changes.length ? 'update' : 'same' });
    });
    const missing = cols.some(c => c.key === 'id') ? products.filter(p => !seen.has(p.id)).map(p => p.id) : [];
    return { columns: cols.map(c => c.key), ignored, rows: out, missing };
  }

  /* ═══════════════ PHOTOS ═══════════════ */
  // opts.frame: product photos all come out the same — square, white, the item trimmed of its
  // empty edges and centred at the same size. A photo with no plain background (a room, a
  // person) is kept whole and fitted inside the square instead of being cut.
  async function resizeImage(file, max, opts) {
    max = max || 1000; opts = opts || {};
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Not an image the browser can read')); i.src = url; });
      const cv = opts.frame ? framed(img, max) : scaled(img, max);
      let out = cv.toDataURL('image/webp', 0.82);
      if (!out.startsWith('data:image/webp')) out = cv.toDataURL('image/jpeg', 0.86);   // older Safari can't write WebP
      return out;
    } finally { URL.revokeObjectURL(url); }
  }
  function scaled(img, max) {
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(img, 0, 0, w, h);
    return cv;
  }
  function framed(img, size) {
    // look at a copy at most 600px across: enough to find the edges, quick on a phone
    const k = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const a = document.createElement('canvas'); a.width = w; a.height = h;
    const ax = a.getContext('2d', { willReadFrequently: true }); ax.fillStyle = '#fff'; ax.fillRect(0, 0, w, h); ax.drawImage(img, 0, 0, w, h);
    const box = itemBox(ax.getImageData(0, 0, w, h).data, w, h);
    const whole = !box || (box.w * box.h) / (w * h) > 0.9;
    const sx = whole ? 0 : box.x / k, sy = whole ? 0 : box.y / k;
    const sw = whole ? img.naturalWidth : box.w / k, sh = whole ? img.naturalHeight : box.h / k;
    const fill = whole ? 1 : 0.82;                          // a trimmed item gets a margin around it
    const s = Math.min(size * fill / sw, size * fill / sh, whole ? size / Math.max(sw, sh) : Infinity);
    const dw = sw * s, dh = sh * s;
    const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
    const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, size, size);
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(img, sx, sy, sw, sh, (size - dw) / 2, (size - dh) / 2, dw, dh);
    return cv;
  }
  // the box around everything that isn't the background (the colour of the four corners)
  function itemBox(d, w, h) {
    const px = (x, y) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
    const bg = [0, 1, 2].map(c => corners.reduce((a, p) => a + p[c], 0) / 4);
    // corners that disagree mean there is no plain background to trim
    if (corners.some(p => p.some((v, c) => Math.abs(v - bg[c]) > 40))) return null;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 60) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return null;
    const pad = 2;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  const dataUrlBytes = u => { const b = atob(u.split(',')[1]); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };

  root.SaleemAdminLib = { zip, unzip, crc32, csvParse, csvWrite, xlsxRead, xlsxWrite, COLUMNS, toRows, planImport, resizeImage, dataUrlBytes, norm };
})(typeof window !== 'undefined' ? window : globalThis);
