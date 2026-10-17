// 读 Google 搜索联想词：node google-suggest.mjs '[["ai 做视频","zh-CN"],["ai explainer video","en"]]'
// 用的是浏览器搜索框调用的 suggestqueries 接口，不是有文档的公开 API，随时可能变；没有搜索量。
const seeds = JSON.parse(process.argv[2] || '[]');
if (!seeds.length) { console.error('用法：node google-suggest.mjs \'[["种子词","zh-CN"]]\''); process.exit(1); }
const out = {};
for (const [q, hl] of seeds) {
  const u = 'https://suggestqueries.google.com/complete/search?client=firefox&hl=' + hl + '&q=' + encodeURIComponent(q);
  try {
    const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0' } });
    // 返回的编码跟着 content-type 的 charset 走，中文有时不是 UTF-8
    const charset = /charset=([^;]+)/.exec(r.headers.get('content-type') || '')?.[1] || 'utf-8';
    out[q + ' [' + hl + ']'] = JSON.parse(new TextDecoder(charset).decode(await r.arrayBuffer()))[1];
  } catch (e) {
    out[q + ' [' + hl + ']'] = 'ERR ' + e.message;
  }
  await new Promise((ok) => setTimeout(ok, 400));
}
console.log(JSON.stringify(out, null, 1));
