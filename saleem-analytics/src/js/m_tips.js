/* ---------- column header explanations ----------
   Every table header gets a short explanation on hover (and on focus/tap), from one glossary:
   a table-specific entry ("tableId|Header") wins over a general one ("Header"); a header with its own title
   keeps that when the glossary has nothing; "A" after "X B" explains period A of X. A MutationObserver applies
   it to tables as they are drawn, so new tables get it without extra code. */
const TIP_MEASURE={'Orders':'Distinct orders in the period (an order with two services counts once for each service). Follows the measure picked in the filter bar.',
  'Services delivered':'Service lines delivered in the period.','Patient-days':'Distinct patients per service per day, added up (not unique patients).',
  'Sales (IQD)':'The services’ final prices in the period, in IQD.','Company revenue (IQD)':'Sales minus every provider’s revenue share, in IQD.'};
const TIPS={
  // general
  'Service':'The service category, as in the orders export.','Services':'The services it involves.','Provider':'The doctor, nurse or physiotherapist.','Doctor':'The doctor on the visit.',
  'Specialty':'The doctor’s specialty, from DoctorInfo. Empty for nurses and physiotherapists.','Type':'What kind of row this is.','Category':'The group it belongs to.',
  'Share':'This row’s part of the total for the selection.','Change':'The difference between this period and the one it is compared with.','Change %':'The change as a percentage of the earlier period.',
  'Verdict':'Whether the result is likely real. Strong: passes a strict bar that allows for many tests at once. Possible / worth checking: passes the usual bar or a milder correction. Blank: could be chance.',
  'vs last year':'Change against the same dates a year earlier (lined up as set under More settings).','vs LY':'Change against the same dates a year earlier.',
  'Previous period':'The same number of days just before the period.','Cancel rate':'Cancelled orders as a share of all orders, including cancelled ones.',
  'Month':'The calendar month.','Date':'The day it happened.','Dates':'The days it covers.','Source':'Where the information comes from.','Weeks':'Full Saturday-to-Friday weeks used.',
  'Total':'All of it added up.','Average':'The average over the years or rows shown.','Correlation':'How closely the week-to-week changes move together: 1 = always together, 0 = unrelated, negative = opposite.',
  'Lag':'How many weeks later the second series is compared.','Then':'The service that may follow.','Their service':'The service the provider delivers.',
  'Patients':'Patients counted in this row.','First service':'The service of the patient’s first-ever real visit.','Competitor':'The competitor, from the Competitors tab of the outside-factors sheet.','New patients':'Patients whose first-ever real visit falls in this row.',
  // Performance: service table
  'svcTable|vs prev period':'Change against the same number of days just before the period.',
  'svcTable|vs usual move':'This period’s change against the period before, minus the usual change for the same weeks in past years (Hijri-aligned, weekdays and holidays taken out), in points. Below: the two moves as percentages.',
  'svcTable|Ad spend (matching ads)':'Meta spend on ads matched to this service, split by order share when an ad group covers several services.',
  'svcTable|Ad cost / order (matching ads)':'Matching ad spend ÷ orders.','svcTable|Share':'This service’s part of the total for the selected services.',
  // month table
  'momTable|Service':'The service, or All selected. Each month column follows the mode picked above the table.',
  // weekday
  'wdTable|Weekday':'Saturday to Friday, the Iraqi week.','wdTable|Days counted':'How many of that weekday are in the period (holiday days left out unless included).',
  'wdTable|Share of the week':'How much of an average week that weekday carries.','wdTable|vs before':'Change in that weekday’s average day against the same number of weeks just before.',
  'wdTable|Same move last year':'The same change a year earlier. If both say −5%, nothing unusual happened to that weekday.','wdTable|Gap':'vs before minus the same move last year, in points.',
  'wdGrid|Week of':'The Saturday each week starts on.','wdGrid|Week':'That week’s total.',
  // Plan
  'pjFactors|Factor':'A part of the projection model.','pjFactors|What it measured':'What the data showed for this factor.','pjFactors|Effect on the next 90 days':'How much this factor moves the next 90 days’ projection.',
  'pjAcc|As if it were':'The day the projection was made from, using only the data before it.','pjAcc|Projected next 28 days':'What the model would have projected then.','pjAcc|Actual':'What really happened in those 28 days.','pjAcc|Error':'Projected minus actual, as a % of actual.',
  // Calendar
  'holTable|Holiday':'The holiday or official day off.','holTable|Average':'Its average effect over the years measured: how far orders sat above or below the same weekdays in the four weeks around it.',
  'fxTable|Average effect':'How far orders moved on average during this kind of event, against the same weekdays around it.','fxTable|Events measured':'How many events of this kind had enough data around them.',
  'fxEvents|Effect':'How far orders sat above or below the same weekdays in the four weeks around this event.','fxEvents|Event':'The outside event from the sheet.',
  'cmpTable|After vs usual':'Orders in the weeks after this milestone against the usual level before it.','cmpTable|Milestone':'What the competitor did.','cmpSummary|Kinds':'The kinds of milestones logged.','cmpSummary|Latest':'The most recent milestone.','cmpSummary|Milestones':'How many are logged.',
  // Ads
  'campTable|Spend':'Meta spend in the period, USD.','campTable|Results':'Meta’s result count (messages, installs or purchases, by objective).','campTable|Cost / result':'Spend ÷ results.','campTable|Result type':'What Meta counts as a result for this ad.','campTable|Impressions':'Times the ad was shown.','campTable|Clicks':'Clicks on the ad.','campTable|Matched by':'How the ad was tied to a service: its name, or its ad group.','campTable|Ad set':'The Meta ad set.','campTable|Ad':'The Meta ad.','campTable|Campaign':'The Meta campaign.',
  'alLagTable|Needs (5% / 1%)':'How strong the correlation must be to pass the usual 5% bar and the stricter 1% bar, allowing for week-to-week swings.','alAds|Spend in those weeks':'Spend in the weeks where the ad effect showed up.',
  // Providers
  'pvTable|Orders':'Orders the provider had in the period.','pvTable|Share of service':'Their part of all orders for that service.','pvTable|Previous period':'Their orders in the same number of days just before.',
  'spTable|Orders':'Orders by doctors of this specialty in the period.','spTable|Share':'Its part of all doctor orders.',
  'gwSvcTable|Back in 30 days':'Came back for another order within 30 days of the first visit (only patients whose 30 days have passed).','gwSvcTable|Back in 90 days':'Came back within 90 days.','gwSvcTable|Back in 180 days':'Came back within 180 days.','gwSvcTable|Orders each, 90 days':'Further orders per patient within 90 days.','gwSvcTable|First service':'The service of the patient’s first-ever real visit.',
  'gnTable|Gateway provider':'The provider on the new patient’s first visit.','gnTable|First service':'The service of that first visit.','gnTable|Patients':'New patients whose window has passed.','gnTable|Any service':'Share who ordered any other service within the window.',
  // Service links
  'pdTable|Driver':'A specialty or provider whose weekly volume is tested.','pdTable|Service it may move':'The service tested against it.','pdTable|Best lag':'The weeks-later offset with the strongest link.','pdTable|Type':'Specialty or provider.',
  'pfTable|Patients seen':'Patients the provider saw in the months in range (whose window has passed).','pfTable|Within 7 days':'Share who had the next service within 7 days.','pfTable|Within 30 days':'Share who had it within 30 days.','pfTable|Orders per 100 patients':'Orders of the next service per 100 patients seen.',
  'bwTable|Busy weeks':'Weeks when the provider took an unusually large share of their service (their own top 20%).','bwTable|Growth after busy weeks':'How much the other service grew in the weeks after a busy week.','bwTable|After other weeks':'Its growth after the provider’s other weeks.','bwTable|Difference':'Busy weeks minus other weeks.','bwTable|Over':'How many weeks after are counted.',
  'lkFollowTable|Patients with first service':'Patients who had the first service in the months in range.','lkFollowTable|Within 7 days':'Share who had the second service within 7 days.','lkFollowTable|Within 30 days':'Share who had it within 30 days.','lkFollowTable|First service':'The service that may lead.',
  // compare two periods: cases or doctors
  'Cases B':'Patients seen a day under From (e.g. doctor-visit patients) in period B, the earlier period. From the daily provider export.',
  'Mix B':'This row’s share of all From cases in period B.','Went on B':'Patients who had a To service (e.g. a lab test) within the window, out of the patients whose window has passed, in period B.',
  'Sent on B':'Went on as a share: how often this row’s patients go on to the To service in period B. * = under 10 patients, so the overall share is used.',
  'Cases effect':'To patients a day gained or lost because this row saw more or fewer patients, at its period-B share: (Cases A − Cases B) × Sent on B.',
  'Doctors effect':'To patients a day gained or lost because this row sent a different share on: Cases A × (Sent on A − Sent on B).',
  'Patients seen B':'Patients seen in period B (whose window has passed), a month on average.','Went on':'Patients who went on to the To service.',
  'Volume':'The part of the change from seeing more or fewer patients, at the earlier share.','Rate':'The part of the change from a different share of patients going on.',
  'Change a day':'The difference per day between period A and period B.','Share of the change':'This row’s part of the total change.',
  // unique patients
  'upTable|Unique patients':'Each patient counted once in the month.','upTable|New':'Patients new that month (first order, or record created, as set under More settings).','upTable|Returning':'Patients served that month who were new earlier.','upTable|New share':'New ÷ unique patients.','upTable|MoM':'Change against the month before.','upTable|YoY':'Change against the same month a year earlier.',
};
const MONTH_RE=/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec) \d{2}/, DAY_RE=/^\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)$/, WD={Sat:'Saturday',Sun:'Sunday',Mon:'Monday',Tue:'Tuesday',Wed:'Wednesday',Thu:'Thursday',Fri:'Friday'};
function tipFor(th,prevKey){
  const tbl=th.closest('table'), id=tbl&&tbl.id||'', raw=th.textContent.replace(/[↑↓]/g,'').replace(/\s+/g,' ').trim();
  if(!raw) return null;
  // "A" right after "X B": period A of the same thing
  if(raw==='A'&&prevKey&&/ B$/.test(prevKey)){ const base=TIPS[id+'|'+prevKey]||TIPS[prevKey]; return base? base.replace(/period B, the earlier period|period B/g,'period A, the later period').replace(/\bB\b/g,'A') : 'The same as the column before, for period A (the later period).'; }
  const t=TIPS[id+'|'+raw]||TIPS[raw]||TIP_MEASURE[raw]||TIP_MEASURE[raw.replace(/ per day$/,'')]&&TIP_MEASURE[raw.replace(/ per day$/,'')].replace('in the period','per day');
  if(t) return t;
  if(id==='momTable'&&MONTH_RE.test(raw)) return 'This month’s value in the mode picked above the table. * = month not finished; R Nd = days of Ramadan in the month.';
  if(id==='wdGrid'&&WD[raw]) return WD[raw]+': that day’s value each week. Darker = busier.';
  if(id==='wdGrid'&&DAY_RE.test(raw)) return 'The week starting that Saturday.';
  if(id==='holTable'&&/^\d{4}$/.test(raw)) return 'The holiday’s effect in '+raw+': above or below the same weekdays around it.';
  if(id==='gnTable') return 'Share of the gateway’s new patients who ordered '+raw.toLowerCase()+' within the window. Green / orange: above / below the other gateways with the same first service.';
  if(id==='lkMatrixTable') return 'Correlation of week-to-week changes with '+raw+' in the same week.';
  if(id==='upTable') return raw+': unique and new patients that month.';
  return null;
}
function applyTips(root){
  (root||document).querySelectorAll('table:not(.coltable):not(.sampletable) thead').forEach(thead=>{
    let prev=null;
    thead.querySelectorAll('th').forEach(th=>{
      const raw=th.textContent.replace(/[↑↓]/g,'').replace(/\s+/g,' ').trim();
      const tbl=th.closest('table'), specific=TIPS[(tbl&&tbl.id||'')+'|'+raw], own=th.getAttribute('title');
      // a table-specific glossary entry, else the header's own explanation, else the general glossary
      const tip=specific||own||th.dataset.tip||tipFor(th,prev);
      if(tip&&th.dataset.tip!==tip){ th.dataset.tip=tip; th.classList.add('hastip'); th.setAttribute('aria-description',tip); }
      if(own) th.removeAttribute('title');   // the custom tooltip replaces the slow native one
      if(raw) prev=raw;
    });
  });
}
function wireTips(){
  const box=document.createElement('div'); box.className='tipbox'; box.setAttribute('role','tooltip'); box.hidden=true; document.body.appendChild(box);
  let cur=null;
  const show=el=>{ cur=el; box.textContent=el.dataset.tip; box.hidden=false; const r=el.getBoundingClientRect(), w=Math.min(320,window.innerWidth-16);
    box.style.maxWidth=w+'px'; const bw=box.offsetWidth, bh=box.offsetHeight; let x=Math.min(Math.max(8,r.left+r.width/2-bw/2),window.innerWidth-bw-8), y=r.bottom+6; if(y+bh>window.innerHeight-8) y=r.top-bh-6;
    box.style.left=x+'px'; box.style.top=y+'px'; };
  const hide=()=>{ cur=null; box.hidden=true; };
  document.addEventListener('mouseover',e=>{ const th=e.target.closest&&e.target.closest('th.hastip'); if(th) show(th); else if(cur) hide(); });
  document.addEventListener('scroll',hide,{passive:true,capture:true});
  // touch: a long press shows it (a tap still sorts)
  let tt=null; document.addEventListener('touchstart',e=>{ const th=e.target.closest&&e.target.closest('th.hastip'); clearTimeout(tt); if(th) tt=setTimeout(()=>show(th),450); else hide(); },{passive:true});
  document.addEventListener('touchend',()=>clearTimeout(tt),{passive:true});
  let pend=false; new MutationObserver(()=>{ if(pend) return; pend=true; requestAnimationFrame(()=>{ pend=false; applyTips(); }); }).observe(document.body,{childList:true,subtree:true});
  applyTips();
}
