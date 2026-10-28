async page => {
  // 定时发布：改下面三个值后 run-code。先选"定时发布"，再翻日历点日期，最后在时、分两列滚轮里点到目标值。输入框不接受键入的日期
  const DATE = '2026-10-30', HH = '21', MM = '00';
  await page.bringToFront();
  const sl = page.locator('label', { hasText: '定时发布' }).first(); await sl.scrollIntoViewIfNeeded(); const sb = await sl.boundingBox();
  await page.mouse.click(sb.x + 18, sb.y + sb.height / 2); await page.waitForTimeout(1500);
  const date = await (async page => {
    await page.bringToFront();
    const [Y, M, D] = DATE.split('-').map(Number);
    const inp = page.locator('input[placeholder="日期和时间"]');
    await inp.scrollIntoViewIfNeeded(); await inp.click(); await page.waitForTimeout(1200);
    const hdr = () => page.evaluate(() => { const e = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && /^\d{4}年\s*\d{1,2}月$/.test((e.textContent||'').trim()) && e.getBoundingClientRect().height > 0); return e ? e.textContent.trim() : null; });
    let h = await hdr();
    if (!h) { const dd = (await inp.inputValue()).slice(0, 10); await page.getByText(dd, { exact: true }).last().click(); await page.waitForTimeout(900); h = await hdr(); }
    if (!h) return 'STOP no calendar';
    for (let k = 0; k < 3; k++) {
      const [, y, m] = h.match(/(\d{4})年\s*(\d{1,2})月/).map(Number);
      if (y === Y && m === M) break;
      const p = await page.evaluate(() => { const e = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && /^\d{4}年\s*\d{1,2}月$/.test((e.textContent||'').trim()) && e.getBoundingClientRect().height > 0); let row = e.parentElement; while (row && row.querySelectorAll('button,[role=button],svg').length < 2) row = row.parentElement; const bs = [...row.querySelectorAll('button,[role=button]')].filter(b => b.getBoundingClientRect().width > 0); const b = bs[bs.length - 1].getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
      await page.mouse.click(p.x, p.y); await page.waitForTimeout(900); h = await hdr();
    }
    const cell = await page.evaluate((D) => { const e = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && /^\d{4}年\s*\d{1,2}月$/.test((e.textContent||'').trim()) && e.getBoundingClientRect().height > 0); let panel = e; while (panel && panel.getBoundingClientRect().height < 250) panel = panel.parentElement; const cs = [...panel.querySelectorAll('*')].filter(c => c.children.length === 0 && (c.textContent||'').trim() === String(D) && c.getBoundingClientRect().height > 0); const c = cs[0]; if (!c) return null; const b = c.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, D);
    if (!cell) return 'STOP no day ' + h;
    await page.mouse.click(cell.x, cell.y); await page.waitForTimeout(900);
    const v = await inp.inputValue();
    await page.getByText(v.slice(-5), { exact: true }).last().click(); await page.waitForTimeout(900);
    return 'month=' + h + ' value=' + v + ' timepanel=' + await page.getByText('选择时间', { exact: true }).last().isVisible();
  })(page);
  if (date.startsWith('STOP')) return date;
  return date + ' | ' + await (async page => {
    await page.bringToFront();
    const inp = page.locator('input[placeholder="日期和时间"]');
    const cur = async () => (await inp.inputValue()).slice(-5).split(':');
    const ensureOpen = async () => {
      if (!(await page.getByText('选择时间', { exact: true }).count()) || !(await page.getByText('选择时间', { exact: true }).last().isVisible())) {
        await inp.scrollIntoViewIfNeeded(); await inp.click(); await page.waitForTimeout(1000);
        const hm = (await inp.inputValue()).slice(-5);
        await page.getByText(hm, { exact: true }).last().click(); await page.waitForTimeout(1000);
      }
    };
    const step = async (target, left) => {
      for (let k = 0; k < 12; k++) {
        await ensureOpen();
        const [h, m] = await cur(); const now = left ? h : m;
        if (now === target) return 'ok ' + target;
        const p = await page.evaluate(([target, left, now]) => {
          const head = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && (e.textContent||'').trim() === '选择时间');
          let panel = head; while (panel && panel.getBoundingClientRect().height < 250) panel = panel.parentElement;
          const pb = panel.getBoundingClientRect(); const mid = pb.x + pb.width / 2;
          const items = [...panel.querySelectorAll('li')].map(e => ({ e, t: (e.textContent||'').trim().replace(/[时分]$/, ''), b: e.getBoundingClientRect() }))
            .filter(o => ((o.b.x + o.b.width/2 < mid) === left) && o.b.height > 0 && o.b.y > pb.y + 50 && o.b.bottom < pb.bottom - 55);
          let o = items.find(o => o.t === target);
          if (!o) { const n = +now, t = +target, mod = left ? 24 : 60; const down = ((t - n) % mod + mod) % mod <= mod / 2; const ys = items.sort((a, b) => a.b.y - b.b.y); o = down ? ys[ys.length - 1] : ys[0]; }
          return o ? { x: o.b.x + o.b.width/2, y: o.b.y + o.b.height/2, t: o.t } : null;
        }, [target, left, now]);
        if (!p) return 'nopanel';
        await page.mouse.click(p.x, p.y); await page.waitForTimeout(900);
      }
      return 'fail ' + target;
    };
    const a = await step(HH, true);
    const b = await step(MM, false);
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    return a + ' ' + b + ' when=' + await inp.inputValue();
  })(page);
}
