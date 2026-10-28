// 逐帧渲染：node tools/render.mjs <slug> [--stills 1.5,8,20] [--fps 30] [--readcheck] [--audio]
// 用本机 Chrome 打开 src/stage.html，调用 render(t) 取每一帧，再交给 ffmpeg 合成。
// 渲染前先逐帧导出音效事件（build/events.json），由 tools/mix.py 混出 build/audio.wav；--audio 只做这一步。
// 每期的文件都在 episodes/<期号>-<slug>/ 下：script.json、shots.js、build/、out/。
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadBrand } from './brand.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [slug, ...rest] = process.argv.slice(2);
const opt = (name) => { const i = rest.indexOf('--' + name); return i < 0 ? null : rest[i + 1]; };
const fps = Number(opt('fps') || 30);
const stills = opt('stills');
const readcheck = rest.includes('--readcheck');
const audioOnly = rest.includes('--audio');
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
// 配乐和音效跟着画面走：先导出每个元素出场的时刻，再混音。
// voice.py 改版前配音的老期没有 voice.wav，沿用 build/ 里已有的 audio.wav
const mixAudio = async (page) => {
  if (!existsSync(join(build, 'voice.wav'))) { console.warn(slug + ': 没有 build/voice.wav，沿用旧的 audio.wav（重跑 voice.py 后才有新配乐和音效）'); return; }
  const events = await page.evaluate((fps) => window.CUES(fps), fps);
  writeFileSync(join(build, 'events.json'), JSON.stringify(events));
  const r = spawnSync('uv', ['run', '--quiet', join(root, 'tools/mix.py'), slug], { stdio: 'inherit' });
  if (r.status !== 0) { console.error('mix.py 失败'); process.exit(1); }
};
const grab = (page, t, type) => page.evaluate(([t, type]) => {
  window.render(t);
  return document.getElementById('stage').toDataURL(type, 0.95).split(',')[1];
}, [t, type]);

if (readcheck) {
  // 阅读时长：每 0.1 秒取一次画面里完整可见的字（透明度不低于 0.9，整段在画面内），
  // 每段字连续停留的时间要不少于 中文字数 ÷ 4.5 + 其他字符数 ÷ 15 + 1.5 秒
  const page = await open();
  const step = 0.1;
  const frames = await page.evaluate((step) => {
    const out = [];
    for (let t = 0; t <= window.DURATION + 1e-6; t += step) {
      window.render(t);
      out.push(window.E.seen.list.filter((x) => x.a >= 0.9 && x.x0 >= -1 && x.y0 >= -1 && x.x1 <= 1921 && x.y1 <= 1081));
    }
    return out;
  }, step);
  const lines = await page.evaluate(() => window.TIMELINE.lines);
  const need = (s) => { const cjk = (s.match(/[\u3400-\u9fff]/gu) || []).length; const other = s.replace(/[\s\u3400-\u9fff]/gu, '').length; return Math.max(1.5, cjk / 4.5 + other / 15 + 1.5); };
  const shotAt = (t) => { let i = 0; lines.forEach((l, j) => { if (t >= l.start - 0.6) i = j; }); return i + 1; };
  const open_ = new Map(), runs = [];
  frames.forEach((list, f) => {
    const now = new Map(list.map((x) => [x.s, x]));
    for (const [s, r] of open_) if (!now.has(s)) { r.end = f; runs.push(r); open_.delete(s); }
    for (const [s, x] of now) if (!open_.has(s)) open_.set(s, { s, start: f, x0: x.x0, y0: x.y0 });
  });
  for (const r of open_.values()) { r.end = frames.length; runs.push(r); }
  const short = runs.filter((r) => {
    // 采样间隔带来的误差算在容差里
    const dur = (r.end - r.start) * step;
    if (dur + step >= need(r.s)) return false;
    // 打字机和数字滚动的中间状态：不到 0.3 秒就被同一位置的另一段字换掉，或者被它的加长版换掉
    const next = frames[r.end] || [];
    if (next.some((x) => x.s !== r.s && x.s.startsWith(r.s))) return false;
    if (dur < 0.3 && next.some((x) => x.s !== r.s && Math.abs(x.x0 - r.x0) < 6 && Math.abs(x.y0 - r.y0) < 6)) return false;
    return true;
  }).sort((a, b) => a.start - b.start);
  for (const r of short) {
    const t = r.start * step, dur = (r.end - r.start) * step;
    console.log('第 ' + shotAt(t) + ' 镜 ' + t.toFixed(1) + ' 秒「' + r.s + '」停留 ' + dur.toFixed(1) + ' 秒，需要 ' + need(r.s).toFixed(1) + ' 秒');
  }
  console.log(slug + '：' + runs.length + ' 段字，' + short.length + ' 段停留时间不够读完');
  if (short.length) process.exitCode = 1;
} else if (audioOnly) {
  await mixAudio(await open());
} else if (stills) {
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
  await mixAudio(pages[0]);
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
