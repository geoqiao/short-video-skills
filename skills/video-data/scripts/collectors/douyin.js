// 抖音创作者中心：只读。由 scripts/collect.mjs 通过 playwright-cli run-code 执行，返回 JSON 字符串。
async page => {
  const got = {};
  let current = null;
  page.on('response', async (r) => {
    const m = r.url().split('?')[0].match(/creator\.douyin\.com\/janus\/douyin\/creator\/data\/(item\/play\/source|item\/chapter|item_analysis\/search\/keyword|realtime\/analysis\/data_center)$/);
    if (!m || !current) return;
    try { got[current][m[1]] = await r.json(); } catch (e) {}
  });
  const api = (path) => page.evaluate(async (p) => {
    const r = await fetch(p, { credentials: 'include', headers: { 'Agw-Js-Conv': 'str' } });
    return r.json();
  }, path);
  const num = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, Number(v)]));

  await page.goto('https://creator.douyin.com/creator-micro/content/manage?tab=works', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  if (!/creator-micro\/content/.test(page.url())) return JSON.stringify({ platform: 'douyin', error: 'not_logged_in', url: page.url() });

  const out = { platform: 'douyin', account: null, works: [] };
  try {
    const u = (await api('/aweme/v1/creator/user/info/')).douyin_user_verify_info || {};
    out.account = { name: u.nick_name, followers: u.follower_count, totalLikes: u.total_favorited };
  } catch (e) {}

  const list = [];
  for (let cursor = 0, n = 0; n < 5; n++) {
    const j = await api('/janus/douyin/creator/pc/work_list?status=0&count=12&max_cursor=' + cursor + '&scene=star_atlas&device_platform=android&aid=1128');
    if (j.status_code !== 0 && !j.aweme_list) return JSON.stringify({ platform: 'douyin', error: 'work_list ' + j.status_code + ' ' + (j.status_msg || '') });
    list.push(...(j.aweme_list || []));
    if (!j.has_more) break;
    cursor = j.max_cursor;
  }

  const fresh = Date.now() / 1000 - 30 * 86400;
  for (const a of list) {
    const id = String(a.aweme_id);
    const w = { id, desc: a.desc, publishedAt: a.create_time, durationSec: Math.round(a.duration / 100) / 10, metrics: null };
    try {
      const it = ((await api('/web/api/creator/item/mget?ids=' + id + '&fields=metrics,review,play_info')).items || [])[0];
      w.metrics = num(it && it.metrics);
    } catch (e) { w.metricsError = String(e).slice(0, 120); }
    if (!w.metrics) w.metrics = { view_count: a.statistics.play_count, like_count: a.statistics.digg_count, comment_count: a.statistics.comment_count, share_count: a.statistics.share_count, favorite_count: a.statistics.collect_count };
    // 流量来源、章节点击率、搜索词、留存曲线只在详情页的"流量分析"里加载，这里只跟近 30 天的作品
    if (a.create_time > fresh && out.works.length < 12) {
      current = id; got[id] = {};
      try {
        await page.goto('https://creator.douyin.com/creator-micro/work-management/work-detail/' + id, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(5000);
        await page.evaluate(() => { const e = [...document.querySelectorAll('.semi-tabs-tab')].find((e) => e.textContent.trim() === '流量分析'); if (e) e.click(); });
        await page.waitForTimeout(6000);
      } catch (e) { w.detailError = String(e).slice(0, 120); }
      const g = got[id];
      current = null;
      w.sources = ((g['item/play/source'] || {}).play_source || []).map((s) => ({ key: s.key, share: s.value }));
      w.chapters = ((g['item/chapter'] || {}).chapter_top_data || []).map((c) => ({ at: c.chapter_detail.Timestamp / 1000, name: c.chapter_detail.Desc, clickRate: c.click_rate }));
      const kw = g['item_analysis/search/keyword'] || {};
      w.search = { inspire: kw.inspire_search || [], showFrom: kw.show_from || [] };
      w.retention = ((g['realtime/analysis/data_center'] || {}).analysis_trend || {}).current_item || [];
    }
    out.works.push(w);
  }
  return JSON.stringify(out);
}
