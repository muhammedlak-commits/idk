/* ---------- saved uploads (kept with the dashboard on claude.ai) ----------
   Each uploaded export is stored as a CSV asset of this artifact, and a db document saved/<P key> points at it:
   {asset, name, at, bytes, base}. On open the page loads every saved file over the built-in data, so uploads
   survive new versions of the page and open on any device. `base` fingerprints the built-in data at save time:
   when a later version of the page ships different built-in data for that export, the built-in data wins and the
   saved copy is left alone (it is still listed in the Data tab). Only people who can edit the dashboard save;
   everyone who can open it reads. Browser storage stays as the fallback when the page runs outside claude.ai. */
const CLOUD_KEYS=['services','servicesBooked','uniquePatients','followon','providers','gateway','gatewayNext','provFollowon','adsDaily','adsMonthly','map'];
const CLOUD_META={services:'orders',servicesBooked:'ordersBooked',uniquePatients:'patients',followon:'links',providers:'providers',gateway:'gateway',gatewayNext:'gwnext',provFollowon:'pfollow'};
const cloudSnap=()=>Object.fromEntries(CLOUD_KEYS.map(k=>[k,P[k]||'']));
const BUILT_IN=cloudSnap();   // before browser storage or saved files replace anything
const cloud={db:null,assets:null,state:'off',docs:{},msg:''};
function fnv(s){ let h=0x811c9dc5; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,0x01000193); } return (h>>>0).toString(16)+':'+s.length; }
const BUILT_FP=Object.fromEntries(CLOUD_KEYS.map(k=>[k,fnv(BUILT_IN[k])]));
const cloudErr=e=>(e&&e.code)||'error';

async function cloudInit(){
  if(!(window.claude&&window.claude.use)) return;
  let db=null, assets=null;
  try{ [db,assets]=await Promise.all([window.claude.use('db'),window.claude.use('assets')]); }catch(e){}
  cloud.db=db; cloud.assets=assets;
  if(!db){ cloud.state='off'; if(st.mod==='data') renderData(); return; }
  cloud.state='loading'; if(st.mod==='data') renderData();
  let changed=false;
  try{
    const snap=await db.collection('saved').get();
    for(const d of snap.docs){ const v={...(d.data()||{})}; if(!CLOUD_KEYS.includes(d.id)||!v.asset) continue; cloud.docs[d.id]=v;
      if(v.base&&v.base!==BUILT_FP[d.id]){ v.superseded=true; continue; }   // this version of the page carries newer built-in data
      try{ const r=await fetch('/_blob/'+v.asset); if(!r.ok){ v.missing=true; continue; }
        const text=await r.text(); if(P[d.id]!==text){ P[d.id]=text; changed=true; }
        if(CLOUD_META[d.id]) setDataMeta(CLOUD_META[d.id],{name:v.name,at:v.at,cloud:true});
      }catch(e){ v.missing=true; } }
    cloud.state='ready';
  }catch(e){ cloud.state='error'; cloud.msg=cloudErr(e); }
  if(changed){ boot(true); try{ if(Object.keys(sheetFeed.tabs).length) applySheetData(); }catch(e){} }
  else if(st.mod==='data') renderData();
}
/* after a load or a reset: save what changed, forget what went back to the built-in data */
async function cloudSaveChanged(before,name){
  const keys=CLOUD_KEYS.filter(k=>(P[k]||'')!==before[k]); if(!keys.length) return {saved:0,forgot:0};
  if(!cloud.db||!cloud.assets) return {saved:0,forgot:0,off:true};
  let saved=0, forgot=0, err=null;
  for(const k of keys){
    try{
      if((P[k]||'')===BUILT_IN[k]){ if(await cloudForget(k)) forgot++; continue; }
      const r=await cloud.assets.upload(new Blob([P[k]],{type:'text/csv'}),{type:'text/csv'});
      const old=cloud.docs[k], doc={asset:r.id,name:name||'Uploaded file',at:Date.now(),bytes:r.sizeBytes,base:BUILT_FP[k]};
      await cloud.db.doc('saved/'+k).set(doc); cloud.docs[k]=doc; saved++;
      if(old&&old.asset&&old.asset!==r.id) cloud.assets.delete(old.asset).catch(()=>{});   // the file it replaces
    }catch(e){ err=cloudErr(e); }
  }
  if(st.mod==='data') renderData();
  return {saved,forgot,err};
}
async function cloudForget(k){
  const old=cloud.docs[k]; if(!old) return false;
  await cloud.db.doc('saved/'+k).delete(); delete cloud.docs[k];
  if(old.asset&&cloud.assets) cloud.assets.delete(old.asset).catch(()=>{});
  return true;
}
/* a line for the Data tab and each export's box */
function cloudLine(){
  if(cloud.state==='off') return window.claude? 'Files you load are kept in this browser only. Saving to the dashboard works when you can edit it in claude.ai.' : 'Files you load are kept in this browser only.';
  if(cloud.state==='loading') return 'Loading your saved files…';
  if(cloud.state==='error') return 'Saved files couldn’t be read ('+cloud.msg+'); showing the data built into this page.';
  const n=Object.keys(cloud.docs).length;
  return (cloud.assets? 'Files you load are saved to this dashboard, so they open on any device and stay through updates.' : 'You can view this dashboard but not save files to it; files you load stay in this browser.')+(n?' '+n+' saved file'+(n>1?'s':'')+' loaded.':'');
}
function cloudRow(k){
  const v=cloud.docs[k]; if(!v) return '';
  const when=new Date(v.at).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  return '<div><dt>Saved to dashboard</dt><dd>'+esc(v.name)+' <span class="note">('+when+(v.bytes?', '+(v.bytes/1048576).toFixed(1)+' MB':'')+')'+(v.superseded?' · not used: this version of the page has newer built-in data':'')+(v.missing?' · the file couldn’t be read':'')+'</span></dd></div>';
}
function cloudNote(r){
  if(!r||r.off) return ' Saved in this browser only.';
  if(r.err) return ' Couldn’t save it to the dashboard ('+r.err+'), so it is kept in this browser only.';
  return r.saved? ' Saved to the dashboard: it will load on any device.' : '';
}
