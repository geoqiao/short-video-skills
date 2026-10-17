// 读小红书搜索框的联想词（只读）。先开一个 www.xiaohongshu.com/explore 标签页并切过去，把 SEEDS 换成自己的种子词，
// 再 playwright-cli -s=chrome --raw run-code --filename=xhs-suggest.js
// 搜索框清不干净，所以每个词重载一次页面；一次别超过 25 个词，否则命令会超时。
async page => {
  const SEEDS = ['ai做视频', 'ai做科普视频'];
  if (!page.url().includes('www.xiaohongshu.com')) return 'wrong tab ' + page.url();
  const got = {};
  page.on('response', async r => { const u = r.url(); if (/search\/recommend/.test(u) && /keyword=/.test(u)) { try { const k = decodeURIComponent(u.match(/keyword=([^&]+)/)[1].replace(/\+/g, ' ')); const j = await r.json(); got[k] = ((j.data && j.data.sug_items) || []).map(s => s.text); } catch (e) {} } });
  const out = {};
  for (const q of SEEDS) {
    await page.goto('https://www.xiaohongshu.com/explore', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1800);
    await page.mouse.click(1000, 94); await page.waitForTimeout(300); // 真正的 input 宽度为 0，点可见的搜索框
    await page.keyboard.type(q, { delay: 40 }); await page.waitForTimeout(1800);
    out[q] = got[q] || null;
  }
  return JSON.stringify(out);
}
