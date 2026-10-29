// Админ: список людей, выдача логина/пароля/группы, запись auth.json через GitHub.
import { wrapKey, toB64, fromB64 } from './crypto.js';
import { normGroup } from './lessons.js';

const $ = sel => document.querySelector(sel);

let ctx;
let auth = { users: [] };
let authSha = null;

export function initAdmin(context) {
  ctx = context;
  bind();
  return { render, reload };
}

function esc(s) {
  return ctx.esc(s);
}

function utf8ToB64(str) {
  return toB64(new TextEncoder().encode(str));
}

function randomPassword() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function publicUser(u) {
  return {
    username: u.username,
    name: u.name,
    group: u.group || '',
    role: u.role || (String(u.username).toLowerCase() === 'vsevolod' ? 'admin' : 'user'),
  };
}

function renderUsers() {
  const users = auth.users || [];
  $('#aUsers').innerHTML = users.length
    ? users.map((u, i) => {
      const p = publicUser(u);
      const admin = p.role === 'admin';
      return `<div class="row-item">
        <span><b>${esc(p.name || p.username)}</b><br>
        <span class="muted small">${esc(p.username)} · ${esc(p.group || '—')}${admin ? ' · админ' : ''}</span></span>
        ${admin ? '' : `<span class="acts"><button class="btn small danger" type="button" data-a="del-user" data-i="${i}">Удалить</button></span>`}
      </div>`;
    }).join('')
    : '<div class="empty">Нет пользователей</div>';
}

function renderStatus() {
  const warn = $('#adminWarn');
  const ok = ctx.canWrite();
  warn.hidden = ok;
  warn.textContent = 'Добавь токен GitHub ниже — без него новый человек не попадёт на сайт (можно скачать auth.json и закоммитить руками).';
  $('#writeStatus').textContent = ok
    ? `✓ Запись в ${ctx.repo()} включена`
    : 'Токена нет — сохранять в репозиторий нельзя';
  $('#writeStatus').className = 'small ' + (ok ? '' : 'error');
}

async function fetchAuth() {
  if (ctx.canWrite()) {
    try {
      const res = await fetch(`https://api.github.com/repos/${ctx.repo()}/contents/docs/auth.json?ref=main&t=${Date.now()}`, {
        headers: ctx.ghHeaders(),
      });
      if (res.ok) {
        const j = await res.json();
        authSha = j.sha;
        auth = JSON.parse(new TextDecoder().decode(fromB64(j.content.replace(/\n/g, ''))));
        return;
      }
    } catch {}
  }
  auth = await ctx.fetchJSON('auth.json');
  authSha = null;
}

async function putAuth(message) {
  if (!ctx.canWrite()) return false;
  const url = `https://api.github.com/repos/${ctx.repo()}/contents/docs/auth.json`;
  const content = utf8ToB64(JSON.stringify(auth, null, 2) + '\n');
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!authSha) {
      const cur = await fetch(`${url}?ref=main&t=${Date.now()}`, { headers: ctx.ghHeaders() });
      if (cur.ok) authSha = (await cur.json()).sha;
    }
    const res = await fetch(url, {
      method: 'PUT',
      headers: ctx.ghHeaders(),
      body: JSON.stringify({ message, content, sha: authSha || undefined, branch: 'main' }),
    });
    if (res.ok) {
      authSha = (await res.json()).content?.sha || null;
      return true;
    }
    if (res.status === 409 || res.status === 422) { authSha = null; continue; }
    const err = await res.json().catch(() => ({}));
    ctx.toast(res.status === 401 || res.status === 403
      ? 'GitHub не принял токен — проверь Contents: Read and write'
      : `Не сохранилось: GitHub ${res.status}${err.message ? ' · ' + err.message : ''}`);
    return false;
  }
  ctx.toast('Не сохранилось: конфликт версий, обнови страницу');
  return false;
}

function downloadAuth() {
  const blob = new Blob([JSON.stringify(auth, null, 2) + '\n'], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'auth.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function inviteText(login, password, fio, group) {
  const url = 'https://xrex-collab.github.io/knn-tracker/';
  return `КНН трекер: ${url}\nЛогин: ${login}\nПароль: ${password}\nФИО: ${fio}\nГруппа: ${group}`;
}

function showInvite({ login, password, fio, group, published }) {
  const box = $('#uResult');
  box.hidden = false;
  box.innerHTML = `
    <div class="state">${published ? 'Человек добавлен' : 'Данные готовы — их ещё нужно залить'}</div>
    <div class="subject">${esc(fio)}</div>
    <p class="secret">${esc(login)} / ${esc(password)}</p>
    <p class="small muted">${published
      ? 'Через 1–2 минуты после обновления Pages можно входить этими логином и паролем.'
      : 'Токена нет: скачай auth.json, замени <code>docs/auth.json</code> в репозитории и залей в main.'}</p>
    <div class="links">
      <button class="btn" type="button" data-a="copy-invite" data-text="${esc(inviteText(login, password, fio, group))}">Скопировать приглашение</button>
      ${published ? '' : '<button class="btn" type="button" data-a="download-auth">Скачать auth.json</button>'}
    </div>`;
}

async function addUser(e) {
  e.preventDefault();
  const login = String($('#uLogin').value || '').trim().toLowerCase();
  const password = $('#uPass').value;
  const fio = $('#uFio').value.trim().replace(/\s+/g, ' ');
  const group = normGroup($('#uGroup').value);
  if (!/^[a-z0-9._-]{2,32}$/.test(login)) return ctx.toast('Логин: латиница, цифры, точка, 2–32 символа');
  if (!password || password.length < 6) return ctx.toast('Пароль не короче 6 символов');
  if (!fio || !group) return ctx.toast('Нужны ФИО и группа');
  await fetchAuth();
  if ((auth.users || []).some(u => String(u.username).toLowerCase() === login)) {
    return ctx.toast(`Логин ${login} уже занят`);
  }
  const wrapped = await wrapKey(ctx.dataKey(), password);
  auth.users.push({ username: login, name: fio, group, role: 'user', ...wrapped });
  const published = await putAuth(`Пользователь ${login}`);
  if (!published) downloadAuth();
  e.target.reset();
  $('#uGroup').value = group;
  showInvite({ login, password, fio, group, published });
  renderUsers();
  renderStatus();
}

async function deleteUser(i) {
  const u = auth.users[i];
  if (!u || publicUser(u).role === 'admin') return;
  if (!confirm(`Удалить ${u.name || u.username}? Войти этим логином больше нельзя.`)) return;
  await fetchAuth();
  const idx = auth.users.findIndex(x => String(x.username).toLowerCase() === String(u.username).toLowerCase());
  if (idx < 0) return;
  const gone = auth.users.splice(idx, 1)[0];
  if (await putAuth(`Удалён пользователь ${gone.username}`)) {
    ctx.toast(`Удален ${gone.name || gone.username}`);
    $('#uResult').hidden = true;
    renderUsers();
  } else {
    auth.users.splice(idx, 0, gone);
    ctx.toast('Не удалось удалить в репозитории');
  }
}

async function render() {
  renderStatus();
  if (!$('#uGroup').value) $('#uGroup').value = ctx.defaultGroup();
  if (!$('#uPass').value) $('#uPass').value = randomPassword();
  try {
    await fetchAuth();
    renderUsers();
  } catch (e) {
    $('#aUsers').innerHTML = `<div class="empty">Не удалось загрузить список: ${esc(e.message)}</div>`;
  }
}

async function reload() {
  await render();
}

function bind() {
  $('#uPassGen').onclick = () => { $('#uPass').value = randomPassword(); };
  $('#userForm').addEventListener('submit', addUser);
  $('#saveToken').onclick = () => {
    const t = $('#tokenInput').value.trim();
    if (!t) return;
    ctx.setToken(t);
    $('#tokenInput').value = '';
    ctx.toast('Токен сохранён на этом устройстве');
    render();
  };
  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-a]');
    if (!el || !el.closest('[data-view="admin"]')) return;
    const { a, i, text } = el.dataset;
    if (a === 'del-user') deleteUser(Number(i));
    else if (a === 'copy-invite') {
      try { await navigator.clipboard.writeText(text); ctx.toast('Скопировано'); }
      catch { ctx.toast('Не удалось скопировать'); }
    } else if (a === 'download-auth') downloadAuth();
  });
}
