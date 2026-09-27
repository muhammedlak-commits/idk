/* ---------- file loading ---------- */
function wireFiles(){
  const inp=document.getElementById('fileInput');
  document.getElementById('loadBtn').addEventListener('click',()=>inp.click());
  inp.addEventListener('change',async()=>{
    for(const f of inp.files){ const text=await f.text(); const hdr=headerLine(text);
      try{
        if(DROPS.gateway.check(hdr)){ DROPS.gateway.apply(text,f.name); }
        else if(DROPS.pfollow.check(hdr)){ DROPS.pfollow.apply(text,f.name); }
        else if(DROPS.providers.check(hdr)){ DROPS.providers.apply(text,f.name); }
        else if(DROPS.links.check(hdr)){ DROPS.links.apply(text,f.name); }
        else if(DROPS.patients.check(hdr)){ DROPS.patients.apply(text,f.name); }
        else if(DROPS.orders.check(hdr)){ DROPS.orders.apply(text,f.name); }
        else if(/campaign_id/.test(hdr)&&/ad_group/.test(hdr)){ P.map=text; lsSet('spl.map',text); }
        else if(/campaign_id/.test(hdr)&&/month/.test(hdr)){ P.adsMonthly=text; lsSet('spl.adsMonthly',text); }
        else if(/spend_usd/.test(hdr)){ P.adsDaily=text; lsSet('spl.adsDaily',text); }
        else if(/category/.test(hdr)&&/title/.test(hdr)){ P.events=text; }
        else throw new Error(f.name+' was not recognised. Expected a Metabase service export or one of the ads CSVs.');
        toast('Loaded '+f.name);
      }catch(err){ toast(err.message); }
    }
    inp.value=''; lsSet('spl.build',P.built); boot(true);
  });
}
/* newer file wins for any day it contains */
function mergeServices(oldText,newText){
  const days=new Set(); const nl=newText.trim().split(/\r?\n/); const hdrN=splitCsv(nl[0]).map(normHdr); const di=hdrN.indexOf('day');
  nl.slice(1).forEach(l=>days.add((splitCsv(l)[di]||'').slice(0,10)));
  const ol=oldText.trim().split(/\r?\n/); const hdrO=splitCsv(ol[0]).map(normHdr); const doi=hdrO.indexOf('day');
  // same columns in any order: old rows are rewritten in the new file's column order; different columns can't be merged
  const setN=[...hdrN].sort().join(','), setO=[...hdrO].sort().join(',');
  if(setN!==setO){ const extra=hdrN.filter(h=>!hdrO.includes(h)), missing=hdrO.filter(h=>!hdrN.includes(h));
    throw new Error('This file has '+(extra.length?'columns the loaded data lacks ('+extra.join(', ')+')':'fewer columns than the loaded data ('+missing.join(', ')+' missing)')+', so its days can\u2019t be added to it. Export the full history with the current query and choose \u201cReplace everything\u201d.'); }
  const q=v=>/[",]/.test(v)?'"'+String(v).replace(/"/g,'""')+'"':v, map=hdrN.map(h=>hdrO.indexOf(h));
  const oldRows=ol.slice(1).filter(l=>l.trim()&&!days.has((splitCsv(l)[doi]||'').slice(0,10))).map(l=>{ if(hdrO.join(',')===hdrN.join(',')) return l; const f=splitCsv(l); return map.map(i=>q(f[i]||'')).join(','); });
  return [nl[0]].concat(oldRows, nl.slice(1)).join('\n');
}

let toastT=null;
function toast(msg){ let el=document.querySelector('.toast'); if(!el){el=document.createElement('div'); el.className='toast'; el.setAttribute('role','status'); document.body.appendChild(el);} el.textContent=msg; el.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>el.hidden=true,2600); }

