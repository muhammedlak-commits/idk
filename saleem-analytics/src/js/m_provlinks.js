/* ---------- Service links › Specialties & providers: follow-on by provider, busy weeks ----------
   1. Provider follow-on (optional export, sql/provider_followon_monthly.sql): of the patients a doctor,
      nurse or physiotherapist saw, the share who had one of the other selected services within 7 and
      30 days, against the median provider of the same service (robustBench in m_providers.js), or the
      other providers pooled (two-proportion z-test) when fewer than 3 have enough patients.
   2. Busy weeks (provider export): weeks when a provider took an unusually large share of their
      service, and whether the other selected services grew faster in the 2 or 4 weeks after. */
let PF=null, pfChart=null, bwShare=null, bwTgt=null, bwRows=[];
function buildProvFollowon(text){
  if(!text||!text.trim()) return null;
  const lines=text.trim().split(/\r?\n/), hdr=splitCsv(lines[0]).map(normHdr), ix=n=>hdr.indexOf(n);
  const need=['month','provider_service','provider_name','target_service','eligible_30d','followed_30d'], miss=need.filter(n=>ix(n)<0);
  if(miss.length) throw new Error('The provider follow-on export needs the columns '+need.join(', ')+'. Missing: '+miss.join(', ')+'.');
  const iM=ix('month'), iS=ix('provider_service'), iId=ix('provider_id'), iN=ix('provider_name'), iSp=ix('specialty'), iT=ix('target_service'),
        iP=ix('patients'), iE7=ix('eligible_7d'), iF7=ix('followed_7d'), iE30=ix('eligible_30d'), iF30=ix('followed_30d'), iO=ix('target_orders_30d');
  const g=(f,i)=>i>=0?num(f[i]):0, provs=new Map(), rows=[], base=new Map(), cell=new Map(), months=new Set(), srcs=new Set(), tgts=new Set();
  for(let k=1;k<lines.length;k++){
    const f=splitCsv(lines[k]); if(f.length<hdr.length-1) continue;
    const m=(f[iM]||'').match(/(\d{4})-(\d{2})/); if(!m) continue; const mk=m[1]+'-'+m[2];
    const src=(f[iS]||'').trim(), tgt=(f[iT]||'').trim(); if(!src||!tgt) continue;
    const name=(f[iN]||'').trim()||'Unassigned', id=iId>=0&&(f[iId]||'').trim()? f[iId].trim() : name, key=src+'|'+id;
    let p=provs.get(key); if(!p){ p={i:provs.size,id,name,cat:src,spec:''}; provs.set(key,p); }
    const sp=iSp>=0?prettySpec((f[iSp]||'').trim()):''; if(sp) p.spec=sp;
    const r={mk,p:p.i,src,tgt,pat:g(f,iP),e7:g(f,iE7),f7:g(f,iF7),e30:g(f,iE30),f30:g(f,iF30),o30:g(f,iO)};
    rows.push(r); months.add(mk); srcs.add(src);
    if(tgt==='(any)') base.set(p.i+'|'+mk,r); else { tgts.add(tgt); cell.set(p.i+'|'+mk+'|'+tgt,r); }
  }
  if(!rows.length) return null;
  // a provider-month without its '(any)' row takes the counts its target rows repeat
  for(const r of rows) if(r.tgt!=='(any)'&&!base.has(r.p+'|'+r.mk)) base.set(r.p+'|'+r.mk,{mk:r.mk,p:r.p,src:r.src,tgt:'(any)',pat:r.pat,e7:r.e7,f7:0,e30:r.e30,f30:0,o30:0});
  return {rows,provs:[...provs.values()],base,cell,months:[...months].sort(),srcs:[...srcs],tgts:[...tgts]};
}
/* pairs from the top filter: a provider service picked there, then each other picked service as the database names it */
function pfPairs(chosen,M=PF,to=chosen){
  if(!M) return [];
  const out=[];
  for(const s of chosen.filter(c=>M.srcs.includes(c))){ const seen=new Set();
    for(const c of to){ if(c===s) continue; const t=UP_CAT[c]||c; if(t===s||seen.has(t)||!M.tgts.includes(t)) continue; seen.add(t); out.push({src:s,tgt:t}); } }
  return out;
}
/* pooled over the months in range; a missing target row = nobody followed on, with the provider-month's eligible counts */
function pfCompute(M,{fromMk,toMk,pairs,minElig=10}){
  const months=M.months.filter(mk=>mk>=fromMk&&mk<=toMk), rows=[], pairOut=[];
  for(const pr of pairs){
    const acc=M.provs.filter(p=>p.cat===pr.src&&p.name!=='Unassigned').map(p=>{ const a={p,pat:0,e7:0,f7:0,e30:0,f30:0,o30:0,me:[],mf:[]};
      for(const mk of months){ const b=M.base.get(p.i+'|'+mk), c=b&&M.cell.get(p.i+'|'+mk+'|'+pr.tgt);
        a.me.push(b?b.e30:0); a.mf.push(c?c.f30:0); if(!b) continue;
        a.pat+=b.pat; a.e7+=b.e7; a.e30+=b.e30; if(c){ a.f7+=c.f7; a.f30+=c.f30; a.o30+=c.o30; } }
      return a; });
    const E=acc.reduce((s,a)=>s+a.e30,0), Fo=acc.reduce((s,a)=>s+a.f30,0), pool=E?Fo/E:0, mine=[];
    // benchmark: the median provider when there are 3+ (robust to one big outlier), else the other providers pooled
    const inL=acc.filter(a=>a.e30>=minElig), rb=robustBench(inL.map(a=>({r:a.f30/a.e30,n:a.e30})));
    inL.forEach((a,i)=>{
      const pe=E-a.e30, pf=Fo-a.f30, r30=a.f30/a.e30; let peer, z;
      if(rb){ peer=rb.benches[i]; z=rb.z[i]; }
      else { peer=pe>0?pf/pe:null; const se=pe>0?Math.sqrt(pool*(1-pool)*(1/a.e30+1/pe)):0; z=se>0?(r30-peer)/se:null; }
      const row={src:pr.src,tgt:pr.tgt,p:a.p,pat:a.pat,e7:a.e7,f7:a.f7,e30:a.e30,f30:a.f30,o30:a.o30,r7:a.e7?a.f7/a.e7:null,r30,peer,peerN:rb?inL.length:pe,peerKind:rb?'median':'pooled',
        diff:peer==null?null:r30-peer,z,per100:a.o30/a.e30*100,me:a.me,mf:a.mf};
      rows.push(row); mine.push(row); });
    const pooled=months.map((_,i)=>{ let e=0,f=0; for(const a of acc){ e+=a.me[i]; f+=a.mf[i]; } return e?f/e:null; });
    pairOut.push({...pr,E,F:Fo,rate:E?Fo/E:null,n:mine.length,pooled,top:mine.slice().sort((x,y)=>y.e30-x.e30).slice(0,4)});
  }
  const tests=rows.filter(r=>r.z!=null).length, zStrong=tests?zTwoSided(0.05/tests):Infinity, ord={strong:0,possible:1,chance:2,none:3};
  rows.forEach(r=>{ r.pv=r.z==null?null:normP(r.z); });
  const cut=bhCut(rows.map(r=>r.pv),tests);
  rows.forEach(r=>{ const z=r.z==null?null:Math.abs(r.z); r.verdict=z==null?'none':z>zStrong?'strong':r.pv<=cut?'possible':'chance'; });
  rows.sort((x,y)=>ord[x.verdict]-ord[y.verdict]||Math.abs(y.diff||0)-Math.abs(x.diff||0));
  return {rows,tests,zStrong,months,pairs:pairOut};
}
const pfTl=t=>UP_LABEL[t]||label(t);
const plVerdict=(v,d)=>({strong:'<span class="delta '+(d<0?'down':'up')+'">✓ Strong</span>',possible:'<span class="delta flat">~ Worth checking</span>',chance:'<span class="delta flat" style="opacity:.7">Could be chance</span>',none:'<span class="note">No peers</span>'})[v];
function renderProvFollowon(chosen,to=chosen,a=st.from,b=st.to){
  const panel=document.getElementById('pfPanel'), msg=document.getElementById('pfMsg'), body=document.getElementById('pfBody');
  panel.hidden=false;
  const setMsg=h=>{ msg.innerHTML=h; msg.hidden=false; body.hidden=true; if(pfChart){ pfChart.destroy(); pfChart=null; } };
  if(!PF) return setMsg('This needs the provider follow-on export. Copy the SQL, run it in Metabase with no date filter, download the results as CSV and drop the file on the <strong>Data</strong> tab. <button class="btn" type="button" id="copySqlPf">Copy SQL</button>');
  const pairs=pfPairs(chosen,PF,to);
  if(!pairs.length) return setMsg('Under <strong>From</strong>, pick a service with named providers (Doctor visit, Nursing or Physiotherapy); under <strong>To</strong>, pick the services it may lead to.');
  const R=pfCompute(PF,{fromMk:monthKey(a),toMk:monthKey(b),pairs}), m0=PF.months[0], m1=PF.months[PF.months.length-1];
  if(!R.months.length) return setMsg('The provider follow-on export covers '+fmtM(m0)+' – '+fmtM(m1)+', outside this period. Pick another period above.');
  if(!R.rows.length) return setMsg('No provider has 10 or more patients whose 30-day window has passed in this period. Pick a longer or earlier period above.');
  msg.hidden=true; body.hidden=false;
  const nS=R.rows.filter(r=>r.verdict==='strong').length, nP=R.rows.filter(r=>r.verdict==='possible').length, chance=0;
  const bySrc=new Map(); pairs.forEach(p=>{ if(!bySrc.has(p.src)) bySrc.set(p.src,[]); bySrc.get(p.src).push(pfTl(p.tgt)); });
  document.getElementById('pfDesc').textContent=[...bySrc].map(([s,t])=>label(s)+' → '+t.join(', ')).join(' · ')+' · '+fmtM(R.months[0])+' – '+fmtM(R.months[R.months.length-1])+' · '+
    R.rows.length+' provider rows with 10 or more patients: '+nS+' strong, '+nP+' worth checking.';
  const pc=v=>v==null?'–':(v*100).toFixed(1)+'%', pts=v=>v==null?'–':(v>0?'+':'')+(v*100).toFixed(1)+' pts';
  document.getElementById('pfTable').innerHTML='<thead><tr><th class="nosort" style="text-align:left">Provider</th><th class="nosort" style="text-align:left">Their service</th><th class="nosort" style="text-align:left">Then</th><th class="nosort">Patients seen</th><th class="nosort">Within 7 days</th><th class="nosort">Within 30 days</th><th class="nosort" title="Against the median provider of the same service (or the other providers together when there are only one or two)">vs typical provider (30 days)</th><th class="nosort">Verdict</th><th class="nosort">Orders per 100 patients</th></tr></thead><tbody>'+
    R.rows.slice(0,40).map(r=>'<tr><td dir="auto" style="text-align:left">'+esc(r.p.name)+(r.p.spec?' <span class="note">'+esc(r.p.spec)+'</span>':'')+'</td><td style="text-align:left">'+esc(label(r.src))+'</td><td style="text-align:left">'+esc(pfTl(r.tgt))+'</td><td>'+fmtInt(r.pat)+'</td><td>'+pc(r.r7)+'</td><td title="'+fmtInt(r.f30)+' of '+fmtInt(r.e30)+' patients">'+pc(r.r30)+'</td>'+
      '<td class="'+(r.verdict==='strong'||r.verdict==='possible'?(r.diff>0?'pos':'neg'):'')+'" title="'+(r.peer==null?'No other provider':r.peerKind==='median'?'Median of '+r.peerN+' providers: '+pc(r.peer):'Other providers: '+pc(r.peer)+' of '+fmtInt(r.peerN)+' patients')+'">'+pts(r.diff)+'</td><td>'+plVerdict(r.verdict,r.diff)+'</td><td>'+r.per100.toFixed(1)+'</td></tr>').join('')+'</tbody>';
  // monthly rate for the first pair with data: every provider pooled, plus the four with the most eligible patients
  const pr=R.pairs.find(p=>p.n>0), labels=R.months.map(fmtM), pal=['--s1','--s2','--s3','--s4'];
  const ds=[{label:'All providers, pooled',data:pr.pooled.map(v=>v==null?null:v*100),borderColor:css('--ghost'),backgroundColor:css('--ghost'),borderDash:[5,4],borderWidth:2,pointRadius:0,pointHoverRadius:4,tension:.25}]
    .concat(pr.top.map((r,i)=>({label:r.p.name,data:r.me.map((e,j)=>e>=10?r.mf[j]/e*100:null),el:r.me,borderColor:css(pal[i]),backgroundColor:css(pal[i]),borderWidth:2,pointRadius:3,pointHoverRadius:5,tension:.25})));
  const o=baseOpts(); o.scales.y.ticks.callback=v=>v+'%';
  o.plugins.tooltip.callbacks={label:it=>' '+it.dataset.label+': '+(it.parsed.y==null?'–':it.parsed.y.toFixed(1)+'%')+(it.dataset.el?' of '+fmtInt(it.dataset.el[it.dataIndex])+' patients':'')};
  if(pfChart) pfChart.destroy(); pfChart=new Chart(document.getElementById('pfChart'),{type:'line',data:{labels,datasets:ds},options:o});
  document.getElementById('pfLegend').innerHTML=ds.map(d=>'<span><i style="background:'+d.borderColor+'"></i>'+esc(d.label)+'</span>').join('');
  document.getElementById('pfChartH').textContent='30-day follow-on by month · '+label(pr.src)+' → '+pfTl(pr.tgt);
  const notes=['Pooled over the months in the range. A patient counts once per provider and month, from their first visit with that provider that month, so a patient seen in two months counts in both.',
    'Eligible = the 30-day (or 7-day) window has passed. Typical = the median provider of the same service (the others pooled when only one or two have enough patients), so one very large provider doesn’t make everyone else look worse; when providers differ more than chance allows, the bar is raised to match. A month on the chart needs 10 or more eligible patients.',
    '“Strong” passes a 5% bar corrected for all '+R.tests+' rows tested; “worth checking” passes a false-discovery check that keeps chance finds to about 1 in 10 of those rows. A provider who sees sicker patients will send more on, so a gap is a lead to look at, not proof.',
    'Real visits only (started, finished or reviewed), whatever statuses are picked above; services with no provider yet are left out.'];
  if(st.pview!=='all'&&S.hasNew) notes.push('This export has all patients, so the New / Returning switch doesn’t change this panel.');
  if(monthKey(st.from)<m0||monthKey(st.to)>m1) notes.push('The export covers '+fmtM(m0)+' – '+fmtM(m1)+'.');
  document.getElementById('pfNote').textContent=notes.join(' ');
}
function wireProvFollowon(){
  document.addEventListener('click',e=>{ if(!(e.target.closest&&e.target.closest('#copySqlPf'))) return;
    if(!P.provFollowonSql) return toast('The query is in sql/provider_followon_monthly.sql');
    navigator.clipboard.writeText(P.provFollowonSql).then(()=>toast('Provider follow-on SQL copied')).catch(()=>toast('Copy was blocked by this browser; the query is in sql/provider_followon_monthly.sql')); });
}

/* ---------- busy weeks and what followed ----------
   Busy week = the provider's share of their service at or above their own 80th percentile in the range.
   Growth after week t over k weeks = ln(1 + mean of weeks t+1..t+k) - ln(1 + mean of weeks t-3..t) of the
   other service. Busy weeks against other weeks with Welch's t-test; consecutive windows overlap, so each
   group's n is divided by k. Student t p-value from the regularized incomplete beta. */
function bwLnGamma(x){ const c=[0.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
  if(x<0.5) return Math.log(Math.PI/Math.sin(Math.PI*x))-bwLnGamma(1-x);
  x-=1; let a=c[0]; const t=x+7.5; for(let i=1;i<9;i++) a+=c[i]/(x+i); return 0.5*Math.log(2*Math.PI)+(x+0.5)*Math.log(t)-t+Math.log(a); }
function bwBetaCf(a,b,x){ const T=1e-300; let c=1, d=1-(a+b)*x/(a+1); if(Math.abs(d)<T) d=T; d=1/d; let h=d;
  for(let m=1;m<=300;m++){ const m2=2*m; let aa=m*(b-m)*x/((a-1+m2)*(a+m2)); d=1+aa*d; if(Math.abs(d)<T) d=T; c=1+aa/c; if(Math.abs(c)<T) c=T; d=1/d; h*=d*c;
    aa=-(a+m)*(a+b+m)*x/((a+m2)*(a+1+m2)); d=1+aa*d; if(Math.abs(d)<T) d=T; c=1+aa/c; if(Math.abs(c)<T) c=T; d=1/d; const del=d*c; h*=del; if(Math.abs(del-1)<1e-13) break; }
  return h; }
function bwIncBeta(x,a,b){ if(x<=0) return 0; if(x>=1) return 1;
  const bt=Math.exp(bwLnGamma(a+b)-bwLnGamma(a)-bwLnGamma(b)+a*Math.log(x)+b*Math.log(1-x));
  return x<(a+1)/(a+b+2)? bt*bwBetaCf(a,b,x)/a : 1-bt*bwBetaCf(b,a,1-x)/b; }
const bwTP=(t,df)=>bwIncBeta(df/(df+t*t),df/2,0.5);   // two-sided p of Student t
function bwWelch(x,y,k=1){
  const nx=x.length, ny=y.length, ex=nx/k, ey=ny/k; if(nx<2||ny<2||ex<=1||ey<=1) return null;
  const mx=x.reduce((s,v)=>s+v,0)/nx, my=y.reduce((s,v)=>s+v,0)/ny, vx=x.reduce((s,v)=>s+(v-mx)**2,0)/(nx-1), vy=y.reduce((s,v)=>s+(v-my)**2,0)/(ny-1);
  const a=vx/ex, b=vy/ey, se=Math.sqrt(a+b), d=mx-my;
  if(!(se>0)) return {d,mx,my,nx,ny,t:null,df:null,p:d===0?1:0};
  const t=d/se, df=(a+b)**2/(a*a/(ex-1)+b*b/(ey-1)); return {d,mx,my,nx,ny,t,df,p:bwTP(t,df)};
}
function bwQuantile(s,q){ const pos=(s.length-1)*q, lo=Math.floor(pos); return lo+1<s.length? s[lo]+(s[lo+1]-s[lo])*(pos-lo) : s[lo]; }
/* provW [{p,name,cat,v}], catW {cat: weekly totals, unassigned included}, tgtW [{c,v}]; all on the same weeks */
function busyWeeksCompute(provW,catW,tgtW,opts={}){
  const q=opts.q??0.8, H=opts.horizons||[2,4], minWeeks=opts.minWeeks??20, nW=opts.nW??(tgtW[0]?tgtW[0].v.length:0);
  if(nW<minWeeks) return {err:'weeks',nW,rows:[],tests:0};
  const mean=(v,i,j)=>{ let s=0; for(let n=i;n<=j;n++) s+=v[n]; return s/(j-i+1); }, rows=[];
  for(const pw of provW){
    const tot=catW[pw.cat]; if(!tot) continue;
    const share=pw.v.map((x,i)=>tot[i]>0?x/tot[i]:null), ok=share.filter(s=>s!=null).sort((x,y)=>x-y); if(ok.length<minWeeks) continue;
    const thr=bwQuantile(ok,q), busy=share.map(s=>s!=null&&s>0&&s>=thr), nBusy=busy.filter(Boolean).length;
    for(const t of tgtW){ if(t.c===pw.cat||!t.v.some(x=>x>0)) continue;
      const tests=[];
      for(const k of H){ const gb=[], go=[];
        for(let i=3;i+k<nW;i++){ if(share[i]==null) continue; (busy[i]?gb:go).push(Math.log1p(mean(t.v,i+1,i+k))-Math.log1p(mean(t.v,i-3,i))); }
        const w=bwWelch(gb,go,k); if(w) tests.push({k,...w}); }
      if(!tests.length) continue;
      const best=tests.reduce((m,x)=>x.p<m.p?x:m);
      rows.push({prov:pw.p,name:pw.name,cat:pw.cat,tgt:t.c,share,busy,nBusy,thr,tests,...best,gBusy:Math.exp(best.mx)-1,gOther:Math.exp(best.my)-1,diffPct:Math.exp(best.d)-1});
    }
  }
  const tests=rows.reduce((s,r)=>s+r.tests.length,0), ord={strong:0,possible:1,chance:2};
  // a row keeps its best lag, so its p is multiplied by the lags tried before the false-discovery check across rows
  rows.forEach(r=>{ r.pr=Math.min(1,r.p*r.tests.length); });
  const cut=bhCut(rows.map(r=>r.pr),rows.length);
  rows.forEach(r=>{ r.verdict=r.p<0.05/tests?'strong':r.pr<=cut?'possible':'chance'; });
  rows.sort((x,y)=>ord[x.verdict]-ord[y.verdict]||Math.abs(y.d)-Math.abs(x.d));
  return {rows,tests,nW};
}
/* weekly inputs from the provider model (top filter applied by pvEach) and the orders cube; no DOM */
function bwGather(chosen,a,b,to=chosen){
  const w0=weekStart(a)+(weekStart(a)<a?7:0), keys=[]; for(let w=w0; w+6<=b; w+=7) keys.push(w);
  const nW=keys.length, cats=chosen.filter(c=>PV.cats.includes(c)), catW={}, byP=new Map(), tot=new Map();
  if(!nW) return {keys,provW:[],catW,tgtW:[]};
  cats.forEach(c=>catW[c]=new Array(nW).fill(0));
  pvEach(w0,keys[nW-1]+6,(r,x)=>{ const cw=catW[r.cat]; if(!cw) return; const i=Math.floor((r.n-w0)/7); cw[i]+=x; if(PV.provs[r.p].name==='Unassigned') return;
    let v=byP.get(r.p); if(!v){ v=new Array(nW).fill(0); byP.set(r.p,v); } v[i]+=x; tot.set(r.p,(tot.get(r.p)||0)+x); });
  const provW=[];
  cats.forEach(c=>[...tot.entries()].filter(([pi,t])=>PV.provs[pi].cat===c&&t>0).sort((x,y)=>y[1]-x[1]).slice(0,6)
    .forEach(([pi,t])=>provW.push({p:PV.provs[pi],name:pvName(PV.provs[pi]),cat:c,v:byP.get(pi),tot:t})));
  return {keys,provW,catW,tgtW:to.map(c=>({c,v:weeklyOf(c,a,b).v.slice(0,nW)}))};
}
function renderBusyWeeks(chosen,a,b,to=chosen){
  const panel=document.getElementById('bwPanel'), msg=document.getElementById('bwMsg'), body=document.getElementById('bwBody');
  panel.hidden=false;
  const setMsg=h=>{ msg.innerHTML=h; msg.hidden=false; body.hidden=true; };
  if(!PV) return setMsg('This needs the provider export. Open the <strong>Data</strong> tab, copy the provider SQL, run it in Metabase and drop the CSV there.');
  if(!chosen.some(c=>PV.cats.includes(c))||!to.some(c=>!PV.cats.includes(c)||!chosen.includes(c))) return setMsg('Under <strong>From</strong>, pick a service with named providers (Doctor visit, Nursing or Physiotherapy); under <strong>To</strong>, pick the services it may lead to.');
  const G=bwGather(chosen,a,b,to);
  if(G.keys.length<20) return setMsg('Pick a period of at least 20 full weeks (Saturday to Friday) in the Period switch above. This one has '+G.keys.length+'.');
  const R=busyWeeksCompute(G.provW,G.catW,G.tgtW,{nW:G.keys.length});
  if(!R.rows.length) return setMsg('Not enough provider volume in this range to test.');
  msg.hidden=true; body.hidden=false;
  bwRows=R.rows.slice(0,40); const bwKey=r=>r.name+'|'+r.cat+'|'+r.tgt; let bi=bwRows.findIndex(r=>bwKey(r)===st.bwSel); if(bi<0){ bi=0; st.bwSel=bwRows[0]?bwKey(bwRows[0]):''; }
  const nS=R.rows.filter(r=>r.verdict==='strong').length, nP=R.rows.filter(r=>r.verdict==='possible').length, chance=0, M=MLABEL[pvMeasure()].toLowerCase();
  const tg=[...new Set(R.rows.map(r=>r.tgt))];
  document.getElementById('bwDesc').textContent=(st.basis==='booked'?'Provider data is dated by scheduled time, whatever Dates by is set to. ':'')+G.provW.length+' providers against '+tg.map(label).join(', ')+': '+R.rows.length+' rows, 2 and 4 weeks after, '+R.nW+' full weeks. '+
    nS+' strong, '+nP+' worth checking.'+(R.rows.length>40?' Showing the top 40.':'');
  const wk=k=>k+' weeks';
  const tb=document.getElementById('bwTable');
  tb.innerHTML='<thead><tr><th class="nosort" style="text-align:left">Provider</th><th class="nosort" style="text-align:left">Their service</th><th class="nosort" style="text-align:left">Then</th><th class="nosort">Busy weeks</th><th class="nosort">Growth after busy weeks</th><th class="nosort">After other weeks</th><th class="nosort">Difference</th><th class="nosort">Over</th><th class="nosort">Verdict</th></tr></thead><tbody>'+
    bwRows.map((r,i)=>'<tr data-i="'+i+'" class="'+(i===bi?'sel':'')+'" style="cursor:pointer"><td dir="auto" style="text-align:left">'+esc(r.name)+'</td><td style="text-align:left">'+esc(label(r.cat))+'</td><td style="text-align:left">'+esc(label(r.tgt))+'</td><td>'+fmtInt(r.nBusy)+'</td><td>'+fmtPct(r.gBusy*100,1)+'</td><td>'+fmtPct(r.gOther*100,1)+'</td>'+
      '<td class="'+(r.verdict==='chance'?'':r.d>0?'pos':'neg')+'" title="p = '+(r.p<0.001?'< 0.001':r.p.toFixed(3))+' · '+r.nx+' busy and '+r.ny+' other weeks">'+fmtPct(r.diffPct*100,1)+'</td><td>'+wk(r.k)+'</td><td>'+plVerdict(r.verdict,r.d)+'</td></tr>').join('')+'</tbody>';
  tb.querySelectorAll('tbody tr').forEach(tr=>tr.addEventListener('click',()=>{ st.bwSel=bwKey(bwRows[+tr.dataset.i]); renderBusyWeeks(chosen,a,b,to); }));
  const top=R.rows[0], amt=v=>Math.abs(v*100).toFixed(Math.abs(v)<0.1?1:0)+'%';
  // shares in a service add up to 100%, so one provider's busy weeks are dips for colleagues: say so when the other side shows up too
  const mir=top.verdict!=='chance'&&R.rows.find(o=>o!==top&&o.cat===top.cat&&o.tgt===top.tgt&&o.verdict!=='chance'&&o.d*top.d<0);
  document.getElementById('bwFinding').innerHTML= top.verdict==='chance'
    ? 'No provider’s busy weeks are clearly followed by faster or slower growth in the other services picked; every gap here could be chance. The largest: '+esc(label(top.tgt))+' after '+esc(top.name)+'’s busy weeks ('+fmtPct(top.diffPct*100,1)+' over '+wk(top.k)+').'
    : 'In the '+wk(top.k)+' after '+esc(top.name)+'’s busy weeks, '+esc(label(top.tgt))+' grew <strong>'+amt(top.diffPct)+' '+(top.d>0?'faster':'slower')+'</strong> than after other weeks ('+(top.verdict==='strong'?'strong':'worth checking: passes the false-discovery check but not the strict bar, so treat it as a lead')+').'+
      (mir?' Shares within a service add up to 100%, so this may be the other side of '+esc(mir.name)+'’s result ('+fmtPct(mir.diffPct*100,0)+' after their busy weeks).':'');
  // the selected row: share bars and the other service's weekly line, two charts
  const r=bwRows[bi], labels=G.keys.map(k=>fmtDs(k)), acc=css('--accent'), gh=css('--ghost'), title=it=>'Week of '+fmtD(G.keys[it[0].dataIndex]);
  const o1=baseOpts(); o1.scales.y.ticks.maxTicksLimit=4; o1.scales.y.ticks.callback=v=>v+'%';
  o1.plugins.tooltip.callbacks={title,label:it=>' Share of '+label(r.cat)+': '+(it.parsed.y==null?'–':it.parsed.y.toFixed(1)+'%')+(r.busy[it.dataIndex]?' · busy week':''),footer:()=>' Busy from '+(r.thr*100).toFixed(1)+'% (this provider’s 80th percentile)'};
  if(bwShare) bwShare.destroy();
  bwShare=new Chart(document.getElementById('bwShareChart'),{type:'bar',data:{labels,datasets:[{label:'Share',data:r.share.map(s=>s==null?null:s*100),backgroundColor:r.busy.map(x=>x?acc:gh),borderRadius:{topLeft:3,topRight:3},borderSkipped:'bottom',maxBarThickness:18}]},options:o1});
  const tv=G.tgtW.find(t=>t.c===r.tgt).v, o2=baseOpts(); o2.scales.y.ticks.maxTicksLimit=4;
  o2.plugins.tooltip.callbacks={title,label:it=>' '+label(r.tgt)+': '+fmtInt(it.parsed.y)+(r.busy[it.dataIndex]?' · '+r.name+'’s busy week':'')};
  if(bwTgt) bwTgt.destroy();
  bwTgt=new Chart(document.getElementById('bwTgtChart'),{type:'line',data:{labels,datasets:[{label:label(r.tgt),data:tv,borderColor:css('--s2'),backgroundColor:css('--s2'),borderWidth:2,
    pointRadius:r.busy.map(x=>x?3:0),pointBackgroundColor:acc,pointBorderColor:acc,pointHoverRadius:4,tension:.25}]},options:o2});
  document.getElementById('bwShareH').textContent='Weekly share of '+label(r.cat)+' '+M+' · '+r.name;
  document.getElementById('bwTgtH').textContent='Weekly '+M+' · '+label(r.tgt)+' (dots mark the busy weeks)';
}
