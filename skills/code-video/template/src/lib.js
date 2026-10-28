// 渲染引擎：所有画面只由时间 t 决定，window.render(t) 画出第 t 秒。
(function () {
  const W = 1920, H = 1080;
  // 品牌由 tools/render.mjs 从 brand.json 注入为 window.BRAND，没写的项用这里的默认值。
  // accent 是主强调色；green 是点睛色，只用在标题线尾、进度条头、对勾这类小地方
  const B = window.BRAND || {};
  const C = Object.assign({ paper: '#FAF7F2', ink: '#1C1B18', mute: '#8A8580', line: '#E2DBD2', soft: '#F0EAE2', accent: '#D14289', green: '#4FAE8F', white: '#FFFFFF' }, B.colors);
  const F = Object.assign({
    serif: '"Songti SC","STSong",serif',
    sans: '"PingFang SC","Hiragino Sans GB",sans-serif',
    mono: '"SF Mono","Menlo",monospace',
  }, B.fonts);
  const SERIES = B.series || '';
  const HANDLE = B.handle || '';
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, p) => a + (b - a) * p;
  const eo = (p) => 1 - Math.pow(1 - clamp(p), 3);
  const eio = (p) => { p = clamp(p); return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; };
  const spring = (p) => { p = clamp(p); return 1 - Math.exp(-7 * p) * Math.cos(9 * p); };

  // 手机竖持看横屏时画面只有约 390pt 宽，1920 画布上的 24px 只剩 5pt。
  // 所以小字统一抬高：24→34、34→41、44→48，56 以上不动。
  const fit = (s) => (s >= 56 ? s : Math.round(34 + ((s - 24) * 22) / 32));
  // 阅读时长检查（render.mjs --readcheck）：run.js 画镜头时打开，记下每段字在屏幕上的框和透明度。
  // 来源脚注（传入字号不超过 24）和 o.read === false 的字不记。
  const seen = { on: false, list: [] };
  // 音效事件（render.mjs 渲染前逐帧过一遍）：动画元素每帧记下进度，进度从 0 变正的那一帧就是出场。
  // 同一段代码画的元素按出现顺序编号，所以同一个辅助函数画的几个元素各算各的。
  const cue = { on: false, list: [], n: {}, shot: 0, inner: 0 };
  function cueNote(kind, sig, p) {
    if (!cue.on || cue.inner) return;
    const key = cue.shot + '|' + kind + '|' + sig;
    cue.n[key] = (cue.n[key] || 0) + 1;
    cue.list.push([kind, key + '|' + cue.n[key], p]);
  }
  function note(c, s, x, y, w, px, o) {
    const left = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
    const base = o.base || 'alphabetic';
    const top = base === 'middle' ? y - px / 2 : base === 'top' ? y : y - px * 0.8;
    const m = c.getTransform();
    const xs = [], ys = [];
    for (const [px_, py] of [[left, top], [left + w, top], [left, top + px], [left + w, top + px]]) {
      xs.push(m.a * px_ + m.c * py + m.e); ys.push(m.b * px_ + m.d * py + m.f);
    }
    seen.list.push({ s, a: c.globalAlpha, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
  }
  function txt(c, s, x, y, o = {}) {
    c.save();
    const px = fit(o.size || 40);
    c.font = (o.weight || 400) + ' ' + px + 'px ' + (o.font || F.sans);
    c.fillStyle = o.color || C.ink;
    c.textAlign = o.align || 'left';
    c.textBaseline = o.base || 'alphabetic';
    if (o.alpha != null) c.globalAlpha *= clamp(o.alpha);
    c.fillText(s, x, y);
    const w = c.measureText(s).width;
    if (seen.on && o.read !== false && (o.size || 40) > 24 && String(s).trim()) note(c, String(s), x, y, w, px, o);
    c.restore();
    return w;
  }
  function measure(c, s, o = {}) {
    c.save();
    c.font = (o.weight || 400) + ' ' + fit(o.size || 40) + 'px ' + (o.font || F.sans);
    const w = c.measureText(s).width;
    c.restore();
    return w;
  }
  // 进场：透明度加一小段位移，p 为 0..1
  function rise(c, p, fn, dy = 26, dx = 0) {
    p = clamp(p);
    if (cue.on) cueNote('rise', fn.toString(), p);
    if (p <= 0) return;
    c.save();
    c.globalAlpha *= p;
    c.translate((1 - p) * dx, (1 - p) * dy);
    fn();
    c.restore();
  }
  // 以中心点弹出
  function pop(c, p, cx, cy, fn) {
    if (cue.on) cueNote('pop', fn.toString(), p);
    if (p <= 0) return;
    const s = lerp(0.82, 1, spring(p));
    c.save();
    c.globalAlpha *= clamp(p * 3);
    c.translate(cx, cy); c.scale(s, s); c.translate(-cx, -cy);
    fn();
    c.restore();
  }
  function rrect(c, x, y, w, h, r, fill, stroke, lw = 3) {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
  }
  // 按进度画折线，返回当前端点和方向
  function path(c, pts, p, color = C.ink, lw = 4, dash) {
    p = clamp(p);
    if (cue.on) cueNote('line', pts[0] + '', p);
    if (p <= 0) return null;
    let total = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
    let left = total * p, end = pts[0], ang = 0;
    c.save();
    c.strokeStyle = color; c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round';
    if (dash) c.setLineDash(dash);
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const d = seg[i - 1], a = pts[i - 1], b = pts[i];
      const q = d === 0 ? 1 : clamp(left / d);
      end = [lerp(a[0], b[0], q), lerp(a[1], b[1], q)];
      ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      c.lineTo(end[0], end[1]);
      left -= d;
      if (left <= 0) break;
    }
    c.stroke();
    c.restore();
    return { end, ang };
  }
  function arrow(c, pts, p, color = C.ink, lw = 4, dash) {
    if (cue.on) cueNote('line', pts[0] + '', clamp(p));
    cue.inner++;
    const r = path(c, pts, p, color, lw, dash);
    cue.inner--;
    if (!r || p < 0.08) return;
    const s = 9 + lw * 2.2;
    c.save();
    c.translate(r.end[0], r.end[1]); c.rotate(r.ang);
    c.fillStyle = color;
    c.beginPath(); c.moveTo(4, 0); c.lineTo(-s, -s * 0.55); c.lineTo(-s, s * 0.55); c.closePath(); c.fill();
    c.restore();
  }
  // 标签块，返回宽度
  function chip(c, s, x, y, o = {}) {
    const size = o.size || 34, padX = o.padX || 22, h = o.h || fit(size) + 30;
    const w = o.w || measure(c, s, { size, font: o.font || F.mono, weight: o.weight || 500 }) + padX * 2;
    rrect(c, x, y, w, h, o.r == null ? 12 : o.r, o.fill === undefined ? C.white : o.fill, o.stroke === undefined ? C.ink : o.stroke, o.lw || 3);
    txt(c, s, x + w / 2, y + h / 2 + 2, { size, font: o.font || F.mono, weight: o.weight || 500, color: o.color || C.ink, align: 'center', base: 'middle' });
    return w;
  }
  // 每个镜头左上角的标题，带一条画出来的强调线
  function title(c, k, s, sub) {
    const p = k.at(0, -0.15, 0.7);
    rise(c, p, () => txt(c, s, 140, 190, { size: 74, font: F.serif, weight: 900 }), 0, -40);
    stroke(c, 140, 228, 150, 10, k.at(0, 0.15, 0.8));
    if (sub) rise(c, k.at(0, 0.3, 0.6), () => txt(c, sub, 364, 242, { size: 30, color: C.mute }), 0, -20);
  }
  // 品牌笔画：圆头主色横线，末尾带一撇点睛色
  function stroke(c, x, y, w, lw, p = 1) {
    if (cue.on) cueNote('stroke', x + ',' + y, clamp(p));
    cue.inner++;
    path(c, [[x, y], [x + w, y]], clamp(p * 1.4), C.accent, lw);
    path(c, [[x + w + lw * 1.6, y + lw * 0.1], [x + w + lw * 4.2, y + lw * 1.1]], clamp(p * 3.5 - 2.5), C.green, lw);
    cue.inner--;
  }
  // 头像（brand.json 的 avatar），正片叠底让白底融进纸色；没配头像就不画
  function mark(c, x, y, size) {
    if (!window.AVATAR) return;
    c.save();
    c.globalCompositeOperation = 'multiply';
    c.imageSmoothingQuality = 'high';
    c.drawImage(window.AVATAR, x, y, size, size);
    c.restore();
  }
  // 片尾落款：头像加账号名。只写站内账号名，不写网址：B 站和抖音都把网址、站外账号算作导流
  function sign(c, p, x, y, align) {
    const pad = window.AVATAR ? 96 : 0;
    const w = measure(c, HANDLE, { size: 34, font: F.mono });
    const left = align === 'right' ? x - w - pad : x;
    rise(c, p, () => { mark(c, left, y - 62, 84); txt(c, HANDLE, left + pad, y, { size: 34, font: F.mono, color: C.mute, read: false }); });
  }
  function fmt(n, d = 0) {
    return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function code(c, lines, x, y, p, o = {}) {
    const size = o.size || 32, lh = o.lh || size * 1.62;
    const total = lines.reduce((a, l) => a + l.length, 0);
    if (cue.on) cueNote('type', lines[0], clamp(p));
    let left = Math.floor(total * clamp(p));
    lines.forEach((l, i) => {
      if (left <= 0) return;
      const s = l.slice(0, left); left -= l.length;
      const isComment = l.trim().startsWith('//');
      txt(c, s, x, y + i * lh, { size, font: F.mono, color: isComment ? C.mute : (o.color || C.ink) });
    });
  }

  window.E = { W, H, C, F, clamp, lerp, eo, eio, spring, txt, measure, rise, pop, rrect, path, arrow, chip, title, fmt, code, stroke, mark, sign, HANDLE, seen, cue };
})();
