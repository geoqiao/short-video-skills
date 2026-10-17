// 每日采集：通过已登录的 Chrome（playwright-cli 扩展）只读创作者后台，存一份当日快照。
// 用法（在项目根目录运行）：node <skill>/scripts/collect.mjs [douyin|weixin|xiaohongshu]
// 后台只显示当前累计值，历史要靠这里每天存。输出 <outDir>/<日期>.json，同一天重跑会合并、覆盖。
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cfg = loadConfig();
// playwright-cli 会在当前目录写快照文件，放到临时目录里
const cli = (args) => execFileSync('playwright-cli', args, { cwd: tmpdir(), encoding: 'utf8', timeout: 240000 });

function collect(name) {
  const session = `collect-${name}-${Date.now()}`;
  try {
    cli(['attach', '--extension=chrome', `--session=${session}`]);
    let v = JSON.parse(cli([`-s=${session}`, 'run-code', `--filename=${join(here, 'collectors', name + '.js')}`, '--raw']));
    if (typeof v === 'string') v = JSON.parse(v);
    return v;
  } catch (e) {
    return { platform: name, error: String(e.stdout || e.message).slice(0, 300) };
  } finally {
    // 只关自己开的标签页
    for (const cmd of ['tab-close', 'close']) { try { cli([`-s=${session}`, cmd]); } catch {} }
  }
}

const only = process.argv[2];
if (only && !cfg.platforms.includes(only)) { console.error(`${only} 不在 video-data.json 的 platforms 里`); process.exit(2); }
const date = new Date().toLocaleDateString('sv-SE', { timeZone: cfg.timezone });
const file = join(cfg.outDir, date + '.json');
const snap = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
snap.date = date;
snap.collectedAt = new Date().toISOString();
let failed = 0;
// 每采完一个平台就落盘，整体被外部超时打断时已采到的不会丢
const save = () => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(snap, null, 1) + '\n'); };
for (const name of cfg.platforms) {
  if (only && only !== name) continue;
  const r = collect(name);
  // 采集失败时保留当天已有的那份，不用错误覆盖
  if (r.error && snap[name] && !snap[name].error) { console.log(`${name}: 失败（${r.error}），保留当天已有数据`); failed++; continue; }
  snap[name] = r;
  if (r.error) { failed++; console.log(`${name}: 失败 ${r.error}`); }
  else console.log(`${name}: ${r.works.length} 条作品，粉丝 ${r.account?.followers ?? '?'}` + (r.warning ? '，' + r.warning : ''));
  save();
}
console.log(file);
process.exit(failed ? 1 : 0);
