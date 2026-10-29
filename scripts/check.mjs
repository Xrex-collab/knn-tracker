import { readFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, SCHEDULE_FILE, SCHEDULE_ENC_FILE, AUTH_FILE, config, readJSON } from './lib/common.mjs';
import { loadSecrets } from './lib/secrets.mjs';
import { blocksForDate, setTimezone, normGroup } from '../docs/js/lessons.js';
import { decryptJSON, encryptJSON, isEncryptedBox, unwrapKey, wrapKey } from '../docs/js/crypto.js';

const schedule = JSON.parse(readFileSync(SCHEDULE_FILE, 'utf8'));
setTimezone(schedule.timezoneOffsetHours ?? 3);
const group = config.group;
if (group !== '3426А') throw new Error(`Ожидал группу 3426А, в config: ${group}`);
const blocks = blocksForDate(schedule, '2026-10-29', group);
if (blocks.length !== 4) throw new Error(`У 3426А должно быть 4 пары, получилось ${blocks.length}`);
const expect = [
  ['17:30', 'МДК 04.01', 'Соловьева'],
  ['18:25', 'Основы проект. баз данных', 'Исавин'],
  ['19:20', 'МДК 02.01', 'Ахметзянов'],
  ['20:15', 'МДК 02.02', 'Ахметзянов'],
];
expect.forEach(([start, subject, teacher], i) => {
  const b = blocks[i];
  if (b.start !== start || b.subject !== subject || b.teacher !== teacher) {
    throw new Error(`Пара ${i}: ${JSON.stringify(b)} ≠ ${start} ${subject} ${teacher}`);
  }
});

const box = JSON.parse(readFileSync(SCHEDULE_ENC_FILE, 'utf8'));
if (!isEncryptedBox(box)) throw new Error('docs/data/schedule.json должен быть AES-GCM конвертом, без groups');
if (JSON.stringify(box).includes('МДК 04.01')) throw new Error('шифротекст содержит открытый предмет');

const round = await decryptJSON(await encryptJSON({ ping: 1 }, 'test-key'), 'test-key');
if (round.ping !== 1) throw new Error('crypto roundtrip сломан');

loadSecrets();
if (process.env.DATA_KEY) {
  const opened = await decryptJSON(box, process.env.DATA_KEY);
  if (opened.groups?.['3426А']?.['2026-10-29']?.length !== 4) {
    throw new Error('DATA_KEY не открыл 3426А');
  }
}
const auth = readJSON(AUTH_FILE);
const admin = auth.users.find(u => u.username === 'vsevolod');
if (!admin) throw new Error('Нет пользователя vsevolod в docs/auth.json');
if (admin.role !== 'admin') throw new Error('vsevolod должен быть admin');
if (normGroup(admin.group) !== '3426А') throw new Error(`группа Всеволода: ${admin.group}`);
if (process.env.TRACKER_PASSWORD) {
  const key = await unwrapKey(admin, process.env.TRACKER_PASSWORD);
  const opened = await decryptJSON(box, key);
  if (!opened.groups['3426А']) throw new Error('пароль Всеволода не открыл расписание');
  const guestWrap = await wrapKey(key, 'guest-test-pass');
  const guestKey = await unwrapKey({ ...admin, ...guestWrap }, 'guest-test-pass');
  if (guestKey !== key) throw new Error('обёртка ключа для нового пользователя сломана');

  const bak = AUTH_FILE + '.checkbak';
  copyFileSync(AUTH_FILE, bak);
  try {
    const add = spawnSync(process.execPath, [
      join(ROOT, 'scripts', 'users.mjs'), 'add', 'checkuser', 'Проверка Чек',
      '--group', '3426А', '--password', 'Check-user-1', '--old', process.env.TRACKER_PASSWORD,
    ], { encoding: 'utf8', env: { ...process.env } });
    if (add.status !== 0) throw new Error(add.stderr || add.stdout);
    const added = readJSON(AUTH_FILE).users.find(u => u.username === 'checkuser');
    if (!added || added.group !== '3426А' || added.role !== 'user') throw new Error('users.mjs add не записал группу');
    if (await unwrapKey(added, 'Check-user-1') !== key) throw new Error('новый пользователь не открыл DATA_KEY');
  } finally {
    copyFileSync(bak, AUTH_FILE);
    unlinkSync(bak);
  }
}

const dry = spawnSync(process.execPath, [join(ROOT, 'scripts', 'notify.mjs'), '--dry', '--now', '2026-10-29T17:10'], {
  encoding: 'utf8',
  env: { ...process.env },
});
if (dry.status !== 0) throw new Error(dry.stderr || dry.stdout);
if (!dry.stdout.includes('МДК 04.01')) throw new Error('dry-notify не нашёл ближайшую пару:\n' + dry.stdout);

console.log('Проверки ок: 3426А, шифротекст, админ vsevolod, 4 пары 29.10.2026, напоминание в 17:10.');
console.log(dry.stdout.trim());
