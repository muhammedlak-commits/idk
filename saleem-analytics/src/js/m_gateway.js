/* ---------- gateway providers and retention (optional gateway export) ----------
   One row per basis, cohort month, first service and gateway provider, from sql/gateway_provider_monthly.sql.
   The gateway is the provider on a new patient's first-ever real visit. Return rate = returned_Nd / eligible_Nd,
   and eligible only counts patients whose N days have passed, so an unfinished window never drags a rate down.
   Follows the top filter: services (as database service types, via UP_CAT), the date range (cohort months)
   and New patient means (basis). Visit status and measure don't apply: these are patients, from real visits.
   "vs peers" compares a provider with the other named providers of the same first service (two-proportion
   z-test on the 90-day rate). Many providers are tested at once, so "strong" uses a Bonferroni bar
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
    const r={basis,mk,cat,pid:o.gateway_provider_id||'',name,none:name===GW_NONE,spec:o.specialty||''};
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
    ['vs','90 days vs peers','90-day return minus that of the other named providers with the same first service, in percentage points'],['opp','Orders each, 90 days','Further orders per patient within 90 days'],
    ['oth','Other service, 90 days','Had a different service within 90 days'],['same','Same provider, 90 days','Saw the same provider again in another order within 90 days']]);
  const vt={strong:(u)=>'<span class="delta '+(u?'up':'down')+'">✓ '+(u?'Above':'Below')+' peers</span>',possible:(u)=>'<span class="delta flat">~ '+(u?'Above':'Below')+' peers</span>'};
  const rc=(r,e,d)=>'<td title="'+fmtInt(r)+' of '+fmtInt(e)+' whose '+d+' days have passed">'+(e>=10?pct(r/e):'–')+'</td>';
  const vc=x=>{ if(x.diff==null) return '<td title="'+(x.none?'Not a provider, so not compared':'Needs 10+ patients past 90 days here and among the peers')+'">–</td>';
    const t=pct(x.r90/x.e90,1)+' of '+fmtInt(x.e90)+' vs '+pct(x.pr/x.pe,1)+' of '+fmtInt(x.pe)+' for the other '+svcName(x.cat).toLowerCase()+' providers'+(x.tested?'; z = '+x.z.toFixed(2)+' (strong needs '+R.zStrong.toFixed(2)+' with '+R.m+' tested)':'; not tested, needs 20+ on both sides');
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
    'Rates show – under 10 patients whose window has passed (hover for the counts). '+(R.m? R.m+' provider'+(R.m>1?'s':'')+' with 20+ patients past 90 days tested against their peers: '+nS+' strong, '+nP+' possible'+(R.m*0.05>=0.5?' (about '+Math.round(R.m*0.05)+' possible would turn up by chance alone)':'')+'. ' : '')+
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
