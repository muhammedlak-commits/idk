/* ---------- data module: drag-and-drop / browse for the two Metabase exports ---------- */
const ORIG={services:P.services, uniquePatients:P.uniquePatients};   // the data built into this page
function dataMeta(){ try{ return JSON.parse(lsGet('spl.meta')||'{}'); }catch(e){ return {}; } }
function setDataMeta(k,v){ const m=dataMeta(); if(v==null) delete m[k]; else m[k]=v; lsSet('spl.meta',JSON.stringify(m)); }
function lsSave(k,v){ try{ localStorage.setItem(k,v); return true; }catch(e){ return false; } }
function lsDel(k){ try{ localStorage.removeItem(k); }catch(e){} }

const DROPS={
  orders:{
    check:hdr=>/service_category/.test(hdr)&&/distinct_orders/.test(hdr)&&/(^|,)day(,|$)/.test(hdr),
    wrong:'This file doesn’t look like the orders export. It needs the columns day, service_category and distinct_orders.',
    apply(text,name){
      const mode=st.ordersMode;
      const next= mode==='replace'? text : mergeServices(P.services,text);
      buildServices(next);                  // throws with a readable message if the file can't be used
      P.services=next;
      const saved=lsSave('spl.services',next); lsSave('spl.build',P.built);
      setDataMeta('orders',{name,at:Date.now(),mode});
      return saved;
    },
    reset(){ P.services=ORIG.services; lsDel('spl.services'); setDataMeta('orders',null); }
  },
  patients:{
    check:hdr=>/unique_patients/.test(hdr)&&/new_patients/.test(hdr),
    wrong:'This file doesn’t look like the unique patients export. Run the query from Copy SQL and download its results.',
    apply(text,name){
      if(!buildUnique(text)) throw new Error('No usable rows found. Check the file has month, category and unique_patients columns.');
      P.uniquePatients=text;
      const saved=lsSave('spl.uniquePatients',text); lsSave('spl.build',P.built);
      setDataMeta('patients',{name,at:Date.now()});
      return saved;
    },
    reset(){ P.uniquePatients=ORIG.uniquePatients; lsDel('spl.uniquePatients'); setDataMeta('patients',null); }
  }
};

async function takeFiles(kind, files){
  const D=DROPS[kind], msg=document.getElementById('msg-'+kind);
  const list=[...files].filter(f=>/\.csv$/i.test(f.name)||/csv|text/.test(f.type));
  if(!list.length){ showMsg(msg,'bad','Only CSV files can be loaded here.'); return; }
  let ok=0, notSaved=false, last='';
  for(const f of list){
    try{
      const text=await f.text(); const hdr=headerLine(text);
      if(!D.check(hdr)) throw new Error(f.name+': '+D.wrong);
      if(!D.apply(text,f.name)) notSaved=true;
      ok++; last=f.name;
    }catch(err){ showMsg(msg,'bad',err.message); }
  }
  if(!ok) return;
  if(kind==='patients') document.getElementById('upCat').innerHTML='';
  boot(true);
  showMsg(msg,'good','Loaded '+(ok>1?ok+' files':last)+'.'+(notSaved?' This browser wouldn’t save it, so it will be gone after a reload.':' Saved in this browser.'));
  toast('Loaded '+(ok>1?ok+' files':last));
}
function headerLine(text){ return splitCsv(text.slice(0,1000).split(/\r?\n/)[0]).map(normHdr).join(','); }
function showMsg(el,tone,text){ el.className='dmsg '+tone; el.textContent=text; el.hidden=false; }

function renderData(){
  const meta=dataMeta();
  const fmtAt=t=>new Date(t).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const row=(k,v)=>'<div><dt>'+k+'</dt><dd>'+v+'</dd></div>';
  const o=meta.orders;
  document.getElementById('stat-orders').innerHTML=
    row('Source', o? esc(o.name)+' <span class="note">('+(o.mode==='replace'?'replaced all':'added to built-in data')+', '+fmtAt(o.at)+')</span>' : 'Built into this page')+
    row('Dates', fmtD(S.min)+' – '+fmtD(S.max))+
    row('Rows', S.rowCount.toLocaleString('en-US'))+
    row('Services', S.C+' categories, '+S.T+' statuses');
  document.getElementById('reset-orders').hidden=!o;
  const p=meta.patients;
  const months=U? [...new Set(Object.values(U.by).flatMap(x=>Object.keys(x)))].sort() : [];
  document.getElementById('stat-patients').innerHTML=
    row('Source', p? esc(p.name)+' <span class="note">('+fmtAt(p.at)+')</span>' : (U?'Built into this page':'Nothing loaded yet'))+
    (U? row('Months', fmtM(months[0])+' – '+fmtM(months[months.length-1])+' ('+months.length+')')+row('Categories', U.cats.map(c=>esc(UP_LABEL[c]||label(c))).join(', ')) : '');
  document.getElementById('reset-patients').hidden=!p;
  document.querySelectorAll('#ordersMode button').forEach(b=>b.classList.toggle('on',b.dataset.m===st.ordersMode));
  renderSamples();
}


/* ---------- sample files: what each export should look like ---------- */
const SAMPLES={
  orders:{file:'saleem-orders-sample.csv',
    cols:[['day','Date, YYYY-MM-DD','2026-09-01'],
          ['service_category','Service as Metabase names it','physiotherapy, nursing, doctorVisit, labTest, xRay, physiotherapy (b2b)…'],
          ['visit_status','Visit status','finished, reviewed, started or cancelled'],
          ['services_delivered','Number of services','42'],
          ['distinct_orders','Number of distinct orders','42'],
          ['distinct_patients','Distinct patients that day','41']],
    rules:['One row for each day, service and visit status. Days with nothing for a service can be left out.',
           'Keep the column names as shown. Their order doesn’t matter, and extra columns are ignored.',
           'A time after the date (2026-09-01T00:00:00) is fine. Numbers can have thousands separators.',
           'For a quick update, export only the latest days and use “Add or update days”.'],
    csv:'day,service_category,visit_status,services_delivered,distinct_orders,distinct_patients\n2026-09-01,physiotherapy,finished,42,42,41\n2026-09-01,physiotherapy,cancelled,3,3,3\n2026-09-01,nursing,finished,51,50,44\n2026-09-01,nursing,reviewed,6,6,6\n2026-09-01,doctorVisit,finished,14,14,14\n2026-09-01,labTest,finished,13,12,12\n2026-09-01,physiotherapy (b2b),finished,4,4,4\n2026-09-02,physiotherapy,finished,45,45,44\n2026-09-02,nursing,finished,49,48,42\n'},
  patients:{file:'saleem-unique-patients-sample.csv',
    cols:[['month','Month, YYYY-MM','2026-08'],
          ['category','Service type, or all for every service together','all, physiotherapy, nursing, doctorVisit, labTest, radiology…'],
          ['unique_patients','Different patients served that month','1,240'],
          ['new_patients','Of those, first-ever service with Saleem','410'],
          ['returning_patients','Of those, served before','830'],
          ['services','Services delivered to them','3,900']],
    rules:['One row per month and category, plus one row per month with category all.',
           'new_patients + returning_patients = unique_patients on every row.',
           'Export the full history with no date filter, otherwise “new” is wrong for the early months.',
           'The Copy SQL query produces exactly this layout.'],
    csv:'month,category,unique_patients,new_patients,returning_patients,services\n2026-08,all,1240,410,830,3900\n2026-08,physiotherapy,420,120,300,1410\n2026-08,nursing,380,140,240,1680\n2026-08,doctorVisit,310,130,180,480\n2026-09,all,1180,360,820,3300\n2026-09,physiotherapy,400,105,295,1030\n2026-09,nursing,370,125,245,1330\n2026-09,doctorVisit,290,115,175,330\n'}
};
let downloadsApi;   // undefined = not checked yet, null = not available in this view
function renderSamples(){
  for(const [kind,s] of Object.entries(SAMPLES)){
    const box=document.getElementById('sample-'+kind); if(box.dataset.done) continue; box.dataset.done='1';
    const lines=s.csv.trim().split('\n'), hdr=lines[0].split(',');
    box.innerHTML='<h3>How the file should look</h3>'+
      '<div class="tablewrap"><table class="coltable"><thead><tr><th class="nosort">Column</th><th class="nosort">What it holds</th><th class="nosort">Example</th></tr></thead><tbody>'+
      s.cols.map(c=>'<tr><td><code>'+esc(c[0])+'</code></td><td>'+esc(c[1])+'</td><td>'+esc(c[2])+'</td></tr>').join('')+'</tbody></table></div>'+
      '<ul class="assume">'+s.rules.map(r=>'<li>'+esc(r)+'</li>').join('')+'</ul>'+
      '<p class="note" style="margin:12px 0 4px">Sample file (example values, not your data):</p>'+
      '<div class="tablewrap"><table class="sampletable"><thead><tr>'+hdr.map(h=>'<th class="nosort">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+
      lines.slice(1).map(l=>'<tr>'+splitCsv(l).map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'+
      '<div class="frow" style="margin-top:10px"><button class="btn" type="button" data-save="'+kind+'" hidden>Save sample file</button><button class="btn" type="button" data-copy="'+kind+'">Copy sample</button></div>';
    box.querySelector('[data-copy]').addEventListener('click',()=>navigator.clipboard.writeText(s.csv).then(()=>toast('Sample copied. Paste it into a text file saved as .csv')).catch(()=>toast('Copy was blocked by this browser')));
    box.querySelector('[data-save]').addEventListener('click',async()=>{
      try{ await downloadsApi.save({filename:s.file,data:s.csv}); toast('Sample saved'); }
      catch(e){ if(e&&e.code==='declined') return; toast(e&&e.code==='rate_limited'?'A save is already waiting for you':'Saving isn’t available here. Use Copy sample instead.'); }
    });
  }
  if(downloadsApi===undefined){
    downloadsApi=null;
    const use=window.claude&&window.claude.use;
    if(use) Promise.resolve(window.claude.use('downloads')).then(api=>{ downloadsApi=api; document.querySelectorAll('[data-save]').forEach(b=>b.hidden=!api); }).catch(()=>{});
  } else document.querySelectorAll('[data-save]').forEach(b=>b.hidden=!downloadsApi);
}
function wireData(){
  for(const kind of Object.keys(DROPS)){
    const zone=document.getElementById('drop-'+kind), inp=document.getElementById('file-'+kind);
    zone.addEventListener('click',()=>inp.click());
    zone.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); inp.click(); } });
    inp.addEventListener('change',()=>{ takeFiles(kind,inp.files).finally(()=>inp.value=''); });
    let depth=0;
    zone.addEventListener('dragenter',e=>{ e.preventDefault(); depth++; zone.classList.add('over'); });
    zone.addEventListener('dragover',e=>{ e.preventDefault(); e.dataTransfer.dropEffect='copy'; });
    zone.addEventListener('dragleave',()=>{ if(--depth<=0){ depth=0; zone.classList.remove('over'); } });
    zone.addEventListener('drop',e=>{ e.preventDefault(); depth=0; zone.classList.remove('over'); if(e.dataTransfer.files.length) takeFiles(kind,e.dataTransfer.files); });
    document.getElementById('reset-'+kind).addEventListener('click',()=>{
      DROPS[kind].reset(); if(kind==='patients') document.getElementById('upCat').innerHTML='';
      boot(true); showMsg(document.getElementById('msg-'+kind),'good','Back to the data built into this page.');
    });
  }
  document.querySelectorAll('#ordersMode button').forEach(b=>b.addEventListener('click',()=>{ st.ordersMode=b.dataset.m; renderData(); }));
  document.getElementById('copySql2').addEventListener('click',()=>navigator.clipboard.writeText(P.uniqueSql).then(()=>toast('SQL copied')).catch(()=>toast('Copy was blocked by this browser; the query is in sql/unique_patients_monthly.sql')));
  // a file dropped anywhere else shouldn't make the browser navigate away from the dashboard
  window.addEventListener('dragover',e=>{ if(!e.target.closest||!e.target.closest('.drop')) e.preventDefault(); });
  window.addEventListener('drop',e=>{ if(!e.target.closest||!e.target.closest('.drop')){ e.preventDefault(); if(e.dataTransfer&&e.dataTransfer.files.length) toast('Drop files on one of the boxes in the Data tab'); } });
}
