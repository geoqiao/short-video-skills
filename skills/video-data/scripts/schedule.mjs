// 按 video-data.json 的 time 打印定时用的 cron 表达式和一行 crontab。只打印，不改系统设置。
// 用法（在项目根目录运行）：node <skill>/scripts/schedule.mjs
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.mjs';

const cfg = loadConfig();
const [h, m] = cfg.time.split(':').map(Number);
const expr = `${m} ${h} * * *`;
const collect = join(dirname(fileURLToPath(import.meta.url)), 'collect.mjs');
const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
console.log(`cron 表达式：${expr}（每天 ${cfg.time}，按 ${local} 时间）`);
if (local !== cfg.timezone) console.log(`注意：本机时区是 ${local}，配置里的 timezone 是 ${cfg.timezone}；cron 按本机时区触发，timezone 只决定快照文件的日期。`);
console.log('crontab 一行：');
console.log(`${expr} cd '${process.cwd()}' && node '${collect}' >> '${join(cfg.outDir, 'collect.log')}' 2>&1`);
