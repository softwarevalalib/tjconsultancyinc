(function () {
  'use strict';
  const C = FMSWorkforceCore, S = FMSWorkforceStore;
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const idOf = r => String(r._id ?? r.id);
  const staff = () => FMSDB.table('staff').filter(r => !['disabled','inactive','terminated'].includes(String(r.status).toLowerCase()));
  const name = id => FMSDB.table('staff').find(r=>idOf(r)===id)?.name || 'Former / unavailable employee';
  const policy = () => ({ ...C.defaults, ...S.rows('policy')[0] });
  const options = (items, selected) => items.map(([value,label])=>`<option value="${esc(value)}" ${String(value)===String(selected)?'selected':''}>${esc(label)}</option>`).join('');
  const staffSelect = () => `<label>Employee<select name="staffId" required><option value="">Select employee</option>${options(staff().map(r=>[idOf(r),r.name]))}</select></label>`;
  const input = (label,key,type='text',value='',extra='') => `<label>${esc(label)}<input name="${key}" type="${type}" value="${esc(value)}" ${extra} required></label>`;
  const select = (label,key,items,value) => `<label>${esc(label)}<select name="${key}">${options(items.map(x=>Array.isArray(x)?x:[x,x]),value)}</select></label>`;
  const amount = (label,key,value=0) => input(label,key,'number',value,'min="0" max="100000000" step="0.01"');
  const badge = s => `<span class="hr-badge ${esc(s)}">${esc(s)}</span>`;
  const table = (headers, rows) => `<div class="hr-table-wrap"><table class="hr-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('') : `<tr><td class="hr-empty" colspan="${headers.length}">No records yet.</td></tr>`}</tbody></table></div>`;
  const cards = items => `<div class="hr-cards">${items.map(([label,value])=>`<div class="hr-card"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>`;
  const header = (title, subtitle) => `<div class="hr-head"><div><h2>${title}</h2><p>${subtitle}</p></div><span class="hr-status ${S.live()?'live':''}">${esc(S.status())}</span></div><div class="hr-feedback" role="status" aria-live="polite"></div>`;
  const action = (label, act, id) => `<button type="button" data-hr-action="${act}" data-id="${esc(id)}">${label}</button>`;
  let filterDay = '', filterMonth = new Date().toISOString().slice(0,7), search = '';
  let selectedPayslip = null;
  function payslipMarkup(r) {
    const employee=FMSDB.table('staff').find(s=>idOf(s)===r.staffId) || {};
    const company=localStorage.getItem('fms_institution_name') || 'TJ Consultancy Inc';
    const location=localStorage.getItem('fms_institution_location') || '';
    const logo=localStorage.getItem('fms_logo_url') || '';
    const validLogo=/^(data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);|https?:\/\/)/i.test(logo);
    const date=v=>v && Number.isFinite(Date.parse(v)) ? new Date(v).toLocaleDateString() : 'Not recorded';
    return `<article class="hr-slip"><header class="hr-slip-brand">${validLogo?`<img class="hr-slip-logo" src="${esc(logo)}" alt="${esc(company)} logo">`:'<div class="hr-slip-mark" aria-label="Company monogram">TJ</div>'}<div><h2>${esc(company)}</h2>${location?`<p>${esc(location)}</p>`:''}<h3>Payslip · ${esc(r.period)}</h3></div></header><dl class="hr-slip-details">
      <div><dt>Employee</dt><dd>${esc(r.staffName)}</dd></div><div><dt>Employee ID</dt><dd>${esc(r.staffId)}</dd></div>
      <div><dt>Department</dt><dd>${esc(r.staffDept ?? employee.dept ?? 'Not recorded')}</dd></div><div><dt>Role</dt><dd>${esc(r.staffRole ?? employee.role ?? 'Not recorded')}</dd></div>
      <div><dt>Payroll reference</dt><dd>${esc(r._id)}</dd></div><div><dt>Status</dt><dd>${esc(r.status)}</dd></div>
      <div><dt>Pay period</dt><dd>${esc(r.period)}</dd></div><div><dt>Currency</dt><dd>${esc(r.currency)}</dd></div></dl>${table(['Description',`Amount (${esc(r.currency)})`],[
      ['Base salary',r.base.toFixed(2)],['Allowance',r.allowance.toFixed(2)],
      [`Overtime (${esc(r.overtimeHours)} hours × ${esc(r.overtimeRate)})`,r.overtime.toFixed(2)],
      ['Gross pay',r.gross.toFixed(2)],['Deductions',r.deductions.toFixed(2)],
      ['<strong>Net pay</strong>',`<strong>${r.net.toFixed(2)}</strong>`]
    ])}<div class="hr-slip-notes"><p><strong>Calculation / deduction notes:</strong> ${esc(r.notes || 'None recorded')}</p><p><strong>Approved by:</strong> ${esc(r.approvedBy || 'Not approved')}</p><p><strong>Payment reference:</strong> ${esc(r.paymentReference || 'Not recorded')}<br><strong>Payment date:</strong> ${esc(date(r.paidAt))}</p></div></article>`;
  }
  function renderPayslipPreview() {
    $('hr-payslip-preview')?.remove();
    const r=S.rows('payroll').find(r=>r._id===selectedPayslip && r.period===filterMonth);
    if(!r)return;
    const register=$('hr-month')?.closest('.hr-panel');
    register?.insertAdjacentHTML('beforeend',`<section id="hr-payslip-preview" class="hr-payslip-preview" aria-label="Payslip preview" tabindex="-1"><div class="hr-toolbar"><h3>Payslip preview</h3><button class="hr-btn" data-hr-action="print-slip" data-id="${esc(r._id)}">Print / Save as PDF</button><button class="hr-btn secondary" data-hr-action="close-slip">Close preview</button></div>${payslipMarkup(r)}</section>`);
  }
  function notify(message, error=false) {
    document.querySelectorAll('.hr-feedback').forEach(el=>{ el.className='hr-feedback hr-message'+(error?' hr-error':''); el.textContent=message; });
  }
  function render() {
    if (sessionStorage.getItem('fms_auth_role') !== 'admin') {
      ['salary','attendance','leave'].forEach(v=>{ document.querySelector(`[data-view="${v}"]`)?.closest('li')?.setAttribute('hidden',''); $('hr-'+v).textContent='Administrator access required.'; }); return;
    }
    const focused = document.activeElement;
    // Live updates never erase an in-progress form. Tables refresh after focus leaves it.
    if (focused?.closest('.hr-form')) { document.querySelectorAll('.hr-status').forEach(el=>el.textContent=S.status()); return; }
    const drafts = [...document.querySelectorAll('[data-hr-form]')].map(f=>[f.dataset.hrForm,Object.fromEntries(new FormData(f))]);
    const opened = [...document.querySelectorAll('.workforce details[open]')].map(d=>d.querySelector('summary').textContent);
    renderSalary(); renderAttendance(); renderLeave();
    drafts.forEach(([key,values])=>{const form=document.querySelector(`[data-hr-form="${key}"]`);if(form)Object.entries(values).forEach(([name,value])=>{if(form.elements[name])form.elements[name].value=value;});});
    document.querySelectorAll('.workforce details').forEach(d=>{d.open=opened.includes(d.querySelector('summary').textContent);});
  }
  function renderSalary() {
    const p = policy(), rows = S.rows('payroll').filter(r=>r.period===filterMonth), profiles = S.rows('compensation');
    const fmt = v => Number(v).toFixed(2);
    const totals = rows.reduce((a,r)=>{ a[r.currency]=(a[r.currency]||0)+r.net; return a; },{});
    $('hr-salary').innerHTML = header('Staff Salary','Monthly salary profiles, reviewed payroll and printable payslips.') +
      cards([['Active employees',staff().length],['Salary profiles',profiles.length],['Payroll entries',rows.length],['Paid entries',rows.filter(r=>r.status==='Paid').length]])+
      `<div class="hr-message">${esc(p.country)} · ${esc(p.currency)}. Payroll is prepared for review. Taxes, benefits and statutory deductions must be entered explicitly; attendance does not automatically reduce pay.</div>
      <details class="hr-panel"><summary>Salary profile</summary><form class="hr-form" data-hr-form="compensation">${staffSelect()}${amount('Monthly base salary','base')}${amount('Monthly allowance','allowance')}${amount('Overtime hourly rate','overtimeRate')}<button>Save salary profile</button></form>${table(['Employee','Base','Allowance','Overtime / hour'],profiles.map(r=>[esc(name(r.staffId)),esc(r.currency)+' '+fmt(r.base),fmt(r.allowance),fmt(r.overtimeRate)]))}</details>
      <div class="hr-panel"><h3>Prepare monthly payroll</h3><p class="hr-muted">Choose a saved salary profile. Enter reviewed overtime hours and total deductions. One payroll entry per employee per month; paid entries are locked.</p><form class="hr-form" data-hr-form="payroll">${staffSelect()}${input('Pay period','period','month',filterMonth)}${amount('Approved overtime hours','overtimeHours')}${amount('Total deductions','deductions')}${input('Calculation / deduction notes','notes','text','','maxlength="500"')}<button>Create draft payroll</button></form></div>
      <div class="hr-panel"><h3>Payroll register</h3><div class="hr-toolbar"><label>Pay period <input class="hr-filter" id="hr-month" type="month" value="${esc(filterMonth)}"></label><button class="hr-btn secondary" data-hr-action="export-payroll">Export CSV</button></div><p class="hr-muted">Net totals: ${esc(Object.entries(totals).map(([c,v])=>c+' '+fmt(v)).join(' · ') || 'No payroll for this period')}</p>${table(['Employee','Currency','Base','Allowance','Overtime','Deductions','Net','Status','Actions'],rows.map(r=>[esc(r.staffName),esc(r.currency),fmt(r.base),fmt(r.allowance),fmt(r.overtime),fmt(r.deductions),fmt(r.net),badge(r.status),action('Payslip','slip',r._id)+(r.status==='Draft'?action('Approve','approve-pay',r._id):r.status==='Approved'?action('Mark paid','pay',r._id):'')]))}</div>`;
    renderPayslipPreview();
  }
  function renderAttendance() {
    const p=policy(); if (!filterDay) filterDay=C.dateKey(Date.now(),p.timezone);
    const events=S.rows('event'), summary=C.attendance(events,p).filter(r=>r.day===filterDay && name(r.staffId).toLowerCase().includes(search.toLowerCase()));
    const time = at => at ? new Date(at).toLocaleTimeString([], {timeZone:p.timezone,hour:'2-digit',minute:'2-digit'}) : '—';
    const todayEvents=events.filter(e=>C.dateKey(e.at,p.timezone)===filterDay);
    const devices=S.rows('device'), maps=S.rows('mapping');
    $('hr-attendance').innerHTML=header('Attendance','Live punch records, attendance exceptions and biometric terminal mapping.')+
      cards([['Employees present',new Set(todayEvents.filter(e=>e.direction==='in').map(e=>e.staffId)).size],['Recorded punches',todayEvents.length],['Late arrivals',summary.filter(r=>r.late>0).length],['Exceptions',summary.filter(r=>r.exceptions.length).length]])+deviceSetup()+
      `<div class="hr-panel"><h3>Daily attendance</h3><div class="hr-toolbar"><label>Date <input class="hr-filter" type="date" id="hr-day" value="${esc(filterDay)}"></label><label>Employee <input class="hr-filter" id="hr-search" placeholder="Search employee" value="${esc(search)}"></label><button class="hr-btn secondary" data-hr-action="export-attendance">Export CSV</button></div><p class="hr-muted">${esc(p.timezone)} · shift ${esc(p.shiftStart)} · ${p.dailyHours} hours · ${p.grace} minute grace. Overnight and missing punches require review; unpaired time is never counted.</p>${table(['Employee','First in','Last out','Paired hours','Extra hours¹','Late minutes','Review'],summary.map(r=>[esc(name(r.staffId)),time(r.first),time(r.last),r.hours.toFixed(2),r.overtime.toFixed(2),r.late,esc(r.exceptions.join('; ')) || badge('Complete')]))}<p class="hr-muted">¹ Informational hours above the daily target, not statutory overtime. Payroll overtime requires approval.</p></div>
      <details class="hr-panel"><summary>Record manual attendance</summary><form class="hr-form" data-hr-form="event">${staffSelect()}${select('Punch','direction',['in','out'])}${input('Local date and time (this browser)','localTime','datetime-local')}${input('Reason for manual entry','reason','text','','maxlength="300"')}<button>Record punch</button></form></details>
      <details class="hr-panel"><summary>Biometric terminals & employee mapping</summary><p class="hr-muted">Reference: Hikvision DS-K1T343 series. A vendor adapter must translate terminal events into the FMS JSON contract. Registering a terminal does not connect it. No fingerprint or face templates are stored here.</p><form class="hr-form" data-hr-form="device">${input('Terminal name','name')}${input('Brand','brand','text','Hikvision')}${input('Model','model','text','DS-K1T343 series')}${input('Serial number','serial')}${select('Connection method','protocol',['ISAPI adapter','Vendor SDK adapter','JSON webhook adapter','CSV / manual only'])}<button>Register terminal</button></form>${table(['Terminal','Brand / model','Serial','Connection','Last received event','Actions'],devices.map(d=>{
        const last=events.filter(e=>e.deviceId===d._id).sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt))[0];
        return [esc(d.name),esc(d.brand+' / '+d.model),esc(d.serial),esc(d.protocol),last?esc(new Date(last.receivedAt).toLocaleString()):'No events received',action('Copy device ID','copy-device',d._id)+action(d.enabled===false?'Enable':'Disable','toggle-device',d._id)];
      }))}<form class="hr-form" data-hr-form="mapping">${select('Terminal','deviceId',devices.map(d=>[d._id,d.name]))}${input('Employee ID on terminal','deviceUserId')}${staffSelect()}<button>Save mapping</button></form>${table(['Terminal','Terminal employee ID','FMS employee'],maps.map(m=>[esc(devices.find(d=>d._id===m.deviceId)?.name || m.deviceId),esc(m.deviceUserId),esc(name(m.staffId))]))}<p class="hr-muted">Deploy the biometric-events function and configure server-side device credentials as described in WORKFORCE.md. Terminal enrollment remains in the vendor software.</p></details>
      <details class="hr-panel"><summary>Punch history & CSV import</summary><p class="hr-muted">CSV columns: staffId,at,direction,reason. Use an ISO timestamp including Z or a UTC offset. Import is manual, not a live terminal connection.</p><div class="hr-toolbar"><button class="hr-btn secondary" data-hr-action="csv-template">Download template</button><button class="hr-btn secondary" data-hr-action="staff-ids">Download employee IDs</button><label>Import attendance CSV <input id="hr-import" type="file" accept=".csv,text/csv"></label></div>${table(['Employee','Timestamp','Punch','Source','Reason'],[...todayEvents].sort((a,b)=>b.at.localeCompare(a.at)).slice(0,200).map(e=>[esc(name(e.staffId)),esc(new Date(e.at).toLocaleString([], {timeZone:p.timezone})),esc(e.direction),esc(e.source),esc(e.reason)]))}</details>`;
  }
  function deviceSetup() {
    const devices=S.rows('device'), maps=S.rows('mapping');
    const endpoint=String(window.FMS_SUPABASE_CONFIG?.url || '').replace(/\/$/,'');
    return `<details class="hr-panel" id="hr-device-setup"><summary>Device setup assistant · configure when your terminal arrives</summary>
      <div class="hr-message">Device integration is available in this system. You can prepare your terminal register and employee mappings now. Live collection starts after cloud setup and a compatible terminal adapter are configured.</div>
      ${table(['Setup step','Current state'],[
        ['1. Cloud workspace',esc(S.cloud() ? S.status() : 'Not configured — local preparation only')],
        ['2. Registered terminals',String(devices.length)],
        ['3. Employee mappings',String(maps.length)],
        ['4. Integration endpoint',endpoint ? esc(endpoint+'/functions/v1/biometric-events') : 'Available after cloud configuration'],
        ['5. Terminal delivery',S.rows('event').some(r=>r.source==='Biometric') ? 'Biometric events received — check each terminal below' : 'Awaiting first biometric event']
      ])}
      <p class="hr-muted">When the device arrives: register its actual brand, model and serial below, map its employee IDs, then download its setup file for your installer. The installer configures the adapter and a private device token on the server. Run the downloaded connection test before collecting attendance. The test does not create a punch.</p>
      <p class="hr-muted">Local preparation records are not automatically transferred to a cloud workspace. Download them for reference and register/map them again after cloud setup; then download fresh files containing the cloud device IDs.</p>
      ${table(['Terminal','Device status','Mappings','Installer files'],devices.map(d=>[esc(d.name),d.enabled===false?'Disabled':'Enabled for ingestion after setup',maps.filter(m=>m.deviceId===d._id).length,action('Download setup','device-setup',d._id)+action('Download connection test','device-test',d._id)]))}
      <div class="hr-toolbar"><a class="hr-btn secondary" href="WORKFORCE.md" target="_blank" rel="noopener">Full installation instructions</a></div>
      <p class="hr-muted">Installer files contain configuration references, not passwords. Device registration and a successful receiver test do not certify the terminal’s protocol or confirm a physical device connection.</p></details>`;
  }
  function renderLeave() {
    const p=policy(), rows=S.rows('leave'), year=C.dateKey(Date.now(),p.timezone).slice(0,4);
    const used=id=>rows.filter(r=>r.staffId===id && r.type==='Annual' && r.start.startsWith(year) && ['Approved','Pending'].includes(r.status)).reduce((n,r)=>n+r.days,0);
    $('hr-leave').innerHTML=header('Leave Management','Record requests, review approvals and track annual leave balances.')+
      cards([['Pending requests',rows.filter(r=>r.status==='Pending').length],['Approved requests',rows.filter(r=>r.status==='Approved').length],['Annual entitlement',p.annualDays+' days'],['Balance year',year]])+
      `<div class="hr-panel"><h3>New leave request</h3><p class="hr-muted">Monday–Friday calendar; public holidays are not excluded. Requests must stay within one calendar year. Pending annual leave reserves balance.</p><form class="hr-form" data-hr-form="leave">${staffSelect()}${select('Leave type','type',['Annual','Sick','Unpaid','Other'])}${input('Start date','start','date')}${input('End date','end','date')}${input('Reason','reason','text','','maxlength="500"')}<button>Submit request</button></form></div>
      <div class="hr-panel"><h3>Requests & decisions</h3><button class="hr-btn secondary" data-hr-action="export-leave">Export CSV</button>${table(['Employee','Type','Start','End','Days','Reason','Status','Reviewed by','Actions'],[...rows].sort((a,b)=>b.start.localeCompare(a.start)).map(r=>[esc(name(r.staffId)),esc(r.type),esc(r.start),esc(r.end),r.days,esc(r.reason),badge(r.status),esc(r.reviewedBy || '—'),(r.status==='Pending'?action('Approve','approve-leave',r._id)+action('Reject','reject-leave',r._id):'')+(['Pending','Approved'].includes(r.status)?action('Cancel','cancel-leave',r._id):'')]))}</div>
      <div class="hr-panel"><h3>Annual balances · ${year}</h3>${table(['Employee','Entitlement','Approved + pending','Available'],staff().map(r=>[esc(r.name),p.annualDays,used(idOf(r)),Math.max(0,p.annualDays-used(idOf(r)))]))}</div>
      <details class="hr-panel"><summary>Workforce policy</summary><p class="hr-muted">Editable starting defaults, not a jurisdiction-specific employment policy. Changing these values recalculates attendance summaries and leave balances, but preserves existing payroll amounts.</p><form class="hr-form" data-hr-form="policy">${input('Country','country','text',p.country)}${input('Currency (ISO code)','currency','text',p.currency,'pattern="[A-Z]{3}" maxlength="3"')}${input('IANA time zone','timezone','text',p.timezone)}${input('Shift start','shiftStart','time',p.shiftStart)}${input('Daily target hours','dailyHours','number',p.dailyHours,'min="1" max="24" step="0.25"')}${input('Grace minutes','grace','number',p.grace,'min="0" max="120"')}${input('Annual weekdays entitlement','annualDays','number',p.annualDays,'min="0" max="366"')}<button>Save policy</button></form></details>`;
  }
  async function submit(form) {
    const data=Object.fromEntries(new FormData(form)), kind=form.dataset.hrForm, p=policy();
    if (data.staffId && !staff().some(r=>idOf(r)===data.staffId)) throw Error('Choose an active employee.');
    if (kind==='compensation') {
      const old=S.rows(kind).find(r=>r.staffId===data.staffId);
      await S.save(kind,{...old,...data,base:C.money(data.base),allowance:C.money(data.allowance),overtimeRate:C.money(data.overtimeRate),currency:p.currency});
    } else if (kind==='payroll') {
      const profile=S.rows('compensation').find(r=>r.staffId===data.staffId);
      if (!profile) throw Error('Save this employee’s salary profile first.');
      if (S.rows(kind).some(r=>r.staffId===data.staffId && r.period===data.period)) throw Error('Payroll already exists for this employee and month.');
      if (!/^\d{4}-\d{2}$/.test(data.period)) throw Error('Choose a valid pay period.');
      await S.save(kind,{...data,...C.payroll(profile.base,profile.allowance,data.overtimeHours,profile.overtimeRate,data.deductions),currency:profile.currency,staffName:name(data.staffId),status:'Draft'});
      filterMonth=data.period;
    } else if (kind==='event') {
      const at=new Date(data.localTime).toISOString();
      if (Date.parse(at)>Date.now()+60000) throw Error('Attendance cannot be recorded in the future.');
      await S.save(kind,{staffId:data.staffId,at,direction:data.direction,reason:data.reason,source:'Manual',receivedAt:new Date().toISOString()});
    } else if (kind==='leave') {
      data.status='Pending'; data.days=C.validateLeave(data,S.rows('leave'),p.annualDays);
      await S.save(kind,data);
    } else if (kind==='device') {
      if (S.rows(kind).some(r=>r.serial===data.serial.trim())) throw Error('This serial number is already registered.');
      await S.save(kind,{...data,serial:data.serial.trim(),enabled:true});
    } else if (kind==='mapping') {
      if (!S.rows('device').some(r=>r._id===data.deviceId)) throw Error('Register a terminal first.');
      data.deviceUserId=data.deviceUserId.trim();
      if (!data.deviceUserId) throw Error('Enter the terminal employee ID.');
      const old=S.rows(kind).find(r=>r.deviceId===data.deviceId && r.deviceUserId===data.deviceUserId);
      await S.save(kind,{...old,...data});
    } else if (kind==='policy') {
      new Intl.DateTimeFormat('en',{timeZone:data.timezone}).format();
      new Intl.NumberFormat('en',{style:'currency',currency:data.currency}).format(0);
      ['dailyHours','grace','annualDays'].forEach(k=>data[k]=Number(data[k]));
      const year=C.dateKey(Date.now(),data.timezone).slice(0,4);
      const used={}; S.rows('leave').filter(r=>r.type==='Annual' && r.start.startsWith(year) && ['Pending','Approved'].includes(r.status)).forEach(r=>used[r.staffId]=(used[r.staffId]||0)+r.days);
      if (Object.values(used).some(n=>n>data.annualDays)) throw Error('Entitlement cannot be less than already reserved annual days.');
      await S.save(kind,{...S.rows(kind)[0],...data});
    }
  }
  function download(filename,content,type='text/csv;charset=utf-8') {
    const url=URL.createObjectURL(new Blob([content],{type})), a=document.createElement('a'); a.href=url; a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function csv(rows) {
    if (!rows.length) throw Error('No records to export.');
    const keys=Object.keys(rows[0]);
    const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
    return '\uFEFF'+[keys,...rows.map(r=>keys.map(k=>r[k]))].map(r=>r.map(cell).join(',')).join('\r\n');
  }
  function parseCSV(text) {
    const rows=[]; let row=[],value='',quoted=false;
    text=text.replace(/^\uFEFF/,'');
    for(let i=0;i<text.length;i++) {
      const c=text[i];
      if(c==='"') { if(quoted && text[i+1]==='"') {value+='"';i++;} else quoted=!quoted; }
      else if(c===',' && !quoted){row.push(value);value='';}
      else if((c==='\n'||c==='\r')&&!quoted){ if(c==='\r'&&text[i+1]==='\n')i++; row.push(value); if(row.some(Boolean))rows.push(row);row=[];value=''; }
      else value+=c;
    }
    if(quoted)throw Error('CSV has an unclosed quote.');
    row.push(value);if(row.some(Boolean))rows.push(row);return rows;
  }
  async function importCSV(file) {
    if(file.size>500000)throw Error('CSV must be smaller than 500 KB.');
    const rows=parseCSV(await file.text()), headers=rows.shift();
    if(headers?.join(',')!=='staffId,at,direction,reason')throw Error('Use the supplied CSV template columns.');
    if(!rows.length || rows.length>500)throw Error('Import between 1 and 500 rows.');
    const parsed=rows.map((r,i)=>{
      if(r.length!==4 || !staff().some(s=>idOf(s)===r[0]) || !['in','out'].includes(r[2]) || !r[3].trim() || !/(Z|[+-]\d{2}:\d{2})$/.test(r[1]) || !Number.isFinite(Date.parse(r[1])) || Date.parse(r[1])>Date.now()+60000)throw Error('Invalid CSV row '+(i+2)+'. Check employee ID, timestamp, direction and reason.');
      return {staffId:r[0],at:new Date(r[1]).toISOString(),direction:r[2],reason:r[3],source:'CSV',receivedAt:new Date().toISOString()};
    });
    let count=0, skipped=0;
    try { for(const r of parsed) {
      if(S.rows('event').some(e=>e.staffId===r.staffId && e.at===r.at && e.direction===r.direction)){skipped++;continue;}
      // Stable ID allows retry without inserting the same import twice.
      const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(r.staffId+'|'+r.at+'|'+r.direction));
      r._id='csv-'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
      await S.save('event',r);count++;
    }} catch(e){throw Error(`${count} rows imported before failure; retry is safe. ${e.message}`);}
    render();notify(`${count} imported; ${skipped} duplicate punches skipped.`);
  }
  async function actionClick(button) {
    const act=button.dataset.hrAction, id=button.dataset.id;
    if(act==='device-setup'||act==='device-test') {
      const device=S.rows('device').find(d=>d._id===id);
      if(!device)throw Error('Terminal no longer exists.');
      const configuredUrl=String(window.FMS_SUPABASE_CONFIG?.url || '').replace(/\/$/,'');
      const endpoint=(configuredUrl || 'https://YOUR-PROJECT.supabase.co')+'/functions/v1/biometric-events';
      if(act==='device-setup') {
        const setup={formatVersion:1,mode:S.cloud()?'cloud':'local-preparation-only',workspaceId:window.FMSCloud?.getProfile()?.workspace_id || 'SET_AFTER_CLOUD_SETUP',device:{id:device._id,name:device.name,brand:device.brand,model:device.model,serial:device.serial,protocol:device.protocol,enabled:device.enabled!==false},endpoint,timezone:policy().timezone,employeeMappings:S.rows('mapping').filter(m=>m.deviceId===id).map(m=>({deviceUserId:m.deviceUserId,staffId:m.staffId,employee:name(m.staffId)})),authentication:'Bearer device token: provision privately on adapter and server. Never put credentials in this file.',steps:['Apply the workforce database migration and deploy biometric-events.','For local preparation, recreate terminal and mappings in cloud and download fresh IDs.','Configure a compatible vendor adapter; terminal enrollment stays in vendor software.','Provision a unique device token and server-side SHA-256 allowlist entry.','Run the connection-test HTTP request with the private device token.','Send a real terminal punch and confirm it appears exactly once in Attendance.']};
        download('terminal-'+id+'-setup.json',JSON.stringify(setup,null,2),'application/json');
      } else {
        download('terminal-'+id+'-connection-test.http',`# Replace DEVICE-TOKEN privately in your HTTP client. Do not share a filled-in file.\n# Expected 200: receiver authenticated this enabled terminal. No punch is recorded.\n# 401: check token; 403: register/enable device; 404: deploy function; 5xx: check server setup.\nPOST ${endpoint}\nAuthorization: Bearer DEVICE-TOKEN\nContent-Type: application/json\n\n{"type":"connection-test"}\n`,'text/plain');
      }
      notify(S.cloud()?'Installer file downloaded.':'Preparation file downloaded. Replace local IDs after cloud setup.');return;
    }
    if(act==='copy-device'){await navigator.clipboard.writeText(id);notify('Device ID copied.');return;}
    if(act==='staff-ids'){download('employee-ids.csv',csv(staff().map(r=>({staffId:idOf(r),employee:r.name}))));return;}
    if(act==='csv-template'){download('attendance-template.csv','staffId,at,direction,reason\r\n');notify('Use Download employee IDs for staffId values; timestamps need Z or a UTC offset.');return;}
    if(act.startsWith('export-')) {
      const kind=act.slice(7);
      const rows=kind==='attendance'?C.attendance(S.rows('event'),policy()).filter(r=>r.day===filterDay).map(r=>({employee:name(r.staffId),date:r.day,hours:r.hours,extraHours:r.overtime,lateMinutes:r.late,exceptions:r.exceptions.join('; ')})):S.rows(kind==='payroll'?'payroll':'leave').filter(r=>kind!=='payroll'||r.period===filterMonth).map(({version,kind,_id,...r})=>r);
      download(kind+'.csv',csv(rows));return;
    }
    if(act==='toggle-device'){const r=S.rows('device').find(r=>r._id===id);await S.save('device',{...r,enabled:r.enabled===false});}
    else if(act==='slip') {
      selectedPayslip=id;renderPayslipPreview();
      $('hr-payslip-preview')?.focus();
      $('hr-payslip-preview')?.scrollIntoView({behavior:'smooth',block:'nearest'});return;
    } else if(act==='close-slip') {
      const previous=selectedPayslip;selectedPayslip=null;renderPayslipPreview();
      [...document.querySelectorAll('[data-hr-action="slip"]')].find(b=>b.dataset.id===previous)?.focus();return;
    } else if(act==='print-slip') {
      const r=S.rows('payroll').find(r=>r._id===id);
      if(!r)throw Error('This payroll record is no longer available.');
      let el=$('hr-print-area');if(!el){el=document.createElement('div');el.id='hr-print-area';el.hidden=true;document.body.append(el);}
      el.innerHTML=payslipMarkup(r);
      await Promise.all([...el.querySelectorAll('img')].map(img=>img.decode().catch(()=>{throw Error('The company logo could not load. Update the logo in Settings and try again.');})));
      if(document.fonts?.ready)await document.fonts.ready;
      document.body.classList.add('hr-print');
      try { window.print(); } finally { document.body.classList.remove('hr-print'); }
      return;
    } else if(act==='approve-pay'||act==='pay') {
      const r=S.rows('payroll').find(r=>r._id===id);
      if(act==='approve-pay' && r.status!=='Draft' || act==='pay' && r.status!=='Approved')throw Error('Payroll status has changed.');
      if(act==='pay') {const reference=prompt('Payment reference (records an external payment; no money is transferred):');if(!reference?.trim())return; await S.save('payroll',{...r,status:'Paid',paymentReference:reference.trim(),paidAt:new Date().toISOString()});}
      else await S.save('payroll',{...r,status:'Approved',approvedBy:sessionStorage.getItem('fms_auth_user')});
    } else if(act.endsWith('-leave')) {
      const r=S.rows('leave').find(r=>r._id===id), status={'approve-leave':'Approved','reject-leave':'Rejected','cancel-leave':'Cancelled'}[act];
      if(status==='Approved')C.validateLeave(r,S.rows('leave'),policy().annualDays);
      if(!confirm(`${status==='Approved'?'Approve':status==='Rejected'?'Reject':'Cancel'} leave for ${name(r.staffId)}?`))return;
      await S.save('leave',{...r,status,reviewedBy:sessionStorage.getItem('fms_auth_user'),reviewedAt:new Date().toISOString()});
    }
    render();notify('Saved.');
  }
  document.addEventListener('submit', async e=>{
    const form=e.target.closest('[data-hr-form]');if(!form)return;e.preventDefault();const button=form.querySelector('button');button.disabled=true;
    try{await submit(form);document.activeElement?.blur();form.reset();render();notify('Saved successfully.');}catch(err){notify(err.message,true);}finally{button.disabled=false;}
  });
  document.addEventListener('click',async e=>{const b=e.target.closest('[data-hr-action]');if(!b)return;b.disabled=true;try{await actionClick(b);}catch(err){notify(err.message,true);}finally{b.disabled=false;}});
  document.addEventListener('change',async e=>{
    if(e.target.id==='hr-day'){filterDay=e.target.value;renderAttendance();}
    if(e.target.id==='hr-month'){filterMonth=e.target.value;renderSalary();}
    if(e.target.id==='hr-search'){search=e.target.value;renderAttendance();}
    if(e.target.id==='hr-import' && e.target.files[0]){e.target.disabled=true;try{await importCSV(e.target.files[0]);}catch(err){notify(err.message,true);}finally{e.target.disabled=false;}}
  });
  document.addEventListener('fms:workforce-change',render);
  document.addEventListener('focusout', e=>{if(e.target.closest('.hr-form'))setTimeout(()=>{if(!document.activeElement?.closest('.hr-form'))render();},0);});
  document.addEventListener('fms:db-change',e=>{if(['staff','*'].includes(e.detail?.table))render();});
  document.addEventListener('DOMContentLoaded',()=>{render();S.init();});
})();
