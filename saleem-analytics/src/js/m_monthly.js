/* ---------- month table ---------- */
function ramadanDays(mk){ const s=toN(mk+'-01'), n=daysInMonth(mk); let c=0; for(let i=0;i<n;i++){const h=hijri(s+i); if(h&&h.m===9) c++;} return c; }
function renderMom(){
  const cats=selCats(), stats=selStats(), m=st.measure;
  const endMk=monthKey(st.to); const months=[]; for(let k=12;k>=0;k--){ const mk=addMonths(endMk,-k); const s=toN(mk+'-01'); if(s+daysInMonth(mk)-1>=S.min) months.push(mk); }
  const span=mk=>{const s=toN(mk+'-01'), e=Math.min(s+daysInMonth(mk)-1,S.max); return [Math.max(s,S.min),e];};
  const val=(mk,cs)=>{const [s,e]=span(mk); if(e<s) return null; const t=total(s,e,m,cs,stats); return {t,pd:t/(e-s+1),days:e-s+1,full:daysInMonth(mk)};};
  const rows=[{name:'All selected',cats,total:true}].concat(S.order.map(i=>S.catList[i]).filter(c=>st.svc.has(c)).map(c=>({name:label(c),cats:[c],color:S.colorOf[c]})));
  const head='<thead><tr><th class="nosort">Service</th>'+months.map(mk=>{const r=ramadanDays(mk), v=val(mk,cats); return '<th class="nosort"><div class="mhead"><span>'+fmtM(mk)+(v&&v.days<v.full?'*':'')+'</span>'+(r?'<span class="badge" title="'+r+' Ramadan days">R '+r+'d</span>':'')+'</div></th>';}).join('')+'</tr></thead>';
  const body=rows.map(r=>{
    const cells=months.map(mk=>{
      const v=val(mk,r.cats); if(!v) return '<td>–</td>';
      if(st.mom==='val') return '<td>'+fmtInt(v.t)+'</td>';
      if(st.mom==='perday') return '<td>'+v.pd.toFixed(v.pd<10?1:0)+'</td>';
      const ref= st.mom==='mom'? val(addMonths(mk,-1),r.cats) : (toN(addMonths(mk,-12)+'-01')>=S.min? val(addMonths(mk,-12),r.cats):null);
      if(!ref||!ref.pd) return '<td>–</td>';
      const p=(v.pd-ref.pd)/ref.pd*100; const a=Math.min(Math.abs(p),60)/60;
      const bg = p>=0? 'rgba(12,163,12,'+(0.05+a*0.22)+')' : 'rgba(208,59,59,'+(0.05+a*0.22)+')';
      return '<td class="heat" style="background:'+bg+'" title="'+v.pd.toFixed(1)+' vs '+ref.pd.toFixed(1)+' per day">'+fmtPct(p)+'</td>';
    }).join('');
    return '<tr'+(r.total?' class="total"':'')+'><td>'+(r.color?'<span class="sw" style="background:'+r.color+'"></span>':'')+esc(r.name)+'</td>'+cells+'</tr>';
  }).join('');
  document.getElementById('momTable').innerHTML=head+'<tbody>'+body+'</tbody>';
}

