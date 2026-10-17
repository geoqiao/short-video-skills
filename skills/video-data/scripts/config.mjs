// 读项目根目录（运行命令时的当前目录）下的 video-data.json；没有就用默认值。
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const PLATFORMS = ['douyin', 'weixin', 'xiaohongshu'];

export function loadConfig(cwd = process.cwd()) {
  const file = resolve(cwd, 'video-data.json');
  const c = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const cfg = {
    time: c.time ?? '12:10',
    timezone: c.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    platforms: c.platforms ?? PLATFORMS,
    outDir: resolve(cwd, c.outDir ?? 'data/snapshots'),
  };
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(cfg.time)) throw new Error('video-data.json 的 time 要写成 "HH:MM"，例如 "12:10"');
  const bad = cfg.platforms.filter((p) => !PLATFORMS.includes(p));
  if (bad.length) throw new Error('不认识的平台：' + bad.join(', ') + '。可选：' + PLATFORMS.join(', '));
  return cfg;
}
