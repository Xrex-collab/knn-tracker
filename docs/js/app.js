import {
  addDays, blocksForDate, collegeNow, dayTitle, daysOf, groupList, setTimezone,
  todayISO, upcomingBlocks, plural,
} from './lessons.js';

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const LS = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

let config = { group: '3426А', timezoneOffsetHours: 3, links: [] };
let base = null;
let local = null;
let weekStart = mondayOf(todayISO());

function mondayOf(iso) {
  const day = new Date(iso + 'T00:00:00Z').getUTCDay() || 7;
  return addDays(iso, 1 - day);
}

function schedule() {
  const groups = { ...(base?.groups || {}) };
  for (const [g, days] of Object.entries(local.groups || {})) {
    groups[g] = { ...(groups[g] || {}), ...days };
  }
  return {
    ...base,
    defaultGroup: local.group || config.group || base?.defaultGroup || '3426А',
    timezoneOffsetHours: base?.timezoneOffsetHours ?? config.timezoneOffsetHours ?? 3,
    groups,
  };
}

function group() {
  return LS.get('group') || config.group || '3426А';
}

function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 3200);
}

function isUrl(s) {
  return /^https?:\/\//i.test(String(s || '').trim());
}

function duration(ms) {
  const min = Math.max(0, Math.round(ms / 60000));
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  if (d) return `${d} д ${h} ч`;
  if (h) return `${h} ч ${m} мин`;
  return `${m} мин`;
}

function whenLabel(iso) {
  const today = todayISO();
  if (iso === today) return 'сегодня';
  if (iso === addDays(today, 1)) return 'завтра';
  return dayTitle(iso).toLowerCase();
}

function lessonCard(b, now) {
  const state = b.endMs <= now ? 'past' : b.startMs <= now ? 'now' : '';
  const extra = [b.teacher, b.place, b.note].filter(Boolean).join(' · ');
  const room = isUrl(b.place) ? b.place : '';
  return `
    <div class="lesson ${state}">
      <div class="time">${b.start}<small>${b.end}</small></div>
      <div>
        <div class="subj">${esc(b.subject)}${b.count > 1 ? ` <span class="muted small">×${b.count}</span>` : ''}</div>
        <div class="meta">${esc(extra)}</div>
        <div class="row">
          ${state === 'now' ? '<span class="chip ok">идёт сейчас</span>' : ''}
          ${room ? `<a class="btn small primary" href="${esc(room)}" target="_blank" rel="noopener">Войти</a>` : ''}
        </div>
      </div>
    </div>`;
}

function renderHero(now) {
  const next = upcomingBlocks(schedule(), now, group())[0];
  const hero = $('#hero');
  if (!next) {
    hero.innerHTML = `
      <div class="state">Пар не найдено</div>
      <div class="subject">Загрузи скрин расписания</div>
      <div class="countdown muted">В файле есть 29.10.2026 для группы ${esc(group())}. Добавь фото следующей недели во вкладке «Ещё».</div>`;
    return;
  }
  const live = next.startMs <= now;
  hero.innerHTML = `
    <div class="state">${live ? 'Идёт пара' : 'Следующая пара'}</div>
    <div class="subject">${esc(next.subject)}</div>
    <div class="countdown">${live
      ? `до конца ${duration(next.endMs - now)} (в ${next.end})`
      : `${whenLabel(next.date)} в ${next.start} — через ${duration(next.startMs - now)}`}
      <div class="muted small">${esc([next.teacher, next.place].filter(Boolean).join(' · '))}</div></div>`;
}

function renderToday(now) {
  const today = todayISO(now);
  const blocks = blocksForDate(schedule(), today, group());
  $('#todayList').innerHTML = blocks.length
    ? blocks.map(b => lessonCard(b, now)).join('')
    : `<div class="empty">Сегодня пар нет. Если таблица уже есть — загрузи скрин.</div>`;
  $('#uploadBanner').hidden = Boolean(blocks.length);
}

function shortDate(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function renderWeek(now) {
  $('#weekLabel').textContent = `${shortDate(weekStart)} — ${shortDate(addDays(weekStart, 6))}`;
  const today = todayISO(now);
  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    const blocks = blocksForDate(schedule(), d, group());
    if (i === 6 && !blocks.length) continue;
    html += `<div class="day-head ${d === today ? 'today' : ''}">${esc(dayTitle(d))}</div>`;
    html += blocks.length ? blocks.map(b => lessonCard(b, now)).join('') : '<div class="empty">Пар нет</div>';
  }
  $('#weekList').innerHTML = html;
}

function renderMore() {
  const g = group();
  const list = groupList(schedule());
  $('#groupSelect').innerHTML = list.map(name =>
    `<option value="${esc(name)}" ${name === g ? 'selected' : ''}>${esc(name)}</option>`).join('');
  $('#links').innerHTML = (config.links || []).map(l =>
    `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title)}</a>`).join('');
  const days = Object.keys(daysOf(schedule(), g)).sort();
  const fetched = schedule().fetchedAt ? new Date(schedule().fetchedAt).toLocaleString('ru-RU') : '—';
  $('#schedInfo').textContent = `Группа ${g}. Дней в расписании: ${days.length}${days.length ? ` (${days[0]} … ${days[days.length - 1]})` : ''}. Источник: скриншоты. Обновлено: ${fetched}.`;
}

function renderClock(now) {
  const d = collegeNow(now);
  $('#clock').textContent = `${dayTitle(todayISO(now))}, ${d.toISOString().slice(11, 16)} · ${group()}`;
}

function renderAll() {
  const now = Date.now();
  renderClock(now);
  renderHero(now);
  renderToday(now);
  renderWeek(now);
  renderMore();
}

function showTab(name) {
  document.querySelectorAll('[data-view]').forEach(s => (s.hidden = s.dataset.view !== name));
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  LS.set('tab', name);
  scrollTo(0, 0);
}

function saveLocal() {
  LS.set('local-schedule', JSON.stringify(local));
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(schedule(), null, 2) + '\n'], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'schedule.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function load() {
  const [cfg, sched] = await Promise.all([
    fetch('config.json', { cache: 'no-store' }).then(r => r.json()),
    fetch('data/schedule.json', { cache: 'no-store' }).then(r => r.json()),
  ]);
  config = cfg;
  base = sched;
  setTimezone(sched.timezoneOffsetHours ?? cfg.timezoneOffsetHours ?? 3);
  try { local = JSON.parse(LS.get('local-schedule') || '{"groups":{}}'); } catch { local = { groups: {} }; }
  local.groups ||= {};
  if (!LS.get('group')) LS.set('group', cfg.group || sched.defaultGroup || '3426А');
}

document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  if (go) showTab(go.dataset.go);
});

$('#weekPrev').onclick = () => { weekStart = addDays(weekStart, -7); renderWeek(Date.now()); };
$('#weekNext').onclick = () => { weekStart = addDays(weekStart, 7); renderWeek(Date.now()); };
$('#weekLabel').onclick = () => { weekStart = mondayOf(todayISO()); renderWeek(Date.now()); };

$('#groupSelect').onchange = () => {
  LS.set('group', $('#groupSelect').value);
  renderAll();
};

$('#lDate').value = todayISO();

$('#lessonForm').addEventListener('submit', e => {
  e.preventDefault();
  const g = group();
  const date = $('#lDate').value;
  const item = {
    start: $('#lStart').value,
    end: $('#lEnd').value,
    subject: $('#lSubject').value.trim(),
    teacher: $('#lTeacher').value.trim(),
    place: $('#lPlace').value.trim(),
    note: '',
  };
  local.groups[g] ||= {};
  const day = [...(local.groups[g][date] || daysOf(schedule(), g)[date] || [])];
  day.push(item);
  day.sort((a, b) => a.start.localeCompare(b.start));
  local.groups[g][date] = day;
  saveLocal();
  e.target.reset();
  $('#lDate').value = date;
  renderAll();
  toast('Пара сохранена на этом устройстве');
});

$('#shotInput').addEventListener('change', () => {
  const files = [...($('#shotInput').files || [])];
  $('#shotPreview').innerHTML = files.map(f => {
    const url = URL.createObjectURL(f);
    return `<img src="${url}" alt="${esc(f.name)}">`;
  }).join('');
  if (files.length) {
    showTab('more');
    toast('Скрин открыт. Добавь пары формой ниже — авторазбор таблицы с фото пока ручной.');
  }
});

$('#exportBtn').onclick = exportJSON;
$('#resetLocalBtn').onclick = () => {
  if (!confirm('Удалить пары, добавленные на этом телефоне? Расписание из файла останется.')) return;
  local = { groups: {} };
  LS.del('local-schedule');
  renderAll();
  toast('Локальные правки сброшены');
};

$('#reloadBtn').onclick = async () => {
  try { await load(); renderAll(); toast('Обновлено'); } catch (e) { toast('Ошибка: ' + e.message); }
};

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

try {
  await load();
  showTab(LS.get('tab') || 'today');
  renderAll();
  setInterval(() => { const now = Date.now(); renderClock(now); renderHero(now); renderToday(now); }, 30000);
} catch (e) {
  $('#hero').innerHTML = `<div class="state">Ошибка</div><div class="subject">${esc(e.message)}</div>`;
}
