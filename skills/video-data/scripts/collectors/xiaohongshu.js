// 小红书创作服务平台：只读。由 scripts/collect.mjs 通过 playwright-cli run-code 执行，返回 JSON 字符串。
// 接口带签名，不直接请求，只读页面自己加载的响应。单篇数据要逐个打开笔记的数据详情页。
async page => {
  const cap = {}, base = {}, source = {};
  page.on('response', async (r) => {
    const m = r.url().match(/creator\.xiaohongshu\.com(\/api\/galaxy\/[^?]+)(?:\?(.*))?/);
    if (!m) return;
    try {
      const d = (await r.json()).data;
      const id = ((m[2] || '').match(/note_id=([0-9a-f]+)/) || [])[1];
      if (m[1].endsWith('/datacenter/note/base') && id) base[id] = d;
      else if (m[1].endsWith('/datacenter/note/audience/source') && id) source[id] = d;
      else cap[m[1]] = d;
    } catch (e) {}
  });
  await page.goto('https://creator.xiaohongshu.com/new/home', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await page.goto('https://creator.xiaohongshu.com/new/note-manager', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  const posted = cap['/api/galaxy/v2/creator/note/user/posted'];
  if (/login/.test(page.url()) || !posted || !posted.notes) return JSON.stringify({ platform: 'xiaohongshu', error: 'not_logged_in', url: page.url() });

  const p = cap['/api/galaxy/creator/home/personal_info'] || {};
  const out = { platform: 'xiaohongshu', account: { name: p.name, followers: p.fans_count, likesAndFavorites: p.faved_count }, works: [] };
  // 后台用 -1 表示"还没有数据"
  const n = (v) => (typeof v === 'number' && v >= 0 ? v : null);
  // 后台的比例是百分数（59.1 表示 59.1%），换成和抖音、视频号一样的小数
  const r = (v) => (n(v) == null ? null : n(v) / 100);
  // 只取最近 30 天发布的视频笔记，最多 12 条；笔记列表只读第一页
  const since = Date.now() / 1000 - 30 * 86400;
  const notes = posted.notes.filter((x) => x.type === 'video' && x.visible_time > since).slice(0, 12);
  for (const x of notes) {
    await page.goto('https://creator.xiaohongshu.com/statistics/note-detail?noteId=' + x.id, { waitUntil: 'domcontentloaded' });
    for (let i = 0; i < 16 && !base[x.id]; i++) await page.waitForTimeout(500);
    await page.waitForTimeout(1200);
    const b = base[x.id] || {};
    out.works.push({
      id: x.id,
      desc: x.display_title,
      publishedAt: x.visible_time,
      durationSec: (x.video_info || {}).duration || null,
      metrics: {
        view_count: x.view_count, like_count: x.likes, comment_count: x.comments_count, share_count: x.shared_count, favorite_count: x.collected_count,
        impression_count: n(b.impl_count), cover_click_rate: r(b.cover_click_rate), avg_view_second: n(b.view_time_avg),
        bounce_rate_2s: r(b.exit_view2s_rate), completion_rate_5s: r(b.finish5s_rate), completion_rate: r(b.full_view_rate),
        interaction_rate: r(b.interaction_rate), follow_count: n(b.rise_fans_count), danmaku_count: n(b.danmaku_count),
      },
      // 观看不足 100 时后台不给来源分析；有数据后原样存下，结构到时再对
      sources: null, sourcesRaw: (source[x.id] || {}).no_data ? null : (source[x.id] || {}).source || null,
      detail: !!base[x.id],
    });
  }
  const miss = out.works.filter((w) => !w.detail).length;
  if (miss) out.warning = miss + ' 条笔记没读到数据详情';
  // 第一页最旧的一条还在 30 天内，说明后面几页可能还有该采的
  if (posted.notes.length >= 10 && posted.notes[posted.notes.length - 1].visible_time > since) out.warning = (out.warning ? out.warning + '；' : '') + '笔记列表只读了第一页';
  return JSON.stringify(out);
}
