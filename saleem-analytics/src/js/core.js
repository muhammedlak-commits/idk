/* ---------- storage (per-viewer conveniences only) ---------- */
function lsGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}

/* ---------- dates: integer day numbers in UTC ---------- */
const DAY=86400000;
const toN = s => Math.round(Date.UTC(+s.slice(0,4), +s.slice(5,7)-1, +s.slice(8,10))/DAY);
const toS = n => new Date(n*DAY).toISOString().slice(0,10);
const dow = n => new Date(n*DAY).getUTCDay();        // 0 Sun .. 5 Fri, 6 Sat
const monthKey = n => toS(n).slice(0,7);
const weekStart = n => n - ((dow(n)+1)%7);           // Iraqi week starts Saturday
const monthStart = n => toN(toS(n).slice(0,7)+'-01');
const daysInMonth = mk => new Date(Date.UTC(+mk.slice(0,4), +mk.slice(5,7), 0)).getUTCDate();
const addMonths = (mk,k)=>{const y=+mk.slice(0,4), m=+mk.slice(5,7)-1+k; const d=new Date(Date.UTC(y,m,1)); return d.toISOString().slice(0,7)};
const fmtD = n => new Date(n*DAY).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
const fmtDs = n => new Date(n*DAY).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
const fmtM = mk => new Date(Date.UTC(+mk.slice(0,4), +mk.slice(5,7)-1, 1)).toLocaleDateString('en-GB',{month:'short',year:'2-digit',timeZone:'UTC'});
const fmtInt = v => Math.round(v||0).toLocaleString('en-US');
const fmtUsd = v => '$'+(Math.abs(v)>=10000? Math.round(v).toLocaleString('en-US') : (v||0).toLocaleString('en-US',{maximumFractionDigits: v<100?2:0, minimumFractionDigits: v<100&&v>0?2:0}));
const fmtPct = (v,d=0) => v==null||!isFinite(v) ? '–' : (v>0?'+':'')+v.toFixed(d)+'%';
/* DoctorInfo.speciality comes as a code (Internist, GeneralSurgeon, EntOtolaryngologist): shown as words, with the odd spelling fixed */
const SPEC_NAME={entotolaryngologist:'ENT (otolaryngologist)',gyncologist:'Gynecologist',orthopedicdoctor:'Orthopedic doctor'};
const prettySpec = s => { if(!s) return s; const t=String(s).trim(), k=t.toLowerCase().replace(/[^a-z]/g,''); if(SPEC_NAME[k]) return SPEC_NAME[k];
  const w=t.replace(/_/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase(); return w.charAt(0).toUpperCase()+w.slice(1); };
const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function css(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim()}

/* ---------- services ---------- */
const SVC_LABEL = {physiotherapy:'Physiotherapy','physiotherapy (b2b)':'Physiotherapy B2B',nursing:'Nursing',doctorVisit:'Doctor visit',labTest:'Lab tests',xRay:'X-ray',ultrasound:'Ultrasound',woundCare:'Wound care',echocardiogram:'Echo',onlineConsultation:'Online consultation',doppler:'Doppler',productPurchase:'Product purchase',eyeExam:'Eye exam',psychiatristVisit:'Psychiatrist visit',ambulance:'Ambulance',surgeries:'Surgeries',booking:'Booking',b2b:'B2B (other)',radiology:'Imaging',vendor:'Products'};
const label = c => SVC_LABEL[c] || c.replace(/([A-Z])/g,' $1').replace(/^./,x=>x.toUpperCase());
const QUICK = {
  core:['physiotherapy','nursing','doctorVisit','labTest'],
  imaging:['xRay','ultrasound','echocardiogram','doppler','radiology'],
  b2b:['physiotherapy (b2b)','b2b'],
  nonclinical:['productPurchase','vendor','booking','b2b','physiotherapy (b2b)']
};
/* ad group -> service categories it promotes */
const GROUP_SVCS = {'Physiotherapy':['physiotherapy'],'Nursing':['nursing'],'Doctor visit':['doctorVisit'],'Lab tests':['labTest'],
  'Imaging':['xRay','ultrasound','echocardiogram','doppler','radiology'],'Wound care':['woundCare'],'Eye exam':['eyeExam'],'Surgery':['surgeries'],
  'Telemedicine':['onlineConsultation','psychiatristVisit'],'Ambulance':['ambulance'],'B2B':['physiotherapy (b2b)','b2b'],'Products':['productPurchase','vendor']};
const SHARED_GROUPS = ['All services (general)','Brand & awareness','App','International referral','Recruitment'];

