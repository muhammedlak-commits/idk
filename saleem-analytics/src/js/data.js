/* ---------- data model ---------- */
let S = null;   // services model
function buildServices(csvText){
  const lines = csvText.trim().split(/\r?\n/);
  const hdr = splitCsv(lines[0]).map(normHdr);
  const ix = n => hdr.indexOf(n);
  const iDay=ix('day'), iCat=ix('service_category'), iSt=ix('visit_status'), iS=ix('services_delivered'), iO=ix('distinct_orders'), iP=ix('distinct_patients');
  if(iDay<0||iCat<0||iO<0) throw new Error('This CSV needs day, service_category and distinct_orders columns.');
  const cats=new Map(), sts=new Map(), rows=[];
  let min=Infinity, max=-Infinity;
  for(let k=1;k<lines.length;k++){
    const f=splitCsv(lines[k]); if(f.length<hdr.length-1) continue;
    const n=toN(f[iDay].slice(0,10)); if(!isFinite(n)) continue;
    const c=f[iCat].trim(), st=iSt>=0?f[iSt].trim():'finished';
    if(!cats.has(c)) cats.set(c,cats.size); if(!sts.has(st)) sts.set(st,sts.size);
    rows.push([n,cats.get(c),sts.get(st), num(f[iS]), num(f[iO]), iP>=0?num(f[iP]):0]);
    if(n<min)min=n; if(n>max)max=n;
  }
  const catList=[...cats.keys()], stList=[...sts.keys()];
  const N=max-min+1, C=catList.length, T=stList.length;
  // cube[m][ (d*C + c)*T + t ]
  const cube=[new Float64Array(N*C*T),new Float64Array(N*C*T),new Float64Array(N*C*T)];
  for(const r of rows){const o=((r[0]-min)*C+r[1])*T+r[2]; cube[0][o]+=r[3]; cube[1][o]+=r[4]; cube[2][o]+=r[5];}
  // colour order fixed by all-time non-cancelled orders, so a filter never repaints a service
  const tot=catList.map((c,ci)=>{let s=0; for(let d=0;d<N;d++) for(let t=0;t<T;t++) if(stList[t]!=='cancelled') s+=cube[1][(d*C+ci)*T+t]; return s;});
  const order=catList.map((c,i)=>i).sort((a,b)=>tot[b]-tot[a]);
  const colorOf={}; order.forEach((ci,rank)=>{colorOf[catList[ci]] = rank<8? 'var(--s'+(rank+1)+')' : 'var(--s-other)';});
  return {min,max,N,C,T,catList,stList,cube,order,tot,colorOf,rowCount:rows.length};
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
function buildAds(dailyText, monthlyText, mapText){
  const daily=parseCsvObjects(dailyText), monthly=parseCsvObjects(monthlyText), map=parseCsvObjects(mapText);
  const groupOf={}; map.forEach(r=>groupOf[r.campaign_id]=r.ad_group||'All services (general)');
  const dSpend=new Map(); daily.forEach(r=>dSpend.set(toN(r.day), +r.spend_usd||0));
  const mTot={}; for(const [n,v] of dSpend){const mk=monthKey(n); mTot[mk]=(mTot[mk]||0)+v;}
  const camps={}; const gm={};  // gm[group][month] = {spend, conv}
  monthly.forEach(r=>{
    const g=groupOf[r.campaign_id]||'All services (general)';
    const c=camps[r.campaign_id] || (camps[r.campaign_id]={id:r.campaign_id,name:r.campaign_name,objective:r.objective,group:g,months:{}});
    const isConv=/messaging_conversation_started/.test(r.result_type);
    c.months[r.month]={spend:+r.spend_usd||0,impr:+r.impressions||0,clicks:+r.clicks||0,link:+r.link_clicks||0,res:+r.results||0,rtype:r.result_type,conv:isConv?(+r.results||0):0};
    const gg=gm[g]||(gm[g]={}); const x=gg[r.month]||(gg[r.month]={spend:0,conv:0});
    x.spend+=+r.spend_usd||0; if(isConv) x.conv+=+r.results||0;
  });
  const groups=Object.keys(gm).sort((a,b)=>sumG(gm[b])-sumG(gm[a]));
  function sumG(o){return Object.values(o).reduce((s,x)=>s+x.spend,0)}
  // weight of each day inside its month, from daily account spend (falls back to even split)
  function w(n){const mk=monthKey(n), t=mTot[mk]; return t>0 ? (dSpend.get(n)||0)/t : 1/daysInMonth(mk);}
  return {dSpend,mTot,camps,gm,groups,w,
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
function loadEvents(){
  const base=parseCsvObjects(P.events).map(r=>({s:toN(r.start),e:r.end?toN(r.end):toN(r.start),cat:r.category,title:r.title,note:r.note,own:false}));
  let mine=[]; try{ mine=JSON.parse(lsGet('spl.events')||'[]'); }catch(e){}
  EVENTS=base.concat(mine.map(m=>({...m,own:true}))).sort((a,b)=>a.s-b.s);
}

