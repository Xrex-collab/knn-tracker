// Собирает открытый JSON в state/ и шифротекст для Pages в docs/data/schedule.json.
import { writeJSON, SCHEDULE_FILE, SCHEDULE_ENC_FILE, ROOT } from './lib/common.mjs';
import { dataKey, loadSecrets } from './lib/secrets.mjs';
import { encryptJSON } from '../docs/js/crypto.js';

const DATE = '2026-10-29';
const TIMES = [
  ['17:30', '18:15'],
  ['18:25', '19:10'],
  ['19:20', '20:05'],
  ['20:15', '21:00'],
];

function lessons(rows) {
  return rows.map((row, i) => {
    if (!row) return null;
    const [subject, teacher] = row;
    const [start, end] = TIMES[i];
    return { start, end, subject, teacher: teacher || '', place: '', note: '' };
  }).filter(Boolean);
}

const same = (rowset, names) => Object.fromEntries(names.map(g => [g, { [DATE]: lessons(rowset) }]));

const groups = {
  ...same([
    ['Процессы и аппараты', 'Данилова'],
    ['МДК 01.01', 'Матвеев'],
    ['Теорет. основы хим. технологии', 'Агазамова'],
    ['Теорет. основы хим. технологии', 'Агазамова'],
  ], ['1417А']),
  ...same([
    ['МДК 01.01', 'Нигматуллин'],
    ['МДК 01.01', 'Нигматуллин'],
    ['Информ. технологии в проф. деятельности', 'Галялетдинова'],
  ], ['3414А', '3415А']),
  ...same([
    ['Технолог. оборудование', 'Биккинеев'],
    ['Технолог. оборудование', 'Биккинеев'],
    ['МДК 03.02', 'Садриев'],
    ['Элементы САПР в ГД', 'Галялетдинова'],
  ], ['2413А', '2414А', '2415А']),
  ...same([
    ['Элект. машины и электропривод', 'Васильева'],
    ['Элект. машины и электропривод', 'Васильева'],
    ['Электробезопасность', 'Казакова'],
    ['Электробезопасность', 'Казакова'],
  ], ['343А', '344А']),
  ...same([
    ['МДК 02.01', 'Ахметзянов'],
    ['МДК 02.02', 'Ахметзянов'],
    ['Основы проектирования БД', 'Гильмутдинова'],
  ], ['3422А', '3423А', '3424А']),
  ...same([
    ['МДК 04.01', 'Соловьева'],
    ['Основы проект. баз данных', 'Исавин'],
    ['МДК 02.01', 'Ахметзянов'],
    ['МДК 02.02', 'Ахметзянов'],
  ], ['3425А', '3426А', '3427А']),
  ...same([
    ['МДК 02.02', 'Гусменова'],
    ['МДК 02.01', 'Зрячева'],
    ['Основы проект. баз данных', 'Исавин'],
  ], ['3428А', '3429А']),
};

const schedule = {
  defaultGroup: '3426А',
  timezoneOffsetHours: 3,
  fetchedAt: new Date().toISOString(),
  source: 'screenshots',
  screenshots: [
    'state/screenshots/schedule-2026-10-29-a.png',
    'state/screenshots/schedule-2026-10-29-b.png',
  ],
  groups,
};

writeJSON(SCHEDULE_FILE, schedule);
loadSecrets();
if (process.env.DATA_KEY) {
  writeJSON(SCHEDULE_ENC_FILE, await encryptJSON(schedule, dataKey()));
}
const n = Object.keys(groups).length;
const lessons3426 = groups['3426А'][DATE].length;
console.log(`Групп: ${n}. 3426А на ${DATE}: ${lessons3426} пар. Файл: ${SCHEDULE_FILE.replace(ROOT + '/', '')}`);
