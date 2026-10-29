import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { ROOT } from './lib/common.mjs';

const DOCS = join(ROOT, 'docs');
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
};
const port = Number(process.env.PORT) || 8080;

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  const file = join(DOCS, path || 'index.html');
  if (!file.startsWith(DOCS)) return res.writeHead(403).end();
  try {
    const target = file.endsWith('/') ? join(file, 'index.html') : file;
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': (TYPES[extname(target)] || 'application/octet-stream') + '; charset=utf-8' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`http://localhost:${port}`));
