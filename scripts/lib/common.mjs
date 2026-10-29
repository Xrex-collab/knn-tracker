import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SCHEDULE_FILE = process.env.SCHEDULE_FILE || join(ROOT, 'docs', 'data', 'schedule.json');
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
