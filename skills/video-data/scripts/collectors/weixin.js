// 视频号助手：只读。由 scripts/collect.mjs 通过 playwright-cli run-code 执行，返回 JSON 字符串。
// 后台接口带签名参数，不直接请求，只读页面自己加载的响应。
async page => {
  const cap = {};
  page.on('response', async (r) => {
    const m = r.url().split('?')[0].match(/mmfinderassistant-bin\/(post\/post_list|auth\/auth_data|statistic\/new_post_total_data)$/);
    if (!m) return;
    try {
      cap[m[1]] = await r.json();
      if (m[1] === 'statistic/new_post_total_data') { const b = JSON.parse(r.request().postData() || '{}'); cap.range = { startTs: Number(b.startTs), endTs: Number(b.endTs) }; }
    } catch (e) {}
  });
  await page.goto('https://channels.weixin.qq.com/platform/post/list', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  const posts = cap['post/post_list'];
  if (/login/.test(page.url()) || !posts || posts.errCode !== 0) return JSON.stringify({ platform: 'weixin', error: 'not_logged_in', url: page.url(), errCode: posts ? posts.errCode : null });
  await page.goto('https://channels.weixin.qq.com/platform/statistic/post', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);

  const f = ((cap['auth/auth_data'] || {}).data || {}).finderUser || {};
  const out = { platform: 'weixin', account: { name: f.nickname, followers: f.fansCount, posts: f.feedsCount }, works: [], daily: null };
  const d = posts.data;
  out.works = (d.list || []).map((p) => ({
    id: p.objectId,
    desc: (p.desc || {}).description,
    publishedAt: p.createTime,
    durationSec: (((p.desc || {}).media || [])[0] || {}).videoPlayLen || null,
    metrics: {
      view_count: p.readCount, like_count: p.likeCount, comment_count: p.commentCount, share_count: p.forwardCount, favorite_count: p.favCount,
      follow_count: p.followCount, completion_rate: p.fullPlayRate, avg_view_second: p.avgPlayTimeSec, fast_flip_rate: p.fastFlipRate,
      share_chat_count: p.forwardAllChatCount, share_moments_count: p.forwardSnsCount,
    },
  }));
  // 作品列表只读第一页；作品多于一页时在这里提示
  if (d.totalCount > out.works.length) out.warning = 'post_list 只读到 ' + out.works.length + '/' + d.totalCount + ' 条';
  const t = (cap['statistic/new_post_total_data'] || {}).data;
  if (t) {
    const pick = (x) => ({ views: (x.browse || []).map(Number), likes: (x.like || []).map(Number), shares: (x.forward || []).map(Number), follows: (x.follow || []).map(Number) });
    out.daily = { range: cap.range, total: pick(t.totalData || {}), bySource: (t.dataByTabtype || []).map((s) => ({ source: s.tabTypeName, ...pick(s.data || {}) })) };
  }
  return JSON.stringify(out);
}
