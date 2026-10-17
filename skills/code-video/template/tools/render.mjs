// 逐帧渲染：node tools/render.mjs <slug> [--stills 1.5,8,20] [--fps 30]
// 用本机 Chrome 打开 src/stage.html，调用 render(t) 取每一帧，再交给 ffmpeg 合成。
// 每期的文件都在 episodes/<期号>-<slug>/ 下：script.json、shots.js、build/、out/。
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadBrand } from './brand.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [slug, ...rest] = process.argv.slice(2);
const opt = (name) => { const i = rest.indexOf('--' + name); return i < 0 ? null : rest[i + 1]; };
const fps = Number(opt('fps') || 30);
const stills = opt('stills');
const found = readdirSync(join(root, 'episodes')).filter((d) => d.replace(/^[^-]*-/, '') === slug);
if (found.length !== 1) { console.error('episodes/ 下没有唯一的 <期号>-' + slug + ' 目录'); process.exit(1); }
const episode = join(root, 'episodes', found[0]);
const build = join(episode, 'build');
const outDir = join(episode, 'out');
const url = pathToFileURL(join(root, 'src/stage.html')).href + '?v=' + found[0];

const { brand, avatar } = loadBrand(root);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const open = async () => {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  await page.addInitScript(([b, a]) => { window.BRAND = b; if (a) window.AVATAR_SRC = a; }, [brand, avatar]);
  await page.goto(url);
  await page.evaluate(() => window.READY);
  return page;
};
const grab = (page, t, type) => page.evaluate(([t, type]) => {
  window.render(t);
  return document.getElementById('stage').toDataURL(type, 0.95).split(',')[1];
}, [t, type]);

if (stills) {
  const dir = join(build, 'stills');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const page = await open();
  const duration = await page.evaluate(() => window.DURATION);
  const times = stills === 'auto'
    ? await page.evaluate(() => window.TIMELINE.lines.map((l) => +(l.end - 0.1).toFixed(2)))
    : stills.split(',').map(Number);
  for (const t of times) {
    const name = 't' + t.toFixed(2).padStart(6, '0') + '.png';
    writeFileSync(join(dir, name), Buffer.from(await grab(page, t, 'image/png'), 'base64'));
  }
  console.log(slug + ': ' + times.length + ' stills of ' + duration + 's -> ' + dir);
} else {
  const dir = join(build, 'frames');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const pages = await Promise.all([0, 1, 2, 3].map(open));
  // 第 0 帧就是封面，单独存一张供平台上传
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'cover.png'), Buffer.from(await grab(pages[0], 0, 'image/png'), 'base64'));
  const duration = await pages[0].evaluate(() => window.DURATION);
  const total = Math.ceil(duration * fps);
  let next = 0;
  await Promise.all(pages.map(async (page) => {
    while (next < total) {
      const f = next++;
      const data = await grab(page, f / fps, 'image/jpeg');
      writeFileSync(join(dir, 'f' + String(f).padStart(5, '0') + '.jpg'), Buffer.from(data, 'base64'));
    }
  }));
  const out = join(outDir, 'video.mp4');
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(fps), '-i', join(dir, 'f%05d.jpg'), '-i', join(build, 'audio.wav'),
    '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
  if (r.status !== 0) process.exitCode = 1;
  rmSync(dir, { recursive: true, force: true });
  console.log(slug + ': ' + total + ' frames -> ' + out);
}
await browser.close();
