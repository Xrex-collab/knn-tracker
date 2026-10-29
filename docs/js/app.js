import { decryptJSON, unwrapKey } from './crypto.js';
import {
  addDays, blocksForDate, collegeNow, dayTitle, daysOf, groupList, setTimezone,
  todayISO, upcomingBlocks, normGroup,
} from './lessons.js';

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const LS = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const SESSION_KEY = 'knn.session';
const TOKEN_KEY = 'knn.ghToken';
const LAST_USER_KEY = 'knn.lastUser';

let config = { group: '3426А', timezoneOffsetHours: 3, links: [], repo: 'Xrex-collab/knn-tracker' };
let base = null;
let local = null;
let session = null;
let admin = null;
let started = false;
let weekStart = mondayOf(todayISO());

function readSession() {
  try { return JSON.parse(LS.get(SESSION_KEY) || 'null'); } catch { return null; }
}

function saveSession(next) {
  session = next;
  if (next) LS.set(SESSION_KEY, JSON.stringify(next));
  else LS.del(SESSION_KEY);
}

function profileKey() {
  return session?.username ? `knn.profile.${session.username}` : null;
}

function profile() {
  const key = profileKey();
  if (key) {
    try {
      const raw = LS.get(key);
      if (raw) {
        const p = JSON.parse(raw);
        return { fio: p.fio || '', group: normGroup(p.group || '') };
      }
    } catch {}
  }
  return {
    fio: session?.name || '',
    group: normGroup(session?.group || LS.get('group') || config.group || '3426А'),
  };
}

function saveProfile(next) {
  const p = {
    fio: String(next.fio || '').trim().replace(/\s+/g, ' '),
    group: normGroup(next.group || config.group || '3426А'),
  };
  const key = profileKey();
  if (key) LS.set(key, JSON.stringify(p));
  LS.set('group', p.group);
  if (session) {
    session.name = p.fio;
    session.group = p.group;
    saveSession(session);
  }
  return p;
}

function seedProfile(user) {
  if (profileKey() && LS.get(profileKey())) return;
  saveProfile({
    fio: user.name || '',
    group: user.group || LS.get('group') || config.group || '3426А',
  });
}

function group() {
  return profile().group || config.group || '3426А';
}

function fio() {
  return profile().fio || session?.name || '';
}

function isAdmin() {
  return session?.role === 'admin' || String(session?.username || '').toLowerCase() === 'vsevolod';
}

function joinName() {
  return [fio(), group()].filter(Boolean).join(' ');
}

function chatText() {
  return `${fio() || 'Я'}, я на паре`;
}

function repo() {
  return config.repo || 'Xrex-collab/knn-tracker';
}

function token() {
  return LS.get(TOKEN_KEY) || '';
}

function canWrite() {
  return Boolean(token() && repo());
}

function ghHeaders() {
  return { Authorization: `Bearer ${token()}`, Accept: 'application/vnd.github+json' };
}

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

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function join(block) {
  const room = isUrl(block.place) ? block.place : '';
  if (!room) return toast('Ссылки на эту пару пока нет');
  const name = joinName();
  const copied = name ? copy(name) : Promise.resolve(false);
  const win = window.open(room, '_blank');
  if (win) win.opener = null;
  toast((await copied) ? 'Имя скопировано — вставь его в поле «Имя»' : (name ? `Имя для входа: ${name}` : 'Открываю комнату'));
  if (!win) setTimeout(() => (location.href = room), 1500);
}

function fillGroupOptions() {
  const list = groupList(schedule());
  const current = group();
  if (current && !list.includes(current)) list.unshift(current);
  if (!list.includes('3426А')) list.unshift('3426А');
  $('#groupOptions').innerHTML = [...new Set(list)].map(name => `<option value="${esc(name)}">`).join('');
}

function lessonCard(b, now) {
  const state = b.endMs <= now ? 'past' : b.startMs <= now ? 'now' : '';
  const extra = [b.teacher, b.place && !isUrl(b.place) ? b.place : '', b.note].filter(Boolean).join(' · ');
  const room = isUrl(b.place) ? b.place : '';
  return `
    <div class="lesson ${state}">
      <div class="time">${b.start}<small>${b.end}</small></div>
      <div>
        <div class="subj">${esc(b.subject)}${b.count > 1 ? ` <span class="muted small">×${b.count}</span>` : ''}</div>
        <div class="meta">${esc(extra)}</div>
        <div class="row">
          ${state === 'now' ? '<span class="chip ok">идёт сейчас</span>' : ''}
          ${state !== 'past' && room ? `<button class="btn small primary" type="button" data-action="join" data-date="${b.date}" data-start="${b.start}">Войти</button>` : ''}
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
  const room = isUrl(next.place) ? next.place : '';
  hero.innerHTML = `
    <div class="state">${live ? 'Идёт пара' : 'Следующая пара'}</div>
    <div class="subject">${esc(next.subject)}</div>
    <div class="countdown">${live
      ? `до конца ${duration(next.endMs - now)} (в ${next.end})`
      : `${whenLabel(next.date)} в ${next.start} — через ${duration(next.startMs - now)}`}
      <div class="muted small">${esc([next.teacher, next.place && !isUrl(next.place) ? next.place : ''].filter(Boolean).join(' · '))}</div></div>
    <div class="actions">
      ${room ? `<button class="btn primary" type="button" data-action="join" data-date="${next.date}" data-start="${next.start}">Войти на пару</button>` : ''}
      <button class="btn" type="button" data-action="copy-chat">Скопировать «я на паре»</button>
    </div>`;
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
  $('#links').innerHTML = (config.links || []).map(l =>
    `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title)}</a>`).join('');
  const days = Object.keys(daysOf(schedule(), g)).sort();
  const fetched = schedule().fetchedAt ? new Date(schedule().fetchedAt).toLocaleString('ru-RU') : '—';
  $('#schedInfo').textContent = `Группа ${g}. Дней в расписании: ${days.length}${days.length ? ` (${days[0]} … ${days[days.length - 1]})` : ''}. Источник: скриншоты. Обновлено: ${fetched}.`;
}

function renderProfile() {
  const p = profile();
  $('#pFio').value = p.fio;
  $('#pGroup').value = p.group;
  fillGroupOptions();
  $('#joinNameBox').textContent = joinName() || 'Сначала сохрани ФИО';
  $('#sessionInfo').textContent = session
    ? `Логин ${session.username}${isAdmin() ? ' · админ' : ''}. Сессия на этом устройстве, пока не нажмёшь «Выйти».`
    : '';
}

function renderClock(now) {
  const d = collegeNow(now);
  const name = fio();
  $('#who').textContent = [name, group()].filter(Boolean).join(' · ');
  $('#clock').textContent = `${dayTitle(todayISO(now))}, ${d.toISOString().slice(11, 16)}`;
}

function renderAll() {
  const now = Date.now();
  renderClock(now);
  renderHero(now);
  renderToday(now);
  renderWeek(now);
  renderMore();
  renderProfile();
  if (admin) admin.render();
}

function showTab(name) {
  if (name === 'admin' && !isAdmin()) name = 'today';
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

async function fetchJSON(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

async function openSchedule(dataKey) {
  const [cfg, box] = await Promise.all([
    fetchJSON('config.json'),
    fetchJSON('data/schedule.json'),
  ]);
  const sched = await decryptJSON(box, dataKey);
  if (!sched?.groups) throw new Error('Файл расписания пуст');
  config = cfg;
  base = sched;
  setTimezone(sched.timezoneOffsetHours ?? cfg.timezoneOffsetHours ?? 3);
  try { local = JSON.parse(LS.get('local-schedule') || '{"groups":{}}'); } catch { local = { groups: {} }; }
  local.groups ||= {};
}

function showLogin(err) {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#loginErr').hidden = !err;
  $('#loginErr').textContent = err || '';
  $('#loginUser').value = LS.get(LAST_USER_KEY) || 'vsevolod';
  $('#loginPass')?.focus();
}

function showApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
}

async function ensureAdmin() {
  $('#adminTab').hidden = !isAdmin();
  if (!isAdmin()) {
    admin = null;
    return;
  }
  if (admin) return;
  const { initAdmin } = await import('./admin.js');
  admin = initAdmin({
    esc, toast, LS, fetchJSON, repo, canWrite, ghHeaders,
    dataKey: () => session.dataKey,
    defaultGroup: () => group() || '3426А',
    setToken(t) { LS.set(TOKEN_KEY, t); },
  });
}

async function boot(dataKey) {
  await openSchedule(dataKey);
  showApp();
  await ensureAdmin();
  if (!started) {
    started = true;
    const tab = LS.get('tab');
    showTab(tab === 'admin' && !isAdmin() ? 'today' : tab || 'today');
    setInterval(() => { const now = Date.now(); renderClock(now); renderHero(now); renderToday(now); }, 30000);
  }
  renderAll();
}

function roleOf(user) {
  if (user.role === 'admin' || String(user.username).toLowerCase() === 'vsevolod') return 'admin';
  return user.role || 'user';
}

async function login(username, password) {
  const auth = await fetchJSON('auth.json');
  const id = String(username || '').trim().toLowerCase();
  const user = (auth.users || []).find(u => String(u.username).toLowerCase() === id);
  if (!user) throw new Error('Неверный логин или пароль');
  const dataKey = await unwrapKey(user, password);
  LS.set(LAST_USER_KEY, user.username);
  saveSession({
    username: user.username,
    name: user.name,
    group: user.group || config.group || '3426А',
    role: roleOf(user),
    dataKey,
    at: Date.now(),
  });
  seedProfile(user);
  await boot(dataKey);
}

document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  if (go) showTab(go.dataset.go);
});

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, date, start } = el.dataset;
  if (action === 'join') {
    const b = blocksForDate(schedule(), date, group()).find(x => x.start === start);
    if (b) join(b);
  } else if (action === 'copy-chat') {
    toast((await copy(chatText())) ? 'Скопировано: «' + chatText() + '»' : chatText());
  }
});

$('#weekPrev').onclick = () => { weekStart = addDays(weekStart, -7); renderWeek(Date.now()); };
$('#weekNext').onclick = () => { weekStart = addDays(weekStart, 7); renderWeek(Date.now()); };
$('#weekLabel').onclick = () => { weekStart = mondayOf(todayISO()); renderWeek(Date.now()); };

$('#lDate').value = todayISO();

$('#profileForm').addEventListener('submit', e => {
  e.preventDefault();
  saveProfile({ fio: $('#pFio').value, group: $('#pGroup').value });
  renderAll();
  toast('Профиль сохранён на этом устройстве');
});

$('#copyJoinBtn').onclick = async () => {
  const name = joinName();
  if (!name) return toast('Сначала сохрани ФИО');
  toast((await copy(name)) ? 'Скопировано: «' + name + '»' : name);
};

$('#copyChatBtn').onclick = async () => {
  toast((await copy(chatText())) ? 'Скопировано: «' + chatText() + '»' : chatText());
};

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
  try {
    if (!session?.dataKey) return showLogin();
    await openSchedule(session.dataKey);
    renderAll();
    toast('Обновлено');
  } catch (e) {
    toast('Ошибка: ' + e.message);
  }
};

$('#logoutBtn').onclick = () => {
  if (!confirm('Выйти на этом устройстве? Расписание снова закроется паролем.')) return;
  saveSession(null);
  LS.del('local-schedule');
  base = null;
  local = { groups: {} };
  location.reload();
};

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  $('#loginErr').hidden = true;
  try {
    await login($('#loginUser').value, $('#loginPass').value);
  } catch (err) {
    const msg = err.name === 'OperationError' ? 'Неверный логин или пароль' : (err.message || 'Не удалось войти');
    showLogin(msg);
  } finally {
    btn.disabled = false;
    $('#loginPass').value = '';
  }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

session = readSession();
$('#loginUser').value = LS.get(LAST_USER_KEY) || session?.username || 'vsevolod';
if (session?.dataKey) {
  try {
    await boot(session.dataKey);
  } catch {
    saveSession(null);
    showLogin('Сессия устарела — войди снова');
  }
} else {
  showLogin();
}
