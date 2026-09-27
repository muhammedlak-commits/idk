/* ---------- projections ----------
   Built from the factors ticked in the module, on history up to a cut-off day:
     patterns  weekday shape (last 12 weeks) · holiday effects (last N years) · last year's seasonal
               shape · upcoming events in the sheet (measured effect of their category)
     growth    trend (26 weeks) · year over year · month over month · week over week ·
               custom period over period · your own rate; the ticked rates are averaged
   Forecast = level (last 28 days, patterns removed) × growth × seasonal shape × weekday × holiday × events.
   Accuracy comes from re-running the same mix at earlier cut-offs and comparing with what happened. */
const PJ={window:182,halfLife:60,wdWindow:84,phi:0.99};
const PJ_FACTORS=[
  {k:'weekday', g:'Patterns', label:'Weekday pattern', help:'Each weekday against the average day, from the last 12 weeks of orders. Shapes days and weeks; totals barely change.'},
  {k:'holidays',g:'Patterns', label:'Holidays', help:'Each holiday measured against the same weekdays around it, in past years, then applied to its next dates.'},
  {k:'seasonal',g:'Patterns', label:'Last year’s seasonal shape', help:'How each week of last year ran above or below last year’s own trend, applied to the same weeks ahead.'},
  {k:'events',  g:'Patterns', label:'Upcoming events in the sheet', help:'Future rows in the Outside Factors sheet, at the measured effect of their category.'},
  {k:'trend',   g:'Growth',   label:'Trend, last 26 weeks', help:'Weighted straight line through the last 26 weeks, recent weeks counting more.'},
  {k:'yoy',     g:'Growth',   label:'Year over year', help:'Last 28 days against the same 28 days a year earlier, as a monthly rate.'},
  {k:'mom',     g:'Growth',   label:'Month over month', help:'Last 30 days against the 30 days before.'},
  {k:'wow',     g:'Growth',   label:'Week over week', help:'Average weekly change over the last 4 weeks.'},
  {k:'pop',     g:'Growth',   label:'Custom period over period', help:'The last N days against the N days before.'},
  {k:'custom',  g:'Growth',   label:'Your own growth rate', help:'A monthly rate you set, for scenarios.'}
];
const GROWTH_KEYS=PJ_FACTORS.filter(f=>f.g==='Growth').map(f=>f.k);
let pjChart=null;

function holidayKeysFull(n){ const h=hijri(n); const out=[]; for(const H of HOLS){ if(H.t(h,n)) out.push(H.k==='fixed'?'fixed:'+FIXED[toS(n).slice(5)]:H.k); } return out; }
function holidayMultiplier(effects){
  const eff={}; effects.forEach(r=>eff[r.key]=r.avg/100);
  return n=>{ let m=1; for(const k of holidayKeysFull(n)) if(eff[k]!=null) m*=1+eff[k]; return Math.min(1.7,Math.max(0.3,m)); };
}
/* upcoming sheet events -> day multiplier, from the measured effect of each event's category */
function eventMultiplier(catAvg, from){
  const evs=EVENTS.filter(e=>e.cat!=='Marketing'&&e.e-e.s<=14&&e.e>=from&&catAvg[e.cat]!=null);
  return {list:evs, f:n=>{ let m=1; for(const e of evs) if(n>=e.s&&n<=e.e) m*=1+catAvg[e.cat]/100; return Math.min(1.7,Math.max(0.3,m)); }};
}

/* one projection for a factor mix F (Set of keys); y indexed from S.min; uses days up to `cut` */
function pjModel(y, cut, F, opt, hm, ev){
  const H=F.has('holidays')? hm : ()=>1, E=F.has('events')&&ev? ev : ()=>1;
  const raw=n=> n>=S.min&&n<=cut? y[n-S.min] : null;
  const h1=n=>{ const v=raw(n); return v==null?null:v/H(n); };
  // weekday factors, shrunk 30% toward 1 so one odd week can't dominate
  let wf=[1,1,1,1,1,1,1];
  if(F.has('weekday')){ const s=[0,0,0,0,0,0,0], c=[0,0,0,0,0,0,0]; let all=0, k=0;
    for(let n=Math.max(S.min,cut-PJ.wdWindow+1);n<=cut;n++){ const v=h1(n), d=dow(n); s[d]+=v; c[d]++; all+=v; k++; }
    const mean=k?all/k:0; wf=s.map((x,d)=> mean&&c[d]? 0.3+0.7*((x/c[d])/mean) : 1); }
  const z=n=>{ const v=h1(n); return v==null?null:v/wf[dow(n)]; };
  const sumZ=(a,b)=>{ if(a<S.min||b>cut) return null; let t=0; for(let n=a;n<=b;n++) t+=z(n); return t; };
  const lvl=(sumZ(cut-27,cut)||0)/28, mid=cut-13.5;
  // growth signals, each as a daily log rate
  const ratio=(a,b,c,d,days)=>{ const x=sumZ(a,b), w=sumZ(c,d); return x>0&&w>0? Math.log(x/w)/days : null; };
  const sig={};
  // weighted straight line through log(1+z) over the 26 weeks up to day c: slope and value at c
  const fitTrend=c=>{ let sw=0,sx=0,sy=0,sxx=0,sxy=0; const a=Math.max(S.min,c-PJ.window+1); if(c-a<56) return null;
    for(let n=a;n<=c;n++){ const w=Math.pow(0.5,(c-n)/PJ.halfLife), x=n-c, v=Math.log1p(z(n)); sw+=w; sx+=w*x; sy+=w*v; sxx+=w*x*x; sxy+=w*x*v; }
    const den=sw*sxx-sx*sx; if(!den) return null; const b=(sw*sxy-sx*sy)/den; return {b,a0:(sy-b*sx)/sw}; };
  { const t=fitTrend(cut); sig.trend=t? t.b : null; }
  sig.yoy=ratio(cut-27,cut,cut-391,cut-364,364);
  sig.mom=ratio(cut-29,cut,cut-59,cut-30,30);
  sig.wow=ratio(cut-6,cut,cut-34,cut-28,28);
  const N=Math.max(7,Math.min(365,Math.round(opt.popDays||60))); sig.pop=ratio(cut-N+1,cut,cut-2*N+1,cut-N,N);
  sig.custom=Math.log(1+(opt.customPct||0)/100)/30.44;
  const used=GROWTH_KEYS.filter(k=>F.has(k)&&sig[k]!=null&&isFinite(sig[k]));
  const g=used.length? used.reduce((s,k)=>s+sig[k],0)/used.length : 0;
  const growth=h=> opt.pace==='constant'? g*h : g*PJ.phi*(1-Math.pow(PJ.phi,h))/(1-PJ.phi);
  // last year's shape: 7-day average around the same day last year, against last year's level at the cut-off
  let seas=()=>1;
  // last year's weeks against what last year's own trend expected, so last year's growth isn't counted twice
  if(F.has('seasonal')){ const c=cut-364, t=fitTrend(c);
    if(t){ seas=n=>{ const d=n-364, a7=sumZ(d-3,d+3); if(a7==null) return 1; const exp_=Math.expm1(t.a0+t.b*(d-c)); return exp_>0? 1+0.5*(Math.min(1.4,Math.max(0.7,(a7/7)/exp_))-1) : 1; }; } }   // half strength: one year's shape is noisy
  const f=n=> Math.max(0, lvl*Math.exp(growth(n-mid))*seas(n))*wf[dow(n)]*H(n)*E(n);
  return {f,sig,used,g,wf,lvl,monthly:(Math.exp(g*30.44)-1)*100};
}

function backtest(y, F, opt, hmAt, origins=8){
  const out=[];
  for(let k=1;k<=origins;k++){
    const cut=S.max-28*k; if(cut-PJ.window<S.min) break;
    const M=pjModel(y,cut,F,opt,hmAt(cut),null);   // sudden events aren't known in advance, so they stay out of the check
    let p=0,a=0; const wk=[0,0,0,0], wa=[0,0,0,0];
    for(let n=cut+1;n<=cut+28;n++){ const pv=M.f(n), av=y[n-S.min]; p+=pv; a+=av; const j=Math.floor((n-cut-1)/7); wk[j]+=pv; wa[j]+=av; }
    out.push({cut,p,a,err:a?(p-a)/a*100:null,wkErr:wk.map((v,j)=>wa[j]?Math.abs(v-wa[j])/wa[j]*100:null)});
  }
  return out;
}
const median=arr=>{const v=arr.filter(x=>x!=null&&isFinite(x)).sort((a,b)=>a-b); if(!v.length) return null; const m=Math.floor(v.length/2); return v.length%2?v[m]:(v[m-1]+v[m])/2;};
const pjOpt=()=>({popDays:st.pjPop,customPct:st.pjCustom,pace:st.pjPace});

function renderProjections(){
  const cats=selCats(), stats=selStats(), m=st.measure, H=st.pjH, F=st.pjF, opt=pjOpt();
  document.getElementById('pjScope').textContent='Uses the services, statuses and measure picked above and all history up to '+fmtD(S.max)+'. The date range doesn’t apply here; By sets the period view.';
  document.querySelectorAll('#pjHorizon button').forEach(b=>b.classList.toggle('on',+b.dataset.h===H));
  document.querySelectorAll('#pjPace button').forEach(b=>b.classList.toggle('on',b.dataset.p===st.pjPace));
  const empty=!cats.length||!stats.length;
  document.getElementById('pjBody').hidden=empty; document.getElementById('pjEmpty').hidden=!empty;
  if(empty) return;

  const y=series(S.min,S.max,m,cats,stats);
  const since=cut=> st.pjHolYears==='all'? null : cut-365*(+st.pjHolYears);
  const effCache={}; const hmAt=cut=>effCache[cut]||(effCache[cut]=holidayMultiplier(holidayEffects(cats,stats,m,cut,since(cut))));
  const hm=hmAt(S.max);
  const catAvg={}; factorEffects(cats,stats,m).catRows.forEach(r=>{ if(r.avg!=null) catAvg[r.c]=r.avg; });
  const EV=eventMultiplier(catAvg,S.max+1);
  const start=S.max+1, end=S.max+H;
  const fit=Fs=>pjModel(y,S.max,Fs,opt,hm,EV.f);
  const M=fit(F);
  const horizonTotal=Mx=>{ let s=0; for(let n=start;n<=end;n++) s+=Mx.f(n); return s; };
  const full=horizonTotal(M);
  const bt=backtest(y,F,opt,hmAt);
  const e28=Math.max(4, 1.4*(median(bt.map(x=>Math.abs(x.err)))||10));      // ≈80% range
  const bias=median(bt.map(x=>x.err));

  // ---- factor panel: tick to include; each row shows what it measured and what it changes over the horizon
  const dn=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const effects=holidayEffects(cats,stats,m,S.max,since(S.max));
  const upcomingHol=holidayWindows(start,end).map(w=>{ const k=w.k==='fixed'?'fixed:'+w.name:w.k, r=effects.find(x=>x.key===k); return r? w.name+' '+fmtPct(r.avg) : null; }).filter(Boolean);
  const measured={
    weekday:()=>{ const wf=pjModel(y,S.max,new Set(['weekday']),opt,hm,null).wf; const order=[6,0,1,2,3,4,5]; return order.map(d=>dn[d]+' '+fmtPct((wf[d]-1)*100)).join(' · '); },
    holidays:()=> upcomingHol.length? 'In this period: '+[...new Set(upcomingHol)].join(', ') : 'No measured holiday falls in the next '+H+' days',
    seasonal:()=>{ const x=pjModel(y,S.max,new Set(['seasonal']),opt,hm,null); let s=0,b=0; for(let n=start;n<=end;n++){ s+=x.f(n); b+=x.lvl; } return b? 'Last year, these '+H+' days ran '+fmtPct((s/b-1)*100)+' against last year’s own trend' : 'Needs a year and a half of history'; },
    events:()=> EV.list.length? EV.list.slice(0,4).map(e=>fmtDs(e.s)+' '+e.title+' ('+e.cat+' '+fmtPct(catAvg[e.cat])+')').join('; ')+(EV.list.length>4?' …':'') : 'No upcoming events with a measured category in the sheet',
  };
  const rateTxt=k=>{ const v=M.sig[k]; return v==null||!isFinite(v)? 'Not enough history' : fmtPct((Math.exp(v*30.44)-1)*100,1)+' a month'; };
  const rows=PJ_FACTORS.map(fx=>{
    const on=F.has(fx.k); const other=new Set(F); on? other.delete(fx.k) : other.add(fx.k);
    const alt=horizonTotal(fit(other)); const eff= on? full-alt : alt-full;
    const what= measured[fx.k]? measured[fx.k]() : rateTxt(fx.k);
    return {fx,on,eff,pct:(on?alt:full)? eff/(on?alt:full)*100 : null,what};
  });
  const extra=k=> k==='pop'? ' <input type="number" id="pjPopIn" value="'+st.pjPop+'" min="7" max="365" step="1" aria-label="Days in the custom period"> days'
    : k==='custom'? ' <input type="number" id="pjCustomIn" value="'+st.pjCustom+'" min="-50" max="100" step="1" aria-label="Your monthly growth rate"> % a month'
    : k==='holidays'? ' <select id="pjHolYears" aria-label="Years of holidays to use"><option value="1">last year</option><option value="2">last 2 years</option><option value="all">all years</option></select>' : '';
  let lastG='';
  document.getElementById('pjFactors').innerHTML='<thead><tr><th class="nosort">Factor</th><th class="nosort" style="text-align:left">What it measured</th><th class="nosort">Effect on the next '+H+' days</th></tr></thead><tbody>'+
    rows.map(r=>{ const head= r.fx.g!==lastG? '<tr class="grp"><td colspan="3">'+r.fx.g+(r.fx.g==='Growth'?' <span class="note">· ticked rates are averaged: '+(M.used.length? fmtPct(M.monthly,1)+' a month' : 'none ticked, so flat')+'</span>':'')+'</td></tr>' : ''; lastG=r.fx.g;
      return head+'<tr class="'+(r.on?'':'offrow')+'"><td style="white-space:normal;min-width:220px"><label class="fxl"><input type="checkbox" data-fx="'+r.fx.k+'"'+(r.on?' checked':'')+'> '+esc(r.fx.label)+'</label>'+extra(r.fx.k)+'<div class="note">'+esc(r.fx.help)+'</div></td>'+
        '<td style="text-align:left;white-space:normal">'+esc(r.what)+'</td>'+
        '<td class="'+(Math.abs(r.eff)<0.5?'':r.eff>0?'pos':'neg')+'">'+(r.on?'':'<span class="note">if ticked </span>')+(r.eff>0?'+':'')+fmtInt(r.eff)+' <span class="note">'+fmtPct(r.pct,1)+'</span></td></tr>'; }).join('')+'</tbody>';
  const hy=document.getElementById('pjHolYears'); if(hy) hy.value=st.pjHolYears;

  // ---- KPI tiles
  const act=n=>n<=S.max&&n>=S.min? y[n-S.min] : 0;
  const sumF=(a,b)=>{let s=0; for(let n=a;n<=b;n++) s+= n<=S.max? act(n) : M.f(n); return s;};
  const sumA=(a,b)=>{let s=0; for(let n=Math.max(a,S.min);n<=Math.min(b,S.max);n++) s+=act(n); return s;};
  const rangePct=(futureDays,dist)=> e28*Math.sqrt(28/Math.max(futureDays,7))*(1+Math.max(0,dist)/240);
  const rng=(v,days,dist)=>{const p=rangePct(days,dist)/100; return fmtInt(v*(1-p))+' – '+fmtInt(v*(1+p));};
  const curMk=monthKey(S.max), nextMk=addMonths(curMk,1);
  const mStart=mk=>toN(mk+'-01'), mEnd=mk=>mStart(mk)+daysInMonth(mk)-1;
  const curTot=sumF(mStart(curMk),mEnd(curMk)), nextTot=sumF(mStart(nextMk),mEnd(nextMk));
  const lyOf=mk=>{const k=addMonths(mk,-12); return mStart(k)>=S.min? sumA(mStart(k),mEnd(k)) : null;};
  const prevMk=addMonths(curMk,-1), prevTot=mStart(prevMk)>=S.min? sumA(mStart(prevMk),mEnd(prevMk)) : null;
  const lastH=sumA(S.max-H+1,S.max);
  const pctChip=(cur,ref,lab)=> ref? '<span class="delta '+(Math.abs((cur-ref)/ref*100)<1?'flat':cur>ref?'up':'down')+'">'+(cur>ref?'▲ ':'▼ ')+fmtPct((cur-ref)/ref*100)+' '+lab+'</span>' : '';
  const tiles=[
    {hero:true,lab:fmtM(curMk)+' projected',val:fmtInt(curTot),d:[pctChip(curTot,prevTot,'vs '+fmtM(prevMk)),pctChip(curTot,lyOf(curMk),'vs LY')],sub:fmtInt(sumA(mStart(curMk),S.max))+' so far'},
    {lab:fmtM(nextMk)+' projected',val:fmtInt(nextTot),d:[pctChip(nextTot,curTot,'vs '+fmtM(curMk)),pctChip(nextTot,lyOf(nextMk),'vs LY')],sub:'Likely '+rng(nextTot,daysInMonth(nextMk),mStart(nextMk)-S.max)},
    {lab:'Next '+H+' days',val:fmtInt(full),d:[pctChip(full,lastH,'vs last '+H+' days')],sub:'Likely '+rng(full,H,H/2)},
    {lab:'Typical 28-day error',val:'±'+(e28/1.4).toFixed(0)+'%',d:[bias!=null?'<span class="delta flat">'+(bias>0?'runs high by ':'runs low by ')+Math.abs(bias).toFixed(0)+'%</span>':''],sub:'This mix, '+bt.length+' past checks'}
  ];
  document.getElementById('pjKpis').innerHTML=tiles.map(t=>'<div class="kpi'+(t.hero?' hero':'')+'"><span class="lab">'+t.lab+'</span><span class="val">'+t.val+'</span><div class="deltas">'+t.d.join('')+'</div><span class="sub">'+t.sub+'</span></div>').join('');

  // ---- chart in the period chosen by By: history, then the projection with a likely range
  const g=st.gran, back= g==='day'? 60 : g==='week'? 26*7 : 365;
  const hs= g==='month'? monthStart(S.max-back) : g==='week'? weekStart(S.max-back+1) : S.max-back+1;
  const lastM=monthKey(end), he= g==='month'? mStart(lastM)+daysInMonth(lastM)-1 : g==='week'? weekStart(end)+6 : end;
  const B=buckets(hs,he,g);
  const endOf=k=> g==='day'? k : g==='week'? k+6 : k+daysInMonth(monthKey(k))-1;
  const actualS=[], projS=[], lo=[], hi=[], lyS=[], rowsP=[];
  B.keys.forEach(({k})=>{ const e=endOf(k), fd=Math.max(0,e-Math.max(k-1,S.max));
    if(fd===0){ actualS.push(sumA(k,e)); projS.push(null); lo.push(null); hi.push(null); }
    else { const v=sumF(k,e), soFar=sumA(k,e), p=rangePct(fd,k-S.max)/100*(v-soFar);
      actualS.push(null); projS.push(v); lo.push(v-p); hi.push(v+p);
      const lyv= k-364>=S.min? sumA(k-364,e-364) : null;
      rowsP.push({k,e,soFar,proj:v-soFar,tot:v,lo:v-p,hi:v+p,ly:lyv}); }
    lyS.push(k-364>=S.min? sumA(k-364,e-364) : null); });
  // join the lines: the last complete bucket also starts the projected line
  const firstP=projS.findIndex(v=>v!=null); if(firstP>0) projS[firstP-1]=actualS[firstP-1];
  const o=baseOpts();
  const lab=k=> g==='month'? fmtM(monthKey(k)) : fmtDs(k);
  o.plugins.tooltip.callbacks={title:it=>{const k=B.keys[it[0].dataIndex].k; return g==='month'? fmtM(monthKey(k)) : g==='week'? 'Week of '+fmtD(k) : fmtD(k);},label:it=>{ if(it.parsed.y==null) return null; const n={0:'Actual',1:'Projected',2:'Likely low',3:'Likely high',4:'Same period last year'}[it.datasetIndex]; return ' '+n+': '+fmtInt(it.parsed.y);},
    footer:it=>{const k=B.keys[it[0].dataIndex].k, e=endOf(k); const hs2=new Set(); for(let n=k;n<=e;n++) holsOn(n).forEach(h=>hs2.add(h)); const ev=EV.list.filter(x=>x.s<=e&&x.e>=k).map(x=>x.title); return [hs2.size?'Holidays: '+[...hs2].join(', '):'', ev.length?'Events: '+ev.join(', '):''].filter(Boolean).join('\n');}};
  o.plugins.tooltip.filter=it=>it.parsed.y!=null;
  const accent=css('--accent');
  const ds=[
    {label:'Actual',data:actualS,borderColor:accent,backgroundColor:accent,borderWidth:2,pointRadius:0,pointHoverRadius:4,tension:.25},
    {label:'Projected',data:projS,borderColor:accent,borderDash:[5,4],borderWidth:2,pointRadius:0,pointHoverRadius:4,tension:.25},
    {label:'Likely low',data:lo,borderColor:'transparent',pointRadius:0,fill:false},
    {label:'Likely high',data:hi,borderColor:'transparent',backgroundColor:css('--accent-wash'),pointRadius:0,fill:'-1'},
    {label:'Same period last year',data:lyS,borderColor:css('--ghost'),borderWidth:1.5,pointRadius:0,tension:.25}
  ];
  if(pjChart) pjChart.destroy();
  o.plugins.bands={bands: F.has('holidays')&&g!=='month'? holidayWindows(start,he).filter(w=>w.k!=='fixed').map(w=>({type:w.k==='ramadan'?'ramadan':'hol',i0:B.at(Math.max(w.s,hs)),i1:B.at(Math.min(w.e,he))})) : [],holColor:css('--hol'),ramColor:css('--ram'),evtColor:css('--evt')};
  pjChart=new Chart(document.getElementById('pjChart'),{type:'line',data:{labels:B.keys.map(x=>lab(x.k)),datasets:ds},options:o});
  document.getElementById('pjLegend').innerHTML='<span><i style="background:'+accent+'"></i>Actual</span><span><i style="background:repeating-linear-gradient(90deg,'+accent+' 0 5px,transparent 5px 9px)"></i>Projected</span><span><i class="box" style="background:'+css('--accent-wash')+'"></i>Likely range (about 8 in 10 periods fall inside)</span><span><i style="background:'+css('--ghost')+'"></i>Same period last year</span>';
  const GL={day:'day',week:'week',month:'month'}[g];
  document.getElementById('pjH').textContent='Projected '+MLABEL[m].toLowerCase()+viewLabel(' from ')+' by '+GL;
  document.getElementById('pjDesc').textContent=(g==='day'?'The last 60 days':g==='week'?'The last 26 weeks':'The last 12 months')+', then '+H+' days ahead ('+fmtD(start)+' – '+fmtD(end)+'). Change the period with By in the filter bar.';

  // ---- table by period
  const holNames=(a,b)=>[...new Set(holidayWindows(a,b).filter(w=>w.k!=='fixed'||g==='day').map(w=>w.name))].concat(EV.list.filter(x=>x.s<=b&&x.e>=a).map(x=>x.title)).join(', ');
  document.getElementById('pjPH').textContent='By '+GL;
  document.getElementById('pjMonth').innerHTML='<thead><tr><th class="nosort">'+({day:'Day',week:'Week of',month:'Month'})[g]+'</th><th class="nosort">So far</th><th class="nosort">Projected</th><th class="nosort">Total</th><th class="nosort">Likely range</th><th class="nosort">Last year</th><th class="nosort">vs LY</th><th class="nosort" style="text-align:left">Holidays and events</th></tr></thead><tbody>'+
    rowsP.map(r=>{ const vs=r.ly?(r.tot-r.ly)/r.ly*100:null;
      return '<tr><td>'+(g==='month'?fmtM(monthKey(r.k)):g==='week'?fmtDs(r.k):fmtD(r.k)+' '+dn[dow(r.k)])+'</td><td>'+(r.soFar?fmtInt(r.soFar):'–')+'</td><td class="proj">'+fmtInt(r.proj)+'</td><td><strong>'+fmtInt(r.tot)+'</strong></td><td class="proj">'+fmtInt(r.lo)+' – '+fmtInt(r.hi)+'</td><td>'+(r.ly==null?'–':fmtInt(r.ly))+'</td><td class="'+(vs==null?'':vs>0?'pos':'neg')+'">'+fmtPct(vs)+'</td><td style="text-align:left;white-space:normal;min-width:160px">'+esc(holNames(r.k,r.e))+'</td></tr>'; }).join('')+'</tbody>';

  // ---- per service, each fitted on its own with the same mix
  const svc=S.order.map(i=>S.catList[i]).filter(c=>st.svc.has(c));
  let sumSvc=0;
  const srows=svc.map(c=>{ const yc=series(S.min,S.max,m,[c],stats); const last28=sum(yc.subarray(yc.length-28));
    if(last28<5) return {c,thin:true,last:sum(yc.subarray(yc.length-H))};
    const hmc= F.has('holidays')? holidayMultiplier(holidayEffects([c],stats,m,S.max,since(S.max))) : ()=>1;
    const Mc=pjModel(yc,S.max,F,opt,hmc,EV.f); let p=0; for(let n=start;n<=end;n++) p+=Mc.f(n); sumSvc+=p;
    const last=sum(yc.subarray(yc.length-H)); return {c,p,last,chg:last?(p-last)/last*100:null,mo:Mc.monthly};
  });
  document.getElementById('pjSDesc').textContent='Next '+H+' days, each service projected from its own history with the same factors. Services with fewer than 5 in the last 28 days are too small to project.';
  document.getElementById('pjSvc').innerHTML='<thead><tr><th class="nosort">Service</th><th class="nosort">Last '+H+' days</th><th class="nosort">Next '+H+' days</th><th class="nosort">Change</th><th class="nosort">Growth used / month</th></tr></thead><tbody>'+
    '<tr class="total"><td>Sum of services</td><td>'+fmtInt(lastH)+'</td><td>'+fmtInt(sumSvc)+'</td><td>'+fmtPct(lastH?(sumSvc-lastH)/lastH*100:null)+'</td><td></td></tr>'+
    srows.map(r=>'<tr><td><span class="sw" style="background:'+S.colorOf[r.c]+'"></span>'+esc(label(r.c))+'</td>'+(r.thin? '<td>'+fmtInt(r.last||0)+'</td><td colspan="3" style="text-align:left;color:var(--muted)">Too little recent volume</td>' :
      '<td>'+fmtInt(r.last)+'</td><td>'+fmtInt(r.p)+'</td><td class="'+(r.chg>0.5?'pos':r.chg<-0.5?'neg':'')+'">'+fmtPct(r.chg)+'</td><td class="'+(r.mo>0.5?'pos':r.mo<-0.5?'neg':'')+'">'+fmtPct(r.mo,1)+'</td>')+'</tr>').join('')+'</tbody>';

  // ---- accuracy of this mix
  document.getElementById('pjAcc').innerHTML='<thead><tr><th class="nosort">As if it were</th><th class="nosort">Projected next 28 days</th><th class="nosort">Actual</th><th class="nosort">Error</th></tr></thead><tbody>'+
    bt.map(x=>'<tr><td>'+fmtD(x.cut)+'</td><td>'+fmtInt(x.p)+'</td><td>'+fmtInt(x.a)+'</td><td class="'+(Math.abs(x.err)<5?'':x.err>0?'pos':'neg')+'">'+fmtPct(x.err,1)+'</td></tr>').join('')+'</tbody>';
  document.getElementById('pjAccNote').textContent='Re-runs the ticked factors as if it were each earlier date. Upcoming sheet events are left out of these checks, since sudden events aren’t known in advance.'+(F.has('custom')?' Your own growth rate is applied as set.':'');
}
function wireProjections(){
  document.querySelectorAll('#pjHorizon button').forEach(b=>b.addEventListener('click',()=>{st.pjH=+b.dataset.h; renderProjections();}));
  document.querySelectorAll('#pjPace button').forEach(b=>b.addEventListener('click',()=>{st.pjPace=b.dataset.p; renderProjections();}));
  const box=document.getElementById('pjFactors');
  box.addEventListener('change',e=>{ const t=e.target;
    if(t.dataset.fx){ t.checked? st.pjF.add(t.dataset.fx) : st.pjF.delete(t.dataset.fx); }
    else if(t.id==='pjPopIn'){ const v=+t.value; if(isFinite(v)) st.pjPop=Math.max(7,Math.min(365,Math.round(v))); st.pjF.add('pop'); }
    else if(t.id==='pjCustomIn'){ const v=+t.value; if(isFinite(v)) st.pjCustom=Math.max(-50,Math.min(100,v)); st.pjF.add('custom'); }
    else if(t.id==='pjHolYears'){ st.pjHolYears=t.value; }
    else return;
    lsSet('spl.pj',JSON.stringify({f:[...st.pjF],pop:st.pjPop,custom:st.pjCustom,hol:st.pjHolYears,pace:st.pjPace}));
    renderProjections();
  });
  document.getElementById('pjReset').addEventListener('click',()=>{ Object.assign(st,PJ_DEFAULTS()); lsSet('spl.pj',''); renderProjections(); });
  try{ const v=JSON.parse(lsGet('spl.pj')||'null'); if(v&&Array.isArray(v.f)){ st.pjF=new Set(v.f.filter(k=>PJ_FACTORS.some(f=>f.k===k))); if(v.pop) st.pjPop=v.pop; if(v.custom!=null) st.pjCustom=v.custom; if(v.hol) st.pjHolYears=v.hol; if(v.pace) st.pjPace=v.pace; } }catch(e){}
}
