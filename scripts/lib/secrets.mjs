import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './common.mjs';

const KEYS = new Set(['DATA_KEY', 'TRACKER_PASSWORD']);

export function loadSecrets() {
  const path = join(ROOT, 'secrets.local.txt');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (KEYS.has(k) && v && !process.env[k]) process.env[k] = v;
  }
}

export function dataKey() {
  loadSecrets();
  const key = process.env.DATA_KEY;
  if (!key) throw new Error('Не задан DATA_KEY (общий ключ расписания). Возьми его из secrets.local.txt или задай в окружении.');
  return key;
}
