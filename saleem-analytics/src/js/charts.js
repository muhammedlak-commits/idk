/* ---------- bucketing ---------- */
function buckets(a,b,g){
  const keys=[], idx=new Map();
  for(let n=a;n<=b;n++){ const k= g==='day'?n : g==='week'?weekStart(n) : monthStart(n);
    if(!idx.has(k)){ idx.set(k,keys.length); keys.push({k,days:0}); } keys[idx.get(k)].days++; }
  return {keys, at:n=>idx.get(g==='day'?n : g==='week'?weekStart(n) : monthStart(n))};
}
function bucketLabel(k,g){ return g==='month'? fmtM(monthKey(k)) : fmtDs(k)+(g==='week'?'':''); }
function aggregate(arr,a,B){ const out=new Float64Array(B.keys.length); for(let i=0;i<arr.length;i++) out[B.at(a+i)]+=arr[i]; return out; }

/* ---------- chart plumbing ---------- */
let trendChart=null, spendChart=null, adChart=null;
function baseOpts(){
  const tick=css('--muted'), grid=css('--grid');
  return {responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},
    plugins:{legend:{display:false},tooltip:{backgroundColor:css('--surface'),titleColor:css('--ink'),bodyColor:css('--ink-2'),footerColor:css('--muted'),borderColor:css('--axis'),borderWidth:1,padding:10,boxPadding:4,usePointStyle:true,footerFont:{weight:'normal',size:11}}},
    scales:{x:{grid:{display:false},border:{color:css('--axis')},ticks:{color:tick,maxRotation:0,autoSkip:true,autoSkipPadding:18,font:{size:11}}},
            y:{beginAtZero:true,grid:{color:grid},border:{display:false},ticks:{color:tick,font:{size:11},callback:v=>Number(v).toLocaleString('en-US')}}}};
}
/* shaded holiday bands + event ticks, drawn behind the data */
const bandPlugin={id:'bands',beforeDatasetsDraw(chart,args,opts){
  const bands=opts.bands||[]; if(!bands.length) return;
  const {ctx,chartArea:ca,scales:{x}}=chart; ctx.save();
  for(const b of bands){
    const x0=x.getPixelForValue(b.i0)-(b.half||0), x1=x.getPixelForValue(b.i1)+(b.half||0);
    if(b.type==='event'){ ctx.strokeStyle=opts.evtColor; ctx.lineWidth=1; ctx.beginPath(); const xm=(x0+x1)/2; ctx.moveTo(xm,ca.top); ctx.lineTo(xm,ca.bottom); ctx.stroke();
      ctx.fillStyle=opts.evtColor; ctx.beginPath(); ctx.arc(xm,ca.top+4,3.5,0,Math.PI*2); ctx.fill(); }
    else { ctx.fillStyle=b.type==='ramadan'?opts.ramColor:opts.holColor; ctx.fillRect(Math.max(ca.left,x0),ca.top,Math.min(ca.right,x1)-Math.max(ca.left,x0),ca.bottom-ca.top); }
  }
  ctx.restore();
}};
Chart.register(bandPlugin);

function bandsFor(a,b,B,g){
  const out=[]; const half = g==='day'? 0.5 : 0.5;
  const px=(i)=>i; // category index
  if(st.hol){ for(const w of holidayWindows(a,b)){ if(w.k==='fixed'&&g!=='day') continue;
      out.push({type:w.k==='ramadan'?'ramadan':'hol',i0:B.at(w.s),i1:B.at(w.e),half:0}); } }
  if(st.evt){ for(const e of EVENTS){ if(e.s<a||e.s>b) continue; out.push({type:'event',i0:B.at(e.s),i1:B.at(e.s)}); } }
  return out;
}
function hoverNotes(B,a,b,g){
  // per bucket: holidays and events inside it
  return B.keys.map(({k,days})=>{
    const end = g==='day'?k : g==='week'?k+6 : k+daysInMonth(monthKey(k))-1;
    const lo=Math.max(k,a), hi=Math.min(end,b), hol=new Set(), ev=[];
    for(let n=lo;n<=hi;n++) holsOn(n).forEach(h=>hol.add(h));
    EVENTS.forEach(e=>{ if(e.s>=lo&&e.s<=hi) ev.push(e.title); });
    return {hol:[...hol], ev};
  });
}

