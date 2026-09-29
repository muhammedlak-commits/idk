/* ---------- render ---------- */
/* four sections (plus Data & settings); each shows one or more of the module blocks in the page */
const DRIVERS={patients:renderUnique, providers:()=>{ renderProviders(); renderGateway(); renderGatewayNext(); }, links:renderLinks, ads:renderAds,
  calendar:()=>{ renderHolidays(); renderFactorEffects(); renderEvents(); renderCompetitors(); renderSheetStatus(); }};
const MODULES={
  summary:{mods:()=>['why'], draw:renderWhy},
  performance:{mods:()=>['overview','perf',st.perfTab==='month'?'monthly':st.perfTab==='wd'?'weekday':'services'], draw:()=>{ renderTrend(); renderPerfStrip(); if(st.perfTab==='month') renderMom(); else if(st.perfTab==='wd') renderWeekday(); else renderSvcTable(); }},
  drivers:{mods:()=>['drv',st.drv], draw:()=>{ renderDrvCards(); DRIVERS[st.drv](); }},
  plan:{mods:()=>['projections'], draw:renderProjections},
  data:{mods:()=>['data'], draw:renderData}
};
/* old tab names (links and saved views) land on their new place */
const OLD_TABS={why:['summary'],overview:['performance'],monthly:['performance','month'],services:['performance','svc'],weekday:['performance','wd'],weekdays:['performance','wd'],patients:['drivers','patients'],providers:['drivers','providers'],links:['drivers','links'],ads:['drivers','ads'],calendar:['drivers','calendar'],projections:['plan']};
function resolveMod(m){ const o=OLD_TABS[m]; if(!o) return MODULES[m]? m : 'summary'; if(o[0]==='performance'&&o[1]) st.perfTab=o[1]; if(o[0]==='drivers') st.drv=o[1]; return o[0]; }
/* only the visible section is drawn; switching draws the next one with the current filters */
function render(){
  syncChips();
  (MODULES[st.mod]||MODULES.summary).draw();
  lsSet('spl.view',JSON.stringify({measure:st.measure,gran:st.gran,trend:st.trend,chart:st.chart,mod:st.mod,perfTab:st.perfTab,drv:st.drv}));
}
/* go to a section, optionally a table (performance) or a driver */
function go(sec,sub){ if(sec==='performance'&&sub) st.perfTab=sub; if(sec==='drivers'&&sub) st.drv=sub; showModule(sec,true); window.scrollTo({top:0}); }
function showModule(mod, push){
  mod=resolveMod(mod);
  st.mod=mod;
  const vis=new Set(MODULES[mod].mods());
  document.querySelectorAll('.module').forEach(el=>el.hidden=!vis.has(el.dataset.mod));
  document.querySelectorAll('#drvTabs [data-d]').forEach(b=>{ const on=b.dataset.d===st.drv; b.classList.toggle('on',on); b.setAttribute('aria-selected',on); });
  document.querySelectorAll('#perfTab [data-t]').forEach(b=>b.classList.toggle('on',b.dataset.t===st.perfTab));
  document.querySelectorAll('.tabs [data-mod]').forEach(b=>{ const on=b.dataset.mod===mod; b.setAttribute('aria-selected',on); b.tabIndex=on?0:-1; });
  const db=document.getElementById('dataBtn'); if(db) db.setAttribute('aria-pressed',String(mod==='data'));
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
  if(!reload){ try{ const m=JSON.parse(lsGet('spl.meta')||'{}'); let ch=false; for(const k in m) if(m[k]&&m[k].unsaved){ delete m[k]; ch=true; } if(ch) lsSet('spl.meta',JSON.stringify(m)); }catch(e){} }
  if(!reload && lsGet('spl.build')===P.built){ ['services','servicesBooked','adsDaily','adsMonthly','map','uniquePatients','followon','providers','gateway','gatewayNext','provFollowon'].forEach(k=>{ const v=lsGet('spl.'+k); if(v) P[k]=v; }); }
  if(!reload){ const al=lsGet('spl.align'); if(al==='greg'||al==='hijri') st.align=al; }
  if(!reload){ const b=lsGet('spl.basis'); if(b==='booked'&&P.servicesBooked) st.basis='booked'; }
  if(st.basis==='booked'&&!P.servicesBooked) st.basis='scheduled';
  const prevCats= S? new Set(S.catList) : null, prevStats= S? new Set(S.stList) : null;
  const wasAtEnd = reload && S && st.to===S.max;   // keep following the latest day when new days arrive
  S=buildServices(st.basis==='booked'? P.servicesBooked : P.services); A=buildAds(P.adsDaily,P.adsMonthly,P.map,P.adsAd,P.adMap); U=buildUnique(P.uniquePatients); F=buildFollowon(P.followon); try{ PV=buildProviders(P.providers); }catch(e){ PV=null; } try{ GW=buildGateway(P.gateway); }catch(e){ GW=null; } try{ GN=buildGatewayNext(P.gatewayNext); }catch(e){ GN=null; } try{ PF=buildProvFollowon(P.provFollowon); }catch(e){ PF=null; } loadEvents(); loadCompetitors();
  if(!reload){
    st.svc=new Set(S.catList); st.status=new Set(S.stList.filter(s=>s!=='cancelled'));
    try{ const v=JSON.parse(lsGet('spl.view')||'{}'); if(v.measure) st.measure=v.measure; if(v.trend) st.trend=v.trend; if(['line','bars','share','change','cum'].includes(v.chart)) st.chart=v.chart; if(v.perfTab) st.perfTab=v.perfTab; if(DRIVERS[v.drv]) st.drv=v.drv; if(v.mod) st.mod=resolveMod(v.mod); }catch(e){}
    const h=location.hash.slice(1); if(MODULES[h]||OLD_TABS[h]) st.mod=resolveMod(h);
    buildChips(); buildAdChips(); wireFilters(); wireEvents(); wireFiles(); wireUnique(); wireProjections(); wireData(); wireProviders(); wireGateway(); wireGatewayNext(); wireLinkPick(); wireProvFollowon(); wireWhy(); wirePerf(); wireWeekday(); wireContext(); wireTabs();
    document.querySelectorAll('#lkTabs [data-lk]').forEach(t=>t.addEventListener('click',()=>{ st.lkTab=t.dataset.lk; render(); }));
    document.querySelectorAll('#lkSpan button').forEach(t=>t.addEventListener('click',()=>{ st.lkSpan=t.dataset.s; lsSet('spl.lkSpan',st.lkSpan); render(); }));
    { const ls=lsGet('spl.lkSpan'); if(['12w','26w','52w','all','range'].includes(ls)) st.lkSpan=ls; }
    setTimeout(startSheet,0); setTimeout(cloudInit,0);
    // open on the last complete month, the period the Summary reads best on
    { const endM= monthKey(S.max+1)!==monthKey(S.max)? monthKey(S.max) : addMonths(monthKey(S.max),-1); st.from=Math.max(S.min,toN(endM+'-01')); st.to=Math.min(S.max,toN(endM+'-01')+daysInMonth(endM)-1); st.gran='week'; }
  } else {
    buildAdChips();
    // keep what was selected; anything new in this dataset (e.g. the scheduled status) starts selected, except cancelled
    st.svc=new Set(S.catList.filter(c=> st.svc.has(c) || !prevCats.has(c))); if(!st.svc.size) st.svc=new Set(S.catList);
    st.status=new Set(S.stList.filter(x=> st.status.has(x) || (!prevStats.has(x) && x!=='cancelled')));
    buildChips(); st.to= wasAtEnd? S.max : Math.min(Math.max(st.to,S.min),S.max); st.from=Math.min(Math.max(st.from,S.min),st.to); }
  const dm=document.getElementById('dataMeta'); dm.textContent='Data to '+fmtD(S.max); document.getElementById('dataBtn').title='Data to '+fmtD(S.max)+'. Load or check the exports.'; dm.title='Orders by '+(st.basis==='booked'?'booking':'scheduled')+' time to '+fmtD(S.max)+' · Ads to '+fmtD(A.maxDay);
  document.getElementById('foot').textContent='Service data: Metabase export dated by '+(st.basis==='booked'?'booking time (order created)':'scheduled time (visit date)')+', '+fmtD(S.min)+' – '+fmtD(S.max)+' ('+S.rowCount.toLocaleString('en-US')+' rows). Meta ads: Saleem Ad Account, '+fmtD(A.minDay)+' – '+fmtD(A.maxDay)+', USD. Orders are distinct orders per service per day, so an order with two services counts once in each. Patient-days are distinct patients per service per day added up, so they are not unique patients; that needs a separate export. Holidays use the Umm al-Qura calendar; Iraq sometimes starts a day later on moon sighting. Built '+P.built+'.';
  showModule(st.mod,false);
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>render());
new MutationObserver(()=>render()).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
boot(false);
