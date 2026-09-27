/* ---------- service links ----------
   How services move together, for the services picked in the top filter.
   From the daily orders data (always available):
     - weekly volume indexed to its own average, so different sizes share one axis
     - lead/lag: correlation of week-over-week changes, B shifted k weeks after A
     - ratio: B per 100 A by month (e.g. lab tests per 100 doctor visits)
   From the follow-on export (optional): share of A patients who had B within 7 / 30 days. */
let F=null, lkIdx=null, lkLag=null, lkRatio=null, lkFollow=null;
function buildFollowon(text){
  if(!text||!text.trim()) return null;
  const rows=parseCsvObjects(text); if(!rows.length||!('service_a' in rows[0])) return null;
  const by={}, months=new Set(), cats=new Set();
  rows.forEach(r=>{ const m=(r.month||'').match(/(\d{4})-(\d{2})/); if(!m) return; const mk=m[1]+'-'+m[2];
    const k=r.service_a+'|'+r.service_b; (by[k]||(by[k]={}))[mk]={pa:num(r.patients_a),f7:num(r.followed_7d),f30:num(r.followed_30d)};
    months.add(mk); cats.add(r.service_a); cats.add(r.service_b); });
  return {by,months:[...months].sort(),cats:[...cats]};
}
function corr(x,y){ const n=x.length; if(n<3) return null; let mx=0,my=0; for(let i=0;i<n;i++){mx+=x[i];my+=y[i];} mx/=n; my/=n;
  let sxy=0,sxx=0,syy=0; for(let i=0;i<n;i++){const a=x[i]-mx,b=y[i]-my; sxy+=a*b; sxx+=a*a; syy+=b*b;} return sxx&&syy? sxy/Math.sqrt(sxx*syy) : null; }
/* weekly totals over full Saturday-to-Friday weeks inside the range */
function weeklyOf(c,a,b){
  const w0=weekStart(a)+(weekStart(a)<a?7:0), out=[], keys=[];
  const y=series(w0,b,st.measure,[c],selStats());
  for(let w=w0; w+6<=b; w+=7){ let s=0; for(let n=w;n<=w+6;n++) s+=y[n-w0]; out.push(s); keys.push(w); }
  return {v:out,keys};
}
function lagCorr(A,B,maxLag=4){
  const d=v=>v.slice(1).map((x,i)=>Math.log1p(x)-Math.log1p(v[i]));
  const x=d(A), y=d(B), out=[];
  for(let k=-maxLag;k<=maxLag;k++){ const xs=[], ys=[];
    for(let t=0;t<x.length;t++){ const u=t+k; if(u<0||u>=y.length) continue; xs.push(x[t]); ys.push(y[u]); }
    out.push({k,r:corr(xs,ys),n:xs.length}); }
  return out;
}
function describeLag(lags,a,b){
  const ok=lags.filter(l=>l.r!=null&&l.n>=12); if(!ok.length) return {text:'Not enough weeks in the range to tell. Pick a longer range.',best:null};
  const best=ok.reduce((m,l)=>Math.abs(l.r)>Math.abs(m.r)?l:m), thr=1.96/Math.sqrt(best.n), sig=Math.abs(best.r)>thr;
  const same=ok.find(l=>l.k===0);
  if(!sig) return {text:'No clear link between week-to-week changes in '+a+' and '+b+' (strongest r = '+best.r.toFixed(2)+', needs about ±'+thr.toFixed(2)+').',best};
  const dir=best.r>0?'rise and fall together':'move in opposite directions';
  const when= best.k===0? 'in the same week' : best.k>0? a+' moves first, '+b+' follows '+best.k+' week'+(best.k>1?'s':'')+' later' : b+' moves first, '+a+' follows '+(-best.k)+' week'+(best.k<-1?'s':'')+' later';
  return {text:a+' and '+b+' '+dir+': '+when+' (r = '+best.r.toFixed(2)+(same&&best.k!==0?'; same week r = '+same.r.toFixed(2):'')+').',best};
}

function renderLinks(){
  const a=st.from, b=st.to;
  const chosen=S.order.map(i=>S.catList[i]).filter(c=>st.svc.has(c));
  const msg=document.getElementById('lkMsg'), detail=document.getElementById('lkDetail'), matrix=document.getElementById('lkMatrix');
  const all=S.catList.every(c=>st.svc.has(c));
  if(chosen.length<2){ msg.innerHTML='Pick <strong>2 or 3 services</strong> in the filter bar above (click a chip to add or remove it; double-click to keep only that one) to see how they affect each other.'; msg.hidden=false; detail.hidden=true; matrix.hidden=true; return; }
  if(chosen.length>3){
    msg.innerHTML=(all?'All services are selected. ':'')+'This grid compares the '+Math.min(chosen.length,8)+' busiest selected services. Pick 2 or 3 services in the filter bar for the detailed view.'; msg.hidden=false; detail.hidden=true; matrix.hidden=false;
    renderLinkMatrix(chosen.slice(0,8),a,b); return;
  }
  msg.hidden=true; matrix.hidden=true; detail.hidden=false;
  const W=chosen.map(c=>({c,...weeklyOf(c,a,b)}));
  const labels=W[0].keys.map(k=>fmtDs(k));
  const colorOf=c=>css(S.colorOf[c].slice(4,-1));
  // 1. indexed weekly volume
  const idx=W.map(w=>{ const m=w.v.reduce((s,x)=>s+x,0)/(w.v.length||1); return {label:label(w.c),data:w.v.map(x=>m?x/m*100:null),borderColor:colorOf(w.c),backgroundColor:colorOf(w.c),borderWidth:2,pointRadius:0,pointHoverRadius:4,tension:.25}; });
  const o1=baseOpts(); o1.scales.y.beginAtZero=false; o1.plugins.tooltip.callbacks={title:it=>'Week of '+fmtD(W[0].keys[it[0].dataIndex]),label:it=>' '+it.dataset.label+': '+Math.round(it.parsed.y)+' (= '+fmtInt(W[it.datasetIndex].v[it.dataIndex])+' '+MLABEL[st.measure].toLowerCase()+')'};
  if(lkIdx) lkIdx.destroy(); lkIdx=new Chart(document.getElementById('lkIdxChart'),{type:'line',data:{labels,datasets:idx},options:o1});
  document.getElementById('lkIdxLegend').innerHTML=idx.map(d=>'<span><i style="background:'+d.borderColor+'"></i>'+esc(d.label)+'</span>').join('');
  // 2. lead / lag for each pair
  const pairs=[]; for(let i=0;i<W.length;i++) for(let j=i+1;j<W.length;j++) pairs.push([W[i],W[j]]);
  const lagSets=pairs.map(([A,B])=>({A,B,lags:lagCorr(A.v,B.v)}));
  const ks=lagSets[0].lags.map(l=>l.k);
  const pairColor=['--s1','--s2','--s3'];
  const o2=baseOpts(); o2.scales.y.beginAtZero=true; o2.scales.y.min=-1; o2.scales.y.max=1; o2.interaction={mode:'nearest',intersect:true};
  o2.scales.x.title={display:true,text:'Weeks the second service lags the first (negative = it moves first)',color:css('--muted'),font:{size:11}};
  o2.plugins.tooltip.callbacks={title:it=>{const k=ks[it[0].dataIndex]; return k===0?'Same week':k>0?'Second service '+k+' week'+(k>1?'s':'')+' later':'Second service '+(-k)+' week'+(k<-1?'s':'')+' earlier';},label:it=>' '+it.dataset.label+': r = '+(it.parsed.y==null?'–':it.parsed.y.toFixed(2))};
  if(lkLag) lkLag.destroy();
  lkLag=new Chart(document.getElementById('lkLagChart'),{type:'bar',data:{labels:ks.map(k=>k>0?'+'+k:String(k)),datasets:lagSets.map((p,i)=>({label:label(p.A.c)+' → '+label(p.B.c),data:p.lags.map(l=>l.r),backgroundColor:css(pairColor[i]),borderRadius:3,maxBarThickness:22}))},options:o2});
  document.getElementById('lkLagLegend').innerHTML=lagSets.map((p,i)=>'<span><i class="box" style="background:'+css(pairColor[i])+'"></i>'+esc(label(p.A.c)+' → '+label(p.B.c))+'</span>').join('');
  document.getElementById('lkFindings').innerHTML=lagSets.map(p=>'<li>'+esc(describeLag(p.lags,label(p.A.c),label(p.B.c)).text)+'</li>').join('');
  // 3. ratio by month: the smaller service per 100 of the larger
  const months=[]; for(let mk=monthKey(a); mk<=monthKey(b); mk=addMonths(mk,1)) months.push(mk);
  const mTot=(c,mk)=>{const s=Math.max(toN(mk+'-01'),a,S.min), e=Math.min(toN(mk+'-01')+daysInMonth(mk)-1,b,S.max); return e<s?null:total(s,e,st.measure,[c],selStats());};
  const ratios=pairs.map(([A,B],i)=>{ const tA=A.v.reduce((s,x)=>s+x,0), tB=B.v.reduce((s,x)=>s+x,0); const [big,small]= tA>=tB?[A,B]:[B,A];
    const data=months.map(mk=>{const x=mTot(big.c,mk), y=mTot(small.c,mk); return x?y/x*100:null;});
    return {label:label(small.c)+' per 100 '+label(big.c),data,borderColor:css(pairColor[i]),backgroundColor:css(pairColor[i]),borderWidth:2,pointRadius:3,pointHoverRadius:5,tension:.25,big:big.c,small:small.c}; });
  const o3=baseOpts(); o3.plugins.tooltip.callbacks={label:it=>' '+it.dataset.label+': '+(it.parsed.y==null?'–':it.parsed.y.toFixed(1))};
  if(lkRatio) lkRatio.destroy(); lkRatio=new Chart(document.getElementById('lkRatioChart'),{type:'line',data:{labels:months.map(fmtM),datasets:ratios},options:o3});
  document.getElementById('lkRatioLegend').innerHTML=ratios.map(d=>'<span><i style="background:'+d.borderColor+'"></i>'+esc(d.label)+'</span>').join('');
  // 4. patient follow-on (optional export)
  renderFollowon(chosen,months);
  document.getElementById('lkDesc').textContent=chosen.map(label).join(', ')+' · '+fmtD(a)+' – '+fmtD(b)+' · '+W[0].v.length+' full weeks';
}
function renderFollowon(chosen,months){
  const box=document.getElementById('lkFollowBody'), empty=document.getElementById('lkFollowEmpty');
  if(!F){ box.hidden=true; empty.hidden=false; if(lkFollow){lkFollow.destroy();lkFollow=null;} return; }
  const cats=[...new Set(chosen.map(c=>UP_CAT[c]).filter(Boolean))];
  const pairs=[]; cats.forEach(x=>cats.forEach(y=>{ if(x!==y && F.by[x+'|'+y]) pairs.push([x,y]); }));
  if(!pairs.length){ box.hidden=true; empty.hidden=false; empty.innerHTML='The follow-on export has no pairs for these services'+(cats.length<2?' (they share one service type in the database)':'')+'.'; return; }
  empty.hidden=true; box.hidden=false;
  const inRange=months.filter(mk=>F.months.includes(mk));
  const colors=['--s1','--s2','--s3','--s4','--s5','--s7'];
  const ds=pairs.map(([x,y],i)=>({label:(UP_LABEL[x]||x)+' → '+(UP_LABEL[y]||y),data:inRange.map(mk=>{const r=F.by[x+'|'+y][mk]; return r&&r.pa? r.f30/r.pa*100 : null;}),borderColor:css(colors[i%colors.length]),backgroundColor:css(colors[i%colors.length]),borderWidth:2,pointRadius:3,tension:.25}));
  const o=baseOpts(); o.scales.y.ticks.callback=v=>v+'%'; o.plugins.tooltip.callbacks={label:it=>' '+it.dataset.label+': '+(it.parsed.y==null?'–':it.parsed.y.toFixed(1)+'%')+' within 30 days'};
  if(lkFollow) lkFollow.destroy(); lkFollow=new Chart(document.getElementById('lkFollowChart'),{type:'line',data:{labels:inRange.map(fmtM),datasets:ds},options:o});
  document.getElementById('lkFollowLegend').innerHTML=ds.map(d=>'<span><i style="background:'+d.borderColor+'"></i>'+esc(d.label)+'</span>').join('');
  const rows=pairs.map(([x,y])=>{ let pa=0,f7=0,f30=0; inRange.forEach(mk=>{const r=F.by[x+'|'+y][mk]; if(r){pa+=r.pa;f7+=r.f7;f30+=r.f30;}}); return {x,y,pa,f7,f30}; });
  document.getElementById('lkFollowTable').innerHTML='<thead><tr><th class="nosort">First service</th><th class="nosort">Then</th><th class="nosort">Patients with first service</th><th class="nosort">Within 7 days</th><th class="nosort">Within 30 days</th></tr></thead><tbody>'+
    rows.map(r=>'<tr><td>'+esc(UP_LABEL[r.x]||r.x)+'</td><td style="text-align:left">'+esc(UP_LABEL[r.y]||r.y)+'</td><td>'+fmtInt(r.pa)+'</td><td>'+(r.pa?(r.f7/r.pa*100).toFixed(1)+'%':'–')+'</td><td>'+(r.pa?(r.f30/r.pa*100).toFixed(1)+'%':'–')+'</td></tr>').join('')+'</tbody>';
}
function renderLinkMatrix(cats,a,b){
  const W=cats.map(c=>({c,...weeklyOf(c,a,b)}));
  const cell=(i,j)=>{ if(i===j) return '<td style="color:var(--muted)">–</td>';
    const lags=lagCorr(W[i].v,W[j].v,3), same=lags.find(l=>l.k===0), d=describeLag(lags,'','');
    const r=same&&same.r!=null?same.r:null, best=d.best; const thr=best?1.96/Math.sqrt(best.n):1, sig=best&&Math.abs(best.r)>thr;
    const aC=Math.min(Math.abs(r||0),0.8)/0.8, bg=r==null?'':r>=0?'rgba(28,117,188,'+(0.05+aC*0.3)+')':'rgba(208,59,59,'+(0.05+aC*0.3)+')';
    const lead= sig&&best.k!==0? (best.k>0?' · follows '+best.k+'w later':' · moves '+(-best.k)+'w earlier') : '';
    return '<td class="heat" style="background:'+bg+'" title="Same-week r = '+(r==null?'–':r.toFixed(2))+(best?'; strongest r = '+best.r.toFixed(2)+' at '+best.k+' weeks':'')+'">'+(r==null?'–':r.toFixed(2))+'<span class="note">'+lead+'</span></td>'; };
  document.getElementById('lkMatrixTable').innerHTML='<thead><tr><th class="nosort"></th>'+cats.map(c=>'<th class="nosort">'+esc(label(c))+'</th>').join('')+'</tr></thead><tbody>'+
    cats.map((c,i)=>'<tr><td><span class="sw" style="background:'+S.colorOf[c]+'"></span>'+esc(label(c))+'</td>'+cats.map((_,j)=>cell(i,j)).join('')+'</tr>').join('')+'</tbody>';
}
