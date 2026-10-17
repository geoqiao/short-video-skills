// 把每日快照按作品排成时间序列，看趋势、写周报用。用法（在项目根目录运行）：node <skill>/scripts/stats.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.mjs';

const cfg = loadConfig();
const snaps = readdirSync(cfg.outDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().map((f) => JSON.parse(readFileSync(join(cfg.outDir, f), 'utf8')));
const pct = (v) => (v == null ? '—' : (v * 100).toFixed(1) + '%');
const n = (v, d = 0) => (v == null ? '—' : Number(v).toFixed(d));
const when = (ts) => new Date(ts * 1000).toLocaleString('sv-SE', { timeZone: cfg.timezone }).slice(0, 16);

for (const platform of cfg.platforms) {
  console.log(`\n# ${platform}`);
  console.log('粉丝：' + snaps.map((s) => `${s.date.slice(5)} ${s[platform]?.account?.followers ?? (s[platform]?.error ? '失败' : '—')}`).join(' | '));
  const works = new Map();
  for (const s of snaps) for (const w of s[platform]?.works || []) {
    if (!works.has(w.id)) works.set(w.id, { w, rows: [] });
    works.get(w.id).w = w;
    works.get(w.id).rows.push({ s, w });
  }
  for (const { w, rows } of [...works.values()].sort((a, b) => a.w.publishedAt - b.w.publishedAt)) {
    console.log(`\n## ${(w.desc || '').split('#')[0].trim().slice(0, 40)}（${when(w.publishedAt)} 发布，${w.durationSec} 秒）`);
    // 开头流失：抖音和小红书是 2 秒跳出率，视频号是快速划走率，口径不同，不能直接比
    console.log('| 快照 | 发布后小时 | 播放 | 新增播放 | 平均播放秒 | 完播率 | 开头流失 | 5秒完播 | 赞 | 藏 | 转 | 评 | 涨粉 |');
    console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    let prev = null;
    for (const { s, w: x } of rows) {
      const m = x.metrics || {};
      const age = (Date.parse(s.collectedAt) / 1000 - x.publishedAt) / 3600;
      console.log(`| ${s.date} | ${n(age)} | ${m.view_count} | ${prev == null ? '—' : m.view_count - prev} | ${n(m.avg_view_second, 1)} | ${pct(m.completion_rate)} | ${pct(m.bounce_rate_2s ?? m.fast_flip_rate)} | ${pct(m.completion_rate_5s)} | ${m.like_count} | ${m.favorite_count} | ${m.share_count} | ${m.comment_count} | ${m.subscribe_count ?? m.follow_count ?? '—'} |`);
      prev = m.view_count;
    }
    const last = rows[rows.length - 1].w;
    if (last.metrics?.impression_count != null) console.log(`曝光 ${last.metrics.impression_count}，封面点击率 ${pct(last.metrics.cover_click_rate)}`);
    if (last.sourcesRaw?.length) console.log('流量来源（原始）：' + JSON.stringify(last.sourcesRaw));
    if (last.sources?.length) console.log('流量来源：' + [...last.sources].sort((a, b) => b.share - a.share).map((x) => `${x.key} ${pct(x.share)}`).join('，'));
    if (last.chapters?.length) console.log('章节点击：' + last.chapters.map((c) => `${c.name}@${c.at}s ${pct(c.clickRate)}`).join('，'));
    if (last.search?.inspire?.length || last.search?.showFrom?.length) console.log('搜索词：' + JSON.stringify(last.search));
    if (last.retention?.length) console.log('留存曲线：' + JSON.stringify(last.retention));
  }
}
