// Утренняя сводка и напоминание ~за 20 минут до пары в MAX.
// node scripts/notify.mjs [--dry] [--now 2026-10-29T17:10]
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config, readJSON, writeJSON, SCHEDULE_FILE, STATE_DIR } from './lib/common.mjs';
import { formatDigest, formatReminder, sendMax, sleep } from './lib/max.mjs';
import { addDays, blocksForDate, lessonMs, todayISO, TZ_OFFSET_HOURS, setTimezone, dayTitle } from '../docs/js/lessons.js';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const nowArg = args.includes('--now') ? args[args.indexOf('--now') + 1] : null;

if (!existsSync(SCHEDULE_FILE)) {
  console.log('Нет docs/data/schedule.json — нечего напоминать');
  process.exit(0);
}

const schedule = readJSON(SCHEDULE_FILE);
const tz = schedule.timezoneOffsetHours ?? config.timezoneOffsetHours ?? TZ_OFFSET_HOURS;
setTimezone(tz);
const group = config.group || schedule.defaultGroup || '3426А';

function parseNow(arg) {
  if (!arg) return Date.now();
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(arg)) return Date.parse(arg);
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/.exec(arg);
  if (!m) return Date.parse(arg);
  const [y, mo, d] = m[1].split('-').map(Number);
  const [hh, mm] = m[2].split(':').map(Number);
  return Date.UTC(y, mo - 1, d, hh, mm, Number(m[3] || 0)) - tz * 3600e3;
}

const clock = parseNow(nowArg);

const today = todayISO(clock);
const blocks = blocksForDate(schedule, today, group);
const n = config.notify || { remindBeforeMin: 20, digestAt: '07:00' };
const statePath = join(STATE_DIR, 'notify.json');
const state = readJSON(statePath, { sent: {} });
const minutes = ms => Math.round(ms / 60000);
const dateTitle = dayTitle(today);

const outbox = [];

const digestAt = lessonMs(today, n.digestAt || '07:00');
if (!state.sent[`digest:${today}`] && clock >= digestAt && clock < lessonMs(today, '13:00')) {
  outbox.push({
    key: `digest:${today}`,
    text: formatDigest({ group, dateTitle, blocks }),
  });
}

for (const b of blocks) {
  const k = `pair:${today}:${b.start}`;
  const left = minutes(b.startMs - clock);
  if (state.sent[k] || left > (n.remindBeforeMin ?? 20) || left < -15) continue;
  outbox.push({
    key: k,
    text: formatReminder({ block: b, minutesLeft: left }),
  });
}

if (!outbox.length) {
  console.log(`Нечего отправлять (${today}, группа ${group}, пар ${blocks.length})`);
} else if (!dry && (!process.env.MAX_TOKEN || !(process.env.MAX_USER_ID || process.env.MAX_CHAT_ID))) {
  console.log('Не заданы MAX_TOKEN и MAX_USER_ID/MAX_CHAT_ID — сообщения не отправлены');
  for (const m of outbox) console.log(`  • ${m.text.split('\n')[0]}`);
  process.exit(0);
} else {
  for (const [i, m] of outbox.entries()) {
    await sendMax(m.text, { token: process.env.MAX_TOKEN, dry });
    if (!dry) console.log(`Отправлено: ${m.text.split('\n')[0]}`);
    state.sent[m.key] = new Date(clock).toISOString();
    if (!dry && i < outbox.length - 1) await sleep(600);
  }
}

const cutoff = addDays(today, -30);
for (const k of Object.keys(state.sent || {})) {
  const day = k.split(':')[1] || '';
  if (day && day < cutoff) delete state.sent[k];
}
if (!dry) writeJSON(statePath, state);
