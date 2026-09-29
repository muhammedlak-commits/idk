/* ---------- file loading ---------- */
function wireFiles(){
  const inp=document.getElementById('fileInput');
  document.getElementById('loadBtn').addEventListener('click',()=>inp.click());
  inp.addEventListener('change',async()=>{
    for(const f of inp.files){ const text=await f.text(); const hdr=headerLine(text);
      try{
        if(DROPS.gwnext.check(hdr)){ DROPS.gwnext.apply(text,f.name); }
        else if(DROPS.gateway.check(hdr)){ DROPS.gateway.apply(text,f.name); }
        else if(DROPS.pfollow.check(hdr)){ DROPS.pfollow.apply(text,f.name); }
        else if(DROPS.providers.check(hdr)){ DROPS.providers.apply(text,f.name); }
        else if(DROPS.links.check(hdr)){ DROPS.links.apply(text,f.name); }
        else if(DROPS.patients.check(hdr)){ DROPS.patients.apply(text,f.name); }
        else if(DROPS.orders.check(hdr)){ DROPS.orders.note=''; DROPS.orders.apply(text,f.name); if(DROPS.orders.note){ toast('Loaded '+f.name+'.'+DROPS.orders.note); continue; } }
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
/* newer file wins for any day it contains. Returns {text, replaced}: an export from a newer query (extra columns)
   that covers every loaded day replaces the loaded data outright, since older rows can't be given the new columns. */
function mergeServices(oldText,newText){
  const days=new Set(); const nl=newText.trim().split(/\r?\n/); const hdrN=splitCsv(nl[0]).map(normHdr); const di=hdrN.indexOf('day');
  nl.slice(1).forEach(l=>{ const d=(splitCsv(l)[di]||'').slice(0,10); if(d) days.add(d); });
  const ol=oldText.trim().split(/\r?\n/); const hdrO=splitCsv(ol[0]).map(normHdr); const doi=hdrO.indexOf('day');
  // same columns in any order: old rows are rewritten in the new file's column order
  const setN=[...hdrN].sort().join(','), setO=[...hdrO].sort().join(',');
  if(setN!==setO){ const extra=hdrN.filter(h=>!hdrO.includes(h)), missing=hdrO.filter(h=>!hdrN.includes(h));
    if(missing.length) throw new Error('This file is from an older version of the query ('+missing.join(', ')+' missing), so its days can\u2019t be added to the loaded data. Copy the SQL again from this box, run it, and load that file.');
    const first=a=>a.reduce((m,d)=>!m||d<m?d:m,'');
    const newMin=first([...days]), oldMin=first(ol.slice(1).map(l=>(splitCsv(l)[doi]||'').slice(0,10)).filter(Boolean));
    if(newMin&&(!oldMin||newMin<=oldMin)) return {text:newText, replaced:true};
    throw new Error('This file has columns the loaded data lacks ('+extra.join(', ')+') but starts on '+newMin+', after the loaded data (from '+oldMin+'). Export the full history with the current query (no date filter) and load it again, and it will replace the loaded data.'); }
  const q=v=>/[",]/.test(v)?'"'+String(v).replace(/"/g,'""')+'"':v, map=hdrN.map(h=>hdrO.indexOf(h));
  const oldRows=ol.slice(1).filter(l=>l.trim()&&!days.has((splitCsv(l)[doi]||'').slice(0,10))).map(l=>{ if(hdrO.join(',')===hdrN.join(',')) return l; const f=splitCsv(l); return map.map(i=>q(f[i]||'')).join(','); });
  return {text:[nl[0]].concat(oldRows, nl.slice(1)).join('\n'), replaced:false};
}

let toastT=null;
function toast(msg){ let el=document.querySelector('.toast'); if(!el){el=document.createElement('div'); el.className='toast'; el.setAttribute('role','status'); document.body.appendChild(el);} el.textContent=msg; el.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>el.hidden=true,2600); }

