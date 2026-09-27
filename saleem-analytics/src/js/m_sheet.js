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
  let m=v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if(m) return Math.round(Date.UTC(+m[1],+m[2]-1,+m[3])/DAY);
  m=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if(m) return Math.round(Date.UTC(+m[3],+m[1]-1,+m[2])/DAY);   // Sheets' US display
  const t=Date.parse(v); return isFinite(t)? Math.round(Date.UTC(new Date(t).getFullYear(),new Date(t).getMonth(),new Date(t).getDate())/DAY) : null;
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
  try{ const c=JSON.parse(lsGet('spl.sheet2')||'null'); if(c&&c.rows){ sheetState={...sheetState,status:'cached',at:c.at,rows:c.rows,cmpRows:c.cmpRows||null,message:'Connecting to Google Sheets…'}; loadEvents(); loadCompetitors(); } }catch(e){}
  renderSheetStatus();
  const use=window.claude&&window.claude.use;
  if(!use){ if(sheetState.status!=='cached') sheetState.status='off'; else sheetState.message='Live updates work when this page is opened in claude.ai.'; renderSheetStatus(); return; }
  Promise.resolve(window.claude.use('mcp')).then(mcp=>{
    if(!mcp){ if(sheetState.status==='cached') sheetState.message='Live updates aren’t available in this view.'; renderSheetStatus(); return; }
    if(sheetState.status!=='cached') sheetState.status='loading'; renderSheetStatus();
    const valuesOf=ev=>{ let p=ev.result&&ev.result.payload; if(typeof p==='string'){ try{ p=JSON.parse(p); }catch(e){ p=null; } } return p&&p.values; };
    const denial={needs_reauth:'Google Sheets needs to be reconnected: claude.ai Settings → Connectors.',server_not_connected:'Add the Google Sheets connector in claude.ai Settings → Connectors to read the sheet live.',selection_required:'Choose which Google Sheets connection to use when claude.ai asks.',not_in_manifest:'Google Sheets is turned off for this page. Allow it from the page’s connector prompt to read the sheet live.',blocked_by_policy:'Your organisation’s policy blocks reading Google Sheets from this page.',approval_required:'Reading Google Sheets from this page needs approval from your organisation.'};
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
      sheetState.message= code==='tool_error'? 'Google Sheets couldn’t read the sheet: '+(ev.error.message||'unknown error')+'. It may have been moved, renamed or deleted.' : 'Couldn’t reach Google Sheets just now; it will try again.';
      renderSheetStatus();
    }, {refetchInterval:600000, cache:{staleTime:60000}});
    // Competitors tab: optional; a missing tab keeps the built-in milestones
    if(SHEET.competitors) mcp.watchTool(SHEET.server, SHEET.tool, {spreadsheetId:SHEET.spreadsheetId, range:SHEET.competitors}, ev=>{
      if(ev.type==='data'){ const rows=valuesToRows(valuesOf(ev),['date','competitor']); if(!rows) return;
        sheetState.cmpRows=rows; sheetState.cmpMissing=false; saveSheetCache(); loadCompetitors(); render(); renderSheetStatus(); return; }
      if(ev.error&&ev.error.code==='tool_error'){ sheetState.cmpMissing=true; renderSheetStatus(); }
    }, {refetchInterval:600000, cache:{staleTime:60000}});
  }).catch(()=>renderSheetStatus());
}
