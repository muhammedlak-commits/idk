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
  if(!measureOK(st.measure)) st.measure='ord';
  seg('measure','m',st.measure);
  document.querySelectorAll('#measure [data-m="sales"],#measure [data-m="rev"]').forEach(b=>{ const ok=measureOK(b.dataset.m); b.classList.toggle('unavail',!ok); b.title= ok? (b.dataset.m==='sales'?'Sales: the services’ final prices, in IQD':'Company revenue: sales minus provider shares, in IQD') : !S.hasRev? 'Load the latest orders export (Data tab) to see sales and revenue' : 'The loaded export has no new-patient sales, so this view can’t show money'; }); seg('pview','v',S.hasNew?st.pview:'all');
  document.querySelectorAll('#pview [data-v="new"],#pview [data-v="ret"]').forEach(b=>{ b.classList.toggle('unavail',!S.hasNew); b.title= !S.hasNew? 'Load the latest orders export (Data tab) to split orders by new and returning patients' : b.dataset.v==='new'? 'Patients in their first month: '+(st.newBasis==='created'?'the month their record was created':'the month of their first order')+' (change it under More filters)' : 'Patients served in an earlier month'; }); seg('basis','b',st.basis); seg('align','al',st.align); seg('newBasis','n',st.newBasis); seg('adMode','a',st.adMode);
  const ag=document.getElementById('agChips'); ag.hidden=st.adMode!=='pick';
  ag.querySelectorAll('.chip').forEach(b=>{const on=st.adGroups.has(b.dataset.g); b.classList.toggle('on',on); b.classList.toggle('off',!on); b.setAttribute('aria-pressed',on);});
  const bk=document.querySelector('#basis [data-b="booked"]'); if(bk){ bk.classList.toggle('unavail',!P.servicesBooked); bk.title= P.servicesBooked? 'The day the order was booked' : 'Load a booking-time export in the Data tab to use this'; } seg('gran','g',st.gran); seg('trendMode','t',st.trend); seg('momMode','v',st.mom);
  document.getElementById('dFrom').value=toS(st.from); document.getElementById('dTo').value=toS(st.to);
  [['lyToggle','ly'],['holToggle','hol'],['evtToggle','evt'],['cmpToggle','cmp']].forEach(([id,k])=>document.getElementById(id).classList.toggle('on',st[k]));
  syncContext();
}
function preset(p){
  [st.from,st.to]=presetRange(p);
  if(p==='30d'||p==='mtd'||p==='lastm') st.gran='day'; else if(p==='all'||p==='12m') st.gran= p==='all'?'month':'week'; else st.gran='week';
  render();
}
function wireFilters(){
  document.querySelectorAll('#presets button').forEach(b=>b.addEventListener('click',()=>preset(b.dataset.p)));
  document.querySelectorAll('#adMode button').forEach(b=>b.addEventListener('click',()=>setAdMode(b.dataset.a)));
  document.querySelectorAll('#newBasis button').forEach(b=>b.addEventListener('click',()=>{st.newBasis=b.dataset.n; render();}));
  document.querySelectorAll('#align button').forEach(b=>b.addEventListener('click',()=>{st.align=b.dataset.al; lsSet('spl.align',st.align); render();}));
  document.querySelectorAll('#basis button').forEach(b=>b.addEventListener('click',()=>setBasis(b.dataset.b)));
  document.querySelectorAll('#measure button').forEach(b=>b.addEventListener('click',()=>{
    if(!measureOK(b.dataset.m)){ showModule('data',true); showMsg(document.getElementById('msg-orders'),'bad', S.hasRev? 'This orders data has sales but not the new-patient sales columns, so New and Returning can’t show money. Copy the SQL below, run it and drop the CSV here.' : 'This orders data has no sales columns. Copy the SQL below, run it in Metabase and drop the CSV here to see sales and revenue.'); return; }
    st.measure=b.dataset.m; render(); }));
  document.querySelectorAll('#pview button').forEach(b=>b.addEventListener('click',()=>{
    if(b.dataset.v!=='all'&&!S.hasNew){ showModule('data',true); showMsg(document.getElementById('msg-orders'),'bad','This orders data has no new-patient columns. Copy the SQL below, run it in Metabase and drop the CSV here to use New and Returning.'); return; }
    st.pview=b.dataset.v; render(); }));
  document.querySelectorAll('#gran button').forEach(b=>b.addEventListener('click',()=>{st.gran=b.dataset.g;render();}));
  document.querySelectorAll('#trendMode button').forEach(b=>b.addEventListener('click',()=>{st.trend=b.dataset.t;render();}));
  document.querySelectorAll('#momMode button').forEach(b=>b.addEventListener('click',()=>{st.mom=b.dataset.v;renderMom();syncChips();}));
  [['lyToggle','ly'],['holToggle','hol'],['evtToggle','evt'],['cmpToggle','cmp']].forEach(([id,k])=>document.getElementById(id).addEventListener('click',e=>{e.preventDefault(); st[k]=!st[k]; render();}));
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

/* ad groups row: shown only in "Pick ad groups" mode; colours follow each group's all-time spend rank */
function buildAdChips(){
  const box=document.getElementById('agChips'); box.innerHTML='';
  A.groups.forEach((g,i)=>{
    const b=document.createElement('button'); b.type='button'; b.className='chip'; b.dataset.g=g;
    b.innerHTML='<span class="dot" style="background:var(--s'+(i<8?i+1:'-other')+')"></span>'+esc(g);
    b.title='Click to toggle. Double-click to pick only this ad group.';
    b.addEventListener('click',()=>{ st.adGroups.has(g)?st.adGroups.delete(g):st.adGroups.add(g); render(); });
    b.addEventListener('dblclick',()=>{ st.adGroups=new Set([g]); render(); });
    box.appendChild(b);
  });
}
function setAdMode(m){
  if(m==='pick' && !st.adGroups.size) st.adGroups=new Set(groupsForCats(selCats()));   // start from what matches now
  st.adMode=m; render();
}

/* ---------- context bar: popovers, drawer, pill labels ---------- */
const PRESET_LABEL={'30d':'Last 30 days','90d':'Last 90 days',mtd:'This month',lastm:'Last month',ytd:'This year','12m':'Last 12 months',all:'All time'};
function presetRange(p){
  const end=S.max; let a=S.min, b=end;
  if(p==='30d') a=end-29; else if(p==='90d') a=end-89; else if(p==='mtd') a=monthStart(end);
  else if(p==='lastm'){ b=monthStart(end)-1; a=monthStart(b); }
  else if(p==='ytd') a=toN(toS(end).slice(0,4)+'-01-01'); else if(p==='12m') a=toN(addMonths(monthKey(end),-11)+'-01');
  return [Math.max(a,S.min),b];
}
const DEFAULT_STATUS=()=>S.stList.filter(s=>s!=='cancelled');
function moreCount(){
  const def=new Set(DEFAULT_STATUS()); const stSame=st.status.size===def.size&&[...def].every(s=>st.status.has(s));
  return (st.basis!=='scheduled')+(!stSame)+(st.newBasis!=='first')+(st.adMode!=='match')+(st.align!=='hijri')+(st.whyCmp!=='usual');
}
function syncContext(){
  const p=Object.keys(PRESET_LABEL).find(k=>{ const [a,b]=presetRange(k); return a===st.from&&b===st.to; });
  document.getElementById('datePillTxt').innerHTML=(p?esc(PRESET_LABEL[p])+' <span class="sub">'+esc(fmtD(st.from)+' – '+fmtD(st.to))+'</span>':esc(fmtD(st.from)+' – '+fmtD(st.to)));
  document.querySelectorAll('#presets button').forEach(b=>b.classList.toggle('on',b.dataset.p===p));
  const cats=S.order.map(i=>S.catList[i]).filter(c=>st.svc.has(c)), all=cats.length===S.catList.length;
  document.getElementById('svcPillTxt').textContent= all? 'All '+S.catList.length+' services' : !cats.length? 'No services' : cats.length<=2? cats.map(label).join(', ') : cats.length+' services';
  document.getElementById('svcPill').classList.toggle('on',!all);
  const n=moreCount(), c=document.getElementById('moreCount'); c.textContent=n; c.hidden=!n;
  // the plain-words line: what every number on the page is showing
  const CMP={usual:'judged against the <strong>usual move</strong>',prev:'against <strong>the period before</strong>',ly:'against <strong>last year</strong>'};
  const svcTxt= all? 'all '+S.catList.length+' services' : !cats.length? 'no services' : cats.length<=3? cats.map(c=>esc(label(c))).join(', ') : cats.length+' of '+S.catList.length+' services';
  const range= p? esc(PRESET_LABEL[p])+' ('+esc(fmtD(st.from)+' – '+fmtD(st.to))+')' : esc(fmtD(st.from)+' – '+fmtD(st.to));
  const parts=['<strong>'+esc(MLABEL[st.measure].replace(' (IQD)',''))+'</strong>'+(st.pview!=='all'&&S.hasNew?' from '+PVIEW_LABEL[st.pview]:''), svcTxt, '<strong>'+range+'</strong>', CMP[st.whyCmp]||CMP.usual, st.basis==='booked'?'by booking time':'by scheduled time', 'last year by '+(st.align==='hijri'?'Hijri date':'weekday')];
  const excl=S.stList.filter(x=>!st.status.has(x)); if(excl.length) parts.push(excl.join(', ')+' left out');
  document.getElementById('ctxSentence').innerHTML=parts.join(' · ');
  document.querySelectorAll('#cmpWith button').forEach(b=>b.classList.toggle('on',b.dataset.c===st.whyCmp));
}
function closePops(except){
  document.querySelectorAll('.popover').forEach(el=>{ if(el.id===except||el.hidden) return; const had=el.contains(document.activeElement); el.hidden=true; const b=document.querySelector('[aria-controls="'+el.id+'"]'); if(b){ b.setAttribute('aria-expanded','false'); if(had) b.focus(); } });
}
function togglePop(btnId,popId){
  const el=document.getElementById(popId), open=el.hidden; closePops(popId); el.hidden=!open;
  document.getElementById(btnId).setAttribute('aria-expanded',String(open));
}
function setDrawer(open){
  document.getElementById('drawer').hidden=!open; document.getElementById('drawerBack').hidden=!open;
  ['header.top','.filters','main'].forEach(q=>{ const el=document.querySelector(q); if(el) el.inert=open; });   // keep focus inside the drawer
  document.getElementById('moreBtn').setAttribute('aria-expanded',String(open));
  if(open){ closePops(); document.getElementById('drawerClose').focus(); } else document.getElementById('moreBtn').focus();
}
function setCtxOpen(open){ st.ctxOpen=open; document.getElementById('ctxRow').hidden=!open; ['ctxSentence','ctxChange'].forEach(id=>document.getElementById(id).setAttribute('aria-expanded',String(open))); document.getElementById('ctxChange').textContent=open?'Done':'Change'; lsSet('spl.ctx',open?'1':''); }
function wireContext(){
  ['ctxSentence','ctxChange'].forEach(id=>document.getElementById(id).addEventListener('click',()=>setCtxOpen(!st.ctxOpen)));
  setCtxOpen(lsGet('spl.ctx')==='1');
  document.querySelectorAll('#cmpWith button').forEach(b=>b.addEventListener('click',()=>{ st.whyCmp=b.dataset.c; render(); }));
  document.getElementById('datePill').addEventListener('click',e=>{ e.stopPropagation(); togglePop('datePill','datePop'); });
  document.getElementById('svcPill').addEventListener('click',e=>{ e.stopPropagation(); togglePop('svcPill','svcPop'); });
  document.querySelectorAll('.popover').forEach(el=>el.addEventListener('click',e=>e.stopPropagation()));
  document.addEventListener('click',()=>closePops());
  document.addEventListener('keydown',e=>{ if(e.key!=='Escape') return; if(!document.getElementById('drawer').hidden) setDrawer(false); else closePops(); });
  document.getElementById('moreBtn').addEventListener('click',()=>setDrawer(true));
  document.getElementById('drawerClose').addEventListener('click',()=>setDrawer(false));
  document.getElementById('drawerDone').addEventListener('click',()=>setDrawer(false));
  document.getElementById('drawerBack').addEventListener('click',()=>setDrawer(false));
  document.getElementById('drawerReset').addEventListener('click',()=>{
    st.status=new Set(DEFAULT_STATUS()); st.newBasis='first'; st.adMode='match'; st.align='hijri'; st.whyCmp='usual'; lsSet('spl.align','hijri');
    if(st.basis!=='scheduled') setBasis('scheduled'); else render();
  });
  document.getElementById('dataBtn').addEventListener('click',()=>{ showModule(st.mod==='data'?(st.prevMod||'summary'):(st.prevMod=st.mod,'data'),true); window.scrollTo({top:0}); });
}
