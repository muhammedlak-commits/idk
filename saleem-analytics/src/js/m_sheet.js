/* ---------- live outside-factors sheet ----------
   The page asks the viewer's Google Sheets connector for the "Saleem Outside Factors" sheet
   (get_values, every row) when it opens and every 10 minutes while open: the Events tab, and the
   Competitors tab for competitor milestones. Without the connector the page keeps the last copy it
   read in this browser, then the rows built into the page. (Google Drive's file reader returns only
   a sample of a sheet's rows, so it isn't used.) */
const SHEET=P.sheet||null;          // {spreadsheetId, url, server, tool, events, competitors}
let sheetState={status:'off', at:null, rows:null, cmpRows:null, cmpMissing:false, message:''};

/* get_values rows (arrays) -> row objects keyed by the header row, found as the first row that has all `need` */
function valuesToRows(values, need){
  if(!Array.isArray(values)) return null;
  let hdr=null; const rows=[];
  for(const r of values){ const c=(r||[]).map(v=>v==null?'':String(v).trim());
    if(!hdr){ const h=c.map(normHdr); if(need.every(k=>h.includes(k))) hdr=h; continue; }
    if(c.every(x=>x==='')) continue;
    const o={}; hdr.forEach((h,i)=>o[h]=c[i]||''); rows.push(o); }
  return hdr? rows : null;
}
function sheetDate(v){
  v=(v||'').trim(); if(!v) return null;
  // YYYY-MM-DD (the sheet's format) or Sheets' US display M/D/YYYY; anything else, or an impossible date, is skipped
  let m=v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[ T])/), y, mo, d;
  if(m){ y=+m[1]; mo=+m[2]; d=+m[3]; } else { m=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if(!m) return null; y=+m[3]; mo=+m[1]; d=+m[2]; }
  const t=new Date(Date.UTC(y,mo-1,d)); if(y<2000||y>2100||t.getUTCMonth()!==mo-1||t.getUTCDate()!==d) return null;
  return Math.round(t.getTime()/DAY);
}
function sheetEvents(rows){
  return rows.map(r=>{ const s=sheetDate(r.start); if(s==null) return null; const e=sheetDate(r.end);
    return {s,e:e!=null&&e>=s?e:s,cat:r.category||'Other',title:r.title||'(untitled)',note:[r.notes,r.status&&r.status!=='Confirmed'&&r.status!=='Calendar'?r.status:'',r.scope&&r.scope!=='National'&&r.scope!=='Saleem'?r.scope:''].filter(Boolean).join(' · '),scope:r.scope,status:r.status,source:r.source,own:false,sheet:true}; }).filter(Boolean);
}
function renderSheetStatus(){
  const el=document.getElementById('sheetStatus'); if(!el) return;
  const link=SHEET? ' <a href="'+esc(SHEET.url)+'" target="_blank" rel="noopener">Open the sheet</a>' : '';
  const when=sheetState.at? new Date(sheetState.at).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
  const txt={
    off:'Events built into this page.',
    loading:'Reading the Google Sheet…',
    live:'Live from the Google Sheet · read '+when+'.'+(sheetState.cmpMissing?' The sheet has no Competitors tab yet, so competitor milestones are the ones built into this page.':''),
    cached:'Showing the copy of the Google Sheet read '+when+'. '+sheetState.message,
    error:sheetState.message
  }[sheetState.status]||'';
  el.innerHTML=esc(txt)+link; el.className='sheetstatus '+sheetState.status;
}
function saveSheetCache(){ lsSet('spl.sheet2',JSON.stringify({rows:sheetState.rows,cmpRows:sheetState.cmpRows,at:sheetState.at})); }
function startSheet(){
  if(!SHEET){ renderSheetStatus(); return; }
  try{ const c=JSON.parse(lsGet('spl.sheet2')||'null'); if(c&&(c.rows||c.cmpRows)){ sheetState={...sheetState,status:c.rows?'cached':sheetState.status,at:c.at,rows:c.rows||null,cmpRows:c.cmpRows||null,message:'Connecting to Google Sheets…'}; loadEvents(); loadCompetitors(); } }catch(e){}
  renderSheetStatus();
  const use=window.claude&&window.claude.use;
  if(!use){ if(sheetState.status!=='cached') sheetState.status='off'; else sheetState.message='Live updates work when this page is opened in claude.ai.'; renderSheetStatus(); return; }
  Promise.resolve(window.claude.use('mcp')).then(mcp=>{
    if(!mcp){ if(sheetState.status==='cached') sheetState.message='Live updates aren’t available in this view.'; renderSheetStatus(); return; }
    if(sheetState.status!=='cached') sheetState.status='loading'; renderSheetStatus();
    const valuesOf=ev=>{ let p=ev.result&&ev.result.payload; if(typeof p==='string'){ try{ p=JSON.parse(p); }catch(e){ p=null; } } return p&&p.values; };
    const denial={needs_reauth:'Google Sheets needs to be reconnected: claude.ai Settings → Connectors.',server_not_connected:'Add the Google Sheets connector in claude.ai Settings → Connectors to read the sheet live.',selection_required:'Choose which Google Sheets connection to use when claude.ai asks.',not_in_manifest:'Google Sheets is turned off for this page. Allow it from the page’s connector prompt to read the sheet live.',blocked_by_policy:'Your organisation’s policy blocks reading Google Sheets from this page.',approval_required:'Reading Google Sheets from this page needs approval from your organisation.',consent_required:'Allow Google Sheets for this page when claude.ai asks, to read the sheet live.'};
    const unavailable=new Set(['not_granted','capability_disabled','capability_removed']);
    // Events tab: the main feed
    mcp.watchTool(SHEET.server, SHEET.tool, {spreadsheetId:SHEET.spreadsheetId, range:SHEET.events}, ev=>{
      if(ev.type==='data'){
        const rows=valuesToRows(valuesOf(ev),['start','title']);
        if(!rows){ sheetState.status= sheetState.rows?'cached':'error'; sheetState.message='The sheet was read but its Events tab couldn’t be understood. Keep the header row: start, end, category, title, scope, status, source, notes.'; renderSheetStatus(); return; }
        sheetState.status='live'; sheetState.message=''; sheetState.rows=rows; sheetState.at= ev.result.cache&&ev.result.cache.storedAt || Date.now();
        saveSheetCache(); loadEvents(); render(); renderSheetStatus(); return;
      }
      const code=ev.error&&ev.error.code;
      if(denial[code]){ sheetState={...sheetState,status:'error',at:null,rows:null,cmpRows:null,message:denial[code]}; lsSet('spl.sheet2','null'); loadEvents(); loadCompetitors(); render(); renderSheetStatus(); return; }
      sheetState.status=sheetState.rows?'cached':'error';
      if(unavailable.has(code)){ sheetState.message='Live updates aren’t available in this view.'; renderSheetStatus(); return; }
      sheetState.message= code==='tool_error'? 'Google Sheets couldn’t read the sheet: '+(ev.error.message||'unknown error')+'. It may have been moved, renamed or deleted.' : (ev.error&&ev.error.retryable? 'Couldn’t reach Google Sheets just now; it will try again.' : 'Couldn’t read Google Sheets'+(ev.error&&ev.error.message?': '+ev.error.message:'')+'. Reopen the page to try again.');
      renderSheetStatus();
    }, {refetchInterval:600000, cache:{staleTime:60000}});
    // Competitors tab: optional; a missing tab keeps the built-in milestones
    if(SHEET.competitors) mcp.watchTool(SHEET.server, SHEET.tool, {spreadsheetId:SHEET.spreadsheetId, range:SHEET.competitors}, ev=>{
      if(ev.type==='data'){ const rows=valuesToRows(valuesOf(ev),['date','competitor']); if(!rows) return;
        sheetState.cmpRows=rows; sheetState.cmpMissing=false; saveSheetCache(); loadCompetitors(); render(); renderSheetStatus(); return; }
      if(ev.error&&ev.error.code==='tool_error'){ sheetState.cmpMissing=true; sheetState.cmpRows=null; loadCompetitors(); render(); renderSheetStatus(); }
    }, {refetchInterval:600000, cache:{staleTime:60000}});
    // Metabase data tabs, filled on a timer by automation/metabase_to_sheet.gs; a tab that doesn't exist yet is skipped quietly
    if(SHEET.data){
      const opt={refetchInterval:1800000, cache:{staleTime:300000}};
      if(SHEET.log) mcp.watchTool(SHEET.server, SHEET.tool, {spreadsheetId:SHEET.spreadsheetId, range:SHEET.log}, ev=>{
        if(ev.type!=='data') return; const rows=valuesToRows(valuesOf(ev),['tab','refreshed_at']); if(!rows) return;
        const L={}; rows.forEach(r=>{ const t=Date.parse(r.refreshed_at); L[r.tab]={at:isFinite(t)?t:null,rows:+r.rows||0,status:r.status||''}; });
        sheetFeed.log=L; applySheetData(); }, opt);
      Object.entries(SHEET.data).forEach(([key,tab])=>mcp.watchTool(SHEET.server, SHEET.tool, {spreadsheetId:SHEET.spreadsheetId, range:tab}, ev=>{
        if(ev.type!=='data') return; const v=valuesOf(ev); if(!Array.isArray(v)||v.length<2) return;
        sheetFeed.tabs[key]={csv:valuesToCsv(v),tab,rows:v.length-1}; applySheetData(); }, opt));
    }
  }).catch(()=>renderSheetStatus());
}

/* ---------- Metabase data from the sheet ----------
   A tab's copy replaces the built-in data unless a file was loaded by hand after the tab's last refresh. */
const sheetFeed={tabs:{},log:null,used:{}};
const FEED={services:['orders','orders'],servicesBooked:['ordersBooked','orders'],uniquePatients:['patients','patients'],followon:['links','links'],providers:['providers','providers'],gateway:['gateway','gateway'],gatewayNext:['gwnext','gwnext'],provFollowon:['pfollow','pfollow']};   // P key -> [meta key, DROPS key]
function valuesToCsv(values){
  const q=v=>{ v=v==null?'':String(v); return /[",\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; };
  return values.filter(r=>r&&r.some(v=>v!=null&&String(v)!=='')).map(r=>r.map(q).join(',')).join('\n');
}
let feedT=null;
function applySheetData(){ clearTimeout(feedT); feedT=setTimeout(()=>{
  const meta=dataMeta(); let changed=false;
  for(const [key,f] of Object.entries(sheetFeed.tabs)){
    const lg=sheetFeed.log&&sheetFeed.log[f.tab], at=lg&&lg.at||null, m=meta[FEED[key][0]];
    if(m&&(!at||m.at>at)){ sheetFeed.used[key]={state:'older',at,rows:f.rows,tab:f.tab}; continue; }
    if(!DROPS[FEED[key][1]].check(headerLine(f.csv))){ sheetFeed.used[key]={state:'bad',at,rows:f.rows,tab:f.tab}; continue; }
    if(key==='services'||key==='servicesBooked'){ try{ buildServices(f.csv); }catch(e){ sheetFeed.used[key]={state:'bad',at,rows:f.rows,tab:f.tab}; continue; } }
    sheetFeed.used[key]={state:'used',at,rows:f.rows,tab:f.tab};
    if(P[key]!==f.csv){ P[key]=f.csv; changed=true; }
  }
  if(changed) boot(true); else if(st.mod==='data') renderData();
},400); }
function feedText(key){
  const u=sheetFeed.used[key], lg=sheetFeed.log&&SHEET&&SHEET.data&&sheetFeed.log[SHEET.data[key]];
  const when=t=>t? new Date(t).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : 'unknown time';
  if(!u) return lg&&/^error/.test(lg.status)? 'Refresh failed: '+esc(lg.status.replace(/^error:\s*/,'')) : '<span class="note">Not set up (see automation/README.md)</span>';
  const err=lg&&/^error/.test(lg.status)? ' <span class="note">· last refresh failed: '+esc(lg.status.replace(/^error:\s*/,''))+'</span>' : '';
  if(u.state==='used') return 'In use · tab '+esc(u.tab)+', refreshed '+when(u.at)+', '+fmtInt(u.rows)+' rows'+err;
  if(u.state==='older') return '<span class="note">Not used: the file you loaded is newer than the tab’s refresh ('+when(u.at)+')</span>'+err;
  return '<span class="note">Tab '+esc(u.tab)+' doesn’t have the columns this box needs; check its question number</span>'+err;
}
