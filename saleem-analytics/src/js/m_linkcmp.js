/* ---------- Service links: compare two periods ----------
   Period A (the later) against period B, for the From and To services picked above.
   1. Totals per day (so months of different length compare fairly), and To per 100 From.
   2. The change in To split in two: what From's own change would give at B's rate (volume), and the change in
      To per From (rate): ΔTo = r_B·ΔFrom + From_A·Δr, per day.
   3. By From provider (provider export): each provider's From orders a day in A and B, and their share of From's change.
   4. By From provider's patients (provider follow-on export, monthly): patients seen, the share who had a To service
      within the window, and the change in followed patients split into volume (more or fewer patients seen, at B's rate)
      and rate (a different share of them going on). The follow-on export is monthly, so it uses the calendar months
      each period covers for at least half their days.
   5. The same grouped by doctor specialty, when the exports carry it. */

function lkcPeriods(){
  // from the latest day of data, whatever the date range above says, so a recent dip is always in view
  const last=S.max, endMk= monthKey(last+1)!==monthKey(last)? monthKey(last) : addMonths(monthKey(last),-1), span=mk=>{ const s=toN(mk+'-01'); return [s,s+daysInMonth(mk)-1]; };
  if(st.lkCmp==='w4') return {A:[last-27,last],B:[last-55,last-28]};
  if(st.lkCmp==='mtd'){ const s=toN(monthKey(last)+'-01'); if(last-s>=6) return {A:[s,last],B:span(addMonths(monthKey(last),-1))}; }
  if(st.lkCmp==='ly') return {A:span(endMk),B:span(addMonths(endMk,-12))};
  if(st.lkCmp==='custom'&&st.lkA&&st.lkB) return {A:st.lkA,B:st.lkB};
  return {A:span(endMk),B:span(addMonths(endMk,-1))};
}
/* calendar months with at least half their days inside [a,b] */
function lkcMonths(a,b){ const out=[]; for(let mk=monthKey(a); mk<=monthKey(b); mk=addMonths(mk,1)){ const s=toN(mk+'-01'), e=s+daysInMonth(mk)-1, inside=Math.min(e,b)-Math.max(s,a)+1; if(inside*2>=daysInMonth(mk)) out.push(mk); } return out; }
function renderLinkPeriods(from,to){
  const el=id=>document.getElementById(id);
  document.querySelectorAll('#lkCmp button').forEach(b=>b.classList.toggle('on',b.dataset.c===st.lkCmp));
  el('lkCmpCustom').hidden=st.lkCmp!=='custom';
  const {A,B}=lkcPeriods(), stats=selStats(), m=st.measure, nm=cs=>cs.length>3? label(cs[0])+' and '+(cs.length-1)+' more' : cs.map(label).join(' + ');
  const fN=nm(from), tN=nm(to), dA=A[1]-A[0]+1, dB=B[1]-B[0]+1;
  if(st.lkCmp==='custom'){ ['lkA0','lkA1','lkB0','lkB1'].forEach((id,i)=>{ const v=[A[0],A[1],B[0],B[1]][i]; if(isFinite(v)) el(id).value=toS(v); }); }
  const lab=(p)=>fmtD(p[0])+' – '+fmtD(p[1]);
  el('lkCmpDesc').textContent='A: '+lab(A)+' · B: '+lab(B)+' · per day, so periods of different length compare fairly';
  if(!(A[0]>=S.min&&A[1]<=S.max&&B[0]>=S.min&&B[1]<=S.max&&A[0]<=A[1]&&B[0]<=B[1])){ el('lkCmpBody').hidden=true; el('lkCmpMsg').hidden=false; el('lkCmpMsg').textContent='The orders data covers '+fmtD(S.min)+' – '+fmtD(S.max)+'; pick periods inside it.'; return; }
  el('lkCmpMsg').hidden=true; el('lkCmpBody').hidden=false;
  const per=(cs,p)=>total(p[0],p[1],m,cs,stats)/(p[1]-p[0]+1);
  const fA=per(from,A), fB=per(from,B), tA=per(to,A), tB=per(to,B), rA=fA?tA/fA*100:null, rB=fB?tB/fB*100:null;
  const pc=(x,y)=>y? (x/y-1)*100 : null, f1=v=>MONEY.has(m)? fmtIQD(v) : (Math.abs(v)<10? v.toFixed(1) : fmtInt(v));
  const tile=(lab_,a,b_,fmt,sub)=>'<div class="kpi"><span class="lab">'+lab_+'</span><span class="val">'+fmt(a)+'</span><div class="deltas">'+(b_? chip(fmtPct(pc(a,b_),1)+' vs B',tone(pc(a,b_))) : '')+'</div><span class="sub">B: '+fmt(b_)+(sub||'')+'</span></div>';
  el('lkCmpKpis').innerHTML=tile(esc(fN)+' a day',fA,fB,f1)+tile(esc(tN)+' a day',tA,tB,f1)+tile(esc(tN)+' per 100 '+esc(fN),rA,rB,v=>v==null?'–':v.toFixed(1));
  // the split: volume at B's rate, then the rate change at A's volume
  const dT=tA-tB, vol=rB!=null? (fA-fB)*rB/100 : 0, rate=rA!=null&&rB!=null? fA*(rA-rB)/100 : 0;
  const lines=[], sgn=v=>(v>0?'+':v<0?'−':'')+f1(Math.abs(v));
  lines.push('<li><strong>'+esc(tN)+'</strong> went from '+f1(tB)+' to '+f1(tA)+' a day ('+fmtPct(pc(tA,tB),1)+'); <strong>'+esc(fN)+'</strong> from '+f1(fB)+' to '+f1(fA)+' ('+fmtPct(pc(fA,fB),1)+').</li>');
  if(rB!=null&&Math.abs(dT)>1e-9){
    const big=Math.abs(vol)>=Math.abs(rate);
    lines.push('<li>Of the '+sgn(dT)+' a day in '+esc(tN.toLowerCase())+', <strong>'+sgn(vol)+'</strong> is what '+esc(fN.toLowerCase())+'’s own change gives at the old rate, and <strong>'+sgn(rate)+'</strong> comes from '+(rate<0?'fewer':'more')+' '+esc(tN.toLowerCase())+' per '+esc(fN.toLowerCase())+' ('+rB.toFixed(1)+' → '+rA.toFixed(1)+' per 100). '+(big?'Mostly volume: the change follows '+esc(fN.toLowerCase())+'.':'Mostly the rate: '+esc(fN.toLowerCase())+' held up better than '+esc(tN.toLowerCase())+' did.')+'</li>');
  }
  // by From provider: orders a day (provider export)
  const provCats=PV? from.filter(c=>PV.cats.includes(c)) : [];
  const pvRows=[];
  if(provCats.length){
    const mi=MI[pvMeasure()], acc=new Map(), add=(p,k,v)=>{ let o=acc.get(p); if(!o){ o={a:0,b:0}; acc.set(p,o); } o[k]+=v; };
    for(const r of PV.rows){ if(!provCats.includes(r.cat)||!st.status.has(r.st)) continue;
      if(r.n>=A[0]&&r.n<=A[1]) add(r.p,'a',r.v[mi]); else if(r.n>=B[0]&&r.n<=B[1]) add(r.p,'b',r.v[mi]); }
    let dAll=0; acc.forEach(o=>{ o.a/=dA; o.b/=dB; dAll+=o.a-o.b; });
    acc.forEach((o,pi)=>{ const p=PV.provs[pi]; pvRows.push({name:pvName(p),cat:p.cat,spec:p.spec||'',a:o.a,b:o.b,d:o.a-o.b,share:dAll?(o.a-o.b)/dAll:null}); });
    pvRows.sort((x,y)=>Math.abs(y.d)-Math.abs(x.d));
  }
  // by From provider's patients going on to To (provider follow-on export)
  const pfRows=[]; let pfWin=30, pfMonths=null;
  const pfSrc=PF? from.filter(c=>PF.srcs.includes(c)) : [], pfTgt=PF? [...new Set(to.map(c=>UP_CAT[c]||c))].filter(t=>PF.tgts.includes(t)) : [];
  if(pfSrc.length&&pfTgt.length){
    const mA=lkcMonths(A[0],A[1]).filter(mk=>PF.months.includes(mk)), mB=lkcMonths(B[0],B[1]).filter(mk=>PF.months.includes(mk));
    pfMonths={A:mA,B:mB};
    if(mA.length&&mB.length){
      // a recent month whose 30 days haven't passed for everyone would read low: use the 7-day window then
      let pat=0, e30=0; PF.provs.forEach(p=>{ if(!pfSrc.includes(p.cat)) return; mA.forEach(mk=>{ const b=PF.base.get(p.i+'|'+mk); if(b){ pat+=b.pat; e30+=b.e30; } }); });
      if(pat&&e30<0.9*pat) pfWin=7;
      const eK='e'+pfWin, fK='f'+pfWin;
      PF.provs.forEach(p=>{ if(!pfSrc.includes(p.cat)) return;
        const side=ms=>{ let e=0,f=0; ms.forEach(mk=>{ const b=PF.base.get(p.i+'|'+mk); if(!b) return; e+=b[eK];
          // patients who had any of the To services: the sum over targets can count a patient twice, so cap it at the eligible count
          let ff=0; pfTgt.forEach(t=>{ const c=PF.cell.get(p.i+'|'+mk+'|'+t); if(c) ff+=c[fK]; }); f+=Math.min(ff,b[eK]); }); return {e:e/ms.length,f:f/ms.length}; };
        const a=side(mA), b=side(mB); if(!(a.e+b.e)) return;
        const rb=b.e?b.f/b.e:0, ra=a.e?a.f/a.e:0;
        pfRows.push({name:p.name+(p.name==='Unassigned'?' ('+label(p.cat)+')':''),cat:p.cat,spec:p.spec||'',eA:a.e,eB:b.e,fA:a.f,fB:b.f,rA:a.e>=5?ra:null,rB:b.e>=5?rb:null,vol:(a.e-b.e)*rb,rate:a.e*(ra-rb),d:a.f-b.f}); });
      pfRows.sort((x,y)=>Math.abs(y.d)-Math.abs(x.d));
    }
  }
  // provider lines for the read-out
  if(pfRows.length){ const tot=pfRows.reduce((s,r)=>s+r.d,0), vol_=pfRows.reduce((s,r)=>s+r.vol,0), rate_=pfRows.reduce((s,r)=>s+r.rate,0), top=pfRows.slice(0,3);
    lines.push('<li><strong>By provider</strong> ('+pfWin+'-day follow-on, a month on average): '+esc(fN.toLowerCase())+' patients going on to '+esc(tN.toLowerCase())+' changed by <strong>'+sgn(tot)+'</strong> a month: '+sgn(vol_)+' from providers seeing '+(vol_<0?'fewer':'more')+' patients, '+sgn(rate_)+' from a '+(rate_<0?'smaller':'larger')+' share of them going on.</li>');
    top.forEach(r=>lines.push('<li>'+esc(r.name)+': '+sgn(r.d)+' patients going on a month ('+fmtInt(r.eB)+' → '+fmtInt(r.eA)+' patients seen'+(r.rA!=null&&r.rB!=null?', '+(r.rB*100).toFixed(0)+'% → '+(r.rA*100).toFixed(0)+'% going on':'')+'); '+(Math.abs(r.vol)>=Math.abs(r.rate)?'mostly fewer or more patients seen':'mostly a change in how many went on')+'.</li>')); }
  else if(pvRows.length){ const top=pvRows.slice(0,3).filter(r=>Math.abs(r.d)>0.05);
    if(top.length) lines.push('<li><strong>Biggest changes in '+esc(fN.toLowerCase())+' by provider</strong>: '+top.map(r=>esc(r.name)+' '+sgn(r.d)+' a day').join(', ')+'. Load the provider follow-on export to see whose patients stopped going on to '+esc(tN.toLowerCase())+'.</li>'); }
  else lines.push('<li>'+(provCats.length||pfSrc.length? 'No provider rows cover both periods.' : 'Put a service with named providers (Doctor visit, Nursing or Physiotherapy) under From, and load the provider exports, to see which providers the change came from.')+'</li>');
  el('lkCmpRead').innerHTML='<ul>'+lines.join('')+'</ul>';
  // tables
  const showSpec=(pvRows.some(r=>r.spec)||pfRows.some(r=>r.spec)), cls=v=>v>0.005?'pos':v<-0.005?'neg':'';
  const tv=(v,d)=>'<td class="'+cls(v)+'">'+(v>0?'+':v<0?'−':'')+Math.abs(v).toFixed(d==null?1:d)+'</td>';
  if(pfRows.length){
    el('lkCmpProvH').textContent='By '+fN.toLowerCase()+' provider: patients going on to '+tN.toLowerCase()+' within '+pfWin+' days, a month on average';
    el('lkCmpProv').innerHTML='<thead><tr><th class="nosort" style="text-align:left">Provider</th>'+(showSpec?'<th class="nosort" style="text-align:left">Specialty</th>':'')+'<th class="nosort">Patients seen B</th><th class="nosort">A</th><th class="nosort">Went on B</th><th class="nosort">A</th><th class="nosort" title="Change in patients going on">Change</th><th class="nosort" title="From seeing more or fewer patients, at B’s rate">Volume</th><th class="nosort" title="From a different share of patients going on">Rate</th></tr></thead><tbody>'+
      pfRows.slice(0,25).map(r=>'<tr><td dir="auto" style="text-align:left">'+esc(r.name)+'</td>'+(showSpec?'<td dir="auto" style="text-align:left">'+esc(r.spec||'–')+'</td>':'')+'<td>'+fmtInt(r.eB)+'</td><td>'+fmtInt(r.eA)+'</td><td>'+(r.rB==null?fmtInt(r.fB):fmtInt(r.fB)+' <span class="note">'+(r.rB*100).toFixed(0)+'%</span>')+'</td><td>'+(r.rA==null?fmtInt(r.fA):fmtInt(r.fA)+' <span class="note">'+(r.rA*100).toFixed(0)+'%</span>')+'</td>'+tv(r.d)+tv(r.vol)+tv(r.rate)+'</tr>').join('')+'</tbody>';
  } else if(pvRows.length){
    el('lkCmpProvH').textContent='By '+fN.toLowerCase()+' provider: '+MLABEL[pvMeasure()].toLowerCase()+' a day';
    el('lkCmpProv').innerHTML='<thead><tr><th class="nosort" style="text-align:left">Provider</th><th class="nosort" style="text-align:left">Service</th>'+(showSpec?'<th class="nosort" style="text-align:left">Specialty</th>':'')+'<th class="nosort">B</th><th class="nosort">A</th><th class="nosort">Change a day</th><th class="nosort">Share of the change</th></tr></thead><tbody>'+
      pvRows.slice(0,25).map(r=>'<tr><td dir="auto" style="text-align:left">'+esc(r.name)+'</td><td style="text-align:left">'+esc(label(r.cat))+'</td>'+(showSpec?'<td dir="auto" style="text-align:left">'+esc(r.spec||'–')+'</td>':'')+'<td>'+r.b.toFixed(1)+'</td><td>'+r.a.toFixed(1)+'</td>'+tv(r.d,2)+'<td>'+(r.share==null?'–':(r.share*100).toFixed(0)+'%')+'</td></tr>').join('')+'</tbody>';
  } else { el('lkCmpProvH').textContent=''; el('lkCmpProv').innerHTML=''; }
  // by specialty
  const src=pfRows.length? pfRows : pvRows, bySp=new Map();
  if(showSpec) src.forEach(r=>{ if(!isDoctorCat(r.cat)) return; const k=r.spec||'No specialty'; const o=bySp.get(k)||bySp.set(k,{k,a:0,b:0,eA:0,eB:0,vol:0,rate:0,d:0}).get(k);
    if(pfRows.length){ o.eA+=r.eA; o.eB+=r.eB; o.a+=r.fA; o.b+=r.fB; o.vol+=r.vol; o.rate+=r.rate; o.d+=r.d; } else { o.a+=r.a; o.b+=r.b; o.d+=r.d; } });
  const SP=[...bySp.values()].sort((x,y)=>Math.abs(y.d)-Math.abs(x.d));
  el('lkCmpSpecWrap').hidden=!SP.length;
  if(SP.length) el('lkCmpSpec').innerHTML= pfRows.length?
    '<thead><tr><th class="nosort" style="text-align:left">Specialty</th><th class="nosort">Patients seen B</th><th class="nosort">A</th><th class="nosort">Went on B</th><th class="nosort">A</th><th class="nosort">Change</th><th class="nosort">Volume</th><th class="nosort">Rate</th></tr></thead><tbody>'+SP.map(o=>'<tr><td dir="auto" style="text-align:left">'+esc(o.k)+'</td><td>'+fmtInt(o.eB)+'</td><td>'+fmtInt(o.eA)+'</td><td>'+fmtInt(o.b)+(o.eB?' <span class="note">'+(o.b/o.eB*100).toFixed(0)+'%</span>':'')+'</td><td>'+fmtInt(o.a)+(o.eA?' <span class="note">'+(o.a/o.eA*100).toFixed(0)+'%</span>':'')+'</td>'+tv(o.d)+tv(o.vol)+tv(o.rate)+'</tr>').join('')+'</tbody>'
    : '<thead><tr><th class="nosort" style="text-align:left">Specialty</th><th class="nosort">B</th><th class="nosort">A</th><th class="nosort">Change a day</th></tr></thead><tbody>'+SP.map(o=>'<tr><td dir="auto" style="text-align:left">'+esc(o.k)+'</td><td>'+o.b.toFixed(1)+'</td><td>'+o.a.toFixed(1)+'</td>'+tv(o.d,2)+'</tr>').join('')+'</tbody>';
  const notes=[];
  if(pfMonths) notes.push('Follow-on uses the months '+(pfMonths.B.map(fmtM).join(', ')||'none')+' (B) and '+(pfMonths.A.map(fmtM).join(', ')||'none')+' (A) from the provider follow-on export'+(pfWin===7?'; A’s 30 days haven’t passed for everyone yet, so the 7-day window is used':'')+'.');
  if(!PF) notes.push('Load the provider follow-on export to see whose patients went on to '+tN.toLowerCase()+'.');
  if(!PV) notes.push('Load the provider export to see '+fN.toLowerCase()+' orders by provider.');
  if(!showSpec&&(PV||PF)) notes.push('No specialty in the exports yet, so there is no specialty table.');
  el('lkCmpNote').textContent=notes.join(' ');
}
function wireLinkPeriods(){
  document.querySelectorAll('#lkCmp button').forEach(b=>b.addEventListener('click',()=>{ st.lkCmp=b.dataset.c;
    if(st.lkCmp==='custom'&&!st.lkA){ const p=lkcPeriods(); st.lkA=p.A; st.lkB=p.B; } renderLinks(); }));
  ['lkA0','lkA1','lkB0','lkB1'].forEach(id=>document.getElementById(id).addEventListener('change',()=>{ const v=id=>toN(document.getElementById(id).value);
    const a=[v('lkA0'),v('lkA1')], b=[v('lkB0'),v('lkB1')]; if([...a,...b].every(isFinite)){ st.lkA=a; st.lkB=b; renderLinks(); } }));
}
