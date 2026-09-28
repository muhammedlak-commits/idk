/* ---------- state ---------- */
const PJ_DEFAULTS=()=>({pjF:new Set(['weekday','holidays','events','trend','yoy']),pjPop:60,pjCustom:5,pjHolYears:'2',pjPace:'damped'});
const st={from:0,to:0,measure:'ord',gran:'week',svc:new Set(),status:new Set(),trend:'total',ly:true,hol:true,evt:true,mom:'usual',adGroup:'',svcSort:{k:'cur',dir:-1},campSort:{k:'spend',dir:-1},evCat:'',upCat:'',mod:'summary',pjH:90,ordersMode:'merge',basis:'scheduled',loadBasis:'scheduled',adView:'ad',adQuery:'',newBasis:'first',adMode:'match',adGroups:new Set(),pvSort:{k:'cur',dir:-1},lkTab:'ad',bwSel:'',gwSort:{k:'n',dir:-1},pview:'all',cmp:true,whyCmp:'usual',align:'hijri',perfTab:'svc',drv:'patients',trendSpan:'12m',svcMore:false,ctxOpen:false,...PJ_DEFAULTS()};
const MI={svc:0,ord:1,pat:2,sales:3,rev:4}, MLABEL={ord:'Orders',svc:'Services delivered',pat:'Patient-days',sales:'Sales (IQD)',rev:'Company revenue (IQD)'};
const MONEY=new Set(['sales','rev']);
/* money measures need the sales columns, and for the New/Returning views the new-patient sales columns too */
function measureOK(m){ if(!MONEY.has(m)) return true; if(!S.hasRev) return false; return st.pview==='all'||S.hasRevNew; }
/* a value of the current (or given) measure: counts as whole numbers, money as compact IQD */
function fmtIQD(v){ const a=Math.abs(v||0), s=v<0?'−':''; return s+(a>=1e9?(a/1e9).toFixed(a>=1e10?1:2)+'B':a>=1e6?(a/1e6).toFixed(a>=1e8?0:1)+'M':a>=1e3?Math.round(a/1e3)+'K':Math.round(a))+' IQD'; }
function fmtVal(v,m){ return MONEY.has(m||st.measure)? fmtIQD(v) : fmtInt(v); }
function fmtPer(v,m){ return MONEY.has(m||st.measure)? fmtIQD(v) : v.toFixed(v<10?1:0); }
const moneyTicks=o=>{ if(MONEY.has(st.measure)) o.scales.y.ticks.callback=v=>fmtIQD(v).replace(' IQD',''); return o; };

/* sum of a measure over days [a,b] for the selected services/statuses; returns daily array when asked */
function series(a,b,m,cats,stats){
  const out=new Float64Array(b-a+1); const cube=cubeFor(MI[m]), C=S.C, T=S.T;
  const ci=cats.map(c=>S.catList.indexOf(c)).filter(i=>i>=0), ti=stats.map(s=>S.stList.indexOf(s)).filter(i=>i>=0);
  for(let n=Math.max(a,S.min);n<=Math.min(b,S.max);n++){ const d=n-S.min; let s=0;
    for(const c of ci){ const base=(d*C+c)*T; for(const t of ti) s+=cube[base+t]; } out[n-a]=s; }
  return out;
}
/* the patient view (All / New / Returning in the filter bar) picks the cube; New follows the New patient basis */
function cubeFor(mi){ if(st.pview==='all'||!S.hasNew) return S.cube[mi]; const k=st.newBasis==='created'?'created':'first'; return (st.pview==='new'?S.cubeNew:S.cubeRet)[k][mi]; }
const PVIEW_LABEL={all:'',new:'new patients',ret:'returning patients'};
const viewLabel=(pre=' · ')=> st.pview!=='all'&&S.hasNew? pre+PVIEW_LABEL[st.pview] : '';
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
/* which ads count as "ad spend" everywhere, from the Ad spend switch in the filter bar */
function spendGroups(){
  if(st.adMode==='all') return A.groups.slice();
  if(st.adMode==='pick') return A.groups.filter(g=>st.adGroups.has(g));
  return groupsForCats(selCats());
}
const AD_MODE_LABEL={match:'matching ads',all:'all ads',pick:'chosen ad groups'};
const adModeLabel=()=>AD_MODE_LABEL[st.adMode];
function groupsForCats(cats){
  const set=new Set(cats); const allSel = S.catList.every(c=>st.svc.has(c));
  if(allSel) return A.groups.slice();
  return A.groups.filter(g=>GROUP_SVCS[g] && GROUP_SVCS[g].some(c=>set.has(c)));
}

