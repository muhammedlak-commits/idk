/* ---------- unique patients (separate monthly export) ----------
   Follows the top filter: all services selected -> the "all" rows (each patient once);
   otherwise the export category of each selected service. Unique patients can't be added
   across categories, so several categories are shown side by side, never summed. */
const UP_LABEL={all:'All services',physiotherapy:'Physiotherapy','physiotherapy (b2b)':'Physiotherapy B2B',nursing:'Nursing',doctorVisit:'Doctor visit',labTest:'Lab tests',radiology:'Radiology',surgeries:'Surgeries',booking:'Booking',eyeExam:'Eye exam',ambulance:'Ambulance',vendor:'Products'};
/* dashboard service -> the category the patients export uses (service types in the database) */
const UP_CAT={physiotherapy:'physiotherapy','physiotherapy (b2b)':'physiotherapy (b2b)',nursing:'nursing',doctorVisit:'doctorVisit',labTest:'labTest',
  xRay:'radiology',ultrasound:'radiology',echocardiogram:'radiology',doppler:'radiology',surgeries:'surgeries',booking:'booking',eyeExam:'eyeExam',ambulance:'ambulance',productPurchase:'vendor',radiology:'radiology',vendor:'vendor'};   // radiology/vendor: exports that use database service types
let U=null, upChart=null;
function buildUnique(text){
  if(!text||!text.trim()) return null;
  const rows=parseCsvObjects(text); if(!rows.length||!('unique_patients' in rows[0])) return null;
  const hasCreated='new_by_created' in rows[0];
  const by={};
  rows.forEach(r=>{ const m=(r.month||'').match(/(\d{4})-(\d{2})/); const mk=m? m[1]+'-'+m[2] : (isFinite(Date.parse(r.month))? new Date(Date.parse(r.month)).toISOString().slice(0,7):null); if(!mk) return;
    const c=r.category||'all';
    (by[c]||(by[c]={}))[mk]={u:num(r.unique_patients),n:num(r.new_patients),s:num(r.services),nc:hasCreated?num(r.new_by_created):null,ac:hasCreated&&r.accounts_created!==''?num(r.accounts_created):null}; });
  const cats=Object.keys(by).sort((a,b)=> a==='all'?-1: b==='all'?1 : sumU(by[b])-sumU(by[a]));
  function sumU(o){return Object.values(o).reduce((s,x)=>s+x.u,0)}
  return {by,cats,hasCreated};
}
/* which export categories the top filter points at */
function upCategories(){
  const cats=selCats(); if(!cats.length) return {list:[],missing:[]};
  if(S.catList.every(c=>st.svc.has(c))) return {list:U.by.all?['all']:[],missing:[]};
  const list=[], missing=[];
  cats.forEach(c=>{ const k=UP_CAT[c]; if(k&&U.by[k]){ if(!list.includes(k)) list.push(k); } else missing.push(c); });
  return {list,missing};
}
function newOf(x){ return st.newBasis==='created' && x.nc!=null ? x.nc : x.n; }
function renderUnique(){
  const empty=document.getElementById('upEmpty'), body=document.getElementById('upBody');
  if(!U){ empty.hidden=false; body.hidden=true; return; }
  empty.hidden=true; body.hidden=false;
  const basisTxt= st.newBasis==='created'? 'patient record created that month' : 'first-ever visit that month';
  const {list,missing}=upCategories();
  const note=document.getElementById('upNote');
  const notes=[];
  if(st.newBasis==='created'&&!U.hasCreated) notes.push('This export has no account-created column, so new patients use the first visit. Run the latest Copy SQL query to get both.');
  if(missing.length) notes.push('Not in the patients export as separate categories: '+missing.map(label).join(', ')+'. They are counted inside their parent service type.');
  if(list.length>1) notes.push('Unique patients can’t be added across services, so each selected service is shown on its own.');
  note.textContent=notes.join(' '); note.hidden=!notes.length;
  if(!list.length){ if(upChart){upChart.destroy();upChart=null;} document.getElementById('upTable').innerHTML=''; document.getElementById('upLegend').innerHTML=''; return; }
  const months=[]; for(let mk=monthKey(st.from); mk<=monthKey(st.to); mk=addMonths(mk,1)) if(list.some(c=>U.by[c][mk])) months.push(mk);
  const o=baseOpts();
  let ds;
  if(list.length===1){
    const d=U.by[list[0]];
    o.scales.x.stacked=true; o.scales.y.stacked=true;
    o.plugins.tooltip.callbacks={label:it=>' '+it.dataset.label+': '+fmtInt(it.parsed.y),footer:items=>' Unique patients: '+fmtInt(items.reduce((s,x)=>s+x.parsed.y,0))};
    ds=[{label:'Returning',data:months.map(m=>d[m]?d[m].u-newOf(d[m]):null),backgroundColor:css('--s1')},{label:'New ('+basisTxt+')',data:months.map(m=>d[m]?newOf(d[m]):null),backgroundColor:css('--s3')}];
    ds.forEach(x=>{x.borderColor=css('--surface'); x.borderWidth={top:2,bottom:0,left:0,right:0}; x.borderSkipped=false; x.maxBarThickness=28;});
  } else {
    o.plugins.tooltip.callbacks={label:it=>' '+it.dataset.label+': '+fmtInt(it.parsed.y)};
    ds=list.map((c,i)=>{ const svc=S.catList.find(x=>UP_CAT[x]===c); const col=svc? css(S.colorOf[svc].slice(4,-1)) : css('--s'+(i+1));
      return {type:'line',label:UP_LABEL[c]||c,data:months.map(m=>U.by[c][m]?U.by[c][m].u:null),borderColor:col,backgroundColor:col,borderWidth:2,pointRadius:0,pointHoverRadius:4,tension:.25}; });
  }
  if(upChart) upChart.destroy();
  upChart=new Chart(document.getElementById('upChart'),{type:list.length===1?'bar':'line',data:{labels:months.map(fmtM),datasets:ds},options:o});
  document.getElementById('upLegend').innerHTML=ds.map(x=>'<span><i class="'+(list.length===1?'box':'')+'" style="background:'+(x.backgroundColor||x.borderColor)+'"></i>'+esc(x.label)+'</span>').join('');
  document.getElementById('upH').textContent='Unique patients · '+list.map(c=>UP_LABEL[c]||c).join(', ');
  const pc=(a,b)=>a!=null&&b? (a-b)/b*100 : null, cls=v=>v==null?'':v>0.5?'pos':v<-0.5?'neg':'';
  const partialOf=mk=> mk===monthKey(S.max) && S.max < toN(mk+'-01')+daysInMonth(mk)-1;
  let head, rows;
  if(list.length===1){
    const d=U.by[list[0]], showAcc=list[0]==='all'&&U.hasCreated;
    head='<th class="nosort">Month</th><th class="nosort">Unique patients</th><th class="nosort">New</th><th class="nosort">Returning</th><th class="nosort">New share</th><th class="nosort">MoM</th><th class="nosort">YoY</th><th class="nosort">Services per patient</th>'+(showAcc?'<th class="nosort">Records created</th>':'');
    rows=months.slice().reverse().map(mk=>{const x=d[mk]; if(!x) return ''; const pm=d[addMonths(mk,-1)], py=d[addMonths(mk,-12)], n=newOf(x);
      const mom=pc(x.u,pm&&pm.u), yoy=pc(x.u,py&&py.u);
      return '<tr><td>'+fmtM(mk)+(partialOf(mk)?' (partial)':'')+'</td><td>'+fmtInt(x.u)+'</td><td>'+fmtInt(n)+'</td><td>'+fmtInt(x.u-n)+'</td><td>'+(x.u?(n/x.u*100).toFixed(0)+'%':'–')+'</td><td class="'+cls(mom)+'">'+fmtPct(mom,1)+'</td><td class="'+cls(yoy)+'">'+fmtPct(yoy,1)+'</td><td>'+(x.u?(x.s/x.u).toFixed(1):'–')+'</td>'+(showAcc?'<td>'+(x.ac==null?'–':fmtInt(x.ac))+'</td>':'')+'</tr>';}).join('');
  } else {
    head='<th class="nosort">Month</th>'+list.map(c=>'<th class="nosort">'+esc(UP_LABEL[c]||c)+'<br><span class="note">unique · new</span></th>').join('');
    rows=months.slice().reverse().map(mk=>'<tr><td>'+fmtM(mk)+(partialOf(mk)?' (partial)':'')+'</td>'+list.map(c=>{const x=U.by[c][mk]; return '<td>'+(x? fmtInt(x.u)+' · '+fmtInt(newOf(x)) : '–')+'</td>';}).join('')+'</tr>').join('');
  }
  document.getElementById('upTable').innerHTML='<thead><tr>'+head+'</tr></thead><tbody>'+rows+'</tbody>';
}
function wireUnique(){
  document.getElementById('copySql').addEventListener('click',()=>navigator.clipboard.writeText(P.uniqueSql).then(()=>toast('SQL copied')).catch(()=>toast('Copy was blocked by this browser; the query is in sql/unique_patients_monthly.sql')));
}
