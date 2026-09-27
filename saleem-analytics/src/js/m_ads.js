/* ---------- ads ---------- */
function renderAds(){
  const a=st.from, b=st.to;
  const sel=document.getElementById('adGroupSel');
  if(!sel.options.length){ sel.innerHTML='<option value="">All ad groups</option>'+A.groups.map(g=>'<option>'+esc(g)+'</option>').join(''); }
  sel.value=st.adGroup;
  // monthly stacked spend by group within the range (top 7 + Other, fixed colour by all-time spend rank)
  const m0=monthKey(a), m1=monthKey(b); const months=[]; for(let mk=m0; mk<=m1; mk=addMonths(mk,1)) months.push(mk);
  const top=A.groups.slice(0,7), rest=A.groups.slice(7);
  const seriesFor=gs=>months.map(mk=>{const s=toN(mk+'-01'), e=s+daysInMonth(mk)-1, lo=Math.max(s,a), hi=Math.min(e,b); return sum(adDaily(lo,hi,gs));});
  const ds=top.map((g,i)=>({label:g,data:seriesFor([g]),backgroundColor:css('--s'+(i+1))}));
  if(rest.length) ds.push({label:'Other',data:seriesFor(rest),backgroundColor:css('--s-other')});
  ds.forEach(d=>{d.borderColor=css('--surface'); d.borderWidth={top:2,bottom:0,left:0,right:0}; d.borderSkipped=false; d.maxBarThickness=28;});
  const o=baseOpts(); o.scales.x.stacked=true; o.scales.y.stacked=true; o.scales.y.ticks.callback=v=>'$'+Number(v).toLocaleString('en-US');
  o.plugins.tooltip.callbacks={label:it=> it.parsed.y? ' '+it.dataset.label+': '+fmtUsd(it.parsed.y):null, footer:items=>' Total: '+fmtUsd(items.reduce((s,x)=>s+x.parsed.y,0))};
  o.plugins.tooltip.filter=it=>it.parsed.y>0;
  if(adChart) adChart.destroy();
  adChart=new Chart(document.getElementById('adGroupChart'),{type:'bar',data:{labels:months.map(fmtM),datasets:ds},options:o});
  document.getElementById('adLegend').innerHTML=ds.map(d=>'<span><i class="box" style="background:'+d.backgroundColor+'"></i>'+esc(d.label)+'</span>').join('');
  // campaign table
  const rows=[];
  for(const c of Object.values(A.camps)){
    if(st.adGroup && c.group!==st.adGroup) continue;
    let sp=0,res=0,conv=0,impr=0,clicks=0,rtype='';
    for(const [mk,x] of Object.entries(c.months)){ const s=toN(mk+'-01'), e=s+daysInMonth(mk)-1, lo=Math.max(s,a), hi=Math.min(e,b); if(lo>hi) continue;
      let w=0; for(let n=lo;n<=hi;n++) w+=A.w(n); sp+=x.spend*w; res+=x.res*w; conv+=x.conv*w; impr+=x.impr*w; clicks+=x.clicks*w; if(x.rtype) rtype=x.rtype; }
    if(sp<0.5) continue;
    rows.push({name:c.name,group:c.group,obj:c.objective.replace('OUTCOME_','').replace('_',' ').toLowerCase(),spend:sp,impr,clicks,res,rtype:prettyRes(rtype),cpr:res?sp/res:null});
  }
  const k=st.campSort.k, dir=st.campSort.dir;
  rows.sort((x,y)=>{const a1=x[k], b1=y[k]; if(a1==null) return 1; if(b1==null) return -1; return (a1<b1?-1:a1>b1?1:0)*dir;});
  const cols=[['name','Campaign'],['group','Service'],['obj','Objective'],['spend','Spend'],['impr','Impressions'],['clicks','Clicks'],['res','Results'],['rtype','Result type'],['cpr','Cost / result']];
  const tot=rows.reduce((s,r)=>s+r.spend,0);
  const t=document.getElementById('campTable');
  t.innerHTML='<thead><tr>'+cols.map(([key,l])=>'<th data-k="'+key+'">'+l+(k===key?(dir<0?' ↓':' ↑'):'')+'</th>').join('')+'</tr></thead><tbody>'+
    '<tr class="total"><td>'+rows.length+' campaigns</td><td></td><td></td><td>'+fmtUsd(tot)+'</td><td colspan="5"></td></tr>'+
    rows.map(r=>'<tr><td style="max-width:360px;overflow:hidden;text-overflow:ellipsis" title="'+esc(r.name)+'">'+esc(r.name)+'</td><td style="text-align:left">'+esc(r.group)+'</td><td style="text-align:left">'+esc(r.obj)+'</td><td>'+fmtUsd(r.spend)+'</td><td>'+fmtInt(r.impr)+'</td><td>'+fmtInt(r.clicks)+'</td><td>'+fmtInt(r.res)+'</td><td style="text-align:left">'+esc(r.rtype)+'</td><td>'+(r.cpr?fmtUsd(r.cpr):'–')+'</td></tr>').join('')+'</tbody>';
  t.querySelectorAll('th').forEach(th=>th.addEventListener('click',()=>{const key=th.dataset.k; st.campSort= st.campSort.k===key?{k:key,dir:-st.campSort.dir}:{k:key,dir:(key==='name'||key==='group'||key==='obj'||key==='rtype')?1:-1}; renderAds();}));
  const allSpend=sum(adDaily(a,b,A.groups)), conv=sum(adDaily(a,b,A.groups,'conv'));
  document.getElementById('adsDesc').textContent=fmtD(a)+' – '+fmtD(b)+' · '+fmtUsd(allSpend)+' total spend · '+fmtInt(conv)+' WhatsApp conversations from message campaigns';
}
function prettyRes(t){ if(!t) return ''; return ({'onsite_conversion.messaging_conversation_started_7d':'WhatsApp conversations','mobile_app_install':'App installs','onsite_conversion.purchase':'Purchases (messaging)','offsite_conversion.fb_pixel_purchase':'Website purchases','leadgen.other':'Leads','reach':'Reach','link_click':'Link clicks','post_engagement':'Post engagement','click_to_call_native_call_placed':'Calls','mixed':'Mixed','profile_visit_view':'Profile visits'})[t] || t.replace(/_/g,' ').replace(/.*\./,''); }

