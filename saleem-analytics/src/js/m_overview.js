/* ---------- KPIs ---------- */
function deltaChip(cur,prev,label,upGood=true){
  if(!prev||!isFinite(prev)) return '<span class="delta flat">'+label+' –</span>';
  const p=(cur-prev)/prev*100, cls=Math.abs(p)<1?'flat':((p>0)===upGood?'up':'down'), arrow=p>0?'▲':p<0?'▼':'';
  return '<span class="delta '+cls+'" title="'+label+'">'+arrow+' '+fmtPct(p)+' '+label+'</span>';
}
function renderKpis(){
  const cats=selCats(), stats=selStats(), a=st.from, b=st.to, len=b-a+1;
  const pa=a-len, pb=a-1, ya=a-364, yb=b-364;
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
    {hero:true,lab:MLABEL[m],val:fmtInt(cur),d:[deltaChip(cur,prev,'vs prev'),deltaChip(cur,ly,'vs LY')],sub:fmtInt(cur/len)+' per day · '+len+' days'},
    ...(m!=='pat'?[{lab:'Patient-days',val:fmtInt(pat),d:[deltaChip(pat,patP,'vs prev'),deltaChip(pat,patY,'vs LY')],sub:'A patient seen on 10 days counts 10 times, not unique patients'}]:[]),
    {lab:'Cancellation rate',val:cr==null?'–':cr.toFixed(1)+'%',d:[ptsChip(cr,crp,'vs prev'),ptsChip(cr,cry,'vs LY')],sub:'Cancelled orders ÷ all orders'},
    {lab:'Ad spend · '+adModeLabel(),val:fmtUsd(spend),d:[deltaChip(spend,spendP,'vs prev',false),deltaChip(spend,spendY,'vs LY',false)],sub:st.adMode==='all'?'Every ad, whatever service it promotes':st.adMode==='pick'?groups.length+' ad group'+(groups.length===1?'':'s')+' picked in the filter bar':'Ads matched to the selected services'},
    {lab:'Ad cost per order ('+adModeLabel()+')',val:cpo==null?'–':fmtUsd(cpo),d:[deltaChip(cpo,cpoP,'vs prev',false),deltaChip(cpo,cpoY,'vs LY',false)],sub:'Spend on '+adModeLabel()+' ÷ orders for the selected services'},
    {lab:'WhatsApp conversations',val:fmtInt(conv),d:[],sub:conv? fmtUsd(sumConvSpend(a,b,groups)/conv)+' per conversation, message campaigns only':'From message campaigns'}
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
  const cats=selCats(), stats=selStats(), a=st.from, b=st.to, g=st.gran, m=st.measure;
  const B=buckets(a,b,g), labels=B.keys.map(x=>bucketLabel(x.k,g));
  const ds=[];
  const partial = B.keys.map((x,i)=>{ const full = g==='day'?1 : g==='week'?7 : daysInMonth(monthKey(x.k)); return x.days<full; });
  if(st.trend==='total' || cats.length<=1){
    const cur=aggregate(series(a,b,m,cats,stats),a,B);
    ds.push({label:MLABEL[m],data:[...cur],borderColor:css('--accent'),backgroundColor:css('--accent-wash'),fill:true,borderWidth:2,pointRadius:g==='month'?3:0,pointHoverRadius:5,tension:.25,order:1});
    if(st.ly && covered(a-364,b-364)){
      const ly=aggregate(series(a-364,b-364,m,cats,stats),a,B);
      ds.push({label:'Same period last year',data:[...ly],borderColor:css('--ghost'),borderWidth:1.5,pointRadius:0,pointHoverRadius:4,tension:.25,fill:false,order:2});
    }
  } else {
    const ranked=S.order.map(i=>S.catList[i]).filter(c=>st.svc.has(c));
    const top=ranked.slice(0,7), rest=ranked.slice(7);
    top.forEach(c=>{ const v=aggregate(series(a,b,m,[c],stats),a,B); const col=css(S.colorOf[c].slice(4,-1));
      ds.push({label:label(c),data:[...v],borderColor:col,backgroundColor:col,borderWidth:2,pointRadius:0,pointHoverRadius:4,tension:.25}); });
    if(rest.length){ const v=aggregate(series(a,b,m,rest,stats),a,B); ds.push({label:'Other ('+rest.length+')',data:[...v],borderColor:css('--s-other'),borderWidth:2,pointRadius:0,tension:.25}); }
  }
  const notes=hoverNotes(B,a,b,g);
  const opts=baseOpts();
  opts.plugins.bands={bands:bandsFor(a,b,B,g),holColor:css('--hol'),ramColor:css('--ram'),evtColor:css('--evt')};
  opts.plugins.tooltip.callbacks={
    title:items=>{const i=items[0].dataIndex, k=B.keys[i].k; return g==='week'? 'Week of '+fmtD(k)+(partial[i]?' (partial)':'') : g==='month'? fmtM(monthKey(k))+(partial[i]?' (partial)':'') : new Date(k*DAY).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});},
    label:it=>' '+it.dataset.label+': '+fmtInt(it.parsed.y),
    footer:items=>{const n=notes[items[0].dataIndex]; const out=[]; if(n.hol.length) out.push('Holidays: '+n.hol.join(', ')); n.ev.slice(0,4).forEach(e=>out.push('• '+e)); return out;}
  };
  if(trendChart) trendChart.destroy();
  trendChart=new Chart(document.getElementById('trendChart'),{type:'line',data:{labels,datasets:ds},options:opts});
  const leg=document.getElementById('trendLegend');
  const items=ds.map(d=>'<span><i style="background:'+d.borderColor+'"></i>'+esc(d.label)+'</span>');
  if(st.hol) items.push('<span><i class="box" style="background:'+css('--ram')+'"></i>Ramadan</span><span><i class="box" style="background:'+css('--hol')+'"></i>Other holidays</span>');
  if(st.evt) items.push('<span><i style="background:'+css('--evt')+';width:2px;height:12px"></i>Event (hover for details)</span>');
  leg.innerHTML=items.join('');
  const total_=total(a,b,m,cats,stats);
  document.getElementById('trendH').textContent=MLABEL[m]+' over time';
  document.getElementById('trendDesc').textContent=(st.basis==='booked'?'By booking time':'By scheduled time')+' · '+fmtD(a)+' – '+fmtD(b)+' · '+cats.length+' of '+S.C+' services · '+fmtInt(total_)+' '+MLABEL[m].toLowerCase()+(partial[partial.length-1]&&g!=='day'?' · last '+g+' is partial':'');

  // spend chart on the same buckets (separate axis, separate chart: never dual-axis)
  const groups=spendGroups();
  const sp=aggregate(adDaily(a,b,groups),a,B);
  const o2=baseOpts(); o2.plugins.bands={bands:bandsFor(a,b,B,g),holColor:css('--hol'),ramColor:css('--ram'),evtColor:css('--evt')};
  o2.scales.y.ticks.callback=v=>'$'+Number(v).toLocaleString('en-US'); o2.scales.y.ticks.maxTicksLimit=4;
  o2.plugins.tooltip.callbacks={title:opts.plugins.tooltip.callbacks.title,label:it=>' Spend: '+fmtUsd(it.parsed.y),
    afterLabel:it=>{const o=aggregate(series(a,b,'ord',cats,stats),a,B)[it.dataIndex]; return o? ' Cost per order ('+adModeLabel()+'): '+fmtUsd(it.parsed.y/o):'';},footer:opts.plugins.tooltip.callbacks.footer};
  if(spendChart) spendChart.destroy();
  spendChart=new Chart(document.getElementById('spendChart'),{type:'bar',data:{labels,datasets:[{label:'Ad spend',data:[...sp],backgroundColor:css('--spend'),borderRadius:{topLeft:3,topRight:3},borderSkipped:'bottom',maxBarThickness:24,categoryPercentage:.8,barPercentage:.9}]},options:o2});
  document.getElementById('spendDesc').textContent= (st.adMode==='all'?'All ads':st.adMode==='pick'?'Chosen ad groups: '+(groups.join(', ')||'none'):groups.length===A.groups.length?'All ads (every service is selected)':'Ads matched to the selected services (general and brand campaigns excluded)')+' · '+fmtUsd(sum(sp))+' in range';
}

