/* ---------- file loading ---------- */
function wireFiles(){
  const inp=document.getElementById('fileInput');
  document.getElementById('loadBtn').addEventListener('click',()=>inp.click());
  inp.addEventListener('change',async()=>{
    for(const f of inp.files){ const text=await f.text(); const hdr=text.slice(0,300).split(/\r?\n/)[0];
      try{
        if(/unique_patients/.test(hdr)){ P.uniquePatients=text; lsSet('spl.uniquePatients',text); }
        else if(/service_category/.test(hdr)){ P.services=mergeServices(P.services,text); lsSet('spl.services',P.services); }
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
  const days=new Set(); const nl=newText.trim().split(/\r?\n/); const hdrN=nl[0].split(','); const di=hdrN.indexOf('day');
  nl.slice(1).forEach(l=>days.add(l.split(',')[di].slice(0,10)));
  const ol=oldText.trim().split(/\r?\n/); const hdrO=ol[0].split(','); const doi=hdrO.indexOf('day');
  if(hdrO.join(',')!==hdrN.join(',')) return newText;
  return [ol[0]].concat(ol.slice(1).filter(l=>!days.has(l.split(',')[doi].slice(0,10))), nl.slice(1)).join('\n');
}

let toastT=null;
function toast(msg){ let el=document.querySelector('.toast'); if(!el){el=document.createElement('div'); el.className='toast'; el.setAttribute('role','status'); document.body.appendChild(el);} el.textContent=msg; el.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>el.hidden=true,2600); }

