/* ---------- UI: filters ---------- */
function buildChips(){
  const box=document.getElementById('svcChips'); box.innerHTML='';
  S.order.map(i=>S.catList[i]).forEach(c=>{
    const b=document.createElement('button'); b.type='button'; b.className='chip'; b.dataset.c=c;
    b.innerHTML='<span class="dot" style="background:'+S.colorOf[c]+'"></span>'+esc(label(c));
    b.title='Click to toggle. Double-click to show only this service.';
    b.addEventListener('click',()=>{ st.svc.has(c)?st.svc.delete(c):st.svc.add(c); render(); });
    b.addEventListener('dblclick',()=>{ st.svc=new Set([c]); render(); });
    box.appendChild(b);
  });
  const sb=document.getElementById('stChips'); sb.innerHTML='';
  S.stList.forEach(s=>{
    const b=document.createElement('button'); b.type='button'; b.className='chip'; b.dataset.s=s; b.textContent=s.charAt(0).toUpperCase()+s.slice(1);
    b.addEventListener('click',()=>{ st.status.has(s)?st.status.delete(s):st.status.add(s); render(); });
    sb.appendChild(b);
  });
}
function syncChips(){
  document.querySelectorAll('#svcChips .chip').forEach(b=>{const on=st.svc.has(b.dataset.c); b.classList.toggle('on',on); b.classList.toggle('off',!on); b.setAttribute('aria-pressed',on);});
  document.querySelectorAll('#stChips .chip').forEach(b=>{const on=st.status.has(b.dataset.s); b.classList.toggle('on',on); b.classList.toggle('off',!on); b.setAttribute('aria-pressed',on);});
  const seg=(id,attr,val)=>document.querySelectorAll('#'+id+' button').forEach(b=>b.classList.toggle('on',b.dataset[attr]===val));
  seg('measure','m',st.measure); seg('basis','b',st.basis);
  const bk=document.querySelector('#basis [data-b="booked"]'); if(bk){ bk.classList.toggle('unavail',!P.servicesBooked); bk.title= P.servicesBooked? 'The day the order was booked' : 'Load a booking-time export in the Data tab to use this'; } seg('gran','g',st.gran); seg('trendMode','t',st.trend); seg('momMode','v',st.mom);
  document.getElementById('dFrom').value=toS(st.from); document.getElementById('dTo').value=toS(st.to);
  [['lyToggle','ly'],['holToggle','hol'],['evtToggle','evt']].forEach(([id,k])=>document.getElementById(id).classList.toggle('on',st[k]));
}
function preset(p){
  const end=S.max; let a=S.min, b=end;
  if(p==='30d') a=end-29; else if(p==='90d') a=end-89; else if(p==='mtd') a=monthStart(end);
  else if(p==='lastm'){ b=monthStart(end)-1; a=monthStart(b); }
  else if(p==='ytd') a=toN(toS(end).slice(0,4)+'-01-01'); else if(p==='12m') a=toN(addMonths(monthKey(end),-11)+'-01');
  st.from=Math.max(a,S.min); st.to=b;
  if(p==='30d'||p==='mtd'||p==='lastm') st.gran='day'; else if(p==='all'||p==='12m') st.gran= p==='all'?'month':'week'; else st.gran='week';
  render();
}
function wireFilters(){
  document.querySelectorAll('#presets button').forEach(b=>b.addEventListener('click',()=>preset(b.dataset.p)));
  document.querySelectorAll('#basis button').forEach(b=>b.addEventListener('click',()=>setBasis(b.dataset.b)));
  document.querySelectorAll('#measure button').forEach(b=>b.addEventListener('click',()=>{st.measure=b.dataset.m;render();}));
  document.querySelectorAll('#gran button').forEach(b=>b.addEventListener('click',()=>{st.gran=b.dataset.g;render();}));
  document.querySelectorAll('#trendMode button').forEach(b=>b.addEventListener('click',()=>{st.trend=b.dataset.t;render();}));
  document.querySelectorAll('#momMode button').forEach(b=>b.addEventListener('click',()=>{st.mom=b.dataset.v;renderMom();syncChips();}));
  [['lyToggle','ly'],['holToggle','hol'],['evtToggle','evt']].forEach(([id,k])=>document.getElementById(id).addEventListener('click',e=>{e.preventDefault(); st[k]=!st[k]; render();}));
  document.getElementById('dFrom').addEventListener('change',e=>{const n=toN(e.target.value); if(isFinite(n)){st.from=Math.max(S.min,Math.min(n,st.to)); render();}});
  document.getElementById('dTo').addEventListener('change',e=>{const n=toN(e.target.value); if(isFinite(n)){st.to=Math.min(S.max,Math.max(n,st.from)); render();}});
  document.querySelectorAll('[data-q]').forEach(b=>b.addEventListener('click',()=>{
    const q=b.dataset.q;
    if(q==='all') st.svc=new Set(S.catList);
    else if(q==='none') st.svc=new Set();
    else if(q==='clinical') st.svc=new Set(S.catList.filter(c=>!QUICK.nonclinical.includes(c)));
    else st.svc=new Set(S.catList.filter(c=>QUICK[q].includes(c)));
    render();
  }));
  document.getElementById('adGroupSel').addEventListener('change',e=>{st.adGroup=e.target.value; renderAds();});
  document.querySelectorAll('#adView button').forEach(b=>b.addEventListener('click',()=>{st.adView=b.dataset.v; st.campSort={k:'spend',dir:-1}; renderAds();}));
  let qT=null; document.getElementById('adQuery').addEventListener('input',e=>{ clearTimeout(qT); qT=setTimeout(()=>{st.adQuery=e.target.value; renderAds();},200); });
  document.getElementById('evCat').addEventListener('change',e=>{st.evCat=e.target.value; renderEvents();});
}


/* which date each order counts on: scheduled visit time (default) or booking time */
function setBasis(b){
  if(b===st.basis) return;
  if(b==='booked' && !P.servicesBooked){
    st.loadBasis='booked'; showModule('data',true);
    showMsg(document.getElementById('msg-orders'),'bad','There\u2019s no booking-time data yet. Copy the booking-time SQL below, run it in Metabase, and drop the CSV here with \u201cBooking time\u201d selected.');
    return;
  }
  st.basis=b; lsSet('spl.basis',b); boot(true);
}
