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
      const text=await f.text(); const hdr=text.slice(0,500).split(/\r?\n/)[0];
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
