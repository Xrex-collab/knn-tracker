// Пользователи сайта. Пароль в репозиторий не кладём — только PBKDF2-хеш и обёртка DATA_KEY.
//
//   node scripts/users.mjs add anna "Анна Иванова" --group 3426А --password '...'
//   node scripts/users.mjs password vsevolod --old OLD --password NEW
//   DATA_KEY=... node scripts/users.mjs encrypt
import { randomBytes } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { AUTH_FILE, ROOT, SCHEDULE_ENC_FILE, SCHEDULE_PLAIN_FILE, readJSON, writeJSON } from './lib/common.mjs';
import { dataKey, loadSecrets } from './lib/secrets.mjs';
import { encryptJSON, unwrapKey, wrapKey } from '../docs/js/crypto.js';
import { normGroup } from '../docs/js/lessons.js';

loadSecrets();

function authFile() {
  return readJSON(AUTH_FILE, { users: [] });
}

function findUser(auth, username) {
  const id = String(username || '').trim().toLowerCase();
  return auth.users.find(u => String(u.username).toLowerCase() === id);
}

function printHelp() {
  console.log(`Команды:
  add <логин> "<ФИО>" --group 3426А [--password X] [--admin]
  password <логин> --old OLD --password NEW
  encrypt                              шифрует state/schedule-data.json → docs/data/schedule.json
`);
}

const [cmd, ...args] = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

async function resolveDataKey(auth) {
  try { return dataKey(); } catch {}
  const old = flag('--old') || process.env.TRACKER_PASSWORD;
  if (!old) {
    throw new Error('Нужен DATA_KEY (secrets.local.txt) или --old / TRACKER_PASSWORD — пароль Всеволода');
  }
  const admin = auth.users.find(u => u.role === 'admin') || findUser(auth, 'vsevolod');
  if (!admin) throw new Error('В auth.json нет администратора vsevolod');
  return unwrapKey(admin, old);
}

if (cmd === 'add') {
  const username = String(args[0] || '').trim().toLowerCase();
  const name = args[1];
  if (!username || !name || name.startsWith('--')) {
    throw new Error('Нужно: add <логин> "<ФИО>" --group 3426А [--password X]');
  }
  if (!/^[a-z0-9._-]{2,32}$/.test(username)) {
    throw new Error('Логин: латиница, цифры, точка, 2–32 символа');
  }
  const group = normGroup(flag('--group') || '3426А');
  const password = flag('--password') || randomBytes(12).toString('base64url');
  const auth = authFile();
  if (findUser(auth, username)) throw new Error(`Пользователь ${username} уже есть`);
  const key = await resolveDataKey(auth);
  const wrapped = await wrapKey(key, password);
  const role = args.includes('--admin') || username === 'vsevolod' ? 'admin' : 'user';
  auth.users.push({ username, name, group, role, ...wrapped });
  writeJSON(AUTH_FILE, auth);
  console.log(`${name} (${username}, ${group}): пароль задан. Хеш записан в docs/auth.json`);
  if (!flag('--password')) console.log(`Пароль: ${password}`);
} else if (cmd === 'password') {
  const username = args[0];
  const oldPass = flag('--old');
  const password = flag('--password');
  if (!username || !oldPass || !password) throw new Error('Нужно: password <логин> --old OLD --password NEW');
  const auth = authFile();
  const user = findUser(auth, username);
  if (!user) throw new Error(`Нет пользователя ${username}`);
  const key = await unwrapKey(user, oldPass);
  const wrapped = await wrapKey(key, password);
  Object.assign(user, wrapped);
  writeJSON(AUTH_FILE, auth);
  console.log(`Пароль для ${user.username} обновлён. Перешифровывать расписание не нужно.`);
} else if (cmd === 'encrypt') {
  const plain = readJSON(SCHEDULE_PLAIN_FILE);
  if (!plain?.groups) throw new Error(`Нет открытого расписания: ${SCHEDULE_PLAIN_FILE}`);
  writeJSON(SCHEDULE_ENC_FILE, await encryptJSON(plain, dataKey()));
  console.log(`Зашифровано → docs/data/schedule.json`);
} else if (cmd === 'init-key') {
  const key = randomBytes(32).toString('base64url');
  const path = join(ROOT, 'secrets.local.txt');
  if (existsSync(path) && !args.includes('--force')) throw new Error('secrets.local.txt уже есть');
  writeFileSync(path, `# не коммитить\nDATA_KEY=${key}\n`);
  console.log(`DATA_KEY записан в secrets.local.txt`);
} else {
  printHelp();
}
