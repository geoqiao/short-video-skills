async page => {
  // 定时发表：改下面三个值后 run-code。先选"定时"，再在日历里翻到目标月份点日期（跳过灰色和不可选的格子），然后打开"时间"框，在时、分两列里点目标值
  const DATE = '2026-10-30', HH = '21', MM = '00';
  await page.bringToFront();
  await (async page => { await page.bringToFront(); const r = page.getByText('定时', { exact: true }).last(); await r.scrollIntoViewIfNeeded(); await r.click(); await page.waitForTimeout(1500); return 'ok'; })(page);
  const date = await (async page => {
    await page.bringToFront();
    const [Y, M, D] = DATE.split('-').map(Number);
    const inp = page.locator('input[placeholder="请选择发表时间"]');
    await inp.scrollIntoViewIfNeeded(); await inp.click(); await page.waitForTimeout(1000);
    const hdr = () => page.evaluate(() => [...document.querySelector('wujie-app').shadowRoot.querySelectorAll('.weui-desktop-picker__panel__label')].filter(e => e.getBoundingClientRect().height > 0).map(e => e.textContent.trim()).join(''));
    for (let k = 0; k < 3; k++) {
      const h = await hdr();
      if (h === Y + '年' + M + '月') break;
      const p = await page.evaluate(() => { const b = [...document.querySelector('wujie-app').shadowRoot.querySelectorAll('.weui-desktop-btn__icon__right')].find(e => e.getBoundingClientRect().height > 0); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      if (!p) return 'STOP no next ' + h;
      await page.mouse.click(p.x, p.y); await page.waitForTimeout(800);
    }
    const h = await hdr();
    if (h !== Y + '年' + M + '月') return 'STOP month ' + h;
    const c = await page.evaluate((D) => { const a = [...document.querySelector('wujie-app').shadowRoot.querySelectorAll('.weui-desktop-picker__table a')].find(a => a.getBoundingClientRect().height > 0 && a.textContent.trim() === String(D) && !a.className.includes('faded')); if (!a) return null; const r = a.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, dis: a.className.includes('disabled') }; }, D);
    if (!c) return 'STOP no day';
    if (c.dis) return 'STOP day disabled';
    await page.mouse.click(c.x, c.y); await page.waitForTimeout(800);
    const tb = await page.getByText('时间', { exact: true }).last().boundingBox();
    await page.mouse.click(tb.x + 120, tb.y + tb.height / 2); await page.waitForTimeout(1000);
    return 'month=' + h + ' value=' + await inp.inputValue();
  })(page);
  if (date.startsWith('STOP')) return date;
  return date + ' | ' + await (async page => {
    await page.bringToFront();
    const pick = async (cls, val) => {
      const p = await page.evaluate(([cls, val]) => { const r = document.querySelector('wujie-app').shadowRoot; const ol = [...r.querySelectorAll('ol.weui-desktop-picker__time__panel')].find(o => o.className.includes(cls) && o.getBoundingClientRect().height > 0); if (!ol) return null; const li = [...ol.querySelectorAll('li')].find(l => l.textContent.trim() === val); if (!li) return null; li.scrollIntoView({ block: 'nearest' }); const b = li.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, [cls, val]);
      if (!p) return cls + ':miss';
      await page.mouse.click(p.x, p.y); await page.waitForTimeout(700);
      return cls + ':ok';
    };
    const a = await pick('hour', HH);
    const b = await pick('minute', MM);
    const v = await page.locator('input[placeholder="请选择发表时间"]').inputValue();
    return a + ' ' + b + ' when=' + v;
  })(page);
}
