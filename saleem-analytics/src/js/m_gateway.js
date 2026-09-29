/* ---------- gateway providers and retention (optional gateway export) ----------
   One row per basis, cohort month, first service and gateway provider, from sql/gateway_provider_monthly.sql.
   The gateway is the provider on a new patient's first-ever real visit. Return rate = returned_Nd / eligible_Nd,
   and eligible only counts patients whose N days have passed, so an unfinished window never drags a rate down.
   Follows the top filter: services (as database service types, via UP_CAT), the date range (cohort months)
   and New patient means (basis). Visit status and measure don't apply: these are patients, from real visits.
   "vs typical" compares a provider's 90-day rate with the median provider of the same first service
   (robustBench: funnel-style z with an overdispersion correction), or with the other named providers
   pooled (two-proportion z-test) when fewer than 3 are tested. Many providers are tested at once, so "strong" uses a Bonferroni bar
   (5% across every provider tested); "possible" is the 5% bar for one test. */
let GW=null, gwMonth=null, gwRet=null, gwSel='';
const GW_NONE='No named provider', GW_F=['n','e30','r30','e90','r90','e180','r180','o90','x90','s90'];
const GW_COL={n:'new_patients',e30:'eligible_30d',r30:'returned_30d',e90:'eligible_90d',r90:'returned_90d',e180:'eligible_180d',r180:'returned_180d',o90:'orders_90d',x90:'other_service_90d',s90:'same_provider_90d'};
const GW_PAL=['--s2','--s3','--s4','--s5','--s6','--s7','--s8'];   // --s1 is the accent, kept for the overall line
function buildGateway(text){
  if(!text||!text.trim()) return null;
  const hdr=splitCsv(text.trim().split(/\r?\n/)[0]).map(normHdr);
  const need=['cohort_month','first_service','gateway_provider_name','new_patients','eligible_30d','returned_30d','eligible_90d','returned_90d','eligible_180d','returned_180d'].filter(c=>!hdr.includes(c));
  if(need.length) throw new Error('The gateway export is missing the column'+(need.length>1?'s ':' ')+need.join(', ')+'. Run the query from Copy SQL again and download all of its columns.');
  const has={o90:hdr.includes('orders_90d'),x90:hdr.includes('other_service_90d'),s90:hdr.includes('same_provider_90d')};
  const rows=[], span={}, cats=new Set(); let hasSpec=false;
  for(const o of parseCsvObjects(text)){
    const m=(o.cohort_month||'').match(/(\d{4})-(\d{2})/), cat=o.first_service; if(!m||!cat) continue;
    const mk=m[1]+'-'+m[2], basis=(o.basis||'').toLowerCase()==='created'?'created':'first', name=o.gateway_provider_name||GW_NONE;
    const r={basis,mk,cat,pid:o.gateway_provider_id||'',name,none:name===GW_NONE,spec:prettySpec(o.specialty||'')};
    GW_F.forEach(k=>r[k]= k in has&&!has[k]? 0 : num(o[GW_COL[k]]));
    if(r.spec) hasSpec=true; cats.add(cat); rows.push(r);
    const s=span[basis]||(span[basis]={min:mk,max:mk}); if(mk<s.min) s.min=mk; if(mk>s.max) s.max=mk;
  }
  if(!rows.length) return null;
  return {rows,span,has,hasSpec,hasCreated:!!span.created,cats:[...cats]};
}
/* top-filter services -> the database service types the export uses; null = every service */
function gwCats(){ return S.catList.every(c=>st.svc.has(c))? null : new Set(selCats().map(c=>UP_CAT[c]||c)); }
const gwRate=(r,e,min=10)=> e>=min? r/e : null;
/* pure: filter by basis, cohort months [fromMk,toMk] and first services, then aggregate and test */
function gwCompute(M,{basis,fromMk,toMk,cats}){
  const Z=x=>{ const o={m:new Map(),...x}; GW_F.forEach(k=>o[k]=0); return o; };
  const add=(a,r)=>{ for(const k of GW_F) a[k]+=r[k]; return a; };
  const get=(map,k,x)=>{ let o=map.get(k); if(!o){ o=Z(x); map.set(k,o); } return o; };
  const both=(a,r)=>{ add(a,r); add(get(a.m,r.mk),r); return a; };      // total and per-month
  const all=Z(), rows=new Map(), cat=new Map(), named=new Map(), prov=new Map();
  for(const r of M.rows){ if(r.basis!==basis||r.mk<fromMk||r.mk>toMk||(cats&&!cats.has(r.cat))) continue;
    const pk=r.none?'':(r.pid||r.name);
    both(all,r); add(get(cat,r.cat,{cat:r.cat}),r);
    const row=both(get(rows,r.cat+'|'+pk,{key:r.cat+'|'+pk,cat:r.cat,pk,name:r.name,none:r.none,spec:''}),r); if(r.spec&&!row.spec) row.spec=r.spec;
    both(get(prov,pk,{pk,name:r.name,none:r.none}),r);
    if(!r.none) both(get(named,r.cat,{cat:r.cat}),r);
  }
  const sp=M.span[basis], months=[];
  if(sp) for(let mk=fromMk<sp.min?sp.min:fromMk; mk<=toMk&&mk<=sp.max; mk=addMonths(mk,1)) months.push(mk);
  const has=M.has, R=[...rows.values()];
  R.forEach(x=>{ const c=cat.get(x.cat);
    Object.assign(x,{share:c.n?x.n/c.n:null,R30:gwRate(x.r30,x.e30),R90:gwRate(x.r90,x.e90),R180:gwRate(x.r180,x.e180),
      opp:has.o90?gwRate(x.o90,x.e90):null,oth:has.x90?gwRate(x.x90,x.e90):null,same:has.s90&&!x.none?gwRate(x.s90,x.e90):null,
      pe:null,pr:null,diff:null,z:null,tested:false,verdict:''});
    if(x.none) return;
    const p=named.get(x.cat), pe=p.e90-x.e90, pr=p.r90-x.r90; x.pe=pe; x.pr=pr;
    if(x.e90>=10&&pe>=10) x.diff=(x.r90/x.e90-pr/pe)*100;
    if(x.e90>=20&&pe>=20){ const q=(x.r90+pr)/(x.e90+pe), se=Math.sqrt(q*(1-q)*(1/x.e90+1/pe));
      if(se>0){ x.z=(x.r90/x.e90-pr/pe)/se; x.tested=true; } } });
  // with 3+ tested providers in a first service, compare with the median provider instead (robust to one dominant provider)
  const byCat=new Map(); R.forEach(x=>{ if(!x.none&&x.e90>=20) (byCat.get(x.cat)||byCat.set(x.cat,[]).get(x.cat)).push(x); });
  for(const L of byCat.values()){ const rb=robustBench(L.map(x=>({r:x.r90/x.e90,n:x.e90}))); if(!rb) continue;
    L.forEach((x,i)=>{ x.bench=rb.benches[i]; x.benchN=L.length-1; x.diff=(x.r90/x.e90-x.bench)*100; x.z=rb.z[i]; x.tested=x.z!=null; });
    // smaller named providers in the same service: show the gap to the median, untested
    R.forEach(x=>{ if(!x.none&&x.cat===L[0].cat&&x.bench==null&&x.e90>=10){ x.bench=rb.bench; x.benchN=L.length; x.diff=(x.r90/x.e90-rb.bench)*100; x.z=null; x.tested=false; } }); }
  const m=R.filter(x=>x.tested).length, zStrong=m? zTwoSided(0.05/m) : null;
  R.forEach(x=>{ if(x.tested) x.verdict= Math.abs(x.z)>zStrong? 'strong' : Math.abs(x.z)>1.96? 'possible' : ''; });
  R.sort((x,y)=>y.n-x.n);
  const P_=[...prov.values()].filter(p=>!p.none&&p.n>0).sort((x,y)=>y.n-x.n);
  const colorIx=new Map(P_.slice(0,GW_PAL.length).map((p,i)=>[p.pk,i]));
  // KPIs
  const top=P_[0]||null, ranked=R.filter(x=>!x.none&&x.e90>=20).sort((x,y)=>y.r90/y.e90-x.r90/x.e90);
  const gap=ranked.length>=2? {best:ranked[0],worst:ranked[ranked.length-1],pts:(ranked[0].r90/ranked[0].e90-ranked[ranked.length-1].r90/ranked[ranked.length-1].e90)*100} : null;
  const kpi={n:all.n,e90:all.e90,R90:gwRate(all.r90,all.e90,1),top:top&&{name:top.name,pk:top.pk,n:top.n,share:all.n?top.n/all.n:null},gap};
  // new patients per month: the 6 named providers with most new patients, the rest in Others
  const at=(o,mk,k)=>{ const x=o&&o.m.get(mk); return x?x[k]:0; };
  const top6=P_.slice(0,6);
  const month={series:top6.map(p=>({pk:p.pk,name:p.name,ci:colorIx.get(p.pk),data:months.map(mk=>at(p,mk,'n'))})),
    others:months.map(mk=>at(all,mk,'n')-top6.reduce((s,p)=>s+at(p,mk,'n'),0)),none:months.map(mk=>at(prov.get(''),mk,'n')),total:months.map(mk=>at(all,mk,'n'))};
  // 90-day return by cohort month: overall and the 4 named providers with most eligible patients
  const rateAt=(o,mk)=>gwRate(at(o,mk,'r90'),at(o,mk,'e90'));
  const top4=P_.filter(p=>p.e90>0).sort((x,y)=>y.e90-x.e90).slice(0,4);
  const ret={overall:months.map(mk=>rateAt(all,mk)),series:top4.map(p=>({pk:p.pk,name:p.name,ci:colorIx.has(p.pk)?colorIx.get(p.pk):null,data:months.map(mk=>rateAt(p,mk)),e:months.map(mk=>at(p,mk,'e90'))})),e:months.map(mk=>at(all,mk,'e90'))};
  const C=[...cat.values()].sort((x,y)=>y.n-x.n).map(c=>({cat:c.cat,n:c.n,e30:c.e30,e90:c.e90,e180:c.e180,R30:gwRate(c.r30,c.e30),R90:gwRate(c.r90,c.e90),R180:gwRate(c.r180,c.e180),opp:has.o90?gwRate(c.o90,c.e90):null}));
  // the run of latest months whose window hasn't finished for anyone yet
  const pend=k=>{ let f=null; for(let i=months.length-1;i>=0;i--){ const mk=months[i]; if(!at(all,mk,'n')) continue; if(at(all,mk,k)) break; f=mk; } return f; };
  return {basis,months,all,rows:R,cats:C,provs:P_,named,colorIx,m,zStrong,kpi,month,ret,pend90:pend('e90'),pend180:pend('e180')};
}
/* pure: one table row month by month against the other named providers of its first service */
function gwRowSeries(res,key){
  const x=res.rows.find(r=>r.key===key); if(!x) return null;
  const p=res.named.get(x.cat), g=(o,mk,k)=>{ const v=o&&o.m.get(mk); return v?v[k]:0; };
  return {row:x,own:res.months.map(mk=>gwRate(g(x,mk,'r90'),g(x,mk,'e90'))),
    peers:x.none? null : res.months.map(mk=>gwRate(g(p,mk,'r90')-g(x,mk,'r90'),g(p,mk,'e90')-g(x,mk,'e90')))};
}

function renderGateway(){
  const empty=document.getElementById('gwEmpty'), body=document.getElementById('gwBody'), desc=document.getElementById('gwDesc');
  if(!GW){ empty.hidden=false; body.hidden=true; desc.textContent=''; if(gwMonth){gwMonth.destroy();gwMonth=null;} if(gwRet){gwRet.destroy();gwRet=null;} return; }
  empty.hidden=true; body.hidden=false;
  const fallback=st.newBasis==='created'&&!GW.hasCreated, basis=st.newBasis==='created'&&!fallback?'created':'first';
  const fromMk=monthKey(st.from), toMk=monthKey(st.to), cats=gwCats(), R=gwCompute(GW,{basis,fromMk,toMk,cats});
  const svcName=c=>UP_LABEL[c]||label(c), pct=(v,d=0)=>v==null?'–':(v*100).toFixed(d)+'%', pts=v=>v==null?'–':(v>0?'+':'')+v.toFixed(1)+' pts';
  const colOf=ci=>css(ci!=null&&ci<GW_PAL.length?GW_PAL[ci]:'--s-other');
  const span=R.months.length? fmtM(R.months[0])+' – '+fmtM(R.months[R.months.length-1]) : fmtM(fromMk)+' – '+fmtM(toMk);
  desc.textContent=(cats?[...cats].map(svcName).join(', '):'All services')+' · cohorts '+span+' · new by '+(basis==='created'?'the month their record was created':'the month of their first visit')+
    (fallback?'. This export has no account-created rows, so cohorts use the first visit.':'');
  // KPIs
  const K=R.kpi, tiles=[
    {lab:'New patients',val:fmtInt(K.n),sub:(basis==='created'?'Records created ':'First visit ')+span},
    {lab:'Back within 90 days',val:pct(K.R90,1),sub:K.e90?'Of '+fmtInt(K.e90)+' whose 90 days have passed':'No one’s 90 days have passed yet'},
    {lab:'Started with the top gateway',val:K.top?pct(K.top.share,1):'–',sub:K.top?K.top.name+' · '+fmtInt(K.top.n)+' new patients':'No named provider in the range'},
    {lab:'Best vs worst provider, 90 days',val:K.gap?K.gap.pts.toFixed(0)+' pts':'–',sub:K.gap?[K.gap.best,K.gap.worst].map(x=>x.name+(K.gap.best.cat!==K.gap.worst.cat?' ('+svcName(x.cat)+')':'')+' '+pct(x.r90/x.e90)).join(' · '):'Needs 2 providers with 20+ patients past 90 days'}];
  document.getElementById('gwKpis').innerHTML=tiles.map(t=>'<div class="kpi"><span class="lab">'+t.lab+'</span><span class="val">'+t.val+'</span><span class="sub">'+esc(t.sub)+'</span></div>').join('');
  // provider x first service table
  const so=st.gwSort||(st.gwSort={k:'n',dir:-1}), txt=k=>k==='name'||k==='cat'||k==='spec';
  const val=x=>so.k==='name'?x.name.toLowerCase():so.k==='cat'?svcName(x.cat):so.k==='spec'?(x.spec||'~'):so.k==='vs'?x.diff:x[so.k];
  const rows=R.rows.slice().sort((x,y)=>{ const u=val(x), w=val(y); if(u==null) return w==null?0:1; if(w==null) return -1; return (u<w?-1:u>w?1:0)*so.dir; });
  const showSpec=GW.hasSpec&&R.rows.some(x=>x.spec);
  const cols=[['name','Provider'],['cat','First service']].concat(showSpec?[['spec','Specialty']]:[]).concat([['n','New patients','New patients whose first visit was with this provider'],['share','Share of service','Share of that first service’s new patients'],
    ['R30','Back in 30 days','Came back for another order within 30 days of the first visit'],['R90','Back in 90 days','Came back for another order within 90 days'],['R180','Back in 180 days','Came back for another order within 180 days'],
    ['vs','90 days vs typical','90-day return minus the median provider’s with the same first service (the other named providers together when fewer than 3 are tested), in percentage points'],['opp','Orders each, 90 days','Further orders per patient within 90 days'],
    ['oth','Other service, 90 days','Had a different service within 90 days'],['same','Same provider, 90 days','Saw the same provider again in another order within 90 days']]);
  const vt={strong:(u)=>'<span class="delta '+(u?'up':'down')+'">✓ '+(u?'Above':'Below')+' typical</span>',possible:(u)=>'<span class="delta flat">~ '+(u?'Above':'Below')+' typical</span>'};
  const rc=(r,e,d)=>'<td title="'+fmtInt(r)+' of '+fmtInt(e)+' whose '+d+' days have passed">'+(e>=10?pct(r/e):'–')+'</td>';
  const vc=x=>{ if(x.diff==null) return '<td title="'+(x.none?'Not a provider, so not compared':'Needs 10+ patients past 90 days here and among the peers')+'">–</td>';
    const t=pct(x.r90/x.e90,1)+' of '+fmtInt(x.e90)+' vs '+(x.bench!=null? pct(x.bench,1)+', the median of '+x.benchN+' other '+svcName(x.cat).toLowerCase()+' providers' : pct(x.pr/x.pe,1)+' of '+fmtInt(x.pe)+' for the other '+svcName(x.cat).toLowerCase()+' providers together')+(x.tested?'; z = '+x.z.toFixed(2)+' (strong needs '+R.zStrong.toFixed(2)+' with '+R.m+' tested)':'; not tested (needs 20+ patients past 90 days and enough returns to judge)');
    return '<td title="'+esc(t)+'">'+pts(x.diff)+(x.verdict?' '+vt[x.verdict](x.diff>0):'')+'</td>'; };
  const t=document.getElementById('gwTable');
  if(gwSel&&!R.rows.some(x=>x.key===gwSel)) gwSel='';
  t.innerHTML='<thead><tr>'+cols.map(([k,l,tt])=>'<th data-k="'+k+'"'+(txt(k)?' style="text-align:left"':'')+(tt?' title="'+esc(tt)+'"':'')+'>'+l+(so.k===k?(so.dir<0?' ↓':' ↑'):'')+'</th>').join('')+'</tr></thead><tbody>'+
    (rows.length? rows.slice(0,60).map(x=>'<tr data-key="'+esc(x.key)+'" class="'+(x.key===gwSel?'sel':'')+'" style="cursor:pointer"><td dir="auto" style="text-align:left">'+esc(x.name)+'</td><td style="text-align:left">'+esc(svcName(x.cat))+'</td>'+(showSpec?'<td dir="auto" style="text-align:left">'+esc(x.spec||'–')+'</td>':'')+
      '<td>'+fmtInt(x.n)+'</td><td>'+(x.share==null?'–':(x.share*100).toFixed(1)+'%')+'</td>'+rc(x.r30,x.e30,30)+rc(x.r90,x.e90,90)+rc(x.r180,x.e180,180)+vc(x)+
      '<td>'+(x.opp==null?'–':x.opp.toFixed(2))+'</td><td>'+pct(x.oth)+'</td><td>'+pct(x.same)+'</td></tr>').join('')
      : '<tr><td class="note" colspan="'+cols.length+'" style="text-align:left">No new patients match the filters.</td></tr>')+'</tbody>';
  t.querySelectorAll('th').forEach(th=>th.addEventListener('click',()=>{ const k=th.dataset.k; st.gwSort= so.k===k? {k,dir:-so.dir} : {k,dir:txt(k)?1:-1}; renderGateway(); }));
  t.querySelectorAll('tbody tr[data-key]').forEach(tr=>tr.addEventListener('click',()=>{ gwSel= gwSel===tr.dataset.key? '' : tr.dataset.key; renderGateway(); }));
  const nS=R.rows.filter(x=>x.verdict==='strong').length, nP=R.rows.filter(x=>x.verdict==='possible').length;
  document.getElementById('gwTableNote').textContent=(rows.length>60?'Top 60 of '+rows.length+' rows by the sorted column; '+(rows.length-60)+' hidden. ':'')+
    'Rates show – under 10 patients whose window has passed (hover for the counts). '+(R.m? R.m+' provider'+(R.m>1?'s':'')+' with 20+ patients past 90 days tested against the typical provider of their first service: '+nS+' strong, '+nP+' possible'+(R.m*0.05>=0.5?' (about '+Math.round(R.m*0.05)+' possible would turn up by chance alone)':'')+'. ' : '')+
    'The return chart shows the 4 providers with most patients past 90 days; click a row to follow that one there instead.';
  // new patients per month, stacked by gateway provider
  const labels=R.months.map(fmtM), mo=R.month;
  const bar=(label,data,col)=>({label,data,backgroundColor:col,borderColor:css('--surface'),borderWidth:{top:1,bottom:0,left:0,right:0},borderSkipped:false,maxBarThickness:28});
  const ds=mo.series.map(s=>bar(s.name,s.data,colOf(s.ci)));
  if(mo.others.some(v=>v>0)) ds.push(bar(mo.none.some(v=>v>0)?'Others and no named provider':'Others',mo.others,css('--s-other')));
  const o=baseOpts(); o.scales.x.stacked=true; o.scales.y.stacked=true;
  o.plugins.tooltip.callbacks={label:it=>' '+it.dataset.label+': '+fmtInt(it.parsed.y),footer:it=>{ const i=it[0].dataIndex; return [' New patients: '+fmtInt(mo.total[i])].concat(mo.none[i]?[' No named provider: '+fmtInt(mo.none[i])]:[]); }};
  if(gwMonth) gwMonth.destroy(); gwMonth=new Chart(document.getElementById('gwMonthChart'),{type:'bar',data:{labels,datasets:ds},options:o});
  document.getElementById('gwMonthLegend').innerHTML=ds.map(d=>'<span><i class="box" style="background:'+d.backgroundColor+'"></i>'+esc(d.label)+'</span>').join('');
  // 90-day return by cohort month: overall and the top 4, or the selected row against its peers
  const line=(label,data,col,w,extra)=>({label,data:data.map(v=>v==null?null:v*100),borderColor:col,backgroundColor:col,borderWidth:w,pointRadius:2,pointHoverRadius:4,tension:.25,...extra});
  const sel=gwSel? gwRowSeries(R,gwSel) : null, rds=[line('All new patients',R.ret.overall,css('--accent'),3)];
  if(sel){ const x=sel.row; rds.push(line(x.name+' ('+svcName(x.cat)+')',sel.own,x.none?css('--s-other'):colOf(R.colorIx.get(x.pk)),2.5));
    if(sel.peers) rds.push(line('Other '+svcName(x.cat).toLowerCase()+' providers',sel.peers,css('--ghost'),2,{borderDash:[5,4]})); }
  else R.ret.series.forEach(s=>rds.push(line(s.name,s.data,colOf(s.ci),2)));
  const o2=baseOpts(); o2.scales.y.ticks.callback=v=>v+'%';
  o2.plugins.tooltip.callbacks={label:it=>' '+it.dataset.label+': '+(it.parsed.y==null?'–':it.parsed.y.toFixed(1)+'%')};
  if(gwRet) gwRet.destroy(); gwRet=new Chart(document.getElementById('gwRetChart'),{type:'line',data:{labels,datasets:rds},options:o2});
  document.getElementById('gwRetLegend').innerHTML=rds.map(d=>'<span><i style="background:'+d.borderColor+'"></i>'+esc(d.label)+'</span>').join('');
  document.getElementById('gwRetH').textContent= sel? 'Back within 90 days · '+sel.row.name+' ('+svcName(sel.row.cat)+')'+(sel.peers?' vs peers':'') : 'Back within 90 days, by cohort month';
  // per first service
  const cc=(v,e)=>'<td title="'+fmtInt(e)+' whose window has passed">'+pct(v)+'</td>', A_=R.all;
  document.getElementById('gwSvcTable').innerHTML='<thead><tr><th class="nosort">First service</th><th class="nosort">New patients</th><th class="nosort">Back in 30 days</th><th class="nosort">Back in 90 days</th><th class="nosort">Back in 180 days</th><th class="nosort">Orders each, 90 days</th></tr></thead><tbody>'+
    R.cats.map(c=>'<tr><td>'+esc(svcName(c.cat))+'</td><td>'+fmtInt(c.n)+'</td>'+cc(c.R30,c.e30)+cc(c.R90,c.e90)+cc(c.R180,c.e180)+'<td>'+(c.opp==null?'–':c.opp.toFixed(2))+'</td></tr>').join('')+
    (R.cats.length>1?'<tr class="total"><td>All</td><td>'+fmtInt(A_.n)+'</td>'+cc(gwRate(A_.r30,A_.e30),A_.e30)+cc(gwRate(A_.r90,A_.e90),A_.e90)+cc(gwRate(A_.r180,A_.e180),A_.e180)+'<td>'+(GW.has.o90&&A_.e90>=10?(A_.o90/A_.e90).toFixed(2):'–')+'</td></tr>':'')+'</tbody>';
  const pend=[R.pend90&&['90',R.pend90],R.pend180&&['180',R.pend180]].filter(Boolean).map(([d,mk],i)=>(i?'and from ':'months from ')+fmtM(mk)+(i?' no ':' have no ')+d+'-day figure'+(i?'':' yet'));
  document.getElementById('gwNote').textContent='A patient counts in a return rate only once that many days have passed since their first visit'+(pend.length?', so '+pend.join(', ')+'.':'.');
}
function wireGateway(){
  document.getElementById('copySqlGw').addEventListener('click',()=>navigator.clipboard.writeText(P.gatewaySql).then(()=>toast('Gateway SQL copied')).catch(()=>toast('Copy was blocked by this browser; the query is in sql/gateway_provider_monthly.sql')));
}

/* ---------- where each gateway's patients went next (optional export) ----------
   From sql/gateway_next_services_monthly.sql: per basis, cohort month, first service, gateway provider and next service,
   the patients (of those whose N days have passed) who had that service within N days of the first visit. The '(any)' row
   carries every gateway's eligible counts, also when nobody went on. A share is compared with the other gateways of the
   same first service pooled (two-proportion z); many cells are tested at once, so "worth checking" passes
   Benjamini–Hochberg at 10% across every tested cell. */
let GN=null, gnChart=null, gnSel='';
const GN_ANY='(any)';
function buildGatewayNext(text){
  if(!text||!text.trim()) return null;
  const hdr=splitCsv(text.trim().split(/\r?\n/)[0]).map(normHdr);
  const need=['cohort_month','first_service','gateway_provider_name','next_service','eligible_90d','patients_90d'].filter(c=>!hdr.includes(c));
  if(need.length) throw new Error('The gateway next-services export is missing the column'+(need.length>1?'s ':' ')+need.join(', ')+'. Run the query from Copy SQL again and download all of its columns.');
  const rows=[], nexts=new Set();
  for(const o of parseCsvObjects(text)){
    const m=(o.cohort_month||'').match(/(\d{4})-(\d{2})/), cat=o.first_service, nx=o.next_service; if(!m||!cat||!nx) continue;
    const name=o.gateway_provider_name||GW_NONE;
    rows.push({basis:(o.basis||'').toLowerCase()==='created'?'created':'first',mk:m[1]+'-'+m[2],cat,pid:o.gateway_provider_id||'',name,none:name===GW_NONE,next:nx,
      e30:num(o.eligible_30d),p30:num(o.patients_30d),e90:num(o.eligible_90d),p90:num(o.patients_90d),o90:num(o.orders_90d),e180:num(o.eligible_180d),p180:num(o.patients_180d)});
    if(nx!==GN_ANY) nexts.add(nx);
  }
  return rows.length? {rows,nexts:[...nexts]} : null;
}
/* pure: shares per gateway row and next service for one window, against the same first service's other gateways */
function gnCompute(M,{basis,fromMk,toMk,cats,win}){
  const E=new Map(), rows=new Map(), catT=new Map(), eK='e'+win, pK='p'+win;
  const blank=x=>({...x,E:0,any:0,P:{},O:{}});
  for(const r of M.rows){ if(r.basis!==basis||r.mk<fromMk||r.mk>toMk||(cats&&!cats.has(r.cat))) continue;
    const pk=r.none?'':(r.pid||r.name), key=r.cat+'|'+pk, gk=r.mk+'|'+key;
    const row=rows.get(key)||rows.set(key,blank({key,cat:r.cat,pk,name:r.name,none:r.none})).get(key);
    const ct=catT.get(r.cat)||catT.set(r.cat,blank({cat:r.cat})).get(r.cat);
    // eligible patients belong to the gateway row and month, repeated on each of its rows: count them once
    const e=r[eK]||0; if(e>(E.get(gk)||0)){ const add=e-(E.get(gk)||0); E.set(gk,e); row.E+=add; ct.E+=add; }
    if(r.next===GN_ANY){ row.any+=r[pK]; ct.any+=r[pK]; continue; }
    row.P[r.next]=(row.P[r.next]||0)+r[pK]; ct.P[r.next]=(ct.P[r.next]||0)+r[pK];
    if(win===90){ row.O[r.next]=(row.O[r.next]||0)+r.o90; }
  }
  const R=[...rows.values()].filter(x=>x.E>0).sort((x,y)=>y.E-x.E);
  const tot={}; R.forEach(x=>{ for(const k in x.P) tot[k]=(tot[k]||0)+x.P[k]; });
  const nexts=Object.keys(tot).filter(k=>tot[k]>0).sort((a,b)=>tot[b]-tot[a]);
  // each cell against the other gateways of the same first service
  const cells=[];
  R.forEach(x=>{ const c=catT.get(x.cat); x.cells={};
    for(const k of [GN_ANY].concat(nexts)){ const p=k===GN_ANY?x.any:(x.P[k]||0), cp=k===GN_ANY?c.any:(c.P[k]||0), pe=c.E-x.E, pp=cp-p;
      const cell={p,e:x.E,share:x.E>=10?p/x.E:null,peer:pe>=10?pp/pe:null,pe,z:null,flag:false};
      if(!x.none&&x.E>=20&&pe>=20){ const q=(p+pp)/(x.E+pe), se=Math.sqrt(q*(1-q)*(1/x.E+1/pe)); if(se>0){ cell.z=(p/x.E-pp/pe)/se; cells.push(cell); } }
      x.cells[k]=cell; } });
  const cut=bhCut(cells.map(c=>normP(c.z)),cells.length,0.1); cells.forEach(c=>{ c.flag=normP(c.z)<=cut; });
  const all={E:0,any:0}; catT.forEach(c=>{ all.E+=c.E; all.any+=c.any; });
  return {rows:R,nexts,cats:catT,tested:cells.length,flagged:cells.filter(c=>c.flag).length,all,win};
}
function renderGatewayNext(){
  const empty=document.getElementById('gnEmpty'), body=document.getElementById('gnBody');
  if(!GN){ empty.hidden=false; body.hidden=true; if(gnChart){gnChart.destroy();gnChart=null;} return; }
  empty.hidden=true; body.hidden=false;
  if(st.gnShow==='o') st.gnWin=90;
  document.querySelectorAll('#gnWin button').forEach(b=>{ b.classList.toggle('on',+b.dataset.w===st.gnWin); b.disabled=st.gnShow==='o'&&+b.dataset.w!==90; });
  document.querySelectorAll('#gnShow button').forEach(b=>b.classList.toggle('on',b.dataset.s===st.gnShow));
  const basis=st.newBasis==='created'&&GN.rows.some(r=>r.basis==='created')?'created':'first';
  const R=gnCompute(GN,{basis,fromMk:monthKey(st.from),toMk:monthKey(st.to),cats:gwCats(),win:st.gnWin});
  const svcName=c=>c===GN_ANY?'Any service':(UP_LABEL[c]||label(c)), pct=v=>v==null?'–':(v*100).toFixed(0)+'%', W=st.gnWin;
  const cols=[GN_ANY].concat(R.nexts.slice(0,9)), rows=R.rows.slice(0,40);
  if(gnSel&&!R.rows.some(x=>x.key===gnSel)) gnSel='';
  const sel=R.rows.find(x=>x.key===gnSel)||R.rows.find(x=>!x.none)||R.rows[0];
  const cellHtml=(x,k)=>{ const c=x.cells[k]; if(!c) return '<td>–</td>';
    const d=c.share!=null&&c.peer!=null? (c.share-c.peer)*100 : null, a=d==null?0:Math.min(Math.abs(d),25)/25;
    const bg=d==null||x.none? '' : d>=0? 'background:rgba(12,163,12,'+(0.04+a*0.26).toFixed(2)+')' : 'background:rgba(194,65,12,'+(0.04+a*0.26).toFixed(2)+')';
    const txt= st.gnShow==='n'? fmtInt(c.p) : st.gnShow==='o'? (k===GN_ANY? fmtInt(Object.values(x.O).reduce((s,v)=>s+v,0)) : fmtInt(x.O[k]||0)) : pct(c.share);
    const tip=fmtInt(c.p)+' of '+fmtInt(c.e)+' new patients past '+W+' days had '+svcName(k).toLowerCase()+' within '+W+' days'+(c.peer!=null&&!x.none?' ('+pct(c.share)+') · other '+svcName(x.cat).toLowerCase()+' gateways: '+pct(c.peer)+' of '+fmtInt(c.pe):'')+(c.z!=null?' · z = '+c.z.toFixed(2)+(c.flag?', worth checking':''):'')+(st.gnShow==='o'&&k!==GN_ANY?' · '+fmtInt(x.O[k]||0)+' orders with it in 90 days':'');
    return '<td class="heat" style="'+bg+(c.flag?';box-shadow:inset 0 0 0 2px var(--ink-2)':'')+'" title="'+esc(tip)+'">'+txt+(c.flag?' •':'')+'</td>'; };
  document.getElementById('gnTable').innerHTML='<thead><tr><th class="nosort" style="text-align:left">Gateway provider</th><th class="nosort" style="text-align:left">First service</th><th class="nosort" title="New patients whose '+W+' days have passed">Patients</th>'+cols.map(k=>'<th class="nosort">'+esc(svcName(k))+'</th>').join('')+'</tr></thead><tbody>'+
    (rows.length? rows.map(x=>'<tr data-key="'+esc(x.key)+'" class="'+(sel&&x.key===sel.key?'sel':'')+'" style="cursor:pointer"><td dir="auto" style="text-align:left">'+esc(x.name)+'</td><td style="text-align:left">'+esc(svcName(x.cat))+'</td><td>'+fmtInt(x.E)+'</td>'+cols.map(k=>cellHtml(x,k)).join('')+'</tr>').join('')
      : '<tr><td class="note" colspan="'+(cols.length+3)+'" style="text-align:left">No new patients past '+W+' days match the filters.</td></tr>')+'</tbody>';
  document.querySelectorAll('#gnTable tbody tr[data-key]').forEach(tr=>tr.addEventListener('click',()=>{ gnSel=tr.dataset.key; renderGatewayNext(); }));
  document.getElementById('gnNote').textContent=(R.rows.length>40?'The 40 gateways with most patients of '+R.rows.length+'. ':'')+
    (R.nexts.length>9?'The 9 most-ordered next services of '+R.nexts.length+'. ':'')+
    'Green: more of this gateway’s patients went on to that service than for the other gateways with the same first service; orange: fewer. '+
    R.tested+' cells with 20+ patients on both sides tested; '+R.flagged+' worth checking (• and outlined), after allowing for testing that many. '+(st.gnShow==='o'?'Orders are distinct orders with that service in 90 days, so an order with two services counts under both.':'Hover a cell for the counts.');
  // written read-out
  const flags=[]; R.rows.forEach(x=>{ for(const k of R.nexts){ const c=x.cells[k]; if(c&&c.flag) flags.push({x,k,c}); } });
  flags.sort((a,b)=>Math.abs(b.c.z)-Math.abs(a.c.z));
  const allAny=R.all.E? R.all.any/R.all.E : null, topNext=R.nexts.slice(0,3).map(k=>{ let p=0; R.rows.forEach(x=>p+=x.P[k]||0); return svcName(k)+' '+pct(R.all.E?p/R.all.E:null); });
  const lines=['<li>Of <strong>'+fmtInt(R.all.E)+'</strong> new patients whose '+W+' days have passed, <strong>'+pct(allAny)+'</strong> ordered another service within '+W+' days'+(topNext.length?': '+esc(topNext.join(', ')):'')+'.</li>'];
  if(flags.length) flags.slice(0,4).forEach(f=>lines.push('<li><strong>'+esc(f.x.name)+'</strong> ('+esc(svcName(f.x.cat))+'): '+pct(f.c.share)+' of '+fmtInt(f.c.e)+' patients went on to '+esc(svcName(f.k).toLowerCase())+', against '+pct(f.c.peer)+' for the other '+esc(svcName(f.x.cat).toLowerCase())+' gateways.</li>'));
  else lines.push('<li>No gateway stands out from the others with the same first service once the number of comparisons is allowed for. The colours show the direction, but gaps this size can come from chance.</li>');
  document.getElementById('gnRead').innerHTML='<div class="head">Where new patients go after their first visit</div><ul>'+lines.join('')+'</ul>';
  // the selected gateway against its peers, service by service
  if(gnChart){ gnChart.destroy(); gnChart=null; }
  const h=document.getElementById('gnSelH');
  if(!sel){ h.textContent=''; document.getElementById('gnLegend').innerHTML=''; return; }
  const ks=R.nexts.filter(k=>sel.cells[k]&&sel.cells[k].p>0||(sel.cells[k]&&sel.cells[k].peer>0)).slice(0,10);
  h.textContent=sel.name+' ('+svcName(sel.cat)+'): what '+fmtInt(sel.E)+' new patients went on to within '+W+' days';
  const ds=[{label:sel.name,data:ks.map(k=>sel.cells[k].share==null?null:sel.cells[k].share*100),backgroundColor:css('--accent'),borderRadius:3,maxBarThickness:18}];
  if(!sel.none) ds.push({label:'Other '+svcName(sel.cat).toLowerCase()+' gateways',data:ks.map(k=>sel.cells[k].peer==null?null:sel.cells[k].peer*100),backgroundColor:css('--ghost'),borderRadius:3,maxBarThickness:18});
  const o=baseOpts(); o.indexAxis='y'; o.scales.x.ticks.callback=v=>v+'%'; o.scales.x.grid={color:css('--grid')}; o.scales.y.grid={display:false}; o.scales.y.ticks.callback=function(v){ return this.getLabelForValue(v); };
  o.plugins.tooltip.callbacks={label:it=>{ const c=sel.cells[ks[it.dataIndex]]; return ' '+it.dataset.label+': '+(it.parsed.x==null?'–':it.parsed.x.toFixed(1)+'%')+(it.datasetIndex===0?' ('+fmtInt(c.p)+' of '+fmtInt(c.e)+')':''); }};
  gnChart=new Chart(document.getElementById('gnChart'),{type:'bar',data:{labels:ks.map(svcName),datasets:ds},options:o});
  document.getElementById('gnChart').parentElement.style.height=Math.max(180,ks.length*34+60)+'px';
  document.getElementById('gnLegend').innerHTML=ds.map(d=>'<span><i class="box" style="background:'+d.backgroundColor+'"></i>'+esc(d.label)+'</span>').join('')+'<span class="note">Click another row in the table to switch provider.</span>';
}
function wireGatewayNext(){
  document.querySelectorAll('#gnWin button').forEach(b=>b.addEventListener('click',()=>{ st.gnWin=+b.dataset.w; renderGatewayNext(); }));
  document.querySelectorAll('#gnShow button').forEach(b=>b.addEventListener('click',()=>{ st.gnShow=b.dataset.s; renderGatewayNext(); }));
  document.getElementById('copySqlGn').addEventListener('click',()=>navigator.clipboard.writeText(P.gatewayNextSql).then(()=>toast('Next-services SQL copied')).catch(()=>toast('Copy was blocked by this browser; the query is in sql/gateway_next_services_monthly.sql')));
}
