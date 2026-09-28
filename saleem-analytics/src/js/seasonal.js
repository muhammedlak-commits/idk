/* ---------- last year, and the usual move ----------
   "Last year" lines up either by Hijri date (default: Ramadan against Ramadan, Arbaeen against
   Arbaeen; the Hijri year is 354 or 355 days, so weekdays shift) or by the same weekdays (364 days).
   The usual move asks whether this period moved against the one before it the way the same pair of
   periods moved in earlier years. Both years are first divided by their calendar index (weekday
   shares × each holiday's measured effect, as in What changed), so a holiday or weekday mix that
   differs between the years doesn't count as a real change. With two earlier years the moves are
   averaged (geometric mean). A year under a quarter of this year's size is left out: early growth isn't a season. */
const ALIGN_LABEL={hijri:'same Hijri dates',greg:'same weekdays'};
const hijBackCache=new Map();
/* days back to the same Hijri day and month one Hijri year earlier (354 or 355 days) */
function hijriBack(n){
  if(hijBackCache.has(n)) return hijBackCache.get(n);
  const h=hijri(n); let k=354;
  if(h){ let hit=null;
    for(const d of [h.d, h.d-1]){ for(let j=352;j<=357;j++){ const g=hijri(n-j); if(g&&g.m===h.m&&g.d===d){ hit=j; break; } } if(hit!=null) break; }   // day 30 may not exist a year earlier
    if(hit!=null) k=hit; }
  hijBackCache.set(n,k); return k;
}
/* how far back "k years ago" is for a period starting on day a */
function yearShift(a,k=1){ if(st.align!=='hijri') return 364*k; let s=0; for(let i=0;i<k;i++) s+=hijriBack(a-s); return s; }
const lyShift=a=>yearShift(a,1);

/* weekday shares and holiday effects for the current selection, cached until the filters change */
let calCache={key:'',M:null};
function calModel(cats,stats,m){
  const key=[st.basis,st.pview,st.newBasis,m,cats.join('|'),stats.join('|'),S.min,S.max,S.rowCount].join('#');
  if(calCache.key===key) return calCache.M;
  const y=series(S.min,S.max,m,cats,stats), hol={};
  holidayEffects(cats,stats,m).forEach(r=>{ hol[r.key]=r.avg; });
  const M={wd:whyWeekday(y,S.max),hol,idx:new Map()};
  calCache={key,M}; return M;
}
/* calendar index of a period: the number of "average days" its weekdays and holidays are worth */
function calIdx(M,a,b){ let e=0; for(let n=a;n<=b;n++){ let v=M.idx.get(n); if(v==null){ v=M.wd[dow(n)]*whyHolMult(n,M.hol).m; M.idx.set(n,v); } e+=v; } return e; }

/* this period [a,b] against the one before it [pa,pb], and the same pair in earlier years.
   Returns raw and calendar-adjusted moves, the usual move, and the gap (null when there's no earlier year). */
function usualMove(a,b,pa,pb,cats,stats,m,tot){
  const M=calModel(S.catList.filter(c=>st.svc.has(c)),stats,m);   // one calendar for the whole selection, so service rows stay quick
  const T=tot||((x,y)=>total(x,y,m,cats,stats));
  const t1=T(a,b), t0=T(pa,pb);
  if(!(t0>0)) return null;
  const adj=(x,y,v)=>v/Math.max(1e-9,calIdx(M,x,y));
  const now=t1/t0-1, nowAdj=adj(a,b,t1)/adj(pa,pb,t0)-1;
  const past=[];
  for(const k of [1,2]){ const s=yearShift(a,k), sp=yearShift(pa,k);
    if(!covered(pa-sp,b-s)) continue;
    const u1=T(a-s,b-s), u0=T(pa-sp,pb-sp); if(!(u0>0)||!(u1>=0)) continue;
    // skip years too small to set a norm: under a quarter of this year's size (Saleem's start-up months grew by
    // leaps that say nothing about seasons), or under 5 a day
    if(u0<0.25*t0||(!MONEY.has(m)&&u0/(pb-pa+1)<5)) continue;
    past.push({k,raw:u1/u0-1,adj:adj(a-s,b-s,u1)/adj(pa-sp,pb-sp,u0)-1,from:a-s,to:b-s}); }
  if(!past.length) return {now,nowAdj,usual:null,gap:null,past};
  const usual=Math.exp(past.reduce((s,p)=>s+Math.log1p(p.adj),0)/past.length)-1;
  return {now,nowAdj,usual,gap:nowAdj-usual,past};   // gap in points of growth
}
/* the two moves behind a gap, as percentages: this year's (after weekdays and holidays) and the usual one */
const usualWho=U=>U.past.length>1?'past 2 yrs':'last year';
function usualPair(U,sep){ return fmtPct(U.nowAdj*100,1)+(sep||' vs ')+fmtPct(U.usual*100,1)+' '+usualWho(U); }
/* a chip for the gap: this period's adjusted growth minus the usual growth, in points */
function usualChip(U,label){
  if(!U||U.gap==null) return '<span class="delta flat" title="Needs the same periods a year earlier">'+label+' –</span>';
  const p=U.gap*100, cls=Math.abs(p)<1?'flat':p>0?'up':'down', arrow=p>0?'▲':p<0?'▼':'';
  const tip='This period vs the one before: '+fmtPct(U.now*100,1)+' ('+fmtPct(U.nowAdj*100,1)+' after weekdays and holidays). The same move '+(U.past.length>1?'in the last two years':'last year')+': '+U.past.map(x=>fmtPct(x.raw*100,1)+' ('+fmtPct(x.adj*100,1)+' adjusted)').join(', ')+'. Last year lined up by '+ALIGN_LABEL[st.align]+'.';
  return '<span class="delta '+cls+'" title="'+esc(tip)+'">'+arrow+' '+(p>0?'+':'')+p.toFixed(1)+' pts '+label+'</span>';
}
