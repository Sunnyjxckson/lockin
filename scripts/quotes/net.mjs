// Polite network helpers: sequential, cached, retry with backoff.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const RAW = path.join(HERE, 'raw');
export const UA = 'LockInQuoteLibrary/0.1 (sunny@pylorai.com)';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function getText(url, { tries = 8, delay = 1500 } = {}) {
  let wait = delay;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      const body = await res.text();
      const limited =
        res.status === 429 || /too many requests/i.test(body.slice(0, 300));
      if (res.ok && !limited) return body;
      if (!limited && res.status >= 400 && res.status < 500 && res.status !== 408) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
    } catch (e) {
      if (/HTTP 4/.test(String(e.message))) throw e;
    }
    await sleep(wait);
    wait = Math.min(wait * 2, 60000);
  }
  throw new Error(`gave up on ${url}`);
}

// Cached download into raw/. Returns file text.
export async function cached(name, url, { delay = 0 } = {}) {
  fs.mkdirSync(RAW, { recursive: true });
  const file = path.join(RAW, name);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) {
    return fs.readFileSync(file, 'utf8');
  }
  const body = await getText(url);
  fs.writeFileSync(file, body);
  if (delay) await sleep(delay);
  return body;
}

export async function wikisourceHtml(title, { delay = 700 } = {}) {
  const safe = title.replace(/[^A-Za-z0-9]+/g, '_');
  const file = path.join(RAW, 'wikisource', safe + '.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && fs.statSync(file).size > 0) {
    return fs.readFileSync(file, 'utf8');
  }
  const url =
    'https://en.wikisource.org/w/api.php?action=parse&prop=text&format=json&redirects=1&page=' +
    encodeURIComponent(title.replace(/ /g, '_'));
  const body = await getText(url);
  const j = JSON.parse(body);
  if (!j.parse) throw new Error('no parse result for ' + title + ': ' + body.slice(0, 200));
  const html = j.parse.text['*'];
  fs.writeFileSync(file, html);
  await sleep(delay);
  return html;
}
