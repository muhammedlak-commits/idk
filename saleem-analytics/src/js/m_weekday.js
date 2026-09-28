/* ---------- by weekday ----------
   The average day for each weekday over a span of weeks, against the same number of weeks before and a
   year earlier (lined up as set under More settings). Averages, not totals, so a weekday that falls five
   times in a month doesn't look bigger. Holiday days are left out by default: an Eid Friday isn't a Friday. */
const WD_ORDER=[6,0,1,2,3,4,5], WD_NAME=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
let wdChart=null;
function wdSpan(){
  const b=st.to; if(st.wdSpan==='range') return [st.from,b];
  const w=st.wdSpan==='26w'?26:12; return [Math.max(S.min,b-7*w+1),b];
}
/* per weekday: sum and number of days counted over [a,b] */
function wdAvg(a,b,m,cats,stats){
  const out=WD_ORDER.map(()=>({s:0,n:0})); if(a<S.min||b>S.max||b<a) return null;
  const y=series(a,b,m,cats,stats);
  for(let n=a;n<=b;n++){ if(!st.wdHol&&holKeysOn(n).length) continue; const o=out[WD_ORDER.indexOf(dow(n))]; o.s+=y[n-a]; o.n++; }
  return out.map(o=>o.n?o.s/o.n:null);
}
function renderWeekday(){
  const cats=selCats(), stats=selStats(), m=st.measure, [a,b]=wdSpan(), len=b-a+1, ys=lyShift(a);
  document.querySelectorAll('#wdSpan button').forEach(x=>x.classList.toggle('on',x.dataset.s===st.wdSpan));
  document.getElementById('wdHolToggle').classList.toggle('on',!st.wdHol);
  const cur=wdAvg(a,b,m,cats,stats), prev=wdAvg(a-len,a-1,m,cats,stats), ly=wdAvg(a-ys,b-ys,m,cats,stats), lyPrev=wdAvg(a-ys-len,a-ys-1,m,cats,stats);
  const days=WD_ORDER.map(d=>{ let n=0; for(let x=a;x<=b;x++) if(dow(x)===d&&(st.wdHol||!holKeysOn(x).length)) n++; return n; });
  const labels=WD_ORDER.map(d=>WD_NAME[d].slice(0,3));
  // chart: grouped bars, this span / before / last year
  const ds=[{label:'These weeks',data:cur,backgroundColor:css('--accent'),borderRadius:3,maxBarThickness:34}];
  if(prev) ds.push({label:'The weeks before',data:prev,backgroundColor:css('--accent-wash'),borderColor:css('--accent'),borderWidth:1,borderRadius:3,maxBarThickness:34});
  if(ly) ds.push({label:'A year earlier ('+ALIGN_LABEL[st.align]+')',data:ly,backgroundColor:css('--ghost'),borderRadius:3,maxBarThickness:34});
  const o=moneyTicks(baseOpts());
  o.plugins.tooltip.callbacks={title:it=>WD_NAME[WD_ORDER[it[0].dataIndex]]+' · average day',label:it=>' '+it.dataset.label+': '+fmtPer(it.parsed.y)};
  if(wdChart) wdChart.destroy();
  wdChart=new Chart(document.getElementById('wdChart'),{type:'bar',data:{labels,datasets:ds},options:o});
  document.getElementById('wdLegend').innerHTML=ds.map(d=>'<span><i class="box" style="background:'+d.backgroundColor+(d.borderColor?';outline:1px solid '+d.borderColor:'')+'"></i>'+esc(d.label)+'</span>').join('');
  // table
  const wk=cur? cur.reduce((s,v)=>s+(v||0),0) : 0, pc=(x,y)=>x!=null&&y>0? (x/y-1)*100 : null, cls=v=>v==null?'':v>0.5?'pos':v<-0.5?'neg':'';
  const canc=S.stList.filter(s=>s==='cancelled');
  const A_=series(a,b,'ord',cats,S.stList), C_=canc.length? series(a,b,'ord',cats,canc) : null;
  const cRate=WD_ORDER.map(d=>{ if(!C_) return null; let all=0,c=0;
    for(let x=a;x<=b;x++){ if(dow(x)!==d||(!st.wdHol&&holKeysOn(x).length)) continue; all+=A_[x-a]; c+=C_[x-a]; } return all? c/all*100 : null; });
  const rows=WD_ORDER.map((d,i)=>{ const v=cur&&cur[i], p1=pc(v,prev&&prev[i]), p0=pc(ly&&ly[i],lyPrev&&lyPrev[i]), g=p1!=null&&p0!=null? p1-p0 : null;
    return '<tr><td>'+WD_NAME[d]+'</td><td>'+days[i]+'</td><td>'+(v==null?'–':fmtPer(v))+'</td><td>'+(wk&&v!=null?(v/wk*100).toFixed(1)+'%':'–')+'</td><td class="'+cls(p1)+'">'+fmtPct(p1,1)+'</td><td>'+fmtPct(p0,1)+'</td><td class="'+cls(g)+'">'+(g==null?'–':(g>0?'+':'')+g.toFixed(1)+' pts')+'</td><td>'+(cRate[i]==null?'–':cRate[i].toFixed(1)+'%')+'</td></tr>'; });
  document.getElementById('wdTable').innerHTML='<thead><tr><th class="nosort">Weekday</th><th class="nosort">Days counted</th><th class="nosort">'+esc(MLABEL[m].replace(' (IQD)',''))+' per day</th><th class="nosort">Share of the week</th><th class="nosort">vs before</th><th class="nosort">Same move last year</th><th class="nosort">Gap</th><th class="nosort">Cancel rate</th></tr></thead><tbody>'+rows.join('')+'</tbody>';
  document.getElementById('wdDesc').textContent=fmtD(a)+' – '+fmtD(b)+' ('+Math.round(len/7)+' weeks)'+viewLabel()+' · average day per weekday'+(st.wdHol?', holidays included':', holiday days left out')+(prev?'':' · not enough history for the weeks before');
  renderWdGrid(cats,stats,m,b);
}
/* the last 12 weeks, one row each, Saturday to Friday */
function renderWdGrid(cats,stats,m,b){
  const end=weekStart(b)+6, start=Math.max(weekStart(S.min),end-7*12+1), y=series(start,end,m,cats,stats);
  let mx=-Infinity, mn=Infinity; for(let n=Math.max(start,S.min);n<=Math.min(end,S.max);n++){ mx=Math.max(mx,y[n-start]); mn=Math.min(mn,y[n-start]); } const rg=mx-mn||1;
  const acc=css('--accent-rgb')||'28,95,153';
  const rows=[]; for(let w=start;w<=end;w+=7){
    const cells=WD_ORDER.map((_,i)=>{ const n=w+i; if(n<S.min||n>S.max) return '<td class="none">–</td>'; const v=y[n-start], hs=holsOn(n), r_=(v-mn)/rg, al=(0.05+0.65*r_).toFixed(2);
      return '<td class="'+(hs.length?'hol':'')+'" style="background:rgba('+acc+','+al+')'+(r_>0.7?';color:#fff':'')+'" title="'+esc(new Date(n*DAY).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})+': '+fmtVal(v)+(hs.length?' · '+hs.join(', '):''))+'">'+fmtVal(v).replace(' IQD','')+'</td>'; }).join('');
    let wsum=0; for(let i=0;i<7;i++){ const n=w+i; if(n>=S.min&&n<=S.max) wsum+=y[n-start]; }
    rows.push('<tr><th scope="row">'+fmtDs(w)+'</th>'+cells+'<td class="wsum">'+fmtVal(wsum)+'</td></tr>'); }
  document.getElementById('wdGrid').innerHTML='<thead><tr><th class="nosort">Week of</th>'+WD_ORDER.map(d=>'<th class="nosort">'+WD_NAME[d].slice(0,3)+'</th>').join('')+'<th class="nosort">Week</th></tr></thead><tbody>'+rows.join('')+'</tbody>';
  document.getElementById('wdGridDesc').textContent='The 12 weeks to '+fmtD(Math.min(end,S.max))+'. Lightest is the quietest day in the grid, darkest the busiest. Dotted cells are holidays; hover a cell for its date.';
}
function wireWeekday(){
  document.querySelectorAll('#wdSpan button').forEach(b=>b.addEventListener('click',()=>{ st.wdSpan=b.dataset.s; renderWeekday(); }));
  document.getElementById('wdHolToggle').addEventListener('click',e=>{ e.preventDefault(); st.wdHol=!st.wdHol; renderWeekday(); });
}
