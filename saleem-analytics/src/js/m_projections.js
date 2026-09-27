/* ---------- projections ----------
   Per series, on history up to a cut-off day:
     1. remove measured holiday effects (same numbers as the Holidays module)
     2. weekday pattern from the last 12 weeks
     3. trend: weighted straight line through log(orders) over the last 26 weeks, recent weeks count more
   Forecast = level × growth × weekday × holiday effect. Accuracy comes from re-running the
   same steps at earlier cut-offs and comparing with what happened next. */
const PJ={window:182,halfLife:60,wdWindow:84,phi:0.99};
let pjChart=null;

function holidayKeysFull(n){ const h=hijri(n); const out=[]; for(const H of HOLS){ if(H.t(h,n)) out.push(H.k==='fixed'?'fixed:'+FIXED[toS(n).slice(5)]:H.k); } return out; }
function holidayMultiplier(effects){
  const eff={}; effects.forEach(r=>eff[r.key]=r.avg/100);
  return n=>{ let m=1; for(const k of holidayKeysFull(n)) if(eff[k]!=null) m*=1+eff[k]; return Math.min(1.7,Math.max(0.3,m)); };
}

function fitProjection(y, cut, mode, customPct, hm){
  // y: Float64Array indexed from S.min; uses days up to and including `cut`
  const a=Math.max(S.min, cut-PJ.window+1);
  const z=n=>y[n-S.min]/hm(n);
  // weekday factors, shrunk toward 1 so one odd week can't dominate
  const sum=[0,0,0,0,0,0,0], cnt=[0,0,0,0,0,0,0]; let all=0, alln=0;
  for(let n=Math.max(S.min,cut-PJ.wdWindow+1); n<=cut; n++){ const d=dow(n), v=z(n); sum[d]+=v; cnt[d]++; all+=v; alln++; }
  const mean=alln?all/alln:0;
  const wf=sum.map((s,d)=> mean&&cnt[d]? 0.3+0.7*((s/cnt[d])/mean) : 1);
  // weighted least squares on log(1+u)
  let sw=0,sx=0,sy=0,sxx=0,sxy=0;
  for(let n=a;n<=cut;n++){ const u=z(n)/wf[dow(n)], w=Math.pow(0.5,(cut-n)/PJ.halfLife), x=n-cut, v=Math.log1p(u);
    sw+=w; sx+=w*x; sy+=w*v; sxx+=w*x*x; sxy+=w*x*v; }
  const den=sw*sxx-sx*sx; const b= den? (sw*sxy-sx*sy)/den : 0; let level=(sy-b*sx)/sw;   // value at x=0 (the cut-off day)
  // pull the level halfway toward the last two weeks, so a recent step up or down shows quickly
  let r=0, rn=0; for(let n=Math.max(a,cut-13);n<=cut;n++){ r+=Math.log1p(z(n)/wf[dow(n)])-(level+b*(n-cut)); rn++; }
  if(rn) level+=0.5*(r/rn);
  const g=Math.log(1+(customPct||0)/100)/30.44;
  const growth=h=> mode==='flat'?0 : mode==='trend'? b*h : mode==='custom'? g*h : b*PJ.phi*(1-Math.pow(PJ.phi,h))/(1-PJ.phi);
  const f=n=>Math.max(0, Math.expm1(level+growth(n-cut)))*wf[dow(n)]*hm(n);
  return {f, b, wf, monthly:(Math.exp(b*30.44)-1)*100, cut};
}

function backtest(y, mode, hmAt, origins=8){
  const out=[];
  for(let k=1;k<=origins;k++){
    const cut=S.max-28*k; if(cut-PJ.window<S.min) break;
    const hm=hmAt(cut);
    const M=fitProjection(y,cut,mode==='custom'?'damped':mode,0,hm);
    let p=0,a=0; const wk=[0,0,0,0], wa=[0,0,0,0];
    for(let n=cut+1;n<=cut+28;n++){ const pv=M.f(n), av=y[n-S.min]; p+=pv; a+=av; const j=Math.floor((n-cut-1)/7); wk[j]+=pv; wa[j]+=av; }
    out.push({cut,p,a,err:a?(p-a)/a*100:null,wkErr:wk.map((v,j)=>wa[j]?Math.abs(v-wa[j])/wa[j]*100:null)});
  }
  return out;
}
const median=arr=>{const v=arr.filter(x=>x!=null&&isFinite(x)).sort((a,b)=>a-b); if(!v.length) return null; const m=Math.floor(v.length/2); return v.length%2?v[m]:(v[m-1]+v[m])/2;};

function renderProjections(){
  const cats=selCats(), stats=selStats(), m=st.measure, H=st.pjH, mode=st.pjGrowth;
  document.getElementById('pjScope').innerHTML='Projections use the services and statuses selected above and all history up to <strong>'+fmtD(S.max)+'</strong>. The date range filter doesn’t apply here.';
  document.querySelectorAll('#pjHorizon button').forEach(b=>b.classList.toggle('on',+b.dataset.h===H));
  document.getElementById('pjGrowth').value=mode; document.getElementById('pjCustomWrap').hidden=mode!=='custom';
  document.getElementById('pjHolToggle').classList.toggle('on',st.pjHol);
  if(!cats.length||!stats.length){ ['pjKpis','pjAssume','pjMonth','pjSvc','pjAcc','pjLegend'].forEach(id=>document.getElementById(id).innerHTML=''); if(pjChart){pjChart.destroy();pjChart=null;} document.getElementById('pjDesc').textContent='Select at least one service and status.'; return; }

  const y=series(S.min,S.max,m,cats,stats);
  const effCache={};
  const hmAt=cut=>{ if(!st.pjHol) return ()=>1; const key=Math.floor(cut); return effCache[key]||(effCache[key]=holidayMultiplier(holidayEffects(cats,stats,m,cut))); };
  const hm=hmAt(S.max);
  const M=fitProjection(y,S.max,mode,st.pjCustom,hm);
  const bt=backtest(y,mode,hmAt);
  const e28=Math.max(4, 1.4*(median(bt.map(x=>Math.abs(x.err)))||10));      // ≈80% range
  const wkE=[0,1,2,3].map(j=>Math.max(4,1.4*(median(bt.map(x=>x.wkErr[j]))||12)));
  const bias=median(bt.map(x=>x.err));

  const start=S.max+1, end=S.max+H;
  const lastMk=monthKey(end), fEnd=Math.max(toN(lastMk+'-01')+daysInMonth(lastMk)-1, weekStart(end)+6);
  const fc=n=>M.f(n);
  const act=n=>n<=S.max&&n>=S.min? y[n-S.min] : 0;
  const sumF=(a,b)=>{let s=0; for(let n=a;n<=b;n++) s+= n<=S.max? act(n) : fc(n); return s;};
  const sumA=(a,b)=>{let s=0; for(let n=Math.max(a,S.min);n<=Math.min(b,S.max);n++) s+=act(n); return s;};
  const rangeFor=days=>e28*Math.sqrt(Math.max(days,7)/28);

  // KPI tiles
  const curMk=monthKey(S.max), nextMk=addMonths(curMk,1);
  const mStart=mk=>toN(mk+'-01'), mEnd=mk=>mStart(mk)+daysInMonth(mk)-1;
  const curTot=sumF(mStart(curMk),mEnd(curMk)), curProjDays=mEnd(curMk)-S.max;
  const nextTot=sumF(mStart(nextMk),mEnd(nextMk));
  const lyOf=mk=>{const k=addMonths(mk,-12); return mStart(k)>=S.min? sumA(mStart(k),mEnd(k)) : null;};
  const prevMk=addMonths(curMk,-1), prevTot=mStart(prevMk)>=S.min? sumA(mStart(prevMk),mEnd(prevMk)) : null;
  const hTot=sumF(start,end), lastH=sumA(S.max-H+1,S.max);
  const rng=(v,days)=>{const p=rangeFor(days); return fmtInt(v*(1-p/100))+' – '+fmtInt(v*(1+p/100));};
  const pctChip=(cur,ref,lab)=> ref? '<span class="delta '+(Math.abs((cur-ref)/ref*100)<1?'flat':cur>ref?'up':'down')+'">'+(cur>ref?'▲ ':'▼ ')+fmtPct((cur-ref)/ref*100)+' '+lab+'</span>' : '';
  const tiles=[
    {hero:true,lab:fmtM(curMk)+' projected total',val:fmtInt(curTot),d:[pctChip(curTot,prevTot,'vs '+fmtM(prevMk)),pctChip(curTot,lyOf(curMk),'vs LY')],sub:fmtInt(sumA(mStart(curMk),S.max))+' so far + '+fmtInt(curTot-sumA(mStart(curMk),S.max))+' projected for the last '+curProjDays+' days'},
    {lab:fmtM(nextMk)+' projected',val:fmtInt(nextTot),d:[pctChip(nextTot,curTot,'vs '+fmtM(curMk)),pctChip(nextTot,lyOf(nextMk),'vs LY')],sub:'Likely '+rng(nextTot,daysInMonth(nextMk))},
    {lab:'Next '+H+' days',val:fmtInt(hTot),d:[pctChip(hTot,lastH,'vs last '+H+' days')],sub:'Likely '+rng(hTot,H)+' · '+fmtInt(hTot/H)+' per day'},
    {lab:'Typical 28-day error',val:'±'+(e28/1.4).toFixed(0)+'%',d:[bias!=null?'<span class="delta flat">'+(bias>0?'tends high by ':'tends low by ')+Math.abs(bias).toFixed(0)+'%</span>':''],sub:'From '+bt.length+' past checks, see below'}
  ];
  document.getElementById('pjKpis').innerHTML=tiles.map(t=>'<div class="kpi'+(t.hero?' hero':'')+'"><span class="lab">'+t.lab+'</span><span class="val">'+t.val+'</span><div class="deltas">'+t.d.join('')+'</div><span class="sub">'+t.sub+'</span></div>').join('');

  // weekly chart: 26 weeks of actuals, then projection with a likely range
  const w0=weekStart(S.max)-7*25, wLast=weekStart(end);
  const weeks=[]; for(let w=w0; w<=wLast; w+=7) weeks.push(w);
  const actualS=[], projS=[], lo=[], hi=[], lyS=[];
  weeks.forEach((w,i)=>{
    const complete = w+6<=S.max;
    actualS.push(complete? sumA(w,w+6) : null);
    if(complete){ const nextIncomplete = w+13>S.max; projS.push(nextIncomplete? sumA(w,w+6):null); lo.push(null); hi.push(null); }
    else { const v=sumF(w,w+6); const j=Math.floor((w-weekStart(S.max))/7); const p=(j<4? wkE[j] : wkE[3]*Math.sqrt((j+1)/4)) * Math.min(1,(w+6-S.max)/7); projS.push(v); lo.push(v*(1-p/100)); hi.push(v*(1+p/100)); }
    lyS.push(w-364>=S.min? sumA(w-364,w-358) : null);
  });
  const o=baseOpts();
  o.plugins.tooltip.callbacks={title:it=>'Week of '+fmtD(weeks[it[0].dataIndex]),label:it=>{ if(it.parsed.y==null) return null; const n={0:'Actual',1:'Projected',2:'Likely low',3:'Likely high',4:'Same week last year'}[it.datasetIndex]; return ' '+n+': '+fmtInt(it.parsed.y);},
    footer:it=>{const w=weeks[it[0].dataIndex]; const hs=new Set(); for(let n=w;n<=w+6;n++) holsOn(n).forEach(h=>hs.add(h)); return hs.size?'Holidays: '+[...hs].join(', '):'';}};
  o.plugins.tooltip.filter=it=>it.parsed.y!=null;
  const accent=css('--accent');
  const ds=[
    {label:'Actual',data:actualS,borderColor:accent,backgroundColor:accent,borderWidth:2,pointRadius:0,pointHoverRadius:4,tension:.25,spanGaps:false},
    {label:'Projected',data:projS,borderColor:accent,borderDash:[5,4],borderWidth:2,pointRadius:0,pointHoverRadius:4,tension:.25},
    {label:'Likely low',data:lo,borderColor:'transparent',pointRadius:0,fill:false},
    {label:'Likely high',data:hi,borderColor:'transparent',backgroundColor:css('--accent-wash'),pointRadius:0,fill:'-1'},
    {label:'Same week last year',data:lyS,borderColor:css('--ghost'),borderWidth:1.5,pointRadius:0,tension:.25}
  ];
  if(pjChart) pjChart.destroy();
  o.plugins.bands={bands: st.pjHol? holidayWindows(start,wLast+6).filter(w=>w.k!=='fixed').map(w=>({type:w.k==='ramadan'?'ramadan':'hol',i0:weeks.indexOf(weekStart(w.s)),i1:weeks.indexOf(weekStart(w.e))})).filter(b=>b.i0>=0&&b.i1>=0) : [],holColor:css('--hol'),ramColor:css('--ram'),evtColor:css('--evt')};
  pjChart=new Chart(document.getElementById('pjChart'),{type:'line',data:{labels:weeks.map(w=>fmtDs(w)),datasets:ds},options:o});
  document.getElementById('pjLegend').innerHTML='<span><i style="background:'+accent+'"></i>Actual</span><span><i style="background:repeating-linear-gradient(90deg,'+accent+' 0 5px,transparent 5px 9px)"></i>Projected</span><span><i class="box" style="background:'+css('--accent-wash')+'"></i>Likely range (about 8 in 10 weeks fall inside)</span><span><i style="background:'+css('--ghost')+'"></i>Same week last year</span>'+(st.pjHol?'<span><i class="box" style="background:'+css('--ram')+'"></i>Ramadan</span><span><i class="box" style="background:'+css('--hol')+'"></i>Other holidays</span>':'');
  document.getElementById('pjH').textContent='Projected '+MLABEL[m].toLowerCase();
  document.getElementById('pjDesc').textContent='Weekly totals: the last 26 weeks, then '+H+' days ahead ('+fmtD(start)+' – '+fmtD(end)+').';

  // assumptions, in plain words
  const dn=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const busiest=M.wf.indexOf(Math.max(...M.wf)), quietest=M.wf.indexOf(Math.min(...M.wf));
  const effects=st.pjHol? holidayEffects(cats,stats,m) : [];
  const effOf=k=>{const r=effects.find(x=>x.key===k); return r?r.avg:null;};
  const upcoming=holidayWindows(start,end).map(w=>{const k=w.k==='fixed'?'fixed:'+w.name:w.k, e=effOf(k); return e==null?null:esc(w.name)+' ('+fmtDs(w.s)+(w.e>w.s?' – '+fmtDs(w.e):'')+'): '+fmtPct(e);}).filter(Boolean);
  const growthTxt={damped:'The recent trend ('+fmtPct(M.monthly,1)+' a month over the last 26 weeks) continues but slows gradually, roughly halving every 10 weeks.',
    trend:'The recent trend ('+fmtPct(M.monthly,1)+' a month over the last 26 weeks) continues at the same pace.',
    flat:'No growth: orders stay at today’s level, apart from weekday and holiday patterns. The recent trend was '+fmtPct(M.monthly,1)+' a month.',
    custom:'Custom growth of '+fmtPct(+st.pjCustom,0)+' a month from today’s level. The recent trend was '+fmtPct(M.monthly,1)+' a month.'}[mode];
  const items=[growthTxt,
    'Weekday pattern from the last 12 weeks: '+dn[busiest]+' is the busiest day, '+dn[quietest]+' the quietest.',
    st.pjHol? (upcoming.length? 'Holidays in this period, with the effect measured in past years: '+upcoming.join('; ')+'.' : 'No holidays with a measured effect fall in this period.') : 'Holiday effects are switched off.',
    'The projection doesn’t know about future ad budgets, price changes, new contracts, provider capacity or political events. Use custom growth to try a scenario.'];
  document.getElementById('pjAssume').innerHTML=items.map(t=>'<li>'+t+'</li>').join('');

  // monthly table
  const months=[]; for(let mk=curMk; mk<=monthKey(fEnd); mk=addMonths(mk,1)) months.push(mk);
  const holNames=mk=>[...new Set(holidayWindows(mStart(mk),mEnd(mk)).filter(w=>w.k!=='fixed').map(w=>w.name))].join(', ');
  document.getElementById('pjMonth').innerHTML='<thead><tr><th class="nosort">Month</th><th class="nosort">So far</th><th class="nosort">Projected</th><th class="nosort">Total</th><th class="nosort">Likely range</th><th class="nosort">Last year</th><th class="nosort">vs LY</th><th class="nosort">Holidays</th></tr></thead><tbody>'+
    months.map(mk=>{ const a_=sumA(mStart(mk),mEnd(mk)), t=sumF(mStart(mk),mEnd(mk)), p=t-a_, pd=Math.max(0,mEnd(mk)-Math.max(S.max,mStart(mk)-1)), ly=lyOf(mk), vs=ly?(t-ly)/ly*100:null, pr=rangeFor(pd)/100;
      return '<tr><td>'+fmtM(mk)+'</td><td>'+(a_?fmtInt(a_):'–')+'</td><td class="proj">'+fmtInt(p)+'</td><td><strong>'+fmtInt(t)+'</strong></td><td class="proj">'+fmtInt(a_+p*(1-pr))+' – '+fmtInt(a_+p*(1+pr))+'</td><td>'+(ly==null?'–':fmtInt(ly))+'</td><td class="'+(vs==null?'':vs>0?'pos':'neg')+'">'+fmtPct(vs)+'</td><td style="text-align:left;white-space:normal;min-width:140px">'+esc(holNames(mk))+'</td></tr>'; }).join('')+'</tbody>';

  // per-service table (each service projected on its own)
  const svc=S.order.map(i=>S.catList[i]).filter(c=>st.svc.has(c));
  let sumSvc=0;
  const rows=svc.map(c=>{ const yc=series(S.min,S.max,m,[c],stats); const last28=sum(yc.subarray(yc.length-28));
    if(last28<5) return {c,thin:true,last:sum(yc.subarray(yc.length-H))};
    const hmc= st.pjHol? holidayMultiplier(holidayEffects([c],stats,m)) : ()=>1;
    const Mc=fitProjection(yc,S.max,mode,st.pjCustom,hmc); let p=0; for(let n=start;n<=end;n++) p+=Mc.f(n); sumSvc+=p;
    const last=sum(yc.subarray(yc.length-H)); return {c,p,last,chg:last?(p-last)/last*100:null,mo:Mc.monthly};
  });
  document.getElementById('pjSDesc').textContent='Next '+H+' days, each service projected from its own history. Services with fewer than 5 '+MLABEL[m].toLowerCase()+' in the last 28 days are too small to project. The sum of services can differ a little from the overall projection, since each is fitted separately.';
  document.getElementById('pjSvc').innerHTML='<thead><tr><th class="nosort">Service</th><th class="nosort">Last '+H+' days</th><th class="nosort">Next '+H+' days</th><th class="nosort">Change</th><th class="nosort">Recent trend / month</th></tr></thead><tbody>'+
    '<tr class="total"><td>Sum of services</td><td>'+fmtInt(lastH)+'</td><td>'+fmtInt(sumSvc)+'</td><td>'+fmtPct(lastH?(sumSvc-lastH)/lastH*100:null)+'</td><td></td></tr>'+
    rows.map(r=>'<tr><td><span class="sw" style="background:'+S.colorOf[r.c]+'"></span>'+esc(label(r.c))+'</td>'+(r.thin? '<td>'+fmtInt(r.last||0)+'</td><td colspan="3" style="text-align:left;color:var(--muted)">Too little recent volume</td>' :
      '<td>'+fmtInt(r.last)+'</td><td>'+fmtInt(r.p)+'</td><td class="'+(r.chg>0.5?'pos':r.chg<-0.5?'neg':'')+'">'+fmtPct(r.chg)+'</td><td class="'+(r.mo>0.5?'pos':r.mo<-0.5?'neg':'')+'">'+fmtPct(r.mo,1)+'</td>')+'</tr>').join('')+'</tbody>';

  // accuracy table
  document.getElementById('pjAcc').innerHTML='<thead><tr><th class="nosort">As if it were</th><th class="nosort">Projected next 28 days</th><th class="nosort">Actual</th><th class="nosort">Error</th></tr></thead><tbody>'+
    bt.map(x=>'<tr><td>'+fmtD(x.cut)+'</td><td>'+fmtInt(x.p)+'</td><td>'+fmtInt(x.a)+'</td><td class="'+(Math.abs(x.err)<5?'':x.err>0?'pos':'neg')+'">'+fmtPct(x.err,1)+'</td></tr>').join('')+
    '</tbody>'+(mode==='custom'?'<caption style="caption-side:bottom;text-align:left;padding-top:6px" class="note">Custom growth can’t be checked against the past, so this uses the slowing-trend setting.</caption>':'');
}
function wireProjections(){
  document.querySelectorAll('#pjHorizon button').forEach(b=>b.addEventListener('click',()=>{st.pjH=+b.dataset.h; renderProjections();}));
  document.getElementById('pjGrowth').addEventListener('change',e=>{st.pjGrowth=e.target.value; renderProjections();});
  document.getElementById('pjCustom').addEventListener('change',e=>{const v=+e.target.value; if(isFinite(v)){st.pjCustom=Math.max(-50,Math.min(100,v)); renderProjections();}});
  document.getElementById('pjHolToggle').addEventListener('click',e=>{e.preventDefault(); st.pjHol=!st.pjHol; renderProjections();});
}
