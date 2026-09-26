(function (root) {
  'use strict';
  const defaults = { country: 'United States', currency: 'USD', timezone: 'America/Los_Angeles', shiftStart: '09:00', dailyHours: 8, grace: 10, annualDays: 20 };
  function dateKey(value, timezone) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
    const get = type => parts.find(p => p.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  function days(start, end) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end || start.slice(0, 4) !== end.slice(0, 4)) throw Error('Choose dates in the same year, with end on or after start.');
    let total = 0;
    const a = new Date(start + 'T12:00:00Z'), b = new Date(end + 'T12:00:00Z');
    if (!Number.isFinite(+a) || !Number.isFinite(+b) || a.toISOString().slice(0,10) !== start || b.toISOString().slice(0,10) !== end) throw Error('Invalid date.');
    for (; a <= b; a.setUTCDate(a.getUTCDate() + 1)) if (![0, 6].includes(a.getUTCDay())) total++;
    return total;
  }
  function money(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 100000000) throw Error('Amounts must be between 0 and 100,000,000.');
    return Math.round(n * 100) / 100;
  }
  function payroll(base, allowance, overtimeHours, overtimeRate, deductions) {
    const overtime = money(money(overtimeHours) * money(overtimeRate));
    const gross = money(money(base) + money(allowance) + overtime);
    const net = Math.round((gross - money(deductions)) * 100) / 100;
    if (net < 0) throw Error('Deductions cannot exceed gross pay.');
    return { base: money(base), allowance: money(allowance), overtimeHours: money(overtimeHours), overtimeRate: money(overtimeRate), overtime, deductions: money(deductions), gross, net };
  }
  function attendance(events, policy) {
    const groups = new Map();
    const seen = new Set();
    [...events].sort((a,b) => Date.parse(a.at) - Date.parse(b.at)).forEach(e => {
      if (seen.has(e._id)) return;
      seen.add(e._id);
      const day = dateKey(e.at, policy.timezone), key = e.staffId + ':' + day;
      if (!groups.has(key)) groups.set(key, { staffId: e.staffId, day, hours: 0, late: 0, exceptions: [], first: '', last: '', open: null });
      const g = groups.get(key);
      if (e.direction === 'in') {
        if (g.open) g.exceptions.push('Repeated check-in');
        else g.open = e.at;
        if (!g.first) {
          g.first = e.at;
          const p = new Intl.DateTimeFormat('en-GB', { timeZone: policy.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(e.at));
          const m = Number(p.find(x=>x.type==='hour').value)*60 + Number(p.find(x=>x.type==='minute').value);
          const [h, min] = policy.shiftStart.split(':').map(Number);
          g.late = Math.max(0, m - h*60 - min - Number(policy.grace));
        }
      } else {
        g.last = e.at;
        if (!g.open) g.exceptions.push('Unpaired check-out');
        else { g.hours += (Date.parse(e.at) - Date.parse(g.open))/3600000; g.open = null; }
      }
    });
    return [...groups.values()].map(g => ({ ...g, hours: Math.round(g.hours*100)/100, overtime: Math.round(Math.max(0,g.hours-Number(policy.dailyHours))*100)/100, exceptions: g.open ? [...g.exceptions, 'Missing check-out'] : g.exceptions }));
  }
  function validateLeave(candidate, records, entitlement) {
    const count = days(candidate.start, candidate.end);
    if (!count) throw Error('The selected dates contain no weekdays.');
    const same = records.filter(r => r._id !== candidate._id && r.staffId === candidate.staffId && ['Pending', 'Approved'].includes(r.status));
    if (same.some(r => r.start <= candidate.end && r.end >= candidate.start)) throw Error('This employee already has leave in that date range.');
    const used = same.filter(r => r.type === 'Annual' && r.start.slice(0,4) === candidate.start.slice(0,4)).reduce((s,r) => s+days(r.start,r.end),0);
    if (candidate.type === 'Annual' && used+count > Number(entitlement)) throw Error('Annual entitlement exceeded (pending requests reserve days).');
    return count;
  }
  const api = { defaults, dateKey, days, money, payroll, attendance, validateLeave };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FMSWorkforceCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
