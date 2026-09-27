/* ---------- providers and doctor specialties (optional provider export) ----------
   One row per day, service, visit status and provider, from sql/provider_orders_daily.sql.
   Follows the top filter: the services chosen there (doctor visits, nursing, physiotherapy and
   surgeries have named providers), the statuses, the measure, the date range and By.
   Also feeds the "What inside a service moves the others" panel in Service links. */
let PV=null, pvTrend=null, pvActive=null, pvSpec=null, pdDrv=null, pdTgt=null;
const PV_NOSPEC='Specialty not set';
function buildProviders(text){
  if(!text||!text.trim()) return null;
  const lines=text.trim().split(/\r?\n/), hdr=splitCsv(lines[0]).map(normHdr), ix=n=>hdr.indexOf(n);
  const iD=ix('day'), iC=ix('service_category'), iS=ix('visit_status'), iId=ix('provider_id'), iN=ix('provider_name'), iSp=ix('specialty'),
        iSv=ix('services_delivered'), iO=ix('distinct_orders'), iP=ix('distinct_patients');
  if(iD<0||iC<0||iN<0||iO<0) throw new Error('The provider export needs the columns day, service_category, provider_name and distinct_orders.');
  const provs=new Map(), rows=[], specs=new Set(), cats=new Set(); let min=Infinity, max=-Infinity;
  for(let k=1;k<lines.length;k++){
    const f=splitCsv(lines[k]); if(f.length<hdr.length-1) continue;
    const n=toN((f[iD]||'').slice(0,10)); if(!isFinite(n)) continue;
    const cat=f[iC].trim(), name=(f[iN]||'').trim()||'Unassigned', id=iId>=0&&(f[iId]||'').trim()? f[iId].trim() : name;
    const key=cat+'|'+id; let p=provs.get(key);
    if(!p){ p={i:provs.size,id,name,cat,spec:''}; provs.set(key,p); }
    const sp=iSp>=0? (f[iSp]||'').trim() : ''; if(sp){ p.spec=sp; specs.add(sp); }
    cats.add(cat);
    rows.push({n,p:p.i,cat,st:iS>=0?f[iS].trim():'finished',sp,v:[num(f[iSv]),num(f[iO]),iP>=0?num(f[iP]):0]});
    if(n<min) min=n; if(n>max) max=n;
  }
  if(!rows.length) return null;
  rows.sort((x,y)=>x.n-y.n);
  return {rows,provs:[...provs.values()],min,max,hasSpec:specs.size>0,specs:[...specs],cats:[...cats]};
}
const pvName=p=> p.name+(p.name==='Unassigned'?' ('+label(p.cat)+')':'');
const specOf=r=> r.sp || PV.provs[r.p].spec || PV_NOSPEC;
const isDoctorCat=c=> c==='doctorVisit'||c==='surgeries';
/* rows inside [a,b] that pass the top filter; rows are sorted by day, so find the start by bisection */
function pvEach(a,b,fn,extra){
  const R=PV.rows; let lo=0, hi=R.length; while(lo<hi){ const m=(lo+hi)>>1; if(R[m].n<a) lo=m+1; else hi=m; }
  const mi=MI[st.measure];
  for(let i=lo;i<R.length&&R[i].n<=b;i++){ const r=R[i]; if(!st.svc.has(r.cat)||!st.status.has(r.st)) continue; if(extra&&!extra(r)) continue; fn(r,r.v[mi]); }
}
function pvTotals(a,b,keyFn,extra){ const m=new Map(); pvEach(a,b,(r,v)=>{ const k=keyFn(r); m.set(k,(m.get(k)||0)+v); },extra); return m; }
function pvSelCats(){ return PV? PV.cats.filter(c=>st.svc.has(c)) : []; }

function renderProviders(){
  const empty=document.getElementById('pvEmpty'), body=document.getElementById('pvBody'), msg=document.getElementById('pvMsg');
  if(!PV){ empty.hidden=false; body.hidden=true; msg.hidden=true; return; }
  empty.hidden=true;
  const cats=pvSelCats();
  if(!cats.length){ msg.innerHTML='None of the services picked in the filter bar have named providers. Pick <strong>Doctor visit</strong>, <strong>Nursing</strong> or <strong>Physiotherapy</strong>.'; msg.hidden=false; body.hidden=true; return; }
  const a=st.from, b=st.to, len=b-a+1, M=MLABEL[st.measure];
  const notes=[];
  if(st.basis==='booked') notes.push('Provider data is dated by scheduled time, whatever Dates by is set to.');
  if(a<PV.min||b>PV.max) notes.push('The provider export covers '+fmtD(PV.min)+' – '+fmtD(PV.max)+'; days outside that count as zero.');
  msg.textContent=notes.join(' '); msg.hidden=!notes.length; body.hidden=false;
  const hasP=a-len>=PV.min, hasY=a-364>=PV.min;
  const cur=pvTotals(a,b,r=>r.p), prev=hasP?pvTotals(a-len,a-1,r=>r.p):new Map(), ly=hasY?pvTotals(a-364,b-364,r=>r.p):new Map();
  const catTot={}; for(const [pi,v] of cur){ const c=PV.provs[pi].cat; catTot[c]=(catTot[c]||0)+v; }
  const active=[...cur.entries()].filter(([pi,v])=>v>0&&PV.provs[pi].name!=='Unassigned');
  const activePrev=[...prev.entries()].filter(([pi,v])=>v>0&&PV.provs[pi].name!=='Unassigned').length;
  const grand=[...cur.values()].reduce((s,v)=>s+v,0);
  const top5=active.map(x=>x[1]).sort((x,y)=>y-x).slice(0,5).reduce((s,v)=>s+v,0);
  const newProv=hasP? active.filter(([pi])=>!(prev.get(pi)>0)).length : null;
  const tiles=[
    {lab:'Active providers',val:fmtInt(active.length),sub:hasP?'Previous period: '+fmtInt(activePrev)+(newProv!=null?' · '+fmtInt(newProv)+' not active before':''):'At least one '+M.toLowerCase().replace(/s$/,'')+' in the range'},
    {lab:M+' per active provider',val:active.length?(active.reduce((s,x)=>s+x[1],0)/active.length).toFixed(1):'–',sub:fmtD(a)+' – '+fmtD(b)},
    {lab:'Top 5 providers’ share',val:grand?(top5/grand*100).toFixed(0)+'%':'–',sub:'Of all '+M.toLowerCase()+' for '+cats.map(label).join(', ')},
    {lab:'Unassigned',val:grand?(([...cur.entries()].filter(([pi])=>PV.provs[pi].name==='Unassigned').reduce((s,x)=>s+x[1],0))/grand*100).toFixed(1)+'%':'–',sub:'No provider on the service yet'}];
  document.getElementById('pvKpis').innerHTML=tiles.map(t=>'<div class="kpi"><span class="lab">'+t.lab+'</span><span class="val">'+t.val+'</span><span class="sub">'+esc(t.sub)+'</span></div>').join('');
  // table
  const pc=(x,y)=>y>=5?(x-y)/y*100:null, cls=v=>v==null?'':v>0.5?'pos':v<-0.5?'neg':'';
  const rows=[...new Set([...cur.keys(),...prev.keys()])].map(pi=>{ const p=PV.provs[pi], c=cur.get(pi)||0, pv=prev.get(pi)||0, l=ly.get(pi)||0;
    return {p,cur:c,share:catTot[p.cat]?c/catTot[p.cat]*100:0,prev:hasP?pv:null,diff:hasP?c-pv:null,chg:hasP?pc(c,pv):null,ly:hasY?pc(c,l):null}; }).filter(r=>r.cur>0||r.prev>0);
  const k=st.pvSort.k, dir=st.pvSort.dir, val=r=>k==='name'?pvName(r.p).toLowerCase():k==='spec'?(r.p.spec||'~'):r[k];
  rows.sort((x,y)=>{ const u=val(x), w=val(y); if(u==null) return 1; if(w==null) return -1; return (u<w?-1:u>w?1:0)*dir; });
  const showSpec=PV.hasSpec&&cats.some(isDoctorCat);
  const cols=[['name','Provider'],['cat','Service']].concat(showSpec?[['spec','Specialty']]:[]).concat([['cur',M],['share','Share of service'],['prev','Previous period'],['diff','Change'],['chg','Change %'],['ly','vs last year']]);
  const t=document.getElementById('pvTable');
  t.innerHTML='<thead><tr>'+cols.map(([key,l])=>'<th data-k="'+key+'"'+(key==='name'||key==='cat'||key==='spec'?' style="text-align:left"':'')+'>'+l+(k===key?(dir<0?' ↓':' ↑'):'')+'</th>').join('')+'</tr></thead><tbody>'+
    rows.slice(0,60).map(r=>'<tr><td dir="auto" style="text-align:left">'+esc(pvName(r.p))+'</td><td style="text-align:left">'+esc(label(r.p.cat))+'</td>'+(showSpec?'<td style="text-align:left">'+esc(isDoctorCat(r.p.cat)?(r.p.spec||'–'):'')+'</td>':'')+
      '<td>'+fmtInt(r.cur)+'</td><td>'+r.share.toFixed(1)+'%</td><td>'+(r.prev==null?'–':fmtInt(r.prev))+'</td><td class="'+cls(r.diff)+'">'+(r.diff==null?'–':(r.diff>0?'+':'')+fmtInt(r.diff))+'</td><td class="'+cls(r.chg)+'">'+fmtPct(r.chg,0)+'</td><td class="'+cls(r.ly)+'">'+fmtPct(r.ly,0)+'</td></tr>').join('')+'</tbody>';
  t.querySelectorAll('th').forEach(th=>th.addEventListener('click',()=>{ const key=th.dataset.k; st.pvSort= st.pvSort.k===key? {k:key,dir:-st.pvSort.dir} : {k:key,dir:key==='name'||key==='cat'||key==='spec'?1:-1}; renderProviders(); }));
  document.getElementById('pvTableNote').textContent=(rows.length>60?'Top 60 of '+rows.length+' providers by the sorted column. ':'')+'Previous period = the same number of days just before. Change % needs at least 5 in the previous period.';
  document.getElementById('pvDesc').textContent=cats.map(label).join(', ')+' · '+fmtD(a)+' – '+fmtD(b)+' · '+M;
  // trend of the busiest providers
  const B=buckets(a,b,st.gran), labels=B.keys.map(x=>bucketLabel(x.k,st.gran));
  const topIds=active.sort((x,y)=>y[1]-x[1]).slice(0,6).map(x=>x[0]);
  const byB=new Map(topIds.map(pi=>[pi,new Float64Array(B.keys.length)])), actB=cats.map(()=>B.keys.map(()=>new Set()));
  pvEach(a,b,(r,v)=>{ const i=B.at(r.n); const arr=byB.get(r.p); if(arr) arr[i]+=v; if(v>0&&PV.provs[r.p].name!=='Unassigned'){ const ci=cats.indexOf(r.cat); if(ci>=0) actB[ci][i].add(r.p); } });
  const pal=['--s1','--s2','--s3','--s4','--s5','--s6'];
  const ds=topIds.map((pi,i)=>({label:pvName(PV.provs[pi]),data:[...byB.get(pi)],borderColor:css(pal[i]),backgroundColor:css(pal[i]),borderWidth:2,pointRadius:0,pointHoverRadius:4,tension:.25}));
  const o=baseOpts(); o.plugins.tooltip.callbacks={label:it=>' '+it.dataset.label+': '+fmtInt(it.parsed.y)};
  if(pvTrend) pvTrend.destroy(); pvTrend=new Chart(document.getElementById('pvTrendChart'),{type:'line',data:{labels,datasets:ds},options:o});
  document.getElementById('pvTrendLegend').innerHTML=ds.map(d=>'<span><i style="background:'+d.borderColor+'"></i>'+esc(d.label)+'</span>').join('');
  document.getElementById('pvTrendH').textContent='Busiest providers · '+M.toLowerCase()+' by '+st.gran;
  // active providers per bucket, one line per service
  const ds2=cats.map((c,i)=>({label:label(c),data:actB[i].map(s=>s.size),borderColor:css(S.colorOf[c]?S.colorOf[c].slice(4,-1):pal[i%6]),backgroundColor:css(S.colorOf[c]?S.colorOf[c].slice(4,-1):pal[i%6]),borderWidth:2,pointRadius:0,pointHoverRadius:4,tension:.25}));
  const o2=baseOpts(); o2.plugins.tooltip.callbacks={label:it=>' '+it.dataset.label+': '+fmtInt(it.parsed.y)+' providers'};
  if(pvActive) pvActive.destroy(); pvActive=new Chart(document.getElementById('pvActiveChart'),{type:'line',data:{labels,datasets:ds2},options:o2});
  document.getElementById('pvActiveLegend').innerHTML=ds2.map(d=>'<span><i style="background:'+d.borderColor+'"></i>'+esc(d.label)+'</span>').join('');
  renderSpecialties(a,b,B,labels,hasP,hasY,len);
}
function renderSpecialties(a,b,B,labels,hasP,hasY,len){
  const panel=document.getElementById('spPanel'), none=document.getElementById('spNone'), sbody=document.getElementById('spBody');
  const docCats=pvSelCats().filter(isDoctorCat);
  if(!docCats.length){ panel.hidden=true; return; }
  panel.hidden=false;
  if(!PV.hasSpec){ none.hidden=false; sbody.hidden=true; return; }
  none.hidden=true; sbody.hidden=false;
  const onlyDoc=r=>isDoctorCat(r.cat), M=MLABEL[st.measure];
  const cur=pvTotals(a,b,specOf,onlyDoc), prev=hasP?pvTotals(a-len,a-1,specOf,onlyDoc):new Map(), ly=hasY?pvTotals(a-364,b-364,specOf,onlyDoc):new Map();
  const grand=[...cur.values()].reduce((s,v)=>s+v,0);
  const specs=[...cur.keys()].sort((x,y)=>cur.get(y)-cur.get(x));
  const pc=(x,y)=>y>=5?(x-y)/y*100:null, cls=v=>v==null?'':v>0.5?'pos':v<-0.5?'neg':'';
  document.getElementById('spTable').innerHTML='<thead><tr><th class="nosort" style="text-align:left">Specialty</th><th class="nosort">'+M+'</th><th class="nosort">Share</th><th class="nosort">Previous period</th><th class="nosort">Change %</th><th class="nosort">vs last year</th></tr></thead><tbody>'+
    specs.map(s=>{ const c=cur.get(s)||0, p=prev.get(s)||0, l=ly.get(s)||0, ch=hasP?pc(c,p):null, y=hasY?pc(c,l):null;
      return '<tr><td dir="auto" style="text-align:left">'+esc(s)+'</td><td>'+fmtInt(c)+'</td><td>'+(grand?(c/grand*100).toFixed(1):'0')+'%</td><td>'+(hasP?fmtInt(p):'–')+'</td><td class="'+cls(ch)+'">'+fmtPct(ch,0)+'</td><td class="'+cls(y)+'">'+fmtPct(y,0)+'</td></tr>'; }).join('')+'</tbody>';
  const top=specs.slice(0,8), pal=['--s1','--s2','--s3','--s4','--s5','--s6','--s7','--s8'];
  const arr=new Map(top.map(s=>[s,new Float64Array(B.keys.length)]));
  pvEach(a,b,(r,v)=>{ const x=arr.get(specOf(r)); if(x) x[B.at(r.n)]+=v; },onlyDoc);
  const ds=top.map((s,i)=>({label:s,data:[...arr.get(s)],borderColor:css(pal[i]),backgroundColor:css(pal[i]),borderWidth:2,pointRadius:0,pointHoverRadius:4,tension:.25}));
  const o=baseOpts(); o.plugins.tooltip.callbacks={label:it=>' '+it.dataset.label+': '+fmtInt(it.parsed.y)};
  if(pvSpec) pvSpec.destroy(); pvSpec=new Chart(document.getElementById('spChart'),{type:'line',data:{labels,datasets:ds},options:o});
  document.getElementById('spLegend').innerHTML=ds.map(d=>'<span><i style="background:'+d.borderColor+'"></i>'+esc(d.label)+'</span>').join('');
  document.getElementById('spDesc').textContent=docCats.map(label).join(', ')+' by the doctor’s specialty · '+M.toLowerCase()+' by '+st.gran;
}

/* ---------- Service links: what inside a service moves the others ----------
   Drivers: each doctor specialty and the busiest doctors and nurses among the selected services.
   Targets: the other selected services. For every pair, week-over-week changes in the driver
   against changes in the target 0-4 weeks later. Many pairs are tested at once, so "strong" uses
   a Bonferroni bar (5% across every pair and lag); "possible" is the 5% bar for one test. */
/* Provider comparison robust to one dominant provider (funnel-plot style): the benchmark is the median
   provider's rate, z = (rate - median) / binomial SE at the median, and when providers really differ more
   than chance allows, z is scaled down by the robust overdispersion factor phi = median(z^2) / 0.455.
   rs = [{r, n}] (rate 0-1, denominator). Returns {bench, z:[...] } or null when fewer than 3 providers. */
function robustBench(rs){
  if(rs.length<3) return null;
  const v=rs.map(x=>x.r).sort((a,b)=>a-b), k=v.length, bench=k%2? v[(k-1)/2] : (v[k/2-1]+v[k/2])/2;
  const b=Math.min(0.999,Math.max(0.001,bench)), z=rs.map(x=>(x.r-bench)/Math.sqrt(b*(1-b)/x.n));
  const z2=z.map(t=>t*t).sort((a,b)=>a-b), m2=k%2? z2[(k-1)/2] : (z2[k/2-1]+z2[k/2])/2, phi=Math.max(1,m2/0.455);
  return {bench, phi, z:z.map(t=>t/Math.sqrt(phi))};
}
function zTwoSided(p){ // |z| with two-sided tail p, by bisection on the normal tail
  const tail=z=>{ const t=1/(1+0.2316419*z), d=Math.exp(-z*z/2)/Math.sqrt(2*Math.PI); return 2*d*t*(0.31938153+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429)))); };
  let lo=0, hi=8; for(let i=0;i<60;i++){ const m=(lo+hi)/2; if(tail(m)>p) lo=m; else hi=m; } return (lo+hi)/2;
}
let pdSel=0, pdRows=[];
function renderDrivers(chosen,a,b){
  const panel=document.getElementById('pdPanel'), msg=document.getElementById('pdMsg'), body=document.getElementById('pdBody');
  const driverCats=PV? chosen.filter(c=>PV.cats.includes(c)) : [];
  panel.hidden=false;
  if(!PV||!driverCats.length||chosen.length<2){
    msg.innerHTML=!PV? 'This needs the provider export. Open the <strong>Data</strong> tab, copy the provider SQL, run it in Metabase and drop the CSV there.'
      : 'Pick a service with named providers (Doctor visit, Nursing or Physiotherapy) and at least one other service in the filter bar.';
    msg.hidden=false; body.hidden=true; return; }
  const w0=weekStart(a)+(weekStart(a)<a?7:0), keys=[]; for(let w=w0; w+6<=b; w+=7) keys.push(w);
  if(keys.length<14){ msg.textContent='Pick a date range of at least 14 weeks.'; msg.hidden=false; body.hidden=true; return; }
  const end=keys[keys.length-1]+6, nW=keys.length, wi=n=>Math.floor((n-w0)/7);
  // driver series
  const drivers=[];
  const addWeekly=(name,kind,cat,test)=>{ const v=new Float64Array(nW); let tot=0; pvEach(w0,end,(r,x)=>{ v[wi(r.n)]+=x; tot+=x; },test); if(tot<nW) return; const arr=[...v]; if(drivers.some(d=>d.v.every((x,i)=>x===arr[i]))) return; drivers.push({name,kind,cat,v:arr,tot}); };
  if(PV.hasSpec&&driverCats.some(isDoctorCat)){
    const sp=pvTotals(w0,end,specOf,r=>isDoctorCat(r.cat));
    [...sp.entries()].filter(([s])=>s!==PV_NOSPEC).sort((x,y)=>y[1]-x[1]).slice(0,10).forEach(([s])=>addWeekly(s,'Specialty','doctorVisit',r=>isDoctorCat(r.cat)&&specOf(r)===s));
  }
  driverCats.forEach(c=>{ const tp=pvTotals(w0,end,r=>r.p,r=>r.cat===c);
    [...tp.entries()].filter(([pi])=>PV.provs[pi].name!=='Unassigned').sort((x,y)=>y[1]-x[1]).slice(0,6).forEach(([pi])=>addWeekly(pvName(PV.provs[pi]),label(c)+' provider',c,r=>r.p===pi)); });
  const tgt=chosen.map(c=>({c,v:weeklyOf(c,a,b).v.slice(0,nW)}));
  const d=v=>v.slice(1).map((x,i)=>Math.log1p(x)-Math.log1p(v[i]));
  const pairs=[];
  for(const dr of drivers){ const dx=d(dr.v);
    for(const t of tgt){ if(t.c===dr.cat) continue; const dy=d(t.v);
      let best=null; for(let k=0;k<=4;k++){ const xs=[],ys=[]; for(let i=0;i+k<dy.length;i++){ xs.push(dx[i]); ys.push(dy[i+k]); } const r=corr(xs,ys); if(r!=null&&(!best||Math.abs(r)>Math.abs(best.r))) best={k,r,n:xs.length,ne:effN(xs,ys)}; }
      if(best) pairs.push({dr,t,...best}); } }
  if(!pairs.length){ msg.textContent='Not enough provider volume in this range to test.'; msg.hidden=false; body.hidden=true; return; }
  const tests=pairs.length*5, zStrong=zTwoSided(0.05/tests);
  pairs.forEach(p=>{ const s=Math.sqrt(p.ne); p.verdict=Math.abs(p.r)>zStrong/s?'strong':Math.abs(p.r)>1.96/s?'possible':'noise'; });
  pairs.sort((x,y)=>Math.abs(y.r)-Math.abs(x.r));
  pdRows=pairs.slice(0,20); if(pdSel>=pdRows.length) pdSel=0;
  msg.hidden=true; body.hidden=false;
  const nStrong=pairs.filter(p=>p.verdict==='strong').length, nPoss=pairs.filter(p=>p.verdict==='possible').length;
  const chance=pairs.length*0.05;
  document.getElementById('pdDesc').textContent=drivers.length+' drivers against '+tgt.map(t=>label(t.c)).join(', ')+': '+pairs.length+' pairs, lags 0–4 weeks, '+nW+' full weeks. '+nStrong+' strong, '+nPoss+' possible'+(chance>=0.5?' (about '+Math.round(chance)+' possible would turn up by chance alone)':'')+'.';
  const vt={strong:'<span class="delta up">✓ Strong</span>',possible:'<span class="delta flat">~ Possible</span>',noise:'<span class="delta flat" style="opacity:.7">Could be chance</span>'};
  const tb=document.getElementById('pdTable');
  tb.innerHTML='<thead><tr><th class="nosort" style="text-align:left">Driver</th><th class="nosort" style="text-align:left">Type</th><th class="nosort" style="text-align:left">Service it may move</th><th class="nosort">Best lag</th><th class="nosort">Correlation</th><th class="nosort">Verdict</th></tr></thead><tbody>'+
    pdRows.map((p,i)=>'<tr data-i="'+i+'" class="'+(i===pdSel?'sel':'')+'" style="cursor:pointer"><td dir="auto" style="text-align:left">'+esc(p.dr.name)+'</td><td style="text-align:left">'+esc(p.dr.kind)+'</td><td style="text-align:left">'+esc(label(p.t.c))+'</td><td>'+(p.k===0?'Same week':p.k+' wk later')+'</td><td>'+p.r.toFixed(2)+'</td><td>'+vt[p.verdict]+'</td></tr>').join('')+'</tbody>';
  tb.querySelectorAll('tbody tr').forEach(tr=>tr.addEventListener('click',()=>{ pdSel=+tr.dataset.i; renderDrivers(chosen,a,b); }));
  document.getElementById('pdFinding').innerHTML= nStrong
    ? '<strong>'+nStrong+' pair'+(nStrong>1?'s pass':' passes')+' the strict bar.</strong> The top one: changes in '+esc(pairs[0].dr.name)+' line up with changes in '+esc(label(pairs[0].t.c))+' '+(pairs[0].k?pairs[0].k+' week'+(pairs[0].k>1?'s':'')+' later':'in the same week')+' (r = '+pairs[0].r.toFixed(2)+(pairs[0].r>0?', moving the same way':', moving in opposite directions')+').'
    : 'No pair passes the strict bar, so none of these links is clearly more than chance with this many pairs tested. “Possible” rows are leads to check with a longer range.';
  // the selected row: two separate charts
  const p=pdRows[pdSel], labels=keys.map(k=>fmtDs(k));
  const mk=(el,old,lab,data,color)=>{ if(old) old.destroy(); const o=baseOpts(); o.scales.y.ticks.maxTicksLimit=4; o.plugins.tooltip.callbacks={title:it=>'Week of '+fmtD(keys[it[0].dataIndex]),label:it=>' '+lab+': '+fmtInt(it.parsed.y)};
    return new Chart(document.getElementById(el),{type:'line',data:{labels,datasets:[{label:lab,data,borderColor:color,backgroundColor:color,borderWidth:2,pointRadius:0,pointHoverRadius:4,tension:.25}]},options:o}); };
  pdDrv=mk('pdDrvChart',pdDrv,p.dr.name,p.dr.v,css('--s2'));
  pdTgt=mk('pdTgtChart',pdTgt,label(p.t.c),p.t.v,css('--accent'));
  document.getElementById('pdDrvH').textContent='Weekly '+MLABEL[st.measure].toLowerCase()+' · '+p.dr.name+' ('+p.dr.kind.toLowerCase()+')';
  document.getElementById('pdTgtH').textContent='Weekly '+MLABEL[st.measure].toLowerCase()+' · '+label(p.t.c)+(p.k?' (compare with '+p.k+' week'+(p.k>1?'s':'')+' later)':'');
}
function wireProviders(){
  document.getElementById('copySqlPv').addEventListener('click',()=>navigator.clipboard.writeText(P.providersSql).then(()=>toast('Provider SQL copied')).catch(()=>toast('Copy was blocked by this browser; the query is in sql/provider_orders_daily.sql')));
}
