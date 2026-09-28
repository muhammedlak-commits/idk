/* ---------- section pieces: Summary tiles and attention list, Performance month strip, Drivers cards ---------- */
const lastFullMonth=()=> monthKey(st.to+1)!==monthKey(st.to)? monthKey(st.to) : addMonths(monthKey(st.to),-1);
const monthSpan=mk=>{ const s=toN(mk+'-01'); return [Math.max(s,S.min), Math.min(s+daysInMonth(mk)-1,S.max)]; };
/* a chip that reads good or bad: green when the move is the good direction, orange when it isn't */
function tone(v,upGood=true,flat=0.5){ return v==null||Math.abs(v)<flat? 'flat' : (v>0)===upGood? 'up' : 'down'; }
const chip=(txt,cls)=>'<span class="delta '+cls+'">'+txt+'</span>';
/* total over [a,b] in a given patient view, whatever view is picked above */
function totalView(view,a,b,m,cats,stats){ const keep=st.pview; st.pview=view; try{ return total(a,b,m,cats,stats); } finally{ st.pview=keep; } }

/* the four Summary tiles: the measure, company revenue (or orders when revenue is the measure), returning-patient orders, cancellations */
function summaryTiles(R){
  const {P:P_,cur,base,m,cats,stats}=R, len=P_.b-P_.a+1, M=MLABEL[m].replace(' (IQD)','');
  const tiles=[], tile=(lab,val,chips,sub,hero)=>tiles.push('<div class="kpi'+(hero?' hero':'')+'"><span class="lab">'+lab+'</span><span class="val">'+val+'</span><div class="deltas">'+chips.join('')+'</div>'+(sub?'<span class="sub">'+sub+'</span>':'')+'</div>');
  const pct=(x,y)=> y>0? (x-y)/y*100 : null, short=P_.short==='last year'?'last year':'before';
  // 1. the measure: judged against the chosen comparison, plus the plain change
  const U= covered(P_.a-len,P_.a-1)? usualMove(P_.a,P_.b,P_.a-len,P_.a-1,cats,stats,m) : null;
  const main=[]; if(U&&U.gap!=null) main.push(chip((U.gap>0?'+':'')+(U.gap*100).toFixed(1)+' pts vs usual',tone(U.gap*100)));
  main.push('<span class="delta plain">'+fmtPct(pct(cur,base),1)+' vs '+esc(short)+'</span>');
  tile(esc(M)+viewLabel(' · '),fmtVal(cur,m),main,fmtVal(cur/len,m)+' a day'+(U&&U.gap!=null?' · moved '+fmtPct(U.nowAdj*100,1)+', the same weeks '+(U.past.length>1?'usually move ':'last year moved ')+fmtPct(U.usual*100,1):''),true);
  // 2. revenue, or orders when a money measure is picked
  const m2= MONEY.has(m)? 'ord' : (S.hasRev? 'rev' : 'svc');
  const x2=total(P_.a,P_.b,m2,cats,stats), y2=total(P_.pa,P_.pb,m2,cats,stats), p2=pct(x2,y2);
  const sales=S.hasRev? total(P_.a,P_.b,'sales',cats,stats) : 0;
  tile(esc(MLABEL[m2].replace(' (IQD)','')),fmtVal(x2,m2),[chip(fmtPct(p2,1)+' vs '+esc(short),tone(p2))], m2==='rev'&&sales? Math.round(x2/sales*100)+'% of sales' : '');
  // 3. returning-patient orders
  if(S.hasNew){ const x3=totalView('ret',P_.a,P_.b,'ord',cats,stats), y3=totalView('ret',P_.pa,P_.pb,'ord',cats,stats), p3=pct(x3,y3);
    const n3=totalView('new',P_.a,P_.b,'ord',cats,stats), nb=totalView('new',P_.pa,P_.pb,'ord',cats,stats);
    tile('Returning-patient orders',fmtInt(x3),[chip(fmtPct(p3,1)+' vs '+esc(short),tone(p3))],'New-patient orders '+fmtPct(pct(n3,nb),1)); }
  // 4. cancellations
  const canc=S.stList.filter(s=>s==='cancelled');
  if(canc.length){ const rate=(a,b)=>{ const all=total(a,b,'ord',cats,S.stList); return all? total(a,b,'ord',cats,canc)/all*100 : null; };
    const r1=rate(P_.a,P_.b), r0=rate(P_.pa,P_.pb), ys=lyShift(P_.a), rl=covered(P_.a-ys,P_.b-ys)? rate(P_.a-ys,P_.b-ys) : null;
    const ch=[]; if(rl!=null) ch.push(chip((r1-rl>0?'+':'')+(r1-rl).toFixed(1)+' pts vs last year',tone(r1-rl,false,0.3)));
    if(r0!=null) ch.push('<span class="delta plain">'+(r1-r0>0?'+':'')+(r1-r0).toFixed(1)+' pts vs '+esc(short)+'</span>');
    tile('Cancellation rate',r1==null?'–':r1.toFixed(1)+'%',ch,'Cancelled ÷ all orders'); }
  return tiles.join('');
}

/* "Worth your attention": things the page can check on its own, strongest first, at most three */
function whyAttention(R){
  const {P:P_,base,cats,stats}=R, out=[], add=(score,good,title,body,sec,sub,label)=>out.push({score,good,title,body,sec,sub,label});
  // returning patients stalling while new ones grow (last three complete months)
  const mk=lastFullMonth();
  if(S.hasNew){ const ms=[addMonths(mk,-2),addMonths(mk,-1),mk], per=(v,k)=>{ const [a,b]=monthSpan(k); return b<a? null : totalView(v,a,b,'ord',cats,stats)/(b-a+1)*daysInMonth(k); };
    const ret=ms.map(k=>per('ret',k)), nw=ms.map(k=>per('new',k));
    if(ret.every(x=>x>0)&&nw.every(x=>x>0)){ const gr=ret[2]/ret[0]-1, gn=nw[2]/nw[0]-1;
      if(gr<0.03&&gn>0.08) add(Math.abs(gn-gr)*100,false,'Returning patients have stopped growing','About '+fmtInt((ret[0]+ret[1]+ret[2])/3)+' orders a month since '+fmtM(ms[0])+', while new-patient orders went from '+fmtInt(nw[0])+' to '+fmtInt(nw[2])+'.','drivers','patients','See patients');
      else if(gr<-0.05) add(Math.abs(gr)*100,false,'Fewer returning-patient orders',fmtPct(gr*100,1)+' from '+fmtM(ms[0])+' to '+fmtM(ms[2])+'.','drivers','patients','See patients'); } }
  // the month in progress against its usual move
  const cm=monthKey(S.max);
  if(cm!==mk||S.max<toN(cm+'-01')+daysInMonth(cm)-1){ const [a,b]=monthSpan(cm), pm=addMonths(cm,-1), [pa,pb]=monthSpan(pm);
    if(b-a>=6&&pb>=pa){ const U=usualMove(a,b,pa,pb,cats,stats,'ord'); if(U&&U.gap!=null&&Math.abs(U.gap)>=0.05)
      add(Math.abs(U.gap)*100,U.gap>0,fmtMonthName(cm)+' is running '+(U.gap>0?'above':'below')+' its usual move',Math.abs(U.gap*100).toFixed(1)+' points '+(U.gap>0?'over':'under')+' the same weeks in past years, with the month to '+fmtDs(S.max)+'.','performance','month','See months'); } }
  // cancellations against last year
  const canc=S.stList.filter(s=>s==='cancelled');
  if(canc.length){ const rate=(a,b)=>{ const all=total(a,b,'ord',cats,S.stList); return all? total(a,b,'ord',cats,canc)/all*100 : null; }, ys=lyShift(P_.a);
    if(covered(P_.a-ys,P_.b-ys)){ const r1=rate(P_.a,P_.b), rl=rate(P_.a-ys,P_.b-ys); if(r1!=null&&rl!=null&&Math.abs(r1-rl)>=1.5)
      add(Math.abs(r1-rl)*3,r1<rl,(r1>rl?'More':'Fewer')+' cancellations than a year ago',r1.toFixed(1)+'% of orders, against '+rl.toFixed(1)+'% in the same weeks last year.','performance','svc','See services'); } }
  // the service furthest from its usual move (5% share or more)
  const len=P_.b-P_.a+1;
  if(covered(P_.a-len,P_.a-1)){ const tot=total(P_.a,P_.b,'ord',cats,stats); let worst=null;
    for(const c of cats){ const v=total(P_.a,P_.b,'ord',[c],stats); if(!tot||v/tot<0.05) continue; const U=usualMove(P_.a,P_.b,P_.a-len,P_.a-1,[c],stats,'ord'); if(!U||U.gap==null) continue; if(!worst||U.gap<worst.g) worst={c,g:U.gap}; }
    if(worst&&worst.g<=-0.10) add(Math.abs(worst.g)*100*0.8,false,label(worst.c)+' fell short of its usual move',Math.abs(worst.g*100).toFixed(1)+' points under how the same weeks usually move.','performance','svc','See services'); }
  // company revenue as a share of sales
  if(S.hasRev){ const sh=(a,b)=>{ const s_=total(a,b,'sales',cats,stats); return s_>0? total(a,b,'rev',cats,stats)/s_*100 : null; }, s1=sh(P_.a,P_.b), s0=sh(P_.pa,P_.pb);
    if(s1!=null&&s0!=null&&Math.abs(s1-s0)>=3) add(Math.abs(s1-s0)*2,s1>s0,'Company revenue is a '+(s1>s0?'larger':'smaller')+' share of sales',Math.round(s1)+'% of sales, against '+Math.round(s0)+'% in '+P_.short+'. Provider shares or B2B entries can move this.','performance','svc','See services'); }
  // a real change well beyond the calendar and usual move
  if(Math.abs(R.eRest/base)>=0.05) add(Math.abs(R.eRest/base)*100*0.7,R.eRest>0,'A real '+(R.eRest>0?'rise':'drop')+' of '+Math.abs(R.eRest/base*100).toFixed(1)+'%','What’s left after weekdays, holidays, events'+(R.P.usual?', the usual move':'')+' and ads.','summary',null,null);
  return out.sort((x,y)=>y.score-x.score).slice(0,3);
}
const fmtMonthName=mk=>new Date(Date.UTC(+mk.slice(0,4),+mk.slice(5,7)-1,1)).toLocaleDateString('en-GB',{month:'long',timeZone:'UTC'});
function renderAttention(R){
  const items=whyAttention(R), el=document.getElementById('whyAttn');
  el.innerHTML= items.length? items.map((x,i)=>'<div class="attnitem '+(x.good?'good':'bad')+'"><span class="n">'+(i+1)+'</span><div><div class="t">'+esc(x.title)+'</div><div class="b">'+esc(x.body)+'</div>'+(x.sec&&x.label?'<button type="button" class="linkbtn" data-go="'+x.sec+'" data-sub="'+(x.sub||'')+'">'+esc(x.label)+'</button>':'')+'</div></div>').join('')
    : '<p class="note">Nothing stands out for this selection and period.</p>';
  el.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go,b.dataset.sub||null)));
}

/* Performance: each month of the last 13 against its usual move */
function renderPerfStrip(){
  const cats=selCats(), stats=selStats(), m=st.measure, end=monthKey(S.max), el=document.getElementById('perfStrip'); const cells=[];
  for(let k=12;k>=0;k--){ const mk=addMonths(end,-k), [a,b]=monthSpan(mk), pm=addMonths(mk,-1), [pa,pb]=monthSpan(pm); if(b<a||pb<pa) continue;
    const U=usualMove(a,b,pa,pb,cats,stats,m), partial=b<toN(mk+'-01')+daysInMonth(mk)-1;
    if(!U||U.gap==null){ cells.push('<div class="mcell none"><span class="mm">'+fmtM(mk)+'</span><span class="mv">–</span></div>'); continue; }
    const g=U.gap*100, a_=Math.min(Math.abs(g),20)/20, cls=g>=0?'up':'down';
    const tip='vs '+fmtM(pm)+': '+fmtPct(U.now*100,1)+' this year ('+fmtPct(U.nowAdj*100,1)+' after weekdays and holidays). Same move '+U.past.map(x=>fmtD(x.from).slice(-4)+': '+fmtPct(x.raw*100,1)+' ('+fmtPct(x.adj*100,1)+' adjusted)').join(', ')+'. Gap: '+(g>0?'+':'')+g.toFixed(1)+' pts.'+(partial?' Month to '+fmtDs(b)+'.':'');
    cells.push('<div class="mcell '+cls+'" style="--a:'+(0.08+a_*0.32).toFixed(2)+'" title="'+esc(tip)+'"><span class="mm">'+fmtM(mk)+(partial?'*':'')+'</span><span class="mt">'+fmtPct(U.nowAdj*100,1)+'</span><span class="ml">'+(U.past.length>1?'usual ':'LY ')+fmtPct(U.usual*100,1)+'</span><span class="mv">'+(g>0?'+':g<0?'−':'')+Math.abs(g).toFixed(1)+' pts</span></div>'); }
  el.innerHTML=cells.join('')||'<p class="note">Needs a year of history.</p>';
}

/* Drivers: one answer per driver, then its detail below */
function renderDrvCards(){
  const el=document.getElementById('drvCards'); const R=whyCompute();
  if(R.err){ el.innerHTML='<p class="note">'+esc(R.err)+'</p>'; return; }
  const W=whyWhere(R), f=v=>fmtVal(v,R.m), cards=[];
  const card=(key,title,answer,body)=>cards.push('<section class="drvcard'+(st.drv===key?' on':'')+'"><div class="dh"><h2>'+title+'</h2><button type="button" class="linkbtn" data-drv="'+key+'">'+(st.drv===key?'Showing below':'Details')+'</button></div><div class="da">'+answer+'</div>'+(body||'')+'</section>');
  // patients
  if(W.pat){ const [n,r]=W.pat; card('patients','Patients', (Math.abs(n.d)>=Math.abs(r.d)?'New':'Returning')+' patients drove more of the change: '+(n.d>0?'+':'')+f(n.d)+' new, '+(r.d>0?'+':'')+f(r.d)+' returning, against '+esc(R.P.short)+'.'); }
  else card('patients','Patients', S.hasNew? 'Switch the patient view back to All patients to split the change by new and returning.' : 'Load the latest orders export to split the change by new and returning patients.');
  // providers
  if(W.prov&&W.prov.length){ const s_=W.prov.slice().sort((a,b)=>b.d-a.d), up=s_[0], dn=s_[s_.length-1]; const pf=v=>fmtVal(v,pvMeasure());
    card('providers','Providers','Biggest gain: '+esc(up.name)+' ('+(up.d>0?'+':'')+pf(up.d)+'). '+(dn&&dn.d<0?'Biggest drop: '+esc(dn.name)+' ('+pf(dn.d)+').':'No provider dropped.')); }
  else card('providers','Providers', PV? 'The provider export doesn’t cover both periods.' : 'Load the provider export (Data &amp; settings) to see which doctors and nurses the change came from.');
  // ads
  card('ads','Meta ads', R.ads.ok? 'Ads likely added '+fmtPct(R.eAd/R.base*100,1)+': matching spend went from '+fmtUsd(R.ads.sp0)+' to '+fmtUsd(R.ads.sp1)+'.' : 'No measurable link between weekly ad spend and '+esc(MLABEL[R.m].replace(' (IQD)','').toLowerCase())+' over the past year, so none of the change is credited to ads.');
  // calendar
  const hd=Object.keys({...R.C1.hols,...R.C0.hols}).filter(k=>(R.C1.hols[k]||0)!==(R.C0.hols[k]||0)).map(k=>k+' '+(R.C1.hols[k]||0)+' days vs '+(R.C0.hols[k]||0)).slice(0,2);
  card('calendar','Calendar','Holidays and weekdays '+(R.eCal>=0?'added ':'took away ')+fmtPct(Math.abs(R.eCal/R.base*100),1).replace('+','')+(R.eEv? ', outside events '+fmtPct(R.eEv/R.base*100,1):'')+'.'+(hd.length?' '+esc(hd.join('; '))+'.':''));
  el.innerHTML=cards.join('');
  el.querySelectorAll('[data-drv]').forEach(b=>b.addEventListener('click',()=>{ st.drv=b.dataset.drv; showModule('drivers',true); document.getElementById('drvTabs').scrollIntoView({block:'start',behavior:'smooth'}); }));
}

function wirePerf(){
  document.querySelectorAll('#perfTab button').forEach(b=>b.addEventListener('click',()=>{ st.perfTab=b.dataset.t; showModule('performance',true); }));
  document.querySelectorAll('#chartType button').forEach(b=>b.addEventListener('click',()=>{ st.chart=b.dataset.c; render(); }));
  document.querySelectorAll('#trendSpan button').forEach(b=>b.addEventListener('click',()=>{ st.trendSpan=b.dataset.s; render(); }));
  document.querySelectorAll('#drvTabs [data-d]').forEach(b=>b.addEventListener('click',()=>{ st.drv=b.dataset.d; showModule('drivers',true); }));
  const mb=document.getElementById('svcMoreBtn'); if(mb) mb.addEventListener('click',()=>{ st.svcMore=!st.svcMore; renderSvcTable(); });
}
