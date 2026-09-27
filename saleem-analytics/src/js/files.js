/* ---------- file loading ---------- */
function wireFiles(){
  const inp=document.getElementById('fileInput');
  document.getElementById('loadBtn').addEventListener('click',()=>inp.click());
  inp.addEventListener('change',async()=>{
    for(const f of inp.files){ const text=await f.text(); const hdr=headerLine(text);
      try{
        if(DROPS.providers.check(hdr)){ DROPS.providers.apply(text,f.name); }
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
  if(hdrO.join(',')!==hdrN.join(',')) return newText;   // different columns: can't merge safely, so the new file is used on its own
  return [ol[0]].concat(ol.slice(1).filter(l=>!days.has((splitCsv(l)[doi]||'').slice(0,10))), nl.slice(1)).join('\n');
}

let toastT=null;
function toast(msg){ let el=document.querySelector('.toast'); if(!el){el=document.createElement('div'); el.className='toast'; el.setAttribute('role','status'); document.body.appendChild(el);} el.textContent=msg; el.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>el.hidden=true,2600); }

