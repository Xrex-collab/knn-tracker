export let TZ_OFFSET_HOURS = 3;

export function setTimezone(h) {
  TZ_OFFSET_HOURS = Number(h) || 3;
}

export function collegeNow(nowMs = Date.now()) {
  return new Date(nowMs + TZ_OFFSET_HOURS * 3600e3);
}

export function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

export function todayISO(nowMs = Date.now()) {
  return isoDate(collegeNow(nowMs));
}

export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}

export function lessonMs(dateIso, hhmm) {
  const [y, m, d] = dateIso.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) - TZ_OFFSET_HOURS * 3600e3;
}

export function dayTitle(iso) {
  const s = new Date(iso + 'T00:00:00Z').toLocaleDateString('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });
  return s[0].toUpperCase() + s.slice(1);
}

export function groupList(schedule) {
  const fromGroups = Object.keys(schedule.groups || {});
  if (fromGroups.length) return fromGroups.sort((a, b) => a.localeCompare(b, 'ru'));
  return schedule.group ? [schedule.group] : [];
}

// "3426", "3426-А", "3426a" -> "3426А"
export function normGroup(v) {
  const s = String(v ?? '').toUpperCase().replace(/A/g, 'А').replace(/[\s\-–]/g, '');
  return /^\d+$/.test(s) ? s + 'А' : s;
}

export function daysOf(schedule, group) {
  const g = group || schedule.defaultGroup || schedule.group;
  if (schedule.groups && g && schedule.groups[g]) return schedule.groups[g];
  return schedule.days || {};
}

export function normName(s) {
  return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]/g, '');
}

export function groupLessons(lessons) {
  const blocks = [];
  for (const l of [...lessons].sort((a, b) => a.start.localeCompare(b.start))) {
    const last = blocks[blocks.length - 1];
    if (last && normName(last.subject) === normName(l.subject) && normName(last.teacher) === normName(l.teacher)) {
      last.end = l.end;
      last.count++;
    } else {
      blocks.push({ ...l, count: 1 });
    }
  }
  return blocks;
}

export function blocksForDate(schedule, dateIso, group) {
  const days = daysOf(schedule, group);
  return groupLessons(days[dateIso] || []).map(b => ({
    ...b,
    date: dateIso,
    startMs: lessonMs(dateIso, b.start),
    endMs: lessonMs(dateIso, b.end),
  }));
}

export function upcomingBlocks(schedule, nowMs = Date.now(), group, daysAhead = 21) {
  const out = [];
  const today = todayISO(nowMs);
  for (let i = 0; i <= daysAhead; i++) {
    for (const b of blocksForDate(schedule, addDays(today, i), group)) if (b.endMs > nowMs) out.push(b);
  }
  return out;
}

export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  return `${n} ${w}`;
}
