const API = 'https://platform-api2.max.ru/messages';

export function maxTarget() {
  const userId = process.env.MAX_USER_ID?.trim();
  const chatId = process.env.MAX_CHAT_ID?.trim();
  if (userId) return { user_id: userId };
  if (chatId) return { chat_id: chatId };
  return null;
}

export function formatDigest({ group, dateTitle, blocks }) {
  const lines = [`Пары на ${dateTitle}`, `Группа ${group}`, ''];
  if (!blocks.length) {
    lines.push('Сегодня пар нет.');
  } else {
    for (const b of blocks) lines.push(blockLine(b));
  }
  return lines.join('\n').trim();
}

export function formatReminder({ block, minutesLeft }) {
  const head = minutesLeft > 0 ? `Через ${minutesLeft} мин: ${block.subject}` : `Уже идёт: ${block.subject}`;
  return [head, `Начало в ${block.start}`, blockLine(block)].filter(Boolean).join('\n');
}

function blockLine(b) {
  const extra = [b.teacher, b.place, b.note].filter(Boolean).join(' · ');
  return `${b.start}–${b.end} ${b.subject}${extra ? ` (${extra})` : ''}`;
}

export async function sendMax(text, { token, dry = false } = {}) {
  const target = maxTarget();
  if (dry) {
    console.log(`--- [dry] ${target ? JSON.stringify(target) : 'нет MAX_USER_ID/MAX_CHAT_ID'}\n${text}\n`);
    return { dry: true, text };
  }
  if (!token) throw new Error('Не задан MAX_TOKEN');
  if (!target) throw new Error('Не задан MAX_USER_ID или MAX_CHAT_ID');
  const qs = new URLSearchParams(target);
  const res = await fetch(`${API}?${qs}`, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`MAX ответил ${res.status}: ${body.slice(0, 400)}`);
  return body ? JSON.parse(body) : {};
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
