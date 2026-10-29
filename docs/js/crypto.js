// AES-GCM + PBKDF2-SHA-256. Общий код для браузера и Node 20+.
// Это замок от чужих глаз на GitHub Pages, не банковская защита:
// хеш в публичном репозитории можно подобрать перебором.

const enc = new TextEncoder();
const dec = new TextDecoder();
export const ITERATIONS = 210000;

export function toB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(b64) {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

export function same(a, b) {
  const x = String(a || ''), y = String(b || '');
  if (x.length !== y.length) return false;
  let n = 0;
  for (let i = 0; i < x.length; i++) n |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return n === 0;
}

export async function deriveRaw(password, salt, iter = ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    base,
    256,
  ));
}

export async function importAes(raw) {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function deriveKey(password, salt, iter = ITERATIONS) {
  return importAes(await deriveRaw(password, salt, iter));
}

export async function sha256b64(bytes) {
  return toB64(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

export async function encryptJSON(obj, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { v: 1, alg: 'AES-GCM', kdf: 'PBKDF2-SHA-256', iter: ITERATIONS, salt: toB64(salt), iv: toB64(iv), data: toB64(new Uint8Array(data)) };
}

export async function decryptJSON(box, password) {
  if (!box || box.v !== 1 || !box.salt || !box.iv || !box.data) throw new Error('Неверный формат шифротекста');
  const key = await deriveKey(password, fromB64(box.salt), box.iter || ITERATIONS);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, key, fromB64(box.data));
  return JSON.parse(dec.decode(plain));
}

export async function wrapKey(dataKey, password, iter = ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const raw = await deriveRaw(password, salt, iter);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importAes(raw), enc.encode(dataKey));
  return {
    iter,
    salt: toB64(salt),
    hash: await sha256b64(raw),
    wrap: { iv: toB64(iv), data: toB64(new Uint8Array(ct)) },
  };
}

export async function unwrapKey(user, password) {
  const raw = await deriveRaw(password, fromB64(user.salt), user.iter || ITERATIONS);
  if (!same(await sha256b64(raw), user.hash)) throw new Error('Неверный логин или пароль');
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(user.wrap.iv) },
    await importAes(raw),
    fromB64(user.wrap.data),
  );
  return dec.decode(plain);
}

export function isEncryptedBox(obj) {
  return Boolean(obj && obj.v === 1 && obj.salt && obj.iv && obj.data && !obj.groups);
}
