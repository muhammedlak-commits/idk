/* ---------- unique patients (separate monthly export) ---------- */
const UP_LABEL={all:'All services (each patient once)',physiotherapy:'Physiotherapy','physiotherapy (b2b)':'Physiotherapy B2B',nursing:'Nursing',doctorVisit:'Doctor visit',labTest:'Lab tests',radiology:'Radiology (X-ray, ultrasound, echo, doppler)',surgeries:'Surgeries',booking:'Booking',eyeExam:'Eye exam',ambulance:'Ambulance',vendor:'Products'};
let U=null, upChart=null;
function buildUnique(text){
  if(!text||!text.trim()) return null;
  const rows=parseCsvObjects(text); if(!rows.length||!('unique_patients' in rows[0])) return null;
  const by={};
  rows.forEach(r=>{ const m=(r.month||'').match(/(\d{4})-(\d{2})/); const mk=m? m[1]+'-'+m[2] : (isFinite(Date.parse(r.month))? new Date(Date.parse(r.month)).toISOString().slice(0,7):null); if(!mk) return;
    const c=r.category||'all'; (by[c]||(by[c]={}))[mk]={u:+r.unique_patients||0,n:+r.new_patients||0,r:+r.returning_patients||0,s:+r.services||0}; });
  const cats=Object.keys(by).sort((a,b)=> a==='all'?-1: b==='all'?1 : sumU(by[b])-sumU(by[a]));
  function sumU(o){return Object.values(o).reduce((s,x)=>s+x.u,0)}
  return {by,cats};
}
function renderUnique(){
  const empty=document.getElementById('upEmpty'), body=document.getElementById('upBody'), sel=document.getElementById('upCat');
  if(!U){ empty.hidden=false; body.hidden=true; sel.hidden=true; return; }
  empty.hidden=true; body.hidden=false; sel.hidden=false;
  if(!sel.options.length){ sel.innerHTML=U.cats.map(c=>'<option value="'+esc(c)+'">'+esc(UP_LABEL[c]||label(c))+'</option>').join(''); }
  if(!st.upCat||!U.by[st.upCat]) st.upCat=U.cats[0]; sel.value=st.upCat;
  const d=U.by[st.upCat]; const months=[]; for(let mk=monthKey(st.from); mk<=monthKey(st.to); mk=addMonths(mk,1)) if(d[mk]) months.push(mk);
  const o=baseOpts(); o.scales.x.stacked=true; o.scales.y.stacked=true;
  o.plugins.tooltip.callbacks={label:it=>' '+it.dataset.label+': '+fmtInt(it.parsed.y),footer:items=>' Unique patients: '+fmtInt(items.reduce((s,x)=>s+x.parsed.y,0))};
  const ds=[{label:'Returning',data:months.map(m=>d[m].r),backgroundColor:css('--s1')},{label:'New',data:months.map(m=>d[m].n),backgroundColor:css('--s3')}];
  ds.forEach(x=>{x.borderColor=css('--surface'); x.borderWidth={top:2,bottom:0,left:0,right:0}; x.borderSkipped=false; x.maxBarThickness=28;});
  if(upChart) upChart.destroy();
  upChart=new Chart(document.getElementById('upChart'),{type:'bar',data:{labels:months.map(fmtM),datasets:ds},options:o});
  document.getElementById('upLegend').innerHTML=ds.map(x=>'<span><i class="box" style="background:'+x.backgroundColor+'"></i>'+x.label+'</span>').join('');
  const pc=(a,b)=>a!=null&&b? (a-b)/b*100 : null, cls=v=>v==null?'':v>0.5?'pos':v<-0.5?'neg':'';
  const rows=months.slice().reverse().map(mk=>{const x=d[mk], pm=d[addMonths(mk,-1)], py=d[addMonths(mk,-12)];
    const partial = mk===monthKey(S.max) && S.max < toN(mk+'-01')+daysInMonth(mk)-1;
    const mom=pc(x.u,pm&&pm.u), yoy=pc(x.u,py&&py.u);
    return '<tr><td>'+fmtM(mk)+(partial?' (partial)':'')+'</td><td>'+fmtInt(x.u)+'</td><td>'+fmtInt(x.n)+'</td><td>'+fmtInt(x.r)+'</td><td>'+(x.u?(x.n/x.u*100).toFixed(0)+'%':'–')+'</td><td class="'+cls(mom)+'">'+fmtPct(mom,1)+'</td><td class="'+cls(yoy)+'">'+fmtPct(yoy,1)+'</td><td>'+(x.u?(x.s/x.u).toFixed(1):'–')+'</td></tr>';}).join('');
  document.getElementById('upTable').innerHTML='<thead><tr><th class="nosort">Month</th><th class="nosort">Unique patients</th><th class="nosort">New</th><th class="nosort">Returning</th><th class="nosort">New share</th><th class="nosort">MoM</th><th class="nosort">YoY</th><th class="nosort">Services per patient</th></tr></thead><tbody>'+rows+'</tbody>';
}
function wireUnique(){
  document.getElementById('upCat').addEventListener('change',e=>{st.upCat=e.target.value; renderUnique();});
  document.getElementById('copySql').addEventListener('click',()=>navigator.clipboard.writeText(P.uniqueSql).then(()=>toast('SQL copied')).catch(()=>toast('Copy was blocked by this browser; the query is in sql/unique_patients_monthly.sql')));
}
