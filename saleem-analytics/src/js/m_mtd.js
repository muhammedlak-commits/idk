/* ---------- month so far: the fair month-to-date line at the top of each tab ----------
   Always from the latest day of data, whatever the date range says: this month from the 1st to that day against the
   same days of last month and the same days last year (Hijri or weekday-aligned). When the data ends on a month's
   last day, it is that whole month against the whole month before. The button sets the page to those dates, which the
   Fairest comparison then judges against the same days of last month. */
function mtdPeriods(end){
  const last=end==null?S.max:end, a=monthStart(last), b=last, pa=monthBack(a);
  const pb= isMonthEnd(b)? toN(monthKey(pa)+'-01')+daysInMonth(monthKey(pa))-1 : monthBack(b), ys=lyShift(a);
  return {a,b,pa,pb,la:a-ys,lb:b-ys,full:isMonthEnd(b),mk:monthKey(a)};
}
function mtdLabel(M){ return M.full? fmtMonthName(M.mk)+' ('+fmtDs(M.a)+' – '+fmtDs(M.b)+')' : fmtMonthName(M.mk)+' so far ('+fmtDs(M.a)+' – '+fmtDs(M.b)+')'; }
const mtdChip=(v,upGood=true)=> v==null? '<span class="delta flat">–</span>' : chip(fmtPct(v,1),tone(v,upGood));
function mtdHtml(M,title,parts,extra){
  const useBtn= st.from===M.a&&st.to===M.b? '' : '<button type="button" class="linkbtn" data-mtd-use>Show these dates</button>';
  return '<div class="mtdhead"><span class="mtdtag">'+(M.full?'Last full month':'Month so far')+'</span><strong>'+esc(title)+'</strong>'+useBtn+'</div><div class="mtdrow">'+parts.join('')+'</div>'+(extra?'<div class="mtdnote">'+extra+'</div>':'');
}
function mtdPart(lab,val,vsM,vsLY,sub){ return '<div class="mtdpart"><span class="lab">'+lab+'</span><span class="val">'+val+'</span><span class="cmp">'+vsM+' <span class="note">vs same days last month</span></span><span class="cmp">'+vsLY+' <span class="note">vs same days last year</span></span>'+(sub?'<span class="note">'+sub+'</span>':'')+'</div>'; }
function renderMtd(key){
  const el=document.getElementById('mtd-'+key); if(!el) return;
  const cats=selCats(), stats=selStats(), m=st.measure, pc=(x,y)=>x!=null&&y>0? (x/y-1)*100 : null;
  let M=mtdPeriods(), html='';
  const cov=(a,b)=>covered(a,b);
  if(key==='why'||key==='perf'){
    const T=(a,b,mm,cs)=>cov(a,b)? total(a,b,mm||m,cs||cats,stats) : null;
    const cur=T(M.a,M.b), bm=T(M.pa,M.pb), ly=T(M.la,M.lb), sc=v=>perLen(v,M.pa,M.pb,M.a,M.b);
    const parts=[mtdPart(esc(MLABEL[m].replace(' (IQD)','')),fmtVal(cur,m),mtdChip(pc(cur,sc(bm))),mtdChip(pc(cur,ly)),fmtVal(cur/(M.b-M.a+1),m)+' a day · last month '+fmtVal(bm,m))];
    if(S.hasNew&&!MONEY.has(m)){ const R_=(a,b)=>cov(a,b)? totalView('ret',a,b,'ord',cats,stats) : null, N_=(a,b)=>cov(a,b)? totalView('new',a,b,'ord',cats,stats) : null;
      parts.push(mtdPart('Returning-patient orders',fmtInt(R_(M.a,M.b)),mtdChip(pc(R_(M.a,M.b),sc(R_(M.pa,M.pb)))),mtdChip(pc(R_(M.a,M.b),R_(M.la,M.lb)))));
      parts.push(mtdPart('New-patient orders',fmtInt(N_(M.a,M.b)),mtdChip(pc(N_(M.a,M.b),sc(N_(M.pa,M.pb)))),mtdChip(pc(N_(M.a,M.b),N_(M.la,M.lb))))); }
    // the services that moved most against the same days last month (5% share or more)
    const mv=cats.map(c=>{ const x=T(M.a,M.b,m,[c]), y=sc(T(M.pa,M.pb,m,[c])); return {c,x,p:pc(x,y)}; }).filter(o=>o.p!=null&&cur&&o.x/cur>=0.05).sort((p,q)=>Math.abs(q.p)-Math.abs(p.p)).slice(0,3);
    html=mtdHtml(M,mtdLabel(M),parts, mv.length? 'Moved most against the same days last month: '+mv.map(o=>esc(label(o.c))+' <span class="'+(o.p>=0?'pos':'neg')+'">'+fmtPct(o.p,0)+'</span>').join(', ')+'.' : '');
  } else if(key==='pat'){
    if(!U){ el.innerHTML=''; return; }
    const {list}=upCategories(), c=list[0]; if(!c){ el.innerHTML=''; return; }
    const d=U.by[c], mk=M.mk, x=d[mk], pm=d[addMonths(mk,-1)], py=d[addMonths(mk,-12)];
    if(!x){ el.innerHTML=''; return; }
    const upM=monthKey(S.max)===mk? M : mtdPeriods(S.max);
    if(!U.hasMtd&&!M.full){ el.innerHTML=mtdHtml(M,mtdLabel(M),[],'This patients export has no month-to-date columns, so '+fmtMonthName(mk)+' can’t be compared fairly with earlier months (unique patients don’t add up day by day). Run the updated patients query (Copy SQL in Data &amp; settings) to add them.'); wireMtd(el); return; }
    const day=U.mtdDay, same=!M.full&&U.hasMtd;
    const v=o=>o? (same? o.umtd : o.u) : null, nv=o=>o? (same? (st.newBasis==='created'&&o.ncmtd!=null?o.ncmtd:o.nmtd) : newOf(o)) : null;
    const parts=[mtdPart('Unique patients'+(c!=='all'?' · '+esc(UP_LABEL[c]||c):''),fmtInt(v(x)),mtdChip(pc(v(x),v(pm))),mtdChip(pc(v(x),v(py)))),
      mtdPart('New patients',fmtInt(nv(x)),mtdChip(pc(nv(x),nv(pm)))+'',mtdChip(pc(nv(x),nv(py)))),
      mtdPart('Returning patients',fmtInt(v(x)-nv(x)),mtdChip(pc(v(x)-nv(x),pm&&v(pm)-nv(pm))),mtdChip(pc(v(x)-nv(x),py&&v(py)-nv(py))))];
    html=mtdHtml(M,mtdLabel(M),parts, same? 'Each month counted up to day '+day+', the day the patients export reaches.' : '');
  } else if(key==='prov'){
    if(!PV){ el.innerHTML=''; return; }
    const mi=MI[pvMeasure()], sum_=(a,b)=>{ const t=new Map(); for(const r of PV.rows){ if(r.n<a||r.n>b||!svcOn(r.cat)||!st.status.has(r.st)) continue; t.set(r.p,(t.get(r.p)||0)+r.v[mi]); } return t; };
    M=mtdPeriods(Math.min(S.max,PV.max));
    const A_=sum_(M.a,M.b), B_=sum_(M.pa,M.pb), L_=sum_(M.la,M.lb), tot=mp=>[...mp.values()].reduce((s,v)=>s+v,0), sc=v=>perLen(v,M.pa,M.pb,M.a,M.b);
    const mv=[...new Set([...A_.keys(),...B_.keys()])].map(p=>({p,d:(A_.get(p)||0)-sc(B_.get(p)||0)})).filter(o=>PV.provs[o.p].name!=='Unassigned').sort((x,y)=>Math.abs(y.d)-Math.abs(x.d)).slice(0,3);
    html=mtdHtml(M,mtdLabel(M),[mtdPart('Provider '+MLABEL[pvMeasure()].toLowerCase(),fmtInt(tot(A_)),mtdChip(pc(tot(A_),sc(tot(B_)))),mtdChip(pc(tot(A_),tot(L_))),'Active providers: '+[...A_.values()].filter(v=>v>0).length)],
      mv.length? 'Biggest changes against the same days last month: '+mv.map(o=>esc(pvName(PV.provs[o.p]))+' <span class="'+(o.d>=0?'pos':'neg')+'">'+(o.d>0?'+':'')+Math.round(o.d)+'</span>').join(', ')+'.' : '');
  } else if(key==='ads'){
    M=mtdPeriods(Math.min(S.max,A.maxDay)); const g=spendGroups(), sp=(a,b)=>sum(adDaily(a,b,g)), sc=v=>perLen(v,M.pa,M.pb,M.a,M.b);
    const s1=sp(M.a,M.b), s0=sp(M.pa,M.pb), sl=M.la>=A.minDay? sp(M.la,M.lb) : null;
    html=mtdHtml(M,mtdLabel(M),[mtdPart('Meta spend ('+esc(adModeLabel())+')',fmtUsd(s1),mtdChip(pc(s1,sc(s0)),false),mtdChip(pc(s1,sl),false),fmtUsd(s1/(M.b-M.a+1))+' a day')]);
  }
  el.innerHTML=html; wireMtd(el);
}
function wireMtd(el){ const b=el.querySelector('[data-mtd-use]'); if(b) b.addEventListener('click',()=>{ const M=mtdPeriods(); st.from=M.a; st.to=M.b; st.gran='day'; render(); window.scrollTo({top:0}); }); }
