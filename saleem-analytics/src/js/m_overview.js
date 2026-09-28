/* ---------- KPIs ---------- */
function deltaChip(cur,prev,label,upGood=true){
  if(!prev||!isFinite(prev)) return '<span class="delta flat">'+label+' –</span>';
  const p=(cur-prev)/prev*100, cls=Math.abs(p)<1?'flat':((p>0)===upGood?'up':'down'), arrow=p>0?'▲':p<0?'▼':'';
  return '<span class="delta '+cls+'" title="'+label+'">'+arrow+' '+fmtPct(p)+' '+label+'</span>';
}
function renderKpis(){
  const cats=selCats(), stats=selStats(), a=st.from, b=st.to, len=b-a+1;
  const pa=a-len, pb=a-1, ys=lyShift(a), ya=a-ys, yb=b-ys;
  const hasP=covered(pa,pb), hasY=covered(ya,yb);
  const m=st.measure;
  const cur=total(a,b,m,cats,stats), prev=hasP?total(pa,pb,m,cats,stats):null, ly=hasY?total(ya,yb,m,cats,stats):null;
  const allStats=S.stList; const canc=S.stList.filter(s=>s==='cancelled');
  const cRate=(x,y)=>{const all=total(x,y,'ord',cats,allStats); return all? total(x,y,'ord',cats,canc)/all*100 : null;};
  const cr=cRate(a,b), crp=hasP?cRate(pa,pb):null, cry=hasY?cRate(ya,yb):null;
  const groups=spendGroups();
  const spend=sum(adDaily(a,b,groups)), spendP=hasP?sum(adDaily(pa,pb,groups)):null, spendY=hasY?sum(adDaily(ya,yb,groups)):null;
  const conv=sum(adDaily(a,b,groups,'conv'));
  const ord=total(a,b,'ord',cats,stats), ordP=hasP?total(pa,pb,'ord',cats,stats):null, ordY=hasY?total(ya,yb,'ord',cats,stats):null;
  const cpo=ord?spend/ord:null, cpoP=ordP?spendP/ordP:null, cpoY=ordY?spendY/ordY:null;
  const pat=total(a,b,'pat',cats,stats), patP=hasP?total(pa,pb,'pat',cats,stats):null, patY=hasY?total(ya,yb,'pat',cats,stats):null;
  const tiles=[
    {hero:true,lab:MLABEL[m]+viewLabel(' <span class="note">· ')+(viewLabel()?'</span>':''),val:fmtVal(cur),d:[deltaChip(cur,prev,'vs prev'),usualChip(hasP?usualMove(a,b,pa,pb,cats,stats,m):null,'vs usual')],sub:fmtVal(cur/len)+' a day · '+len+' days'+(ly?' · '+fmtPct((cur-ly)/ly*100)+' vs last year':'')},
    {lab:'Cancellation rate',val:cr==null?'–':cr.toFixed(1)+'%',d:[ptsChip(cr,crp,'vs prev'),ptsChip(cr,cry,'vs LY')],sub:'Cancelled ÷ all orders'},
    {lab:'Ad spend <span class="note">· '+adModeLabel()+'</span>',val:fmtUsd(spend),d:[deltaChip(spend,spendP,'vs prev',false),deltaChip(spend,spendY,'vs LY',false)],sub:conv? fmtInt(conv)+' WhatsApp conversations':''},
    {lab:'Ad cost per '+(viewLabel()?(st.pview==='new'?'new-patient ':'returning-patient '):'')+'order <span class="note">· '+adModeLabel()+'</span>',val:cpo==null?'–':fmtUsd(cpo),d:[deltaChip(cpo,cpoP,'vs prev',false),deltaChip(cpo,cpoY,'vs LY',false)],sub:conv? fmtUsd(sumConvSpend(a,b,groups)/conv)+' per conversation':''}
  ];
  document.getElementById('kpis').innerHTML=tiles.map(t=>'<div class="kpi'+(t.hero?' hero':'')+'"><span class="lab">'+t.lab+'</span><span class="val">'+t.val+'</span><div class="deltas">'+t.d.join('')+'</div><span class="sub">'+t.sub+'</span></div>').join('');
}
function ptsChip(cur,prev,label){
  if(cur==null||prev==null) return '<span class="delta flat">'+label+' –</span>';
  const d=cur-prev, cls=Math.abs(d)<0.3?'flat':(d<0?'up':'down');
  return '<span class="delta '+cls+'">'+(d>0?'▲ +':d<0?'▼ ':'')+d.toFixed(1)+' pts '+label+'</span>';
}
/* spend of message campaigns only, so cost per conversation is not diluted by sales or install campaigns */
function sumConvSpend(a,b,groups){
  let s=0; const gs=new Set(groups);
  for(const c of A.units){ if(!gs.has(c.group)) continue;
    for(const [mk,x] of Object.entries(c.months)){ if(!x.conv) continue;
      const m0=toN(mk+'-01'), m1=m0+daysInMonth(mk)-1, lo=Math.max(a,m0), hi=Math.min(b,m1); if(lo>hi) continue;
      let w=0; for(let n=lo;n<=hi;n++) w+=A.w(n); s+=x.spend*w; } }
  return s;
}

/* ---------- trend ---------- */
function renderTrend(){
  // Performance shows the 12 months to the end of the range unless the date range is picked
  const span12=st.trendSpan==='12m', a= span12? Math.max(S.min,toN(addMonths(monthKey(st.to),-11)+'-01')) : st.from, b=st.to, g= span12&&st.gran==='day'? 'week' : st.gran;
  const cats=selCats(), stats=selStats(), m=st.measure;
  document.querySelectorAll('#trendSpan button').forEach(x=>x.classList.toggle('on',x.dataset.s===st.trendSpan));
  const B=buckets(a,b,g), labels=B.keys.map(x=>bucketLabel(x.k,g));
  const ds=[], T=st.chart, U_=g==='day'?'day':g==='week'?'week':'month', ys=lyShift(a);
  const partial = B.keys.map((x,i)=>{ const full = g==='day'?1 : g==='week'?7 : daysInMonth(monthKey(x.k)); return x.days<full; });
  const split= T==='share' || ((T==='line'||T==='bars') && st.trend==='split' && cats.length>1);
  document.querySelectorAll('#chartType button').forEach(x=>x.classList.toggle('on',x.dataset.c===T));
  document.getElementById('trendMode').hidden= !(T==='line'||T==='bars');
  document.getElementById('lyToggle').hidden= T==='share';
  const lyOK= st.ly && covered(a-ys,b-ys), accent=css('--accent'), ghost=css('--ghost');
  const svcSets=()=>{ const ranked=S.order.map(i=>S.catList[i]).filter(c=>st.svc.has(c)), top=ranked.slice(0,7), rest=ranked.slice(7);
    const out=top.map(c=>({label:label(c),cats:[c],col:css(S.colorOf[c].slice(4,-1))}));
    if(rest.length) out.push({label:'Other ('+rest.length+')',cats:rest,col:css('--s-other')}); return out; };
  const alpha=(hex,a_)=>/^#[0-9a-f]{6}$/i.test(hex)? hex+Math.round(a_*255).toString(16).padStart(2,'0') : hex;
  let type='line', stacked=false, pctAxis=false, extra=null;
  if(T==='line'||T==='bars'){
    const bar=T==='bars'; type=bar?'bar':'line';
    if(!split){
      const cur=aggregate(series(a,b,m,cats,stats),a,B);
      ds.push(bar? {label:MLABEL[m],data:[...cur],backgroundColor:accent,borderRadius:3,maxBarThickness:28,order:2}
                 : {label:MLABEL[m],data:[...cur],borderColor:accent,backgroundColor:css('--accent-wash'),fill:true,borderWidth:2,pointRadius:g==='month'?3:0,pointHoverRadius:5,tension:.25,order:1});
      if(lyOK) ds.push({type:'line',label:'Last year ('+ALIGN_LABEL[st.align]+')',data:[...aggregate(series(a-ys,b-ys,m,cats,stats),a,B)],borderColor:ghost,backgroundColor:ghost,borderWidth:1.5,pointRadius:bar?2:0,pointHoverRadius:4,tension:.25,fill:false,order:1});
    } else { stacked=bar;
      svcSets().forEach(x=>{ const v=aggregate(series(a,b,m,x.cats,stats),a,B);
        ds.push(bar? {label:x.label,data:[...v],backgroundColor:x.col,borderColor:x.col,maxBarThickness:28} : {label:x.label,data:[...v],borderColor:x.col,backgroundColor:x.col,borderWidth:2,pointRadius:0,pointHoverRadius:4,tension:.25}); }); }
  } else if(T==='share'){
    stacked=true; pctAxis=true;
    const sets=svcSets(), vals=sets.map(x=>aggregate(series(a,b,m,x.cats,stats),a,B)), tot=B.keys.map((_,i)=>vals.reduce((t,v)=>t+Math.max(0,v[i]),0));
    sets.forEach((x,j)=>ds.push({label:x.label,data:vals[j].map((v,i)=>tot[i]? Math.max(0,v)/tot[i]*100 : null),borderColor:x.col,backgroundColor:alpha(x.col,.75),fill:j?'-1':'origin',borderWidth:1,pointRadius:0,pointHoverRadius:3,tension:.2,_sw:x.col}));
  } else if(T==='change'){
    type='bar'; pctAxis=true;
    // one bucket earlier, so the first bucket has something to move from; per-day averages so a short last bucket compares fairly
    const ax= g==='day'? a-1 : g==='week'? weekStart(a)-7 : toN(addMonths(monthKey(a),-1)+'-01'), Bx=buckets(ax,b,g);
    const pd=(arr,off)=>arr.map((v,i)=> Bx.keys[i].k-off>=S.min? v/Bx.keys[i].days : null);
    const mv=p=>B.keys.map((_,i)=> p[i]>0&&p[i+1]!=null? (p[i+1]/p[i]-1)*100 : null);
    const now=mv(pd(aggregate(series(ax,b,m,cats,stats),ax,Bx),0));
    const was= st.ly? mv(pd(aggregate(series(ax-ys,b-ys,m,cats,stats),ax,Bx),ys)) : B.keys.map(()=>null);
    const good=css('--good'), bad=css('--bad');
    ds.push({label:'This year: change on the '+U_+' before',data:now,backgroundColor:now.map((v,i)=> was[i]==null||v==null? accent : v>=was[i]? good : bad),borderRadius:2,maxBarThickness:22,order:2,_sw:accent});
    if(was.some(v=>v!=null)) ds.push({type:'line',label:'Last year: the same move ('+ALIGN_LABEL[st.align]+')',data:was,borderColor:ghost,backgroundColor:ghost,borderWidth:1.5,pointRadius:3,pointHoverRadius:5,tension:0,spanGaps:false,order:1});
    extra=i=>{ const x=now[i], y=was[i]; return x!=null&&y!=null? ['Gap: '+(x-y>0?'+':'')+(x-y).toFixed(1)+' pts ('+(x>=y?'better':'worse')+' than last year’s move)'] : []; };
  } else if(T==='cum'){
    const run=arr=>{ let t=0; return [...arr].map(v=>t+=v); };
    const cur=run(aggregate(series(a,b,m,cats,stats),a,B));
    ds.push({label:MLABEL[m]+' so far',data:cur,borderColor:accent,backgroundColor:css('--accent-wash'),fill:true,borderWidth:2,pointRadius:g==='month'?3:0,pointHoverRadius:5,tension:.2,order:1});
    if(lyOK){ const ly=run(aggregate(series(a-ys,b-ys,m,cats,stats),a,B));
      ds.push({label:'Last year so far ('+ALIGN_LABEL[st.align]+')',data:ly,borderColor:ghost,borderWidth:1.5,pointRadius:0,pointHoverRadius:4,tension:.2,fill:false,order:2});
      extra=i=> ly[i]>0? ['vs last year so far: '+fmtPct((cur[i]/ly[i]-1)*100,1)] : []; }
  }
  const notes=hoverNotes(B,a,b,g);
  const opts=moneyTicks(baseOpts());
  if(stacked){ opts.scales.x.stacked=true; opts.scales.y.stacked=true; }
  if(pctAxis){ opts.scales.y.ticks.callback=v=>(v>0&&T==='change'?'+':'')+Number(v).toFixed(0)+'%'; }
  if(T==='share'){ opts.scales.y.max=100; }
  if(T==='change'){ opts.scales.y.beginAtZero=true; opts.scales.y.grid.color=c=>c.tick&&c.tick.value===0? css('--axis') : css('--grid'); }
  opts.plugins.bands={bands:bandsFor(a,b,B,g),holColor:css('--hol'),ramColor:css('--ram'),evtColor:css('--evt'),cmpColor:css('--s2')};
  opts.plugins.tooltip.callbacks={
    title:items=>{const i=items[0].dataIndex, k=B.keys[i].k; return g==='week'? 'Week of '+fmtD(k)+(partial[i]?' (partial)':'') : g==='month'? fmtM(monthKey(k))+(partial[i]?' (partial)':'') : new Date(k*DAY).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});},
    label:it=>' '+it.dataset.label+': '+(it.parsed.y==null?'–': T==='share'? it.parsed.y.toFixed(1)+'%' : T==='change'? fmtPct(it.parsed.y,1) : fmtVal(it.parsed.y)),
    footer:items=>{const i=items[0].dataIndex, n=notes[i]; const out=extra? extra(i) : []; if(n.hol.length) out.push('Holidays: '+n.hol.join(', ')); n.ev.slice(0,4).forEach(e=>out.push('• '+e)); (n.cmp||[]).slice(0,3).forEach(c=>out.push('◆ '+c)); return out;}
  };
  if(trendChart) trendChart.destroy();
  trendChart=new Chart(document.getElementById('trendChart'),{type,data:{labels,datasets:ds},options:opts});
  const leg=document.getElementById('trendLegend');
  const items=ds.map(d=>'<span><i style="background:'+(d._sw||d.borderColor||d.backgroundColor)+'"></i>'+esc(d.label)+'</span>');
  if(T==='change'&&ds.length>1) items.push('<span><i class="box" style="background:'+css('--good')+'"></i>Moved better than last year</span><span><i class="box" style="background:'+css('--bad')+'"></i>Moved worse</span>');
  if(st.hol) items.push('<span><i class="box" style="background:'+css('--ram')+'"></i>Ramadan</span><span><i class="box" style="background:'+css('--hol')+'"></i>Other holidays</span>');
  if(st.evt) items.push('<span><i style="background:'+css('--evt')+';width:2px;height:12px"></i>Event (hover for details)</span>');
  if(st.cmp&&COMPETITORS.length) items.push('<span><i style="background:'+css('--s2')+';width:9px;height:9px;transform:rotate(45deg);border-radius:1px"></i>Competitor milestone</span>');
  leg.innerHTML=items.join('');
  document.getElementById('trendHowTxt').innerHTML=trendHow(T,U_,split);
  const total_=total(a,b,m,cats,stats);
  const ML=MLABEL[m]+viewLabel(' from ');
  document.getElementById('trendH').textContent= T==='share'? 'Share of '+ML.toLowerCase().replace('(iqd)','')+' by service' : T==='change'? ML+': change on the '+U_+' before, against last year' : T==='cum'? ML+': running total' : ML+' over time';
  document.getElementById('trendDesc').textContent=(st.basis==='booked'?'By booking time':'By scheduled time')+' · '+fmtD(a)+' – '+fmtD(b)+' · '+cats.length+' of '+S.C+' services · '+fmtVal(total_)+(MONEY.has(m)?' '+MLABEL[m].replace(' (IQD)','').toLowerCase():' '+MLABEL[m].toLowerCase())+(partial[partial.length-1]&&g!=='day'?' · last '+g+' is partial':'');

  // spend chart on the same buckets (separate axis, separate chart: never dual-axis)
  const groups=spendGroups();
  const sp=aggregate(adDaily(a,b,groups),a,B);
  const o2=baseOpts(); o2.plugins.bands={bands:bandsFor(a,b,B,g),holColor:css('--hol'),ramColor:css('--ram'),evtColor:css('--evt'),cmpColor:css('--s2')};
  o2.scales.y.ticks.callback=v=>'$'+Number(v).toLocaleString('en-US'); o2.scales.y.ticks.maxTicksLimit=4;
  o2.plugins.tooltip.callbacks={title:opts.plugins.tooltip.callbacks.title,label:it=>' Spend: '+fmtUsd(it.parsed.y),
    afterLabel:it=>{const o=aggregate(series(a,b,'ord',cats,stats),a,B)[it.dataIndex]; return o? ' Cost per order ('+adModeLabel()+'): '+fmtUsd(it.parsed.y/o):'';},footer:opts.plugins.tooltip.callbacks.footer};
  if(spendChart) spendChart.destroy();
  spendChart=new Chart(document.getElementById('spendChart'),{type:'bar',data:{labels,datasets:[{label:'Ad spend',data:[...sp],backgroundColor:css('--spend'),borderRadius:{topLeft:3,topRight:3},borderSkipped:'bottom',maxBarThickness:24,categoryPercentage:.8,barPercentage:.9}]},options:o2});
  document.getElementById('spendDesc').textContent= (st.adMode==='all'?'All ads':st.adMode==='pick'?'Chosen ad groups: '+(groups.join(', ')||'none'):groups.length===A.groups.length?'All ads (every service is selected)':'Ads matched to the selected services (general and brand campaigns excluded)')+' · '+fmtUsd(sum(sp))+' in range';
}


/* "How to read this chart", one note per chart type */
const MOVE_NAME={day:'day-on-day (DoD)',week:'week-on-week (WoW)',month:'month-on-month (MoM)'};
function trendHow(T,u,split){
  const ly='Last year lines up by '+(st.align==='hijri'?'Hijri date, so Ramadan sits on Ramadan':'weekday, 364 days back')+' (More settings).';
  const H={
    line: split? '<p>One line per service (the 7 biggest, the rest as Other). Each point is that service’s total for the '+u+'. Look at the <strong>slope</strong> of each line rather than its height: a line that climbs while the others stay flat is the service growing. Lines that cross mean the ranking changed.</p><p>Shaded bands are holidays (darker for Ramadan); dots along the top are events. A short last '+u+' dips because it isn’t over yet.</p>'
      : '<p>Each point is the total for one '+u+'. The blue line is this period; the grey line is the same '+u+'s a year earlier. Where blue sits above grey you are ahead of last year; where the gap <strong>widens or narrows</strong> is the real story, more than any one point.</p><p>Shaded bands are holidays (darker for Ramadan); dots along the top are events. A short last '+u+' dips because it isn’t over yet. '+ly+'</p>',
    bars: split? '<p>Each bar is one '+u+', split into services stacked on top of each other. The <strong>height of the whole bar</strong> is the total; the <strong>size of each colour</strong> is how much that service contributed. Good for seeing whether a big '+u+' came from everything or from one service.</p><p>Hard to compare the middle layers across bars, because they don’t start from the same baseline; use Share for that.</p>'
      : '<p>Each bar is the total for one '+u+'; the grey line with dots is the same '+u+' a year earlier. Bars make single '+u+'s easy to compare side by side, where a line smooths them together. A bar well above its grey dot beat last year.</p><p>'+ly+'</p>',
    share: '<p>Every '+u+' adds up to 100%, split by service. It hides growth on purpose: a band that <strong>gets thicker</strong> is a service taking a larger slice of the business, even if all services grew. Use it to spot mix shifts, for example nursing growing faster than physiotherapy.</p><p>Read the bottom band against the axis; for the others, watch the thickness, not the position.</p>',
    change: '<p>The '+MOVE_NAME[u]+' move: each bar is how much this '+u+' went up or down against the '+u+' before, as a percentage of the average day (so a short '+u+' isn’t penalised). The grey dots are <strong>the same move last year</strong>, over the same dates.</p><p>This is the chart for “is this dip normal?”. If this year and last year both drop in the same '+u+', the drop is seasonal. A bar is <strong>green</strong> when this year moved better than last year did (rose more or fell less) and <strong>orange</strong> when it moved worse; the gap is in the tooltip. These are raw moves; the month strip below also takes weekday and holiday effects out.</p><p>'+ly+'</p>',
    cum: '<p>The running total since the start of the chart: each point adds that '+u+' to everything before it, so the line only goes up. The grey line is the same running total last year. The <strong>vertical gap</strong> is how far ahead or behind the year you are so far (in the tooltip as a %), and a line getting <strong>steeper</strong> means the pace picked up.</p><p>Good for targets and “are we on track” questions; a single bad '+u+' barely shows here, which is the point.</p>'
  };
  return H[T]||H.line;
}
