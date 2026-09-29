/* ---------- holiday effects ---------- */
/* per holiday type: measured effect vs. same weekdays in the surrounding four weeks */
function holidayEffects(cats,stats,m,upTo,since){
  const end=Math.min(upTo==null?S.max:upTo, S.max);
  const y=series(S.min,end,m,cats,stats);
  const at=n=>y[n-S.min];
  const isHol=n=>holKeysOn(n).length>0;
  const wins=holidayWindows(Math.max(S.min+28,since==null?-Infinity:since),end-7);
  const byType={};
  for(const w of wins){
    // weekday-matched baseline from the four weeks either side, skipping holiday days
    const base={}; const cnt={};
    const pad=w.long?35:28;
    for(let n=w.s-pad;n<=w.e+pad;n++){ if(n>=w.s&&n<=w.e) continue; if(n<S.min||n>end) continue; if(isHol(n)) continue; const d=dow(n); base[d]=(base[d]||0)+at(n); cnt[d]=(cnt[d]||0)+1; }
    let act=0, exp=0, ok=true;
    for(let n=w.s;n<=w.e;n++){ const d=dow(n); if(!cnt[d]){ok=false;break;} act+=at(n); exp+=base[d]/cnt[d]; }
    if(!ok||exp<=0) continue;
    const key = w.k==='fixed'? 'fixed:'+w.name : w.k;
    const t=byType[key]||(byType[key]={key,k:w.k,name:w.name,occ:[]}); t.occ.push({s:w.s,e:w.e,eff:(act/exp-1)*100,days:w.e-w.s+1,act,exp,thin:exp/(w.e-w.s+1)<15});
  }
  /* average weights each year by its volume and leaves out years with under 15 expected per day, which are mostly noise */
  return Object.values(byType).map(t=>{const ok=t.occ.filter(o=>!o.thin); const A_=ok.reduce((s,o)=>s+o.act,0), E_=ok.reduce((s,o)=>s+o.exp,0); return {...t,avg:E_?(A_/E_-1)*100:null};}).filter(r=>r.avg!=null).sort((a,b)=>a.avg-b.avg);
}
function renderHolidays(){
  const rows=holidayEffects(selCats(),selStats(),st.measure);
  const cell=v=>{const a=Math.min(Math.abs(v),50)/50; const bg=v>=0?'rgba(12,163,12,'+(0.05+a*0.25)+')':'rgba(208,59,59,'+(0.05+a*0.25)+')'; return '<td class="heat" style="background:'+bg+'">'+fmtPct(v)+'</td>';};
  const maxOcc=Math.max(1,...rows.map(r=>r.occ.length));
  const years=[...new Set(rows.flatMap(r=>r.occ.map(o=>toS(o.s).slice(0,4))))].sort();
  document.getElementById('holTable').innerHTML='<thead><tr><th class="nosort">Holiday</th><th class="nosort">Average</th>'+years.map(yy=>'<th class="nosort">'+yy+'</th>').join('')+'</tr></thead><tbody>'+
    rows.map(r=>'<tr><td>'+esc(r.name)+'</td>'+cell(r.avg)+years.map(yy=>{const o=r.occ.filter(o=>toS(o.s).slice(0,4)===yy); if(!o.length) return '<td>–</td>'; const v=o.reduce((s,x)=>s+x.eff,0)/o.length; return '<td'+(o.every(x=>x.thin)?' style="color:var(--muted)"':'')+' title="'+o.map(x=>fmtD(x.s)+(x.days>1?' – '+fmtD(x.e):'')).join(', ')+(o.every(x=>x.thin)?' · low volume, left out of the average':'')+'">'+fmtPct(v)+'</td>';}).join('')+'</tr>').join('')+'</tbody>';
}


/* ---------- events ---------- */
function renderEvents(){
  const cats=[...new Set(EVENTS.map(e=>e.cat))].sort();
  const sel=document.getElementById('evCat'); const cur=sel.value;
  sel.innerHTML='<option value="">All categories</option>'+cats.map(c=>'<option>'+esc(c)+'</option>').join(''); sel.value=cur;
  const list=EVENTS.filter(e=>!st.evCat||e.cat===st.evCat).slice().reverse();
  document.getElementById('evList').innerHTML=list.map(e=>'<div class="ev"><span class="d">'+fmtD(e.s)+(e.e>e.s?'<br>– '+fmtD(e.e):'')+'</span><span class="c">'+esc(e.cat)+(e.own?' · yours':'')+'</span><span class="t">'+esc(e.title)+(e.note?'<small>'+esc(e.note)+'</small>':'')+'</span><span>'+(e.own?'<button class="linkbtn" data-del="'+e.id+'">Remove</button>':'')+'</span></div>').join('') || '<p class="note">No events in this category.</p>';
  document.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',()=>{ let mine=[]; try{mine=JSON.parse(lsGet('spl.events')||'[]')}catch(e){} mine=mine.filter(x=>String(x.id)!==b.dataset.del); lsSet('spl.events',JSON.stringify(mine)); loadEvents(); render(); toast('Event removed'); }));
}
function wireEvents(){
  document.getElementById('evForm').addEventListener('submit',e=>{ e.preventDefault();
    const s=toN(document.getElementById('evStart').value), title=document.getElementById('evTitle').value.trim(); if(!isFinite(s)||!title) return;
    let mine=[]; try{mine=JSON.parse(lsGet('spl.events')||'[]')}catch(err){}
    mine.push({id:Date.now(),s,e:s,cat:document.getElementById('evNewCat').value,title,note:''}); lsSet('spl.events',JSON.stringify(mine));
    document.getElementById('evTitle').value=''; loadEvents(); render(); toast('Event added');
  });
  document.getElementById('evCopy').addEventListener('click',()=>{
    const q=v=>/[",]/.test(v)?'"'+String(v).replace(/"/g,'""')+'"':v;
    const txt='start,end,category,title,note\n'+EVENTS.map(e=>[toS(e.s),e.e>e.s?toS(e.e):'',e.cat,e.title,e.note||''].map(q).join(',')).join('\n');
    navigator.clipboard.writeText(txt).then(()=>toast('Events copied as CSV')).catch(()=>toast('Copy was blocked by this browser'));
  });
}


/* ---------- outside factor effects ----------
   Same method as holidays: each event window against the same weekdays in the four weeks around it,
   leaving out holiday days and other event days. Campaign launches are left out (they start
   something rather than mark a window), and so are events longer than two weeks. */
function factorEffects(cats,stats,m){
  const y=series(S.min,S.max,m,cats,stats), at=n=>y[n-S.min];
  const evs=EVENTS.filter(e=>e.cat!=='Marketing' && e.e-e.s<=14 && e.s>=S.min+28 && e.e<=S.max-7);
  const busy=new Set(); EVENTS.forEach(e=>{ if(e.cat!=='Marketing') for(let n=Math.max(e.s,S.min-28);n<=Math.min(e.e,S.max);n++) busy.add(n); });
  const skip=n=>busy.has(n)||holKeysOn(n).length>0;
  const res=[];
  for(const ev of evs){
    const base={}, cnt={};
    for(let n=ev.s-28;n<=ev.e+28;n++){ if(n>=ev.s&&n<=ev.e) continue; if(n<S.min||n>S.max||skip(n)) continue; const d=dow(n); base[d]=(base[d]||0)+at(n); cnt[d]=(cnt[d]||0)+1; }
    let act=0, exp=0, ok=true;
    for(let n=ev.s;n<=ev.e;n++){ const d=dow(n); if(!cnt[d]){ok=false;break;} act+=at(n); exp+=base[d]/cnt[d]; }
    if(ok&&exp>0) res.push({ev,act,exp,eff:(act/exp-1)*100,thin:exp/(ev.e-ev.s+1)<15});
  }
  const byCat={}; res.forEach(r=>{ (byCat[r.ev.cat]||(byCat[r.ev.cat]=[])).push(r); });
  const catRows=Object.entries(byCat).map(([c,rs])=>{ const ok=rs.filter(r=>!r.thin); const A_=ok.reduce((s,r)=>s+r.act,0), E_=ok.reduce((s,r)=>s+r.exp,0); return {c,n:rs.length,avg:E_?(A_/E_-1)*100:null}; }).sort((a,b)=>(a.avg??0)-(b.avg??0));
  return {res,catRows};
}
function renderFactorEffects(){
  const {res,catRows}=factorEffects(selCats(),selStats(),st.measure);
  const cell=v=>{ if(v==null) return '<td>–</td>'; const a=Math.min(Math.abs(v),50)/50; const bg=v>=0?'rgba(12,163,12,'+(0.05+a*0.25)+')':'rgba(208,59,59,'+(0.05+a*0.25)+')'; return '<td class="heat" style="background:'+bg+'">'+fmtPct(v)+'</td>'; };
  document.getElementById('fxTable').innerHTML= res.length?
    '<thead><tr><th class="nosort">Category</th><th class="nosort">Events measured</th><th class="nosort">Average effect</th></tr></thead><tbody>'+catRows.map(r=>'<tr><td>'+esc(r.c)+'</td><td>'+r.n+'</td>'+cell(r.avg)+'</tr>').join('')+'</tbody>'
    : '<tbody><tr><td class="note" style="text-align:left">No measurable events yet. Add sudden holidays, salary windows or security events to the Google Sheet.</td></tr></tbody>';
  document.getElementById('fxEvents').innerHTML= res.length?
    '<thead><tr><th class="nosort">Event</th><th class="nosort">Dates</th><th class="nosort">Category</th><th class="nosort">Effect</th></tr></thead><tbody>'+res.slice().sort((a,b)=>b.ev.s-a.ev.s).map(r=>'<tr><td style="text-align:left;white-space:normal;min-width:200px">'+esc(r.ev.title)+'</td><td>'+fmtD(r.ev.s)+(r.ev.e>r.ev.s?' – '+fmtDs(r.ev.e):'')+'</td><td style="text-align:left">'+esc(r.ev.cat)+'</td>'+(r.thin?'<td style="color:var(--muted)" title="Too little volume at the time to count">'+fmtPct(r.eff)+'</td>':cell(r.eff))+'</tr>').join('')+'</tbody>' : '';
}


/* ---------- competitor milestones ----------
   After = 4 weeks from the milestone vs the 4 weeks before, divided by the usual 4-week change
   (median over the half year before), so Saleem's own growth isn't read as a competitor effect. */
function competitorEffect(y, s){
  const sumR=(a,b)=>{ if(a<S.min||b>S.max) return null; let t=0; for(let n=a;n<=b;n++) t+=y[n-S.min]; return t; };
  const before=sumR(s-28,s-1), after=sumR(s,s+27); if(!before||after==null) return null;
  const usual=[]; for(let t=s-182;t<=s-28;t+=7){ const x=sumR(t-28,t-1), z=sumR(t,t+27); if(x&&z!=null) usual.push(z/x); }
  const u=usual.length>=8? median(usual) : null;
  return {eff: u? (after/before/u-1)*100 : null, raw:(after/before-1)*100, thin: before/28<10};
}
const safeUrl=u=>/^https?:\/\//i.test(u||'')? u : null;
function renderCompetitors(){
  const empty=document.getElementById('cmpEmpty'), t=document.getElementById('cmpTable'), sm=document.getElementById('cmpSummary');
  if(!COMPETITORS.length){ empty.hidden=false; t.innerHTML=''; sm.innerHTML=''; return; }
  empty.hidden=true;
  const y=series(S.min,S.max,st.measure,selCats(),selStats());
  const cell=(v,raw)=>{ if(v==null) return '<td>–</td>'; const a=Math.min(Math.abs(v),40)/40; const bg=v>=0?'rgba(12,163,12,'+(0.05+a*0.25)+')':'rgba(208,59,59,'+(0.05+a*0.25)+')'; return '<td class="heat" style="background:'+bg+'" title="Against the usual 4-week change. Plain 4-week change: '+fmtPct(raw)+'">'+fmtPct(v)+'</td>'; };
  const rows=COMPETITORS.slice().reverse().map(c=>({c,x:competitorEffect(y,c.s)}));
  t.innerHTML='<thead><tr><th class="nosort">Date</th><th class="nosort" style="text-align:left">Competitor</th><th class="nosort" style="text-align:left">Milestone</th><th class="nosort" style="text-align:left">Type</th><th class="nosort" style="text-align:left">Services</th><th class="nosort">After vs usual</th><th class="nosort" style="text-align:left">Source</th></tr></thead><tbody>'+
    rows.map(({c,x})=>{ const u=safeUrl(c.source);
      return '<tr><td>'+fmtD(c.s)+'</td><td dir="auto" style="text-align:left">'+esc(c.name)+'</td><td dir="auto" style="text-align:left;white-space:normal;min-width:170px">'+esc(c.milestone)+(c.notes?'<div class="note">'+esc(c.notes)+'</div>':'')+'</td><td style="text-align:left">'+esc(c.type)+'</td><td style="text-align:left;white-space:normal">'+esc(c.services)+(c.city?' · '+esc(c.city):'')+'</td>'+
        (x&&x.eff!=null&&!x.thin? cell(x.eff,x.raw) : '<td style="color:var(--muted)">'+(x&&x.thin?'too few orders':'–')+'</td>')+
        '<td style="text-align:left">'+(u?'<a href="'+esc(u)+'" target="_blank" rel="noopener">'+esc(c.status||'Source')+'</a>':esc(c.status||''))+'</td></tr>'; }).join('')+'</tbody>';
  const by={}; COMPETITORS.forEach(c=>{ const k=c.name; (by[k]||(by[k]={n:0,last:null,types:new Set()})); by[k].n++; by[k].last=c; by[k].types.add(c.type); });
  sm.innerHTML='<thead><tr><th class="nosort">Competitor</th><th class="nosort">Milestones</th><th class="nosort" style="text-align:left">Latest</th><th class="nosort" style="text-align:left">Kinds</th></tr></thead><tbody>'+
    Object.entries(by).sort((a,b)=>b[1].last.s-a[1].last.s).map(([k,v])=>'<tr><td dir="auto">'+esc(k)+'</td><td>'+v.n+'</td><td dir="auto" style="text-align:left;white-space:normal">'+fmtD(v.last.s)+' · '+esc(v.last.milestone)+'</td><td style="text-align:left">'+esc([...v.types].join(', '))+'</td></tr>').join('')+'</tbody>';
}
