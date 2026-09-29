/**
 * Saleem Performance Lab: copy Metabase questions into the "Saleem Outside Factors" Google Sheet
 * on a timer, so the dashboard reads fresh data without anyone exporting CSVs.
 *
 * Setup (once, about 10 minutes; see automation/README.md):
 *   1. In Metabase, save each export query (sql/ folder) as a question with no date filter, and note
 *      the number in its URL (…/question/123-orders-daily → 123). Put the numbers in QUESTIONS below.
 *   2. In Metabase, Admin › Settings › Authentication › API keys: create a key for a group that can
 *      run those questions (read-only access to the database is enough).
 *   3. Open the Google Sheet › Extensions › Apps Script, paste this file, save.
 *   4. Project Settings › Script properties: add METABASE_URL (e.g. https://metabase.saleemservices.com)
 *      and METABASE_API_KEY (the key from step 2). The key stays in the script, never in the sheet.
 *   5. Run refreshAll once (approve the permissions), then run installTrigger to refresh every 6 hours.
 *
 * Each question lands in its own tab (data_…) as plain text, and data_log records when each tab was
 * last refreshed, how many rows it has, and any error. Tabs whose question number is blank are skipped.
 */
const QUESTIONS = {
  // tab name          : Metabase question number (leave blank to skip)
  data_orders          : '',   // sql/orders_daily_by_scheduled_time.sql
  data_orders_booked   : '',   // sql/orders_daily_by_booking_time.sql
  data_patients        : '',   // sql/unique_patients_monthly.sql
  data_followon        : '',   // sql/service_followon_monthly.sql
  data_providers       : '',   // sql/provider_orders_daily.sql
  data_gateway         : '',   // sql/gateway_provider_monthly.sql
  data_gwnext          : '',   // sql/gateway_next_services_monthly.sql
  data_pfollow         : ''    // sql/provider_followon_monthly.sql
};
const LOG_TAB = 'data_log';
const HOURS = 6;

function refreshAll() {
  const props = PropertiesService.getScriptProperties();
  const base = (props.getProperty('METABASE_URL') || '').replace(/\/+$/, '');
  const key = props.getProperty('METABASE_API_KEY');
  if (!base || !key) throw new Error('Add METABASE_URL and METABASE_API_KEY under Project Settings › Script properties.');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = ss.getSheetByName(LOG_TAB) || ss.insertSheet(LOG_TAB);
  const logRows = [['tab', 'refreshed_at', 'rows', 'status']];
  for (const [tab, id] of Object.entries(QUESTIONS)) {
    if (!String(id).trim()) continue;
    const at = new Date().toISOString();
    try {
      const res = UrlFetchApp.fetch(base + '/api/card/' + encodeURIComponent(String(id).trim()) + '/query/csv', {
        method: 'post', headers: { 'x-api-key': key }, muteHttpExceptions: true,
        payload: { format_rows: 'false' }   // raw values: no thousands separators or reformatted dates
      });
      if (res.getResponseCode() !== 200) throw new Error('Metabase answered ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
      const rows = Utilities.parseCsv(res.getContentText('UTF-8'));
      if (!rows.length || !rows[0].length) throw new Error('Metabase returned no rows');
      writeTab_(ss, tab, rows);
      logRows.push([tab, at, rows.length - 1, 'ok']);
    } catch (e) {
      logRows.push([tab, at, '', 'error: ' + String(e.message || e).slice(0, 300)]);   // the tab keeps its last good copy
    }
  }
  // keep the last good time for tabs that failed this round
  const old = log.getLastRow() > 1 ? log.getRange(2, 1, log.getLastRow() - 1, 4).getDisplayValues() : [];
  const lastOk = {}; old.forEach(r => { if (r[3] === 'ok') lastOk[r[0]] = r; });
  const out = logRows.map((r, i) => i && r[3] !== 'ok' && lastOk[r[0]] ? [r[0], lastOk[r[0]][1], lastOk[r[0]][2], r[3]] : r);
  log.clearContents();
  log.getRange(1, 1, out.length, 4).setNumberFormat('@').setValues(out.map(r => r.map(String)));
}

function writeTab_(ss, tab, rows) {
  const width = Math.max(...rows.map(r => r.length));
  const grid = rows.map(r => { const x = r.map(String); while (x.length < width) x.push(''); return x; });
  const sh = ss.getSheetByName(tab) || ss.insertSheet(tab);
  sh.clearContents();
  if (sh.getMaxRows() < grid.length) sh.insertRowsAfter(sh.getMaxRows(), grid.length - sh.getMaxRows());
  if (sh.getMaxColumns() < width) sh.insertColumnsAfter(sh.getMaxColumns(), width - sh.getMaxColumns());
  // plain text, so Sheets doesn't turn days into dates or IDs into numbers; written in chunks to stay under limits
  const CH = 20000;
  for (let i = 0; i < grid.length; i += CH) {
    const part = grid.slice(i, i + CH);
    sh.getRange(i + 1, 1, part.length, width).setNumberFormat('@').setValues(part);
  }
  // drop leftover rows from a longer earlier copy
  if (sh.getMaxRows() > grid.length + 1) sh.deleteRows(grid.length + 2, sh.getMaxRows() - grid.length - 1);
}

function installTrigger() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'refreshAll').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('refreshAll').timeBased().everyHours(HOURS).create();
}
