// 读抖音搜索框的联想词（只读）。先开一个 www.douyin.com 标签页并切过去，把 SEEDS 换成自己的种子词，
// 再运行 playwright-cli -s=chrome --raw run-code --filename=douyin-suggest.js
// 结果是 { 种子词: { val, sug: [联想词] } }。联想词没有搜索量，只说明有人这样搜。
async page => {
  const SEEDS = ['ai做视频', 'ai做科普视频'];
  if (!page.url().includes('www.douyin.com')) return 'wrong tab ' + page.url();
  const got = {};
  page.on('response', async r => { const u = r.url(); if (/sug/.test(u) && /keyword=/.test(u)) { try { const k = decodeURIComponent(u.match(/keyword=([^&]+)/)[1].replace(/\+/g, ' ')); const j = await r.json(); got[k] = (j.sug_list || []).map(s => s.content); } catch (e) {} } });
  const inp = page.locator('input[data-e2e="searchbar-input"]');
  const out = {};
  for (const q of SEEDS) {
    await inp.click(); await inp.fill(''); await page.waitForTimeout(300);
    await page.keyboard.type(q, { delay: 50 }); await page.waitForTimeout(2200);
    out[q] = { val: await inp.inputValue(), sug: got[q] || null };
  }
  await inp.fill('');
  return JSON.stringify({ out, keys: Object.keys(got).slice(-8) });
}