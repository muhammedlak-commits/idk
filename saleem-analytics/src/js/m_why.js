/* ---------- What changed and why ----------
   Compares the chosen date range with the period before it (or the same days last year) for the
   services, statuses, measure and patient view picked above, and splits the change into:
     calendar   : weekdays and official holidays, using each holiday's measured past effect
     events     : outside events from the Google Sheet (salary delays, security, sudden holidays…)
     ads        : Meta spend change × the link between spend and this measure over the past year
     the rest   : whatever those three don't account for (trend, prices, operations, word of mouth…)
   Each step is applied to what the previous steps leave, so the bars add up to the real change.
   Then it shows where the change landed: by service, new vs returning patients, and providers. */
let whyChart=null;
function whyPeriods(){
  const a=st.from, b=st.to, len=b-a+1;
  if(st.whyCmp==='ly'){ const s_=lyShift(a); return {a,b,pa:a-s_,pb:b-s_,lab:'the same '+(st.align==='hijri'?'Hijri dates':'weekdays')+' last year',short:'last year'}; }
  return {a,b,pa:a-len,pb:a-1,lab:'the '+len+' days before',short:'the period before',usual:st.whyCmp==='usual'};
}
const whyClamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));

/* weekday index from the year up to `hi`, holiday days left out; 1 = an average day */
function whyWeekday(y,hi){
  const s={}, c={}; let tot=0, cnt=0;
  for(let n=Math.max(S.min,hi-363);n<=hi;n++){ if(holKeysOn(n).length) continue; const d=dow(n), v=y[n-S.min]; s[d]=(s[d]||0)+v; c[d]=(c[d]||0)+1; tot+=v; cnt++; }
  const mean=cnt? tot/cnt : 0, idx={};
  for(let d=0;d<7;d++) idx[d]= mean>0&&c[d]? whyClamp(s[d]/c[d]/mean,0.2,3) : 1;
  return idx;
}
/* holiday multiplier for a day, from the measured average effect of each holiday type */
function whyHolMult(n,eff){
  const h=hijri(n); let m=1; const names=[];
  for(const H of HOLS){ if(!H.t(h,n)) continue; const key=H.k==='fixed'? 'fixed:'+FIXED[toS(n).slice(5)] : H.k, name=H.k==='fixed'? FIXED[toS(n).slice(5)] : H.name;
    names.push(name); const e=eff[key]; if(e!=null) m*=whyClamp(1+e/100,0.2,2.5); }
  return {m,names};
}
/* sheet events that the Calendar tab can measure (not Marketing, at most two weeks long) */
const whyEvents=(a,b)=>EVENTS.filter(e=>e.cat!=='Marketing'&&e.e-e.s<=14&&e.e>=a&&e.s<=b);

function whyCompute(){
  const P_=whyPeriods(), cats=selCats(), stats=selStats(), m=st.measure;
  if(!covered(P_.pa,P_.pb)) return {err:'The comparison period ('+fmtD(P_.pa)+' – '+fmtD(P_.pb)+') is before the first day of data ('+fmtD(S.min)+'). Pick a later range or compare with the period before.'};
  const y=series(S.min,S.max,m,cats,stats), sumY=(a,b)=>{ let t=0; for(let n=a;n<=b;n++) t+=y[n-S.min]; return t; };
  const cur=sumY(P_.a,P_.b), base=sumY(P_.pa,P_.pb);
  if(!(base>0)) return {err:'There is nothing to compare with in '+P_.lab+' for this selection.'};
  // calendar: expected level of each period from weekdays and holidays alone
  const wd=whyWeekday(y,P_.a-1), hol={}; holidayEffects(cats,stats,m,P_.a-1).forEach(r=>{ hol[r.key]=r.avg; });
  const fx={}; factorEffects(cats,stats,m).catRows.forEach(r=>{ if(r.avg!=null) fx[r.c]=r.avg; });
  const cal=(a,b)=>{ let e=0, ev=0; const hs={}, es=new Map();
    const evs=whyEvents(a,b);
    for(let n=a;n<=b;n++){ const H=whyHolMult(n,hol); H.names.forEach(x=>hs[x]=(hs[x]||0)+1);
      const w=wd[dow(n)]*H.m; e+=w;
      let em=1; const seen=new Set(); for(const x of evs){ if(n<x.s||n>x.e) continue; es.set(x,true); if(seen.has(x.cat)) continue; seen.add(x.cat); if(fx[x.cat]!=null) em*=whyClamp(1+fx[x.cat]/100,0.3,2); }
      ev+=w*em; }
    return {e, ev, hols:hs, evs:[...es.keys()]}; };
  const C1=cal(P_.a,P_.b), C0=cal(P_.pa,P_.pb);
  const rCal=C1.e/C0.e, rEv=(C1.ev/C1.e)/(C0.ev/C0.e);
  // ads: weekly log changes of spend vs this measure over the year before the range; best of lags 0-2 weeks, positive links only
  const groups=spendGroups(), spendOf=(a,b)=>sum(adDaily(a,b,groups));
  const sp1=spendOf(P_.a,P_.b), sp0=spendOf(P_.pa,P_.pb);
  let ads={beta:0,k:null,r:null,ok:false,sp1,sp0,why:''};
  if(sp0>0&&sp1>0){
    const end=P_.a-1, w0=weekStart(end-363)+7, W=[], Sp=[];
    for(let w=w0; w+6<=end; w+=7){ if(w<S.min||w<A.minDay||w+6>A.maxDay) continue; W.push(sumY(w,w+6)); Sp.push(spendOf(w,w+6)); }
    const d=v=>v.slice(1).map((x,i)=>Math.log1p(Math.max(0,x))-Math.log1p(Math.max(0,v[i])));
    const dy=d(W), dx=d(Sp); let best=null;
    for(let k=0;k<=2;k++){ const xs=[], ys=[]; for(let t=0;t+k<dy.length;t++){ xs.push(dx[t]); ys.push(dy[t+k]); }
      const r=corr(xs,ys); if(r==null||xs.length<16) continue; const ne=effN(xs,ys), pass=r>1.96/Math.sqrt(ne);
      const sd=v=>{ const mu=v.reduce((s,x)=>s+x,0)/v.length; return Math.sqrt(v.reduce((s,x)=>s+(x-mu)**2,0)/v.length); };
      const beta=sd(xs)? r*sd(ys)/sd(xs) : 0;
      if(pass&&(!best||r>best.r)) best={k,r,beta:whyClamp(beta,0,1)}; }
    if(best) ads={...ads,...best,ok:true};
    else ads.why='week-to-week changes in spend haven’t lined up with this measure over the past year';
  } else ads.why= sp0||sp1? 'there was no matching ad spend in one of the periods' : 'no matching ad spend in either period';
  const rAd= ads.ok? Math.exp(ads.beta*Math.log(sp1/sp0)) : 1;
  // vs usual move: the same pair of periods in earlier years, calendar-adjusted, is the seasonal norm
  let U=null, rSea=1;
  if(P_.usual){ U=usualMove(P_.a,P_.b,P_.pa,P_.pb,cats,stats,m,(x,z)=>sumY(x,z)); if(U&&U.usual!=null) rSea=1+U.usual; }
  const eCal=base*(rCal-1), eEv=base*rCal*(rEv-1), eSea=base*rCal*rEv*(rSea-1), eAd=base*rCal*rEv*rSea*(rAd-1), eRest=cur-base-eCal-eEv-eSea-eAd;
  return {P:P_,cats,stats,m,cur,base,eCal,eEv,eSea,eAd,eRest,rCal,rEv,rAd,ads,C1,C0,U};
}

/* where the change landed: per service, per patient group, per provider and doctor specialty */
function whyWhere(R){
  const {P:P_,cats,stats,m}=R, out={};
  out.svc=cats.map(c=>{ const x=total(P_.a,P_.b,m,[c],stats), y0=total(P_.pa,P_.pb,m,[c],stats); return {name:label(c),color:S.colorOf[c],d:x-y0,x,y0}; });
  if(S.hasNew&&st.pview==='all'&&(!MONEY.has(m)||S.hasRevNew)){
    const keep=st.pview; const grp=[];
    for(const [v,name] of [['new','New patients'],['ret','Returning patients']]){ st.pview=v; const x=total(P_.a,P_.b,m,cats,stats), y0=total(P_.pa,P_.pb,m,cats,stats); grp.push({name,d:x-y0,x,y0}); }
    st.pview=keep; out.pat=grp;
  }
  if(PV&&PV.min<=P_.pa&&PV.max>=P_.b){
    const t1=pvTotals(P_.a,P_.b,r=>r.p), t0=pvTotals(P_.pa,P_.pb,r=>r.p), keys=new Set([...t1.keys(),...t0.keys()]);
    out.prov=[...keys].map(p=>{ const x=t1.get(p)||0, y0=t0.get(p)||0, pr=PV.provs[p]; return {name:pvName(pr)+' · '+label(pr.cat),d:x-y0,x,y0}; }).filter(r=>r.d!==0);
    if(PV.hasSpec){ const k1=pvTotals(P_.a,P_.b,specOf,r=>isDoctorCat(r.cat)), k0=pvTotals(P_.pa,P_.pb,specOf,r=>isDoctorCat(r.cat)), ks=new Set([...k1.keys(),...k0.keys()]);
      out.spec=[...ks].map(k=>({name:k,d:(k1.get(k)||0)-(k0.get(k)||0),x:k1.get(k)||0,y0:k0.get(k)||0})).filter(r=>r.d!==0); }
  }
  return out;
}

function whyBars(rows,fmt,max,limit){
  rows=rows.slice().sort((p,q)=>Math.abs(q.d)-Math.abs(p.d));
  const top=rows.slice(0,limit||8), rest=rows.slice(limit||8);
  if(rest.length){ const d=rest.reduce((s,r)=>s+r.d,0), x=rest.reduce((s,r)=>s+r.x,0), y0=rest.reduce((s,r)=>s+r.y0,0); top.push({name:rest.length+' others',d,x,y0,other:true}); }
  const M=max||Math.max(1,...top.map(r=>Math.abs(r.d)));
  return '<div class="wbars">'+top.map(r=>{ const w=Math.abs(r.d)/M*50, pct=r.y0>0? (r.x-r.y0)/r.y0*100 : null;
    return '<div class="wrow'+(r.other?' other':'')+'"><span class="wname" dir="auto" title="'+esc(r.name)+'">'+(r.color?'<span class="sw" style="background:'+r.color+'"></span>':'')+esc(r.name)+'</span>'+
      '<span class="wtrack"><span class="wbar '+(r.d>=0?'pos':'neg')+'" style="'+(r.d>=0?'left:50%':'right:50%')+';width:'+w.toFixed(1)+'%"></span></span>'+
      '<span class="wval '+(r.d>=0?'pos':'neg')+'">'+(r.d>0?'+':'')+fmt(r.d)+'</span><span class="wpct">'+(pct==null?'new':fmtPct(pct))+'</span></div>'; }).join('')+'</div>';
}

function renderWhy(){
  const box=document.getElementById('whyBody'), err=document.getElementById('whyErr');
  document.querySelectorAll('#whyCmp button').forEach(b=>b.classList.toggle('on',b.dataset.c===st.whyCmp));
  const R=whyCompute();
  if(R.err){ err.textContent=R.err; err.hidden=false; box.hidden=true; return; }
  err.hidden=true; box.hidden=false;
  const {P:P_,cur,base,m}=R, M=MLABEL[m].replace(' (IQD)',''), f=v=>fmtVal(v,m), pc=v=>fmtPct(v/base*100,1);
  const tot=cur-base, W=whyWhere(R);
  document.getElementById('whyH').textContent=M+viewLabel(' from ')+': '+fmtD(P_.a)+' – '+fmtD(P_.b)+' vs '+R.P.short+(R.P.usual?', judged against the usual move':'');
  document.getElementById('whyDesc').textContent='Compared with '+fmtD(P_.pa)+' – '+fmtD(P_.pb)+' · '+R.cats.length+' of '+S.C+' services · '+(st.basis==='booked'?'by booking time':'by scheduled time');
  document.getElementById('whyKpis').innerHTML=summaryTiles(R);
  renderAttention(R);
  document.getElementById('whyChartH').textContent='Why it moved, step by step';
  // waterfall
  const steps=[{l:R.P.short.replace(/^the /,'').replace(/^./,c=>c.toUpperCase()),v:base,kind:'end'},{l:'Weekdays & holidays',v:R.eCal},{l:'Outside events',v:R.eEv}].concat(R.P.usual?[{l:'Usual move',v:R.eSea}]:[],[{l:'Meta ads',v:R.eAd},{l:'Everything else',v:R.eRest},{l:'This period',v:cur,kind:'end'}]);
  let run=0; const data=steps.map(s=>{ if(s.kind==='end'){ run=s.v; return [0,s.v]; } const lo=run, hi=run+s.v; run=hi; return [Math.min(lo,hi),Math.max(lo,hi)]; });
  const col=steps.map(s=> s.kind==='end'? css('--navy') : s.v>=0? css('--good') : css('--bad'));
  const o=baseOpts(); o.interaction={mode:'nearest',intersect:true}; o.scales.y.beginAtZero=false; moneyTicks(o);
  const lo=Math.min(...data.map(d=>d[0]).filter((v,i)=>steps[i].kind!=='end'),base,cur), hi=Math.max(...data.map(d=>d[1]),base,cur);
  const raw=Math.max(0,lo-(hi-lo)*0.6), step=Math.pow(10,Math.floor(Math.log10(Math.max(1,hi-raw))));
  o.scales.y.min=Math.floor(raw/step)*step; o.scales.x.ticks.autoSkip=false; o.scales.x.ticks.font={size:10.5};
  o.plugins.tooltip.callbacks={title:it=>steps[it[0].dataIndex].l,label:it=>{ const s=steps[it.dataIndex]; return s.kind==='end'? ' '+f(s.v) : ' '+(s.v>0?'+':'')+f(s.v)+' ('+pc(s.v)+')'; }};
  if(whyChart) whyChart.destroy();
  whyChart=new Chart(document.getElementById('whyChart'),{type:'bar',data:{labels:steps.map(s=>s.l),datasets:[{data,backgroundColor:col,borderRadius:3,borderSkipped:false,maxBarThickness:64}]},options:o});
  // what went into each step
  // only what differs between the periods
  const holDiff=(()=>{ const ks=new Set([...Object.keys(R.C1.hols),...Object.keys(R.C0.hols)]), d=[];
    ks.forEach(k=>{ const x=R.C1.hols[k]||0, y0=R.C0.hols[k]||0; if(x!==y0) d.push(k+': '+x+' day'+(x===1?'':'s')+' now, '+y0+' then'); });
    return d.length? d.join('; ')+'.' : 'The same holiday days fall in both periods.'; })();
  const evDiff=(()=>{ const by={}; R.C1.evs.forEach(e=>{ (by[e.cat]||(by[e.cat]={n:0,o:0,t:[]})).n++; by[e.cat].t.push(e.title); }); R.C0.evs.forEach(e=>{ (by[e.cat]||(by[e.cat]={n:0,o:0,t:[]})).o++; });
    const rows=Object.entries(by).filter(([c,v])=>v.n!==v.o||v.n); if(!rows.length) return 'No sheet events in either period.';
    return rows.map(([c,v])=>c+': '+v.n+' now'+(v.n?' ('+v.t.slice(0,2).join('; ')+(v.t.length>2?'; …':'')+')':'')+', '+v.o+' then').join('. ')+'.'; })();
  const adsTxt= R.ads.ok? 'Matching ad spend went from '+fmtUsd(R.ads.sp0)+' to '+fmtUsd(R.ads.sp1)+' ('+fmtPct((R.ads.sp1/R.ads.sp0-1)*100)+'). Over the past year a 10% rise in weekly spend has gone with about '+(R.ads.beta*10).toFixed(1)+'% more '+M.toLowerCase()+(R.ads.k?' '+R.ads.k+' week'+(R.ads.k>1?'s':'')+' later':' the same week')+' (r = '+R.ads.r.toFixed(2)+').'
    : 'Counted as zero: '+R.ads.why+'.'+(R.ads.sp0&&R.ads.sp1?' Spend went from '+fmtUsd(R.ads.sp0)+' to '+fmtUsd(R.ads.sp1)+'.':'');
  document.getElementById('whySteps').innerHTML=
    '<div><dt>Weekdays & holidays <b class="'+(R.eCal>=0?'pos':'neg')+'">'+pc(R.eCal)+'</b></dt><dd>'+esc(holDiff)+' Each holiday counts with its average past effect (Calendar tab) and each weekday with its usual share.</dd></div>'+
    '<div><dt>Outside events <b class="'+(R.eEv>=0?'pos':'neg')+'">'+pc(R.eEv)+'</b></dt><dd>'+esc(evDiff)+' Each event counts with its category’s average past effect (Google Sheet events, Calendar tab).</dd></div>'+
    (R.P.usual? '<div><dt>Usual move <b class="'+(R.eSea>=0?'pos':'neg')+'">'+pc(R.eSea)+'</b></dt><dd>'+(R.U&&R.U.usual!=null? esc('The same two periods '+(R.U.past.length>1?'in the last two years':'last year')+' ('+ALIGN_LABEL[st.align]+'): '+R.U.past.map(x=>fmtD(x.from)+' – '+fmtDs(x.to)+' moved '+fmtPct(x.raw*100,1)+', '+fmtPct(x.adj*100,1)+' after weekdays and holidays').join('; ')+'. That seasonal move counts as expected; only the gap from it is news.') : 'No earlier year covers these periods, so it counts as zero.')+'</dd></div>' : '')+
    '<div><dt>Meta ads <b class="'+(R.eAd>=0?'pos':'neg')+'">'+pc(R.eAd)+'</b></dt><dd>'+esc(adsTxt)+' ('+adModeLabel()+')</dd></div>'+
    '<div><dt>Everything else <b class="'+(R.eRest>=0?'pos':'neg')+'">'+pc(R.eRest)+'</b></dt><dd>Growth or decline the three above don’t account for: demand, prices, provider capacity, operations, competitors. The breakdowns below show where it happened.</dd></div>';
  // where it landed
  const pvF=v=>fmtVal(v,pvMeasure()), sections=[];
  sections.push('<div class="wcol"><h3>By service</h3>'+whyBars(W.svc,f)+'</div>');
  if(W.pat) sections.push('<div class="wcol"><h3>New vs returning patients</h3>'+whyBars(W.pat,f)+'<p class="note">New = '+(st.newBasis==='created'?'account created that month':'first order that month')+' (More settings).</p></div>');
  if(W.prov) sections.push('<div class="wcol"><h3>Providers'+(MONEY.has(m)?' <span class="note">· orders</span>':'')+'</h3>'+(W.prov.length?whyBars(W.prov,pvF,null,8):'<p class="note">No provider changes.</p>')+'</div>');
  if(W.spec&&W.spec.length) sections.push('<div class="wcol"><h3>Doctor specialties'+(MONEY.has(m)?' <span class="note">· orders</span>':'')+'</h3>'+whyBars(W.spec,pvF,null,6)+'</div>');
  if(!W.prov) sections.push('<div class="wcol"><h3>Providers</h3><p class="note">'+(PV?'The provider export doesn’t cover both periods.':'Load the provider export (Data &amp; settings) to see which providers the change came from.')+'</p></div>');
  document.getElementById('whyWhere').innerHTML=sections.join('');
  // the plain-language summary
  const svcTop=W.svc.slice().sort((p,q)=>Math.abs(q.d)-Math.abs(p.d)).filter(r=>Math.abs(r.d)>=Math.abs(tot)*0.1).slice(0,3);
  const dir=tot>=0?'up':'down', big=[['the calendar',R.eCal],['outside events',R.eEv],['the usual seasonal move',R.eSea],['ads',R.eAd]].filter(x=>Math.abs(x[1])>=base*0.005).sort((p,q)=>Math.abs(q[1])-Math.abs(p[1]));
  let s='<strong>'+M+viewLabel(' from ')+' went '+dir+' '+fmtPct(Math.abs(tot)/base*100,1).replace('+','')+' ('+(tot>0?'+':'')+f(tot)+') against '+R.P.lab+'.</strong> ';
  const cap=t=>t.charAt(0).toUpperCase()+t.slice(1);
  s+= big.length? cap(big.map(([n,v])=>n+' '+(v>=0?'added ':'took away ')+fmtPct(Math.abs(v)/base*100,1).replace('+','')).join(', '))+', which leaves '+(R.eRest>=0?'a real rise of ':'a real drop of ')+fmtPct(Math.abs(R.eRest)/base*100,1).replace('+','')+'. ' : 'Calendar, events and ads barely differ between the two periods, so the change is almost all real. ';
  if(svcTop.length) s+='Most of it is in '+svcTop.map(r=>esc(r.name)+' ('+(r.d>0?'+':'')+f(r.d)+')').join(', ')+'. ';
  if(W.pat){ const [n,r_]=W.pat; if(Math.abs(n.d)+Math.abs(r_.d)>0) s+=(Math.abs(n.d)>=Math.abs(r_.d)?'New patients':'Returning patients')+' account for more of it ('+(n.d>0?'+':'')+f(n.d)+' new, '+(r_.d>0?'+':'')+f(r_.d)+' returning). '; }
  if(W.prov&&W.prov.length){ const p=W.prov.slice().sort((a_,b_)=>Math.abs(b_.d)-Math.abs(a_.d))[0]; s+='The biggest provider change: '+esc(p.name)+' ('+(p.d>0?'+':'')+pvF(p.d)+(MONEY.has(m)?' orders':'')+').'; }
  document.getElementById('whySummary').innerHTML=s;
}
/* quick ranges for this view: the last complete month, the last 4 full weeks, the last 3 complete months */
function whyRange(k){
  const endM= monthKey(S.max+1)!==monthKey(S.max)? monthKey(S.max) : addMonths(monthKey(S.max),-1);
  if(k==='month'){ st.from=Math.max(S.min,toN(endM+'-01')); st.to=toN(endM+'-01')+daysInMonth(endM)-1; }
  else if(k==='q'){ const s=addMonths(endM,-2); st.from=Math.max(S.min,toN(s+'-01')); st.to=toN(endM+'-01')+daysInMonth(endM)-1; }
  else { const e=weekStart(S.max+1)-1; st.to=e; st.from=Math.max(S.min,e-27); }
  st.to=Math.min(st.to,S.max); render();
}
function wireWhy(){
  document.querySelectorAll('#whyCmp button').forEach(b=>b.addEventListener('click',()=>{ st.whyCmp=b.dataset.c; render(); }));
  document.querySelectorAll('#whyRange button').forEach(b=>b.addEventListener('click',()=>whyRange(b.dataset.r)));
}
