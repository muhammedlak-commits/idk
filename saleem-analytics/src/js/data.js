/* ---------- data model ---------- */
let S = null;   // services model
function buildServices(csvText){
  const lines = csvText.trim().split(/\r?\n/);
  const hdr = splitCsv(lines[0]).map(normHdr);
  const ix = n => hdr.indexOf(n);
  const iDay=ix('day'), iCat=ix('service_category'), iSt=ix('visit_status'), iS=ix('services_delivered'), iO=ix('distinct_orders'), iP=ix('distinct_patients');
  // optional money columns (IQD): sales and company revenue
  const iMoney=[ix('sales_iqd'),ix('company_revenue_iqd')], hasRev=iMoney.every(i=>i>=0);
  // optional new-patient columns (latest export): new by first order, new by account created, in the cube's measure order
  const newCols=k=>['services','orders','patients','sales_iqd','revenue_iqd'].map(x=>ix('new_'+k+'_'+x));
  const iNewF=newCols('first'), iNewC=newCols('created'), hasNew=[0,1,2].every(m=>iNewF[m]>=0&&iNewC[m]>=0), hasRevNew=hasNew&&hasRev&&[3,4].every(m=>iNewF[m]>=0&&iNewC[m]>=0);
  if(iDay<0||iCat<0||iO<0) throw new Error('This CSV needs day, service_category and distinct_orders columns.');
  const M=5;   // measures: services, orders, patient-days, sales, company revenue
  const cats=new Map(), sts=new Map(), rows=[], raw=[];
  let min=Infinity, max=-Infinity;
  const g=(f,i)=>i>=0?num(f[i]):0;
  for(let k=1;k<lines.length;k++){
    const f=splitCsv(lines[k]); if(f.length<hdr.length-1) continue;
    const n=toN(f[iDay].slice(0,10)); if(!isFinite(n)) continue;
    raw.push([n,f]);
  }
  // a few visits carry mistyped dates decades back (1942, 1986…); start at the first day after which the data has no gap over 180 days
  const ds=[...new Set(raw.map(x=>x[0]))].sort((x,y)=>x-y); let start=ds[0];
  for(let i=ds.length-1;i>0;i--) if(ds[i]-ds[i-1]>180){ start=ds[i]; break; }
  const dropped=raw.filter(x=>x[0]<start);
  for(const [n,f] of raw){ if(n<start) continue;
    const c=f[iCat].trim(), st=iSt>=0?f[iSt].trim():'finished';
    if(!cats.has(c)) cats.set(c,cats.size); if(!sts.has(st)) sts.set(st,sts.size);
    const r=[n,cats.get(c),sts.get(st), g(f,iS), g(f,iO), g(f,iP), g(f,iMoney[0]), g(f,iMoney[1])];
    if(hasNew){ iNewF.forEach(i=>r.push(g(f,i))); iNewC.forEach(i=>r.push(g(f,i))); }
    rows.push(r);
    if(n<min)min=n; if(n>max)max=n;
  }
  if(!rows.length) throw new Error('No usable rows found. Check the file has day, service_category and distinct_orders columns.');
  const catList=[...cats.keys()], stList=[...sts.keys()];
  const N=max-min+1, C=catList.length, T=stList.length;
  // cube[m][ (d*C + c)*T + t ]
  const mk=()=>Array.from({length:M},()=>new Float64Array(N*C*T));
  const cube=mk();
  for(const r of rows){const o=((r[0]-min)*C+r[1])*T+r[2]; for(let m=0;m<M;m++) cube[m][o]+=r[3+m];}
  // new-patient cubes and returning = all - new, per basis, in the same measure layout
  let cubeNew=null, cubeRet=null;
  if(hasNew){
    cubeNew={first:mk(),created:mk()}; cubeRet={first:mk(),created:mk()};
    for(const r of rows){ const o=((r[0]-min)*C+r[1])*T+r[2]; for(let m=0;m<M;m++){ cubeNew.first[m][o]+=r[3+M+m]; cubeNew.created[m][o]+=r[3+2*M+m]; } }
    for(const k of ['first','created']) for(let m=0;m<M;m++){ const A_=cube[m], B_=cubeNew[k][m], R=cubeRet[k][m]; for(let i=0;i<A_.length;i++) R[i]= m>=3? A_[i]-B_[i] : Math.max(0,A_[i]-B_[i]); } }
  // colour order fixed by all-time non-cancelled orders, so a filter never repaints a service
  const tot=catList.map((c,ci)=>{let s=0; for(let d=0;d<N;d++) for(let t=0;t<T;t++) if(stList[t]!=='cancelled') s+=cube[1][(d*C+ci)*T+t]; return s;});
  const order=catList.map((c,i)=>i).sort((a,b)=>tot[b]-tot[a]);
  const colorOf={}; order.forEach((ci,rank)=>{colorOf[catList[ci]] = rank<8? 'var(--s'+(rank+1)+')' : 'var(--s-other)';});
  return {min,max,N,C,T,catList,stList,cube,cubeNew,cubeRet,hasNew,hasRev,hasRevNew,order,tot,colorOf,rowCount:rows.length,dropped:dropped.length?{n:dropped.length,from:Math.min(...dropped.map(x=>x[0])),to:Math.max(...dropped.map(x=>x[0]))}:null};
}
function splitCsv(line){
  if(line.indexOf('"')<0) return line.split(',');
  const out=[]; let cur='', q=false;
  for(let i=0;i<line.length;i++){const ch=line[i];
    if(q){ if(ch==='"'){ if(line[i+1]==='"'){cur+='"';i++} else q=false } else cur+=ch }
    else if(ch==='"') q=true; else if(ch===','){out.push(cur);cur=''} else cur+=ch;}
  out.push(cur); return out;
}
/* headers: ignore case, spaces and a byte-order mark; numbers: ignore thousands separators */
function normHdr(h){ return String(h).replace(/^\uFEFF/,'').trim().toLowerCase().replace(/\s+/g,'_'); }
function num(v){ const n=+String(v==null?'':v).replace(/[,\s]/g,''); return isFinite(n)?n:0; }
function parseCsvObjects(text){
  const lines=text.trim().split(/\r?\n/); const hdr=splitCsv(lines[0]).map(normHdr);
  return lines.slice(1).filter(l=>l.trim()).map(l=>{const f=splitCsv(l); const o={}; hdr.forEach((h,i)=>o[h]=(f[i]||'').trim()); return o;});
}

/* ---------- ads model ---------- */
let A = null;
/* Ads model. With the ad-level export, every ad is matched to a service on its own (ad_service_map.csv),
   so a campaign that mixes services is split correctly; without it, whole campaigns are matched by name. */
function buildAds(dailyText, monthlyText, mapText, adText, adMapText){
  const daily=parseCsvObjects(dailyText), monthly=parseCsvObjects(monthlyText), map=parseCsvObjects(mapText);
  const campGroup={}; map.forEach(r=>campGroup[r.campaign_id]=r.ad_group||'All services (general)');
  const objective={}; monthly.forEach(r=>objective[r.campaign_id]=r.objective);
  const dSpend=new Map(); daily.forEach(r=>dSpend.set(toN(r.day), num(r.spend_usd)));
  const mTot={}; for(const [n,v] of dSpend){const mk=monthKey(n); mTot[mk]=(mTot[mk]||0)+v;}
  const gm={}, camps={}, ads={};
  const addTo=(obj,g,mk,x)=>{ const gg=obj[g]||(obj[g]={}); const y=gg[mk]||(gg[mk]={spend:0,conv:0}); y.spend+=x.spend; y.conv+=x.conv; };
  const monthRow=r=>{ const isConv=/messaging_conversation_started/.test(r.result_type); const res=num(r.results);
    return {spend:num(r.spend_usd),impr:num(r.impressions),clicks:num(r.clicks),res,rtype:r.result_type,conv:isConv?res:0}; };
  const bump=(months,mk,x)=>{ const y=months[mk]||(months[mk]={spend:0,impr:0,clicks:0,res:0,conv:0,rtype:x.rtype}); y.spend+=x.spend; y.impr+=x.impr; y.clicks+=x.clicks; y.res+=x.res; y.conv+=x.conv; };
  const adRows= adText? parseCsvObjects(adText) : [];
  const level= adRows.length? 'ad' : 'campaign';
  if(level==='ad'){
    const adGroup={}, how={}; parseCsvObjects(adMapText||'').forEach(r=>{ adGroup[r.ad_id]=r.ad_group; how[r.ad_id]=r.matched_by; });
    adRows.forEach(r=>{
      const g=adGroup[r.ad_id]||campGroup[r.campaign_id]||'All services (general)', x=monthRow(r);
      const ad=ads[r.ad_id]||(ads[r.ad_id]={id:r.ad_id,name:r.ad_name,adset:r.adset_name,campaign:r.campaign_name,campaignId:r.campaign_id,objective:objective[r.campaign_id]||'',group:g,how:how[r.ad_id]||'campaign',months:{}});
      bump(ad.months,r.month,x);
      const c=camps[r.campaign_id]||(camps[r.campaign_id]={id:r.campaign_id,name:r.campaign_name,objective:objective[r.campaign_id]||'',months:{},groups:{}});
      bump(c.months,r.month,x); c.groups[g]=(c.groups[g]||0)+x.spend;
      addTo(gm,g,r.month,x);
    });
  } else {
    monthly.forEach(r=>{
      const g=campGroup[r.campaign_id]||'All services (general)', x=monthRow(r);
      const c=camps[r.campaign_id]||(camps[r.campaign_id]={id:r.campaign_id,name:r.campaign_name,objective:r.objective,months:{},groups:{}});
      bump(c.months,r.month,x); c.groups[g]=(c.groups[g]||0)+x.spend; addTo(gm,g,r.month,x);
    });
  }
  const groups=Object.keys(gm).sort((a,b)=>sumG(gm[b])-sumG(gm[a]));
  function sumG(o){return Object.values(o).reduce((s,x)=>s+x.spend,0)}
  // weight of each day inside its month, from daily account spend (falls back to even split)
  function w(n){const mk=monthKey(n), t=mTot[mk]; return t>0 ? (dSpend.get(n)||0)/t : 1/daysInMonth(mk);}
  // the units spend is matched at: ads, or whole campaigns when only the campaign export exists
  const units= level==='ad'? Object.values(ads) : Object.values(camps).map(c=>({...c,group:Object.keys(c.groups)[0]}));
  return {dSpend,mTot,camps,ads,units,gm,groups,w,level,
    minDay:Math.min(...dSpend.keys()), maxDay:Math.max(...dSpend.keys())};
}

/* ---------- holidays (Umm al-Qura Hijri calendar via Intl) ---------- */
let HIJ=null;
try{ HIJ=new Intl.DateTimeFormat('en-u-ca-islamic-umalqura',{day:'numeric',month:'numeric',timeZone:'UTC'}); }catch(e){}
const hijCache=new Map();
function hijri(n){ if(hijCache.has(n)) return hijCache.get(n); let r=null;
  if(HIJ){ try{ const p=HIJ.formatToParts(new Date(n*DAY+12*3600000)); r={m:+p.find(x=>x.type==='month').value,d:+p.find(x=>x.type==='day').value}; }catch(e){} }
  hijCache.set(n,r); return r; }
const HOLS=[
  {k:'ramadan',  name:'Ramadan',             long:true, t:h=>h&&h.m===9},
  {k:'fitr',     name:'Eid al-Fitr',         t:h=>h&&h.m===10&&h.d<=3},
  {k:'adha',     name:'Eid al-Adha',         t:h=>h&&h.m===12&&h.d>=9&&h.d<=13},
  {k:'ghadir',   name:'Eid al-Ghadir',       t:h=>h&&h.m===12&&h.d===18},
  {k:'hnewyear', name:'Islamic New Year',    t:h=>h&&h.m===1&&h.d===1},
  {k:'ashura',   name:'Ashura',              t:h=>h&&h.m===1&&h.d>=9&&h.d<=10},
  {k:'arbaeen',  name:'Arbaeen pilgrimage',  t:h=>h&&h.m===2&&h.d>=13&&h.d<=20},
  {k:'mawlid',   name:'Prophet’s Birthday', t:h=>h&&h.m===3&&(h.d===12||h.d===17)},
  {k:'fixed',    name:'Public holiday',      g:true, t:(h,n)=>!!FIXED[toS(n).slice(5)]}
];
const FIXED={'01-01':'New Year’s Day','01-06':'Army Day','03-21':'Nowruz','05-01':'Labour Day','07-14':'Republic Day','10-03':'National Day','12-10':'Victory Day','12-25':'Christmas'};
function holsOn(n){const h=hijri(n); const out=[]; for(const H of HOLS){ if(H.t(h,n)) out.push(H.k==='fixed'?FIXED[toS(n).slice(5)]:H.name); } return out;}
function holKeysOn(n){const h=hijri(n); return HOLS.filter(H=>H.t(h,n)).map(H=>H.k);}
function holidayWindows(from,to){ // contiguous windows per holiday type
  const res=[];
  for(const H of HOLS){ let s=null;
    for(let n=from;n<=to+1;n++){ const on = n<=to && H.t(hijri(n),n);
      if(on&&s===null) s=n; if(!on&&s!==null){ res.push({k:H.k,name:H.k==='fixed'?FIXED[toS(s).slice(5)]:H.name,s,e:n-1,long:!!H.long}); s=null; } } }
  return res.sort((a,b)=>a.s-b.s);
}

/* ---------- events ---------- */
let EVENTS=[];
/* events = the outside-factors sheet (live copy when available, else the copy built into the page)
   plus anything added in this browser. Official holidays come from the Hijri calendar instead. */
/* competitor milestones: the sheet's Competitors tab when read live, else the rows built into the page */
let COMPETITORS=[];
function loadCompetitors(){
  const rows= sheetState.cmpRows || (P.competitors? parseCsvObjects(P.competitors) : []);
  COMPETITORS=rows.map(r=>{ const s=sheetDate(r.date); if(s==null||!r.competitor||/^dropped$/i.test(r.status||'')) return null; const e=sheetDate(r.end);
    return {s,e:e!=null&&e>=s?e:s,name:r.competitor,milestone:r.milestone||'',type:r.type||'Other',services:r.services||'',city:r.city||'',status:r.status||'',source:r.source||'',notes:r.notes||''}; }).filter(Boolean).sort((a,b)=>a.s-b.s);
}
function loadEvents(){
  const rows= sheetState.rows || parseCsvObjects(P.events);
  const base=sheetEvents(rows).filter(e=>e.cat!=='Holiday (official)');
  let mine=[]; try{ mine=JSON.parse(lsGet('spl.events')||'[]'); }catch(e){}
  EVENTS=base.concat(mine.map(m=>({...m,own:true}))).sort((a,b)=>a.s-b.s);
}

