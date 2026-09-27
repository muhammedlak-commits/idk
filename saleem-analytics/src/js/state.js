/* ---------- state ---------- */
const st={from:0,to:0,measure:'ord',gran:'week',svc:new Set(),status:new Set(),trend:'total',ly:true,hol:true,evt:true,mom:'val',adGroup:'',svcSort:{k:'cur',dir:-1},campSort:{k:'spend',dir:-1},evCat:'',upCat:'',mod:'overview',pjH:90,pjGrowth:'damped',pjCustom:5,pjHol:true};
const MI={svc:0,ord:1,pat:2}, MLABEL={ord:'Orders',svc:'Services delivered',pat:'Patient-days'};

/* sum of a measure over days [a,b] for the selected services/statuses; returns daily array when asked */
function series(a,b,m,cats,stats){
  const out=new Float64Array(b-a+1); const cube=S.cube[MI[m]], C=S.C, T=S.T;
  const ci=cats.map(c=>S.catList.indexOf(c)).filter(i=>i>=0), ti=stats.map(s=>S.stList.indexOf(s)).filter(i=>i>=0);
  for(let n=Math.max(a,S.min);n<=Math.min(b,S.max);n++){ const d=n-S.min; let s=0;
    for(const c of ci){ const base=(d*C+c)*T; for(const t of ti) s+=cube[base+t]; } out[n-a]=s; }
  return out;
}
const sum = arr => { let s=0; for(const v of arr) s+=v; return s; };
function total(a,b,m,cats,stats){ return sum(series(a,b,m,cats,stats)); }
function covered(a,b){ return a>=S.min && b<=S.max; }
const selCats = () => S.catList.filter(c=>st.svc.has(c));
const selStats = () => S.stList.filter(s=>st.status.has(s));

/* ad spend per day for a set of groups */
function adDaily(a,b,groups,field){
  const out=new Float64Array(b-a+1);
  for(let n=a;n<=b;n++){ const mk=monthKey(n), w=A.w(n); let s=0;
    for(const g of groups){ const x=A.gm[g]&&A.gm[g][mk]; if(x) s+=x[field||'spend']*w; } out[n-a]=s; }
  return out;
}
function groupsForCats(cats){
  const set=new Set(cats); const allSel = S.catList.every(c=>st.svc.has(c));
  if(allSel) return A.groups.slice();
  return A.groups.filter(g=>GROUP_SVCS[g] && GROUP_SVCS[g].some(c=>set.has(c)));
}

