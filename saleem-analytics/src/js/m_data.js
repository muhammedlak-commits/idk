/* ---------- data module: drag-and-drop / browse for the two Metabase exports ---------- */
const ORIG={services:P.services, servicesBooked:P.servicesBooked, uniquePatients:P.uniquePatients, followon:P.followon};   // the data built into this page
function dataMeta(){ try{ return JSON.parse(lsGet('spl.meta')||'{}'); }catch(e){ return {}; } }
function setDataMeta(k,v){ const m=dataMeta(); if(v==null) delete m[k]; else m[k]=v; lsSet('spl.meta',JSON.stringify(m)); }
function lsSave(k,v){ try{ localStorage.setItem(k,v); return true; }catch(e){ return false; } }
function lsDel(k){ try{ localStorage.removeItem(k); }catch(e){} }

const DROPS={
  orders:{
    check:hdr=>/service_category/.test(hdr)&&/distinct_orders/.test(hdr)&&/(^|,)day(,|$)/.test(hdr),
    wrong:'This file doesn’t look like the orders export. It needs the columns day, service_category and distinct_orders.',
    apply(text,name){
      const mode=st.ordersMode, key=st.loadBasis==='booked'?'servicesBooked':'services';
      const next= mode==='replace'||!P[key]? text : mergeServices(P[key],text);
      buildServices(next);                  // throws with a readable message if the file can't be used
      P[key]=next;
      const saved=lsSave('spl.'+key,next); lsSave('spl.build',P.built);
      setDataMeta(key==='services'?'orders':'ordersBooked',{name,at:Date.now(),mode});
      return saved;
    },
    reset(){ const key=st.loadBasis==='booked'?'servicesBooked':'services'; P[key]=ORIG[key]; lsDel('spl.'+key); setDataMeta(key==='services'?'orders':'ordersBooked',null); if(key==='servicesBooked'&&!P.servicesBooked) st.basis='scheduled'; }
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
  },
  links:{
    check:hdr=>/service_a/.test(hdr)&&/service_b/.test(hdr)&&/followed_30d/.test(hdr),
    wrong:'This file doesn\u2019t look like the service follow-on export. Run the query from Copy SQL in this box and download its results.',
    apply(text,name){
      if(!buildFollowon(text)) throw new Error('No usable rows found. Check the file has month, service_a, service_b, patients_a and followed_30d columns.');
      P.followon=text;
      const saved=lsSave('spl.followon',text); lsSave('spl.build',P.built);
      setDataMeta('links',{name,at:Date.now()});
      return saved;
    },
    reset(){ P.followon=ORIG.followon; lsDel('spl.followon'); setDataMeta('links',null); }
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
  if(kind==='orders') st.basis=st.loadBasis;   // show what was just loaded
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
  const block=(title,key,m)=>{
    const text=P[key]; if(!text) return '<h4>'+title+'</h4>'+row('Source','Nothing loaded yet. Run the '+(key==='servicesBooked'?'booking':'scheduled')+'-time query and drop it here.');
    const X= (st.basis==='booked')===(key==='servicesBooked')? S : buildServices(text);
    return '<h4>'+title+(((st.basis==='booked')===(key==='servicesBooked'))?' · showing now':'')+'</h4>'+
      row('Source', m? esc(m.name)+' <span class="note">('+(m.mode==='replace'||key==='servicesBooked'&&!ORIG.servicesBooked?'loaded':'added to built-in data')+', '+fmtAt(m.at)+')</span>' : 'Built into this page')+
      row('Dates', fmtD(X.min)+' – '+fmtD(X.max))+row('Rows', X.rowCount.toLocaleString('en-US'))+row('Services', X.C+' categories, '+X.T+' statuses');
  };
  document.getElementById('stat-orders').innerHTML=block('By scheduled time','services',meta.orders)+block('By booking time','servicesBooked',meta.ordersBooked);
  const cur= st.loadBasis==='booked'? meta.ordersBooked : meta.orders;
  const rb=document.getElementById('reset-orders'); rb.hidden=!cur; rb.textContent= st.loadBasis==='booked'? 'Remove loaded booking-time data' : 'Go back to built-in orders data';
  document.querySelectorAll('#loadBasis button').forEach(b=>b.classList.toggle('on',b.dataset.b===st.loadBasis));
  const p=meta.patients;
  const months=U? [...new Set(Object.values(U.by).flatMap(x=>Object.keys(x)))].sort() : [];
  document.getElementById('stat-patients').innerHTML=
    row('Source', p? esc(p.name)+' <span class="note">('+fmtAt(p.at)+')</span>' : (U?'Built into this page':'Nothing loaded yet'))+
    (U? row('Months', fmtM(months[0])+' – '+fmtM(months[months.length-1])+' ('+months.length+')')+row('Categories', U.cats.map(c=>esc(UP_LABEL[c]||label(c))).join(', ')) : '');
  document.getElementById('reset-patients').hidden=!p;
  const l=meta.links, F=buildFollowon(P.followon);
  document.getElementById('stat-links').innerHTML=
    row('Source', l? esc(l.name)+' <span class="note">('+fmtAt(l.at)+')</span>' : (F?'Built into this page':'Nothing loaded yet'))+
    (F? row('Months', fmtM(F.months[0])+' – '+fmtM(F.months[F.months.length-1])+' ('+F.months.length+')')+row('Services', F.cats.map(c=>esc(UP_LABEL[c]||label(c))).join(', ')) : '');
  document.getElementById('reset-links').hidden=!l;
  document.querySelectorAll('#ordersMode button').forEach(b=>b.classList.toggle('on',b.dataset.m===st.ordersMode));
  renderSamples();
}


/* ---------- sample files: what each export should look like ---------- */
const SAMPLES={
  orders:{file:'saleem-orders-sample.csv',
    cols:[['day','Date, YYYY-MM-DD','2026-09-01'],
          ['service_category','Service as Metabase names it','physiotherapy, nursing, doctorVisit, labTest, xRay, physiotherapy (b2b)…'],
          ['visit_status','Visit status','finished, reviewed, started or cancelled (a booking-time file can also have scheduled)'],
          ['services_delivered','Number of services','42'],
          ['distinct_orders','Number of distinct orders','42'],
          ['distinct_patients','Distinct patients that day','41']],
    rules:['One row for each day, service and visit status. Days with nothing for a service can be left out.',
           'Keep the column names as shown. Their order doesn’t matter, and extra columns are ignored.',
           'A time after the date (2026-09-01T00:00:00) is fine. Numbers can have thousands separators.',
           'For a quick update, export only the latest days and use “Add or update days”.',
           'The day is either the scheduled visit date or the booking date. Pick which one under \u201cThis file is dated by\u201d before dropping the file.'],
    csv:'day,service_category,visit_status,services_delivered,distinct_orders,distinct_patients\n2026-09-01,physiotherapy,finished,42,42,41\n2026-09-01,physiotherapy,cancelled,3,3,3\n2026-09-01,nursing,finished,51,50,44\n2026-09-01,nursing,reviewed,6,6,6\n2026-09-01,doctorVisit,finished,14,14,14\n2026-09-01,labTest,finished,13,12,12\n2026-09-01,physiotherapy (b2b),finished,4,4,4\n2026-09-02,physiotherapy,finished,45,45,44\n2026-09-02,nursing,finished,49,48,42\n'},
  patients:{file:'saleem-unique-patients-sample.csv',
    cols:[['month','Month, YYYY-MM','2026-08'],
          ['category','Service type, or all for every service together','all, physiotherapy, nursing, doctorVisit, labTest, radiology…'],
          ['unique_patients','Different patients served that month','1,240'],
          ['new_patients','Of those, first-ever service with Saleem','410'],
          ['returning_patients','Of those, served before','830'],
          ['services','Services delivered to them','3,900'],
          ['new_by_created','Of those, patients whose record was created that month','385'],
          ['accounts_created','Only on all rows: patient records created that month, visited or not','520']],
    rules:['One row per month and category, plus one row per month with category all.',
           'new_patients + returning_patients = unique_patients on every row.',
           'Export the full history with no date filter, otherwise “new” is wrong for the early months.',
           'Older exports without new_by_created still load; Account created then falls back to first order.',
           'The Copy SQL query produces exactly this layout.'],
    csv:'month,category,unique_patients,new_patients,returning_patients,services,new_by_created,accounts_created\n2026-08,all,1240,410,830,3900,385,520\n2026-08,physiotherapy,420,120,300,1410,110,\n2026-08,nursing,380,140,240,1680,131,\n2026-08,doctorVisit,310,130,180,480,122,\n2026-09,all,1180,360,820,3300,340,470\n2026-09,physiotherapy,400,105,295,1030,98,\n2026-09,nursing,370,125,245,1330,117,\n2026-09,doctorVisit,290,115,175,330,108,\n'}
};
SAMPLES.links={file:'saleem-service-followon-sample.csv',
  cols:[['month','Month of the first service, YYYY-MM','2026-08'],['service_a','The first service','doctorVisit'],['service_b','The service that may follow','labTest'],['patients_a','Patients who had service A that month','310'],['followed_7d','Of them, had service B within 7 days after','96'],['followed_30d','Of them, had service B within 30 days after','131']],
  rules:['One row per month and ordered pair of services (doctor visit then lab test is a different row from lab test then doctor visit).','Counts are patients, not visits. Export the full history with no date filter.','The Copy SQL query in this box produces exactly this layout.'],
  csv:'month,service_a,service_b,patients_a,followed_7d,followed_30d\n2026-08,doctorVisit,labTest,310,96,131\n2026-08,doctorVisit,radiology,310,22,35\n2026-08,doctorVisit,nursing,310,18,40\n2026-08,labTest,doctorVisit,280,30,61\n2026-08,physiotherapy,nursing,420,12,25\n'};
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
      DROPS[kind].reset();
      boot(true); showMsg(document.getElementById('msg-'+kind),'good','Back to the data built into this page.');
    });
  }
  document.querySelectorAll('#ordersMode button').forEach(b=>b.addEventListener('click',()=>{ st.ordersMode=b.dataset.m; renderData(); }));
  document.querySelectorAll('#loadBasis button').forEach(b=>b.addEventListener('click',()=>{ st.loadBasis=b.dataset.b; renderData(); }));
  const copy=(txt,label)=>navigator.clipboard.writeText(txt).then(()=>toast(label+' copied')).catch(()=>toast('Copy was blocked by this browser; the queries are in the sql folder'));
  document.getElementById('copySqlSched').addEventListener('click',()=>copy(P.sqlScheduled,'Scheduled-time SQL'));
  document.getElementById('copySqlBooked').addEventListener('click',()=>copy(P.sqlBooked,'Booking-time SQL'));
  document.getElementById('copySql3').addEventListener('click',()=>navigator.clipboard.writeText(P.followonSql).then(()=>toast('Follow-on SQL copied')).catch(()=>toast('Copy was blocked by this browser; the query is in the sql folder')));
  document.getElementById('copySql2').addEventListener('click',()=>navigator.clipboard.writeText(P.uniqueSql).then(()=>toast('SQL copied')).catch(()=>toast('Copy was blocked by this browser; the query is in sql/unique_patients_monthly.sql')));
  // a file dropped anywhere else shouldn't make the browser navigate away from the dashboard
  window.addEventListener('dragover',e=>{ if(!e.target.closest||!e.target.closest('.drop')) e.preventDefault(); });
  window.addEventListener('drop',e=>{ if(!e.target.closest||!e.target.closest('.drop')){ e.preventDefault(); if(e.dataTransfer&&e.dataTransfer.files.length) toast('Drop files on one of the boxes in the Data tab'); } });
}
