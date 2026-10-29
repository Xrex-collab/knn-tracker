import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const AUTH_FILE = join(ROOT, 'docs', 'auth.json');
export const SCHEDULE_ENC_FILE = join(ROOT, 'docs', 'data', 'schedule.json');
export const SCHEDULE_PLAIN_FILE = join(ROOT, 'state', 'schedule-data.json');
// MAX/check читают открытый JSON вне Pages. Сайт отдаёт только шифротекст.
export const SCHEDULE_FILE = process.env.SCHEDULE_FILE || SCHEDULE_PLAIN_FILE;
export const DOCS_CONFIG_FILE = join(ROOT, 'docs', 'config.json');
export const STATE_DIR = join(ROOT, 'state');

export function readJSON(path, fallback) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
}

export function writeJSON(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n');
}

export const config = readJSON(join(ROOT, 'config.json'));
