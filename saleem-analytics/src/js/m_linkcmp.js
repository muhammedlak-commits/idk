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
      let pat=0, e30=0, e7=0; PF.provs.forEach(p=>{ if(!pfSrc.includes(p.cat)) return; [...mA,...mB].forEach(mk=>{ const b=PF.base.get(p.i+'|'+mk); if(b){ if(mA.includes(mk)){ pat+=b.pat; e30+=b.e30; } e7+=b.e7; } }); });
      if(pat&&e30<0.9*pat&&e7>0) pfWin=7;   // only when the export carries the 7-day columns
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
  // cases or doctors: fewer cases, a different case mix, or doctors sending a different share
  const SPL= pfRows.length? lkcSplit(A,B,pfSrc,pfTgt,pfMonths.A,pfMonths.B,pfWin) : null;
  if(SPL&&SPL.empty) lines.push('<li><strong>Cases or doctors?</strong> The provider follow-on export has no '+esc(fN.toLowerCase())+' patients past their '+pfWin+'-day window in period '+SPL.noFollow+', so the share sent on can’t be worked out. Upload a newer follow-on export, or pick earlier periods.</li>');
  if(SPL&&SPL.R.length){ const S_=SPL, tot=S_.cases+S_.mix+S_.docs, f2=v=>(v>0?'+':v<0?'−':'')+Math.abs(v).toFixed(Math.abs(v)<10?1:0), grp=S_.useSpec?'specialties':'doctors';
    const caseSide=S_.cases+S_.mix, verdict= Math.abs(caseSide)>=2*Math.abs(S_.docs)? 'Mostly the cases, not the doctors: '+(S_.cases*S_.mix>=0||Math.abs(S_.cases)>Math.abs(S_.mix)? (S_.cases<0?'fewer':'more')+' patients'+(Math.abs(S_.mix)>=0.25*Math.abs(caseSide)?', and a mix shifted toward '+grp+' that send '+(S_.mix<0?'fewer':'more')+' on':'') : 'the mix of '+grp+' shifted')+'.'
      : Math.abs(S_.docs)>=2*Math.abs(caseSide)? 'Mostly the doctors: the same kinds of patients were sent on '+(S_.docs<0?'less':'more')+' often.' : 'Both: the cases and the share sent on each moved it.';
    lines.push('<li><strong>Cases or doctors?</strong> '+esc(fN)+' patients going on to '+esc(tN.toLowerCase())+' ('+pfWin+'-day): about '+S_.oB.toFixed(1)+' a day in B, '+S_.oA.toFixed(1)+' in A ('+f2(tot)+'). <strong>'+f2(S_.cases)+'</strong> from '+(S_.cases<0?'fewer':'more')+' patients overall, <strong>'+f2(S_.mix)+'</strong> from a different mix of '+grp+', <strong>'+f2(S_.docs)+'</strong> from doctors sending a '+(S_.docs<0?'smaller':'larger')+' share on within the same '+(S_.useSpec?'specialty':'doctor')+'. '+verdict+'</li>');
    const mixTop=S_.R.slice().sort((x,y)=>Math.abs(y.vol)-Math.abs(x.vol))[0], docTop=S_.R.slice().sort((x,y)=>Math.abs(y.doc)-Math.abs(x.doc))[0];
    if(mixTop&&Math.abs(mixTop.vol)>0.05) lines.push('<li>'+esc(mixTop.name)+': '+mixTop.nB.toFixed(1)+' → '+mixTop.nA.toFixed(1)+' patients a day ('+(S_.NB?(mixTop.nB/S_.NB*100).toFixed(0):'–')+'% → '+(S_.NA?(mixTop.nA/S_.NA*100).toFixed(0):'–')+'% of cases), and '+(mixTop.rB*100).toFixed(0)+'% of them usually go on: the biggest case effect ('+f2(mixTop.vol)+' a day).</li>');
    if(docTop&&docTop!==mixTop&&Math.abs(docTop.doc)>0.05||docTop===mixTop&&Math.abs(docTop.doc)>Math.abs(docTop.vol)) lines.push('<li>'+esc(docTop.name)+': the share sent on went '+(docTop.rB*100).toFixed(0)+'% → '+(docTop.rA*100).toFixed(0)+'%'+(docTop.estA&&docTop.estB?'':' (few patients, so pooled)')+': the biggest doctor effect ('+f2(docTop.doc)+' a day).</li>');
  }
  // provider lines for the read-out
  if(SPL&&SPL.R.length){}
  else if(pfRows.length){ const tot=pfRows.reduce((s,r)=>s+r.d,0), vol_=pfRows.reduce((s,r)=>s+r.vol,0), rate_=pfRows.reduce((s,r)=>s+r.rate,0), top=pfRows.slice(0,3);
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
  // the split, group by group, and the same by doctor for the provider table
  const splitTable=(X,what)=>{ const pct=v=>(v*100).toFixed(0)+'%';
    return '<thead><tr><th class="nosort" style="text-align:left">'+what+'</th>'+(what==='Doctor'&&X.R.some(o=>o.spec)?'<th class="nosort" style="text-align:left">Specialty</th>':'')+'<th class="nosort" title="Patients a day">Cases B</th><th class="nosort">A</th><th class="nosort" title="Share of all cases">Mix B</th><th class="nosort">A</th><th class="nosort" title="Share of patients who went on">Sent on B</th><th class="nosort">A</th><th class="nosort" title="Effect of this group’s cases changing, at B’s share sent on">Cases effect</th><th class="nosort" title="Effect of this group sending a different share on">Doctors effect</th></tr></thead><tbody>'+
      X.R.slice().sort((x,y)=>Math.abs(y.vol+y.doc)-Math.abs(x.vol+x.doc)).slice(0,25).map(o=>'<tr><td dir="auto" style="text-align:left">'+esc(o.name)+'</td>'+(what==='Doctor'&&X.R.some(q=>q.spec)?'<td dir="auto" style="text-align:left">'+esc(o.spec||'–')+'</td>':'')+'<td>'+o.nB.toFixed(1)+'</td><td>'+o.nA.toFixed(1)+'</td><td>'+(X.NB?pct(o.nB/X.NB):'–')+'</td><td>'+(X.NA?pct(o.nA/X.NA):'–')+'</td><td>'+pct(o.rB)+(o.estB?'':'<span class="note">*</span>')+'</td><td>'+pct(o.rA)+(o.estA?'':'<span class="note">*</span>')+'</td>'+tv(o.vol,2)+tv(o.doc,2)+'</tr>').join('')+
      '<tr class="total"><td style="text-align:left">All</td>'+(what==='Doctor'&&X.R.some(o=>o.spec)?'<td></td>':'')+'<td>'+X.NB.toFixed(1)+'</td><td>'+X.NA.toFixed(1)+'</td><td>100%</td><td>100%</td><td>'+pct(X.rbB)+'</td><td>'+pct(X.rbA)+'</td>'+tv(X.cases+X.mix,2)+tv(X.docs,2)+'</tr></tbody>'; };
  const hasSplit=!!(SPL&&SPL.R.length);
  el('lkCmpSpecWrap').hidden=!(hasSplit&&SPL.useSpec);
  if(hasSplit&&SPL.useSpec){ el('lkCmpSpecH').textContent='Cases or doctors, by specialty ('+pfWin+'-day follow-on, a day)'; el('lkCmpSpec').innerHTML=splitTable(SPL,'Specialty'); }
  if(hasSplit){ const SD=SPL.useSpec? lkcSplit(A,B,pfSrc,pfTgt,pfMonths.A,pfMonths.B,pfWin,true) : SPL;
    el('lkCmpProvH').textContent='Cases or doctors, by doctor ('+pfWin+'-day follow-on, a day)'; el('lkCmpProv').innerHTML=splitTable(SD,'Doctor'); }
  const notes=[];
  if(pfMonths) notes.push('Follow-on uses the months '+(pfMonths.B.map(fmtM).join(', ')||'none')+' (B) and '+(pfMonths.A.map(fmtM).join(', ')||'none')+' (A) from the provider follow-on export'+(pfWin===7?'; A’s 30 days haven’t passed for everyone yet, so the 7-day window is used':'')+'.');
  if(!PF) notes.push('Load the provider follow-on export to see whose patients went on to '+tN.toLowerCase()+'.');
  if(!PV) notes.push('Load the provider export to see '+fN.toLowerCase()+' orders by provider.');
  if(SPL&&SPL.R.length&&SPL.matchedShare<0.8) notes.push('Only '+Math.round(SPL.matchedShare*100)+'% of cases belong to doctors in the follow-on export; the rest use the overall share sent on (*). Upload a newer provider follow-on export so the two cover the same doctors.');
  if(SPL&&SPL.R.length){ notes.push('Cases a day come from '+(SPL.src==='pv'?'the daily provider export (exact dates)':'the follow-on export’s patients per day of its months, so a month exported part-way through reads low; load the provider export for exact counts')+'. * = under 10 patients, so the share uses everyone’s.');
    if(!SPL.useSpec) notes.push('The exports have no doctor specialty, so this groups by doctor. Run the updated provider and provider follow-on queries (Copy SQL in Data & settings) to group by specialty.'); }
  else if(!showSpec&&(PV||PF)) notes.push('No specialty in the exports yet. Run the updated queries (Copy SQL in Data & settings) to add it.');
  el('lkCmpNote').textContent=notes.join(' ');
}
function wireLinkPeriods(){
  document.querySelectorAll('#lkCmp button').forEach(b=>b.addEventListener('click',()=>{ st.lkCmp=b.dataset.c;
    if(st.lkCmp==='custom'&&!st.lkA){ const p=lkcPeriods(); st.lkA=p.A; st.lkB=p.B; } renderLinks(); }));
  ['lkA0','lkA1','lkB0','lkB1'].forEach(id=>document.getElementById(id).addEventListener('change',()=>{ const v=id=>toN(document.getElementById(id).value);
    const a=[v('lkA0'),v('lkA1')], b=[v('lkB0'),v('lkB1')]; if([...a,...b].every(isFinite)){ st.lkA=a; st.lkB=b; renderLinks(); } }));
}

/* Cases or doctors. Groups are doctor specialties (or single doctors when the exports carry no specialty).
   n = cases a day (patients seen), r = share of them who had a To service within the window (provider follow-on export).
   Follow-on a day = Σ n·r. Its change splits exactly into
     cases  = (N_A − N_B)·r̄_B                  fewer or more patients overall, at B's average share
     mix    = Σ n_A·r_B − N_A·r̄_B              the same number of patients spread differently across groups
     doctors= Σ n_A·(r_A − r_B)                 each group sending a different share on
   A group with under 10 eligible patients in a period takes that period's pooled share. */
function lkcSplit(A,B,pfSrc,pfTgt,mA,mB,win,byDoctor){
  const eK='e'+win, fK='f'+win;
  const pvSpec=new Map(PV? PV.provs.filter(p=>p.spec).map(p=>[p.cat+'|'+p.id,p.spec]) : []), specOfPF=p=>p.spec||pvSpec.get(p.cat+'|'+p.id)||'';
  const useSpec=!byDoctor&&(PF.provs.some(p=>pfSrc.includes(p.cat)&&p.spec)||(!!PV&&PV.provs.some(p=>pfSrc.includes(p.cat)&&p.spec)));
  const gk=(cat,spec,id)=> useSpec? (isDoctorCat(cat)? (spec||'No specialty') : label(cat)) : cat+'|'+id;
  const G=new Map(), g=(k,name)=>G.get(k)||G.set(k,{k,name,eA:0,fA:0,eB:0,fB:0,pA:0,pB:0,nA:0,nB:0}).get(k);
  PF.provs.forEach(p=>{ if(!pfSrc.includes(p.cat)) return; const sp=specOfPF(p), k=gk(p.cat,sp,p.id), o=g(k,useSpec?k:p.name+(p.name==='Unassigned'?' ('+label(p.cat)+')':'')); if(!useSpec&&sp) o.spec=sp;
    [[mA,'A'],[mB,'B']].forEach(([ms,x])=>ms.forEach(mk=>{ const b=PF.base.get(p.i+'|'+mk); if(!b) return; let ff=0; pfTgt.forEach(t=>{ const c=PF.cell.get(p.i+'|'+mk+'|'+t); if(c) ff+=c[fK]; });
      o['e'+x]+=b[eK]; o['f'+x]+=Math.min(ff,b[eK]); o['p'+x]+=b.pat; })); });
  let src='pf';
  if(PV&&PV.min<=B[0]&&PV.max>=A[1]){ src='pv'; const dA=A[1]-A[0]+1, dB=B[1]-B[0]+1;
    for(const r of PV.rows){ if(!pfSrc.includes(r.cat)||!st.status.has(r.st)) continue; const x=r.n>=A[0]&&r.n<=A[1]?'nA':r.n>=B[0]&&r.n<=B[1]?'nB':null; if(!x) continue;
      const p=PV.provs[r.p], k=gk(r.cat,r.sp||p.spec,p.id); g(k,useSpec?k:pvName(p))[x]+=r.v[2]/(x==='nA'?dA:dB); } }
  else { const days=ms=>ms.reduce((t,mk)=>t+daysInMonth(mk),0), dA=days(mA)||1, dB=days(mB)||1; G.forEach(o=>{ o.nA=o.pA/dA; o.nB=o.pB/dB; }); }
  const all=[...G.values()], tA=all.reduce((t,o)=>t+o.eA,0), tB=all.reduce((t,o)=>t+o.eB,0);
  const R=all.filter(o=>o.nA+o.nB>0), sum=(f)=>R.reduce((t,o)=>t+f(o),0);
  // unmatched = cases with no follow-on rows at all (different doctors, or doctors missing from the follow-on export)
  const matched=R.filter(o=>o.eA+o.eB>0).reduce((t,o)=>t+o.nA+o.nB,0), allCases=R.reduce((t,o)=>t+o.nA+o.nB,0);
  if(!tA||!tB) return {R:[],empty:true,src,noFollow:!tA?'A':'B'};
  const RA=all.reduce((t,o)=>t+o.fA,0)/tA, RB=all.reduce((t,o)=>t+o.fB,0)/tB;
  R.forEach(o=>{ o.estA=o.eA>=10; o.estB=o.eB>=10; o.rA=o.estA?o.fA/o.eA:RA; o.rB=o.estB?o.fB/o.eB:RB; o.vol=(o.nA-o.nB)*o.rB; o.doc=o.nA*(o.rA-o.rB); });
  const NA=sum(o=>o.nA), NB=sum(o=>o.nB), oA=sum(o=>o.nA*o.rA), oB=sum(o=>o.nB*o.rB), rbB=NB?oB/NB:0, rbA=NA?oA/NA:0;
  const cases=(NA-NB)*rbB, mix=sum(o=>o.nA*o.rB)-NA*rbB, docs=sum(o=>o.doc);
  return {R,NA,NB,oA,oB,rbA,rbB,cases,mix,docs,useSpec,src,matchedShare:allCases?matched/allCases:0};
}
