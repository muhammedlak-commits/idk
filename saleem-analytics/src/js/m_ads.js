/* ---------- ads ---------- */
function renderAds(){
  const a=st.from, b=st.to;
  // follows the top service filter: all services -> every group, otherwise the groups promoting the selected services
  const gset=new Set(spendGroups());
  // monthly stacked spend by group within the range (top 7 + Other, fixed colour by all-time spend rank)
  const m0=monthKey(a), m1=monthKey(b); const months=[]; for(let mk=m0; mk<=m1; mk=addMonths(mk,1)) months.push(mk);
  const shownGroups=A.groups.filter(g=>gset.has(g)); const top=shownGroups.slice(0,7), rest=shownGroups.slice(7);
  const seriesFor=gs=>months.map(mk=>{const s=toN(mk+'-01'), e=s+daysInMonth(mk)-1, lo=Math.max(s,a), hi=Math.min(e,b); return sum(adDaily(lo,hi,gs));});
  const ds=top.map(g=>({label:g,data:seriesFor([g]),backgroundColor:css('--s'+(A.groups.indexOf(g)<8?A.groups.indexOf(g)+1:'-other'))}));
  if(rest.length) ds.push({label:'Other',data:seriesFor(rest),backgroundColor:css('--s-other')});
  ds.forEach(d=>{d.borderColor=css('--surface'); d.borderWidth={top:2,bottom:0,left:0,right:0}; d.borderSkipped=false; d.maxBarThickness=28;});
  const o=baseOpts(); o.scales.x.stacked=true; o.scales.y.stacked=true; o.scales.y.ticks.callback=v=>'$'+Number(v).toLocaleString('en-US');
  o.plugins.tooltip.callbacks={label:it=> it.parsed.y? ' '+it.dataset.label+': '+fmtUsd(it.parsed.y):null, footer:items=>' Total: '+fmtUsd(items.reduce((s,x)=>s+x.parsed.y,0))};
  o.plugins.tooltip.filter=it=>it.parsed.y>0;
  if(adChart) adChart.destroy();
  adChart=new Chart(document.getElementById('adGroupChart'),{type:'bar',data:{labels:months.map(fmtM),datasets:ds},options:o});
  document.getElementById('adLegend').innerHTML=ds.map(d=>'<span><i class="box" style="background:'+d.backgroundColor+'"></i>'+esc(d.label)+'</span>').join('');
  // ads / campaigns table
  const inRange=months=>{ let sp=0,res=0,conv=0,impr=0,clicks=0,rtype='';
    for(const [mk,x] of Object.entries(months)){ const s=toN(mk+'-01'), e=s+daysInMonth(mk)-1, lo=Math.max(s,a), hi=Math.min(e,b); if(lo>hi) continue;
      let w=0; for(let n=lo;n<=hi;n++) w+=A.w(n); sp+=x.spend*w; res+=x.res*w; conv+=x.conv*w; impr+=x.impr*w; clicks+=x.clicks*w; if(x.rtype) rtype=x.rtype; }
    return {sp,res,conv,impr,clicks,rtype}; };
  const view= A.level==='ad'? st.adView : 'campaign';
  const q=st.adQuery.trim().toLowerCase();
  const obj=o=>(o||'').replace('OUTCOME_','').replace('_',' ').toLowerCase();
  const rows=[];
  if(view==='ad'){
    for(const ad of A.units){
      if(!gset.has(ad.group)) continue;
      if(q && !(ad.name+' '+ad.adset+' '+ad.campaign).toLowerCase().includes(q)) continue;
      const m=inRange(ad.months); if(m.sp<0.5) continue;
      rows.push({name:ad.name,group:ad.group,how:ad.how,adset:ad.adset,camp:ad.campaign,obj:obj(ad.objective),spend:m.sp,impr:m.impr,clicks:m.clicks,res:m.res,rtype:prettyRes(m.rtype),cpr:m.res?m.sp/m.res:null});
    }
  } else {
    for(const c of Object.values(A.camps)){
      const gs=Object.entries(c.groups).sort((x,y)=>y[1]-x[1]), tot=gs.reduce((s,x)=>s+x[1],0);
      if(!Object.keys(c.groups).some(g=>gset.has(g))) continue;
      if(q && !c.name.toLowerCase().includes(q)) continue;
      const m=inRange(c.months); if(m.sp<0.5) continue;
      const mix= gs.length===1? gs[0][0] : gs.slice(0,3).map(([g,v])=>g+' '+Math.round(v/tot*100)+'%').join(' · ')+(gs.length>3?' …':'');
      rows.push({name:c.name,group:mix,obj:obj(c.objective),spend:m.sp,impr:m.impr,clicks:m.clicks,res:m.res,rtype:prettyRes(m.rtype),cpr:m.res?m.sp/m.res:null});
    }
  }
  const k=st.campSort.k, dir=st.campSort.dir;
  rows.sort((x,y)=>{const a1=x[k], b1=y[k]; if(a1==null) return 1; if(b1==null) return -1; return (a1<b1?-1:a1>b1?1:0)*dir;});
  const cols= view==='ad'
    ? [['name','Ad'],['group','Service'],['how','Matched by'],['adset','Ad set'],['camp','Campaign'],['spend','Spend'],['impr','Impressions'],['clicks','Clicks'],['res','Results'],['rtype','Result type'],['cpr','Cost / result']]
    : [['name','Campaign'],['group','Services'],['obj','Objective'],['spend','Spend'],['impr','Impressions'],['clicks','Clicks'],['res','Results'],['rtype','Result type'],['cpr','Cost / result']];
  const textCols=new Set(['name','group','how','adset','camp','obj','rtype']);
  const tot=rows.reduce((s,r)=>s+r.spend,0), shown=rows.slice(0,400);
  const cell=(key,r)=>{ const v=r[key];
    if(key==='spend'||key==='cpr') return '<td>'+(v?fmtUsd(v):'–')+'</td>';
    if(key==='impr'||key==='clicks'||key==='res') return '<td>'+fmtInt(v)+'</td>';
    const wide=key==='name'||key==='adset'||key==='camp'; return '<td style="text-align:left'+(wide?';max-width:280px;overflow:hidden;text-overflow:ellipsis':'')+'"'+(wide?' title="'+esc(v)+'"':'')+(key==='name'?' dir="auto"':'')+'>'+esc(v||'')+'</td>'; };
  const t=document.getElementById('campTable');
  const spendCol=cols.findIndex(c=>c[0]==='spend');
  t.innerHTML='<thead><tr>'+cols.map(([key,l])=>'<th data-k="'+key+'">'+l+(k===key?(dir<0?' ↓':' ↑'):'')+'</th>').join('')+'</tr></thead><tbody>'+
    '<tr class="total"><td>'+rows.length+(view==='ad'?' ads':' campaigns')+(rows.length>shown.length?' (top '+shown.length+' shown)':'')+'</td>'+'<td></td>'.repeat(spendCol-1)+'<td>'+fmtUsd(tot)+'</td>'+'<td></td>'.repeat(cols.length-spendCol-1)+'</tr>'+
    shown.map(r=>'<tr>'+cols.map(([key])=>cell(key,r)).join('')+'</tr>').join('')+'</tbody>';
  t.querySelectorAll('th').forEach(th=>th.addEventListener('click',()=>{const key=th.dataset.k; st.campSort= st.campSort.k===key?{k:key,dir:-st.campSort.dir}:{k:key,dir:textCols.has(key)?1:-1}; renderAds();}));
  document.querySelectorAll('#adView button').forEach(bt=>{ bt.classList.toggle('on',bt.dataset.v===view); bt.disabled= A.level!=='ad' && bt.dataset.v==='ad'; });
  const allSpend=sum(adDaily(a,b,[...gset])), conv=sum(adDaily(a,b,[...gset],'conv'));
  document.getElementById('adsDesc').textContent=fmtD(a)+' – '+fmtD(b)+' · '+fmtUsd(allSpend)+(' spend on '+adModeLabel()+' · ')+''+fmtInt(conv)+' WhatsApp conversations from message campaigns';
}
function prettyRes(t){ if(!t) return ''; return ({'onsite_conversion.messaging_conversation_started_7d':'WhatsApp conversations','mobile_app_install':'App installs','onsite_conversion.purchase':'Purchases (messaging)','offsite_conversion.fb_pixel_purchase':'Website purchases','leadgen.other':'Leads','reach':'Reach','link_click':'Link clicks','post_engagement':'Post engagement','click_to_call_native_call_placed':'Calls','mixed':'Mixed','profile_visit_view':'Profile visits'})[t] || t.replace(/_/g,' ').replace(/.*\./,''); }

