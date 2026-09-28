/* ---------- service table ---------- */
function renderSvcTable(){
  const stats=selStats(), a=st.from, b=st.to, len=b-a+1, m=st.measure;
  const hasP=covered(a-len,a-1), hasY=covered(a-364,b-364);
  const canc=S.stList.filter(s=>s==='cancelled');
  const cats=S.order.map(i=>S.catList[i]).filter(c=>st.svc.has(c));
  const grand=total(a,b,m,cats,stats);
  const rows=cats.map(c=>{
    const cur=total(a,b,m,[c],stats), prev=hasP?total(a-len,a-1,m,[c],stats):null, ly=hasY?total(a-364,b-364,m,[c],stats):null;
    const all=total(a,b,'ord',[c],S.stList), cn=total(a,b,'ord',[c],canc);
    const groups=A.groups.filter(g=>GROUP_SVCS[g]&&GROUP_SVCS[g].includes(c));
    const spend=groups.length? sum(adDaily(a,b,groups)) : null;
    // when a group covers several services (imaging), split its spend by their order share
    let own=spend;
    if(spend&&groups.length){ own=0; groups.forEach(g=>{ const gs=GROUP_SVCS[g]; const tot=total(a,b,'ord',gs,stats); const mine=total(a,b,'ord',[c],stats); own+= sum(adDaily(a,b,[g]))*(tot? mine/tot : 1/gs.length); }); }
    const ord=total(a,b,'ord',[c],stats);
    return {c,cur,share:grand?cur/grand*100:0,prevP:prev>=10?(cur-prev)/prev*100:null,lyP:ly>=10?(cur-ly)/ly*100:null,canc:all?cn/all*100:null,pat:total(a,b,'pat',[c],stats),spend:own,cpo:own&&ord?own/ord:null};
  });
  const k=st.svcSort.k, dir=st.svcSort.dir;
  rows.sort((x,y)=>{const a1=x[k], b1=y[k]; if(a1==null) return 1; if(b1==null) return -1; return (a1<b1?-1:a1>b1?1:0)*dir;});
  const totSpend=sum(adDaily(a,b,spendGroups())), totOrd=total(a,b,'ord',cats,stats);
  const cols=[['c','Service'],['cur',MLABEL[st.measure]],['share','Share'],['prevP','vs prev period'],['lyP','vs last year'],['canc','Cancel rate'],['pat','Patient-days'],['spend','Ad spend (matching ads)'],['cpo','Ad cost / order (matching ads)']];
  const cls=v=>v==null?'':v>0.5?'pos':v<-0.5?'neg':'';
  const tot={cur:grand, prev:hasP?total(a-len,a-1,m,cats,stats):null, ly:hasY?total(a-364,b-364,m,cats,stats):null};
  const html='<thead><tr>'+cols.map(([key,l])=>'<th data-k="'+key+'">'+l+(k===key?(dir<0?' ↓':' ↑'):'')+'</th>').join('')+'</tr></thead><tbody>'+
    '<tr class="total"><td>All selected</td><td>'+fmtVal(tot.cur)+'</td><td>100%</td><td class="'+cls(tot.prev&&(tot.cur-tot.prev)/tot.prev*100)+'">'+fmtPct(tot.prev?(tot.cur-tot.prev)/tot.prev*100:null,1)+'</td><td class="'+cls(tot.ly&&(tot.cur-tot.ly)/tot.ly*100)+'">'+fmtPct(tot.ly?(tot.cur-tot.ly)/tot.ly*100:null,1)+'</td><td></td><td></td><td>'+fmtUsd(totSpend)+'<br><span class="note">'+adModeLabel()+'</span></td><td>'+(totOrd?fmtUsd(totSpend/totOrd):'–')+'<br><span class="note">'+adModeLabel()+'</span></td></tr>'+
    rows.map(r=>'<tr><td><span class="sw" style="background:'+S.colorOf[r.c]+'"></span>'+esc(label(r.c))+'</td><td>'+fmtVal(r.cur)+'</td><td>'+r.share.toFixed(1)+'%</td><td class="'+cls(r.prevP)+'">'+fmtPct(r.prevP,1)+'</td><td class="'+cls(r.lyP)+'">'+fmtPct(r.lyP,1)+'</td><td>'+(r.canc==null?'–':r.canc.toFixed(1)+'%')+'</td><td>'+fmtInt(r.pat)+'</td><td>'+(r.spend?fmtUsd(r.spend):'–')+'</td><td>'+(r.cpo?fmtUsd(r.cpo):'–')+'</td></tr>').join('')+'</tbody>';
  const t=document.getElementById('svcTable'); t.innerHTML=html;
  t.querySelectorAll('th').forEach(th=>th.addEventListener('click',()=>{const key=th.dataset.k; st.svcSort = st.svcSort.k===key? {k:key,dir:-st.svcSort.dir} : {k:key,dir:key==='c'?1:-1}; renderSvcTable();}));
  document.getElementById('svcDesc').textContent=fmtD(a)+' – '+fmtD(b)+viewLabel()+(hasY?'':' · last-year comparison needs data from '+fmtD(a-364));
}

