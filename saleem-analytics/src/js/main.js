/* ---------- render ---------- */
const MODULES={
  overview:()=>{ renderKpis(); renderTrend(); },
  monthly:renderMom, services:renderSvcTable, patients:renderUnique, ads:renderAds,
  projections:renderProjections, calendar:()=>{ renderHolidays(); renderEvents(); }, data:renderData
};
/* only the visible module is drawn; switching tabs draws the next one with the current filters */
function render(){
  syncChips();
  (MODULES[st.mod]||MODULES.overview)();
  lsSet('spl.view',JSON.stringify({measure:st.measure,gran:st.gran,trend:st.trend,mod:st.mod}));
}
function showModule(mod, push){
  if(!MODULES[mod]) mod='overview';
  st.mod=mod;
  document.querySelectorAll('.module').forEach(el=>el.hidden=el.dataset.mod!==mod);
  document.querySelectorAll('.tabs [data-mod]').forEach(b=>{ const on=b.dataset.mod===mod; b.setAttribute('aria-selected',on); b.tabIndex=on?0:-1; });
  if(push) try{ history.replaceState(null,'','#'+mod); }catch(e){}
  render();
}
function wireTabs(){
  const tabs=[...document.querySelectorAll('.tabs [data-mod]')];
  tabs.forEach((b,i)=>{
    b.addEventListener('click',()=>{ showModule(b.dataset.mod,true); window.scrollTo({top:0}); });
    b.addEventListener('keydown',e=>{ if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft') return; const n=tabs[(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length]; n.focus(); showModule(n.dataset.mod,true); });
  });
  window.addEventListener('hashchange',()=>{ const h=location.hash.slice(1); if(h&&h!==st.mod) showModule(h,false); });
}
function boot(reload){
  // files loaded in this browser are reused until a newer build of the page replaces them
  if(!reload && lsGet('spl.build')===P.built){ ['services','servicesBooked','adsDaily','adsMonthly','map','uniquePatients'].forEach(k=>{ const v=lsGet('spl.'+k); if(v) P[k]=v; }); }
  if(!reload){ const b=lsGet('spl.basis'); if(b==='booked'&&P.servicesBooked) st.basis='booked'; }
  if(st.basis==='booked'&&!P.servicesBooked) st.basis='scheduled';
  const prevCats= S? new Set(S.catList) : null, prevStats= S? new Set(S.stList) : null;
  const wasAtEnd = reload && S && st.to===S.max;   // keep following the latest day when new days arrive
  S=buildServices(st.basis==='booked'? P.servicesBooked : P.services); A=buildAds(P.adsDaily,P.adsMonthly,P.map); U=buildUnique(P.uniquePatients); loadEvents();
  if(!reload){
    st.svc=new Set(S.catList); st.status=new Set(S.stList.filter(s=>s!=='cancelled'));
    try{ const v=JSON.parse(lsGet('spl.view')||'{}'); if(v.measure) st.measure=v.measure; if(v.trend) st.trend=v.trend; if(v.mod) st.mod=v.mod; }catch(e){}
    const h=location.hash.slice(1); if(MODULES[h]) st.mod=h;
    buildChips(); wireFilters(); wireEvents(); wireFiles(); wireUnique(); wireProjections(); wireData(); wireTabs();
    st.to=S.max; st.from=Math.max(S.min, toN(addMonths(monthKey(S.max),-11)+'-01')); st.gran='week';
  } else {
    // keep what was selected; anything new in this dataset (e.g. the scheduled status) starts selected, except cancelled
    st.svc=new Set(S.catList.filter(c=> st.svc.has(c) || !prevCats.has(c))); if(!st.svc.size) st.svc=new Set(S.catList);
    st.status=new Set(S.stList.filter(x=> st.status.has(x) || (!prevStats.has(x) && x!=='cancelled')));
    buildChips(); st.to= wasAtEnd? S.max : Math.min(Math.max(st.to,S.min),S.max); st.from=Math.min(Math.max(st.from,S.min),st.to); }
  document.getElementById('dataMeta').textContent='Orders by '+(st.basis==='booked'?'booking':'scheduled')+' time to '+fmtD(S.max)+' · Ads to '+fmtD(A.maxDay);
  document.getElementById('foot').textContent='Service data: Metabase export dated by '+(st.basis==='booked'?'booking time (order created)':'scheduled time (visit date)')+', '+fmtD(S.min)+' – '+fmtD(S.max)+' ('+S.rowCount.toLocaleString('en-US')+' rows). Meta ads: Saleem Ad Account, '+fmtD(A.minDay)+' – '+fmtD(A.maxDay)+', USD. Orders are distinct orders per service per day, so an order with two services counts once in each. Patient-days are distinct patients per service per day added up, so they are not unique patients; that needs a separate export. Holidays use the Umm al-Qura calendar; Iraq sometimes starts a day later on moon sighting. Built '+P.built+'.';
  showModule(st.mod,false);
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>render());
new MutationObserver(()=>render()).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
boot(false);
