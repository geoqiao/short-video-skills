// 竖封面 3:4（1440×1920）：单独排版，不是横封面补边。用法：node tools/cover-vertical.mjs <slug>
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadBrand } from './brand.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const slug = process.argv[2];
const dirs = readdirSync(join(root, 'episodes')).filter((d) => d.replace(/^\d+-/, '') === slug);
if (dirs.length !== 1) { console.error('episodes/ 下没有唯一的 <期号>-' + slug + ' 目录'); process.exit(1); }
const ep = join(root, 'episodes', dirs[0]);
const cover = JSON.parse(readFileSync(join(ep, 'script.json'), 'utf8')).cover;
const { brand, avatar } = loadBrand(root);
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1920 } });
await page.goto(pathToFileURL(join(root, 'src/blank.html')).href);
await page.evaluate((b) => { window.BRAND = b; }, brand);
await page.addScriptTag({ path: join(root, 'src/lib.js') });
const data = await page.evaluate(async ([src, d]) => {
  const { C, F, txt, measure, stroke, mark, HANDLE, SERIES } = window.E;
  const W = 1440, H = 1920, X = 112;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  if (src) { window.AVATAR = new Image(); window.AVATAR.src = src; await window.AVATAR.decode(); }
  await Promise.all(['900 74px ' + F.serif, '500 40px ' + F.sans, '500 34px ' + F.mono].map((f) => document.fonts.load(f, '字A')));
  c.fillStyle = C.paper; c.fillRect(0, 0, W, H);
  c.fillStyle = C.line;
  for (let x = 30; x < W; x += 60) for (let y = 30; y < H; y += 60) c.fillRect(x, y, 3, 3);
  // 上半：期号、标题、笔画、钩子句，全部左对齐；下半：头像放大压在右下
  c.beginPath(); c.arc(X + 20, 201, 19, 0, Math.PI * 2); c.fillStyle = C.accent; c.fill();
  const w = SERIES ? txt(c, SERIES, X + 62, 226, { size: 76, weight: 600 }) + 32 : 0;
  txt(c, '第 ' + d.no + ' 期', X + 62 + w, 226, { size: 76, color: C.mute });
  let size = 290;
  d.lines.forEach((s) => { size = Math.min(size, (290 * 1216) / measure(c, s, { size: 290, font: F.serif, weight: 900 })); });
  const lh = size * 1.22, y0 = 300 + size;
  d.lines.forEach((s, i) => txt(c, s, X - 8, y0 + i * lh, { size, font: F.serif, weight: 900, color: i === d.hot ? C.accent : C.ink }));
  const y = y0 + (d.lines.length - 1) * lh + size * 0.42;
  stroke(c, X + 8, y, 520, 24);
  const ts = Math.min(88, (88 * 1216) / measure(c, d.tag, { size: 88 }));
  txt(c, d.tag, X, y + 170, { size: ts, color: C.ink });
  // 头像放在钩子句下方，按剩余高度取大小，不压字；没配头像就空着
  const top = y + 200, ms = Math.min(900, H - 40 - top);
  mark(c, W - 70 - ms, top, ms);
  txt(c, HANDLE, X, 1790, { size: 68, font: F.mono, color: C.mute });
  return cv.toDataURL('image/png').split(',')[1];
}, [avatar, cover]);
writeFileSync(join(ep, 'out/cover-3x4.png'), Buffer.from(data, 'base64'));
await browser.close();
console.log(join('episodes', dirs[0], 'out/cover-3x4.png'));
