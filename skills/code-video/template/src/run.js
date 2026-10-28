// 时间线驱动：第 0 帧是封面，之后每个镜头接上一镜头。转场默认横向平移；
// shots.js 可以写 window.TRANSITIONS = { 3: 'push' } 改第 3 个镜头的进场方式（pan 平移、cut 硬切、push 推进）。
// script.json 的 turns 里的镜头默认硬切。
(function () {
  const { W, H, C, F, clamp, eo, eio, txt, measure, rrect, stroke, mark, HANDLE, SERIES, seen, cue } = window.E;
  const cv = document.getElementById('stage');
  const c = cv.getContext('2d');
  const TL = window.TIMELINE, SHOTS = window.SHOTS, TR = window.TRANSITIONS || {};
  const COVER = 0.3, LEAD = 0.6, MOVE = 0.95;
  const kind = (i) => (i <= 0 ? 'pan' : TR[i + 1] || ((TL.turns || []).includes(i + 1) ? 'cut' : 'pan'));
  // 硬切落在开口前一点点：安静之后，画面和第一个字一起来
  const shotStart = (i) => (i === 0 ? COVER : TL.lines[i].start - (kind(i) === 'cut' ? 0.05 : LEAD));

  function ctxFor(i, t) {
    const L = TL.lines[i];
    const tl = t - L.start;
    const segs = L.segs.map((s) => s.start - L.start);
    const at = (j, delay = 0, d = 0.7) => eo((tl - (segs[Math.min(j, segs.length - 1)] + delay)) / d);
    const raw = (j, delay = 0, d = 0.7) => clamp((tl - (segs[Math.min(j, segs.length - 1)] + delay)) / d);
    // 镜头内运镜：在画任何东西之前调用。from 是起始取景（默认全景），
    // moves 每一步在第 at 个分句后 delay 秒开始、dur 秒内移到以 (x, y) 为中心、放大 z 倍的取景。
    const cam = (c, moves, from) => {
      let s = Object.assign({ x: W / 2, y: H / 2, z: 1 }, from);
      for (const m of moves) {
        const p = eio(raw(m.at || 0, m.delay || 0, m.dur || 0.9));
        const to = { x: m.x ?? W / 2, y: m.y ?? H / 2, z: m.z ?? 1 };
        s = { x: s.x + (to.x - s.x) * p, y: s.y + (to.y - s.y) * p, z: s.z + (to.z - s.z) * p };
      }
      // 取景不出画布边
      const x = clamp(s.x, W / 2 / s.z, W - W / 2 / s.z), y = clamp(s.y, H / 2 / s.z, H - H / 2 / s.z);
      c.translate(W / 2, H / 2); c.scale(s.z, s.z); c.translate(-x, -y);
    };
    return { t: tl, d: L.end - L.start, segs, at, raw, cam, on: (j, d) => at(j, 0, d) };
  }

  function background(camX) {
    c.fillStyle = C.paper; c.fillRect(0, 0, W, H);
    // 视差点阵，比镜头走得慢
    const off = -((camX * 0.35) % 60);
    c.fillStyle = C.line;
    for (let x = off - 60; x < W + 60; x += 60) for (let y = 30; y < H; y += 60) c.fillRect(x, y, 3, 3);
  }

  // 封面：全系列同一版式。左边系列名和期号、标题、品牌笔画、钩子句，右边是头像。
  function cover() {
    const d = TL.cover;
    mark(c, 1130, 190, 660);
    c.beginPath(); c.arc(158, 197, 15, 0, Math.PI * 2); c.fillStyle = C.accent; c.fill();
    const w = SERIES ? txt(c, SERIES, 192, 216, { size: 60, weight: 600 }) + 28 : 0;
    txt(c, '第 ' + d.no + ' 期', 192 + w, 216, { size: 60, color: C.mute });
    let size = 160;
    d.lines.forEach((s) => { size = Math.min(size, (160 * 960) / measure(c, s, { size: 160, font: F.serif, weight: 900 })); });
    const lh = size * 1.24;
    d.lines.forEach((s, i) => txt(c, s, 132, 470 + i * lh, { size, font: F.serif, weight: 900, color: i === d.hot ? C.accent : C.ink }));
    const y = 470 + (d.lines.length - 1) * lh + size * 0.44;
    stroke(c, 146, y, 400, 18);
    txt(c, d.tag, 140, y + 124, { size: 60, color: C.ink });
    txt(c, HANDLE, 140, 972, { size: 56, font: F.mono, color: C.mute });
  }

  function subtitle(t) {
    const L = TL.lines.find((l) => t >= l.start - 0.05 && t <= l.end + 0.25);
    if (!L) return;
    let seg = L.segs[0];
    for (const s of L.segs) if (t >= s.start - 0.05) seg = s;
    const s = seg.sub.replace(/[，。：；、]$/u, '');
    const w = measure(c, s, { size: 56, weight: 500 }) + 72;
    rrect(c, W / 2 - w / 2, 932, w, 96, 16, C.ink);
    txt(c, s, W / 2, 982, { size: 56, weight: 500, color: C.paper, align: 'center', base: 'middle' });
  }

  window.DURATION = TL.duration;
  window.render = function (t) {
    t = clamp(t, 0, TL.duration);
    let i = -1;
    for (let j = 0; j < TL.lines.length; j++) if (t >= shotStart(j)) i = j;
    const type = kind(i);
    const mv = i < 0 || type === 'cut' ? 1 : eio((t - shotStart(i)) / MOVE);
    const camX = type === 'pan' ? (i - 1 + mv) * W : i * W;
    c.setTransform(1, 0, 0, 1, 0, 0);
    seen.list = [];
    background(camX);
    const draw = (j, alpha = 1, zoom = 1) => {
      c.save();
      if (type === 'pan') c.translate(j * W - camX, 0);
      c.globalAlpha = alpha;
      if (zoom !== 1) { c.translate(W / 2, H / 2); c.scale(zoom, zoom); c.translate(-W / 2, -H / 2); }
      if (j < 0) cover();
      else if (j < SHOTS.length) {
        const k = ctxFor(j, t);
        // 镜头内缓慢推近
        const z = 1 + 0.025 * clamp((t - shotStart(j)) / (k.d + LEAD + 1));
        c.translate(W / 2, H / 2); c.scale(z, z); c.translate(-W / 2, -H / 2);
        seen.on = true; cue.shot = j;
        SHOTS[j](c, k);
        seen.on = false;
      }
      c.restore();
    };
    if (i < 0) draw(-1);
    else if (mv < 1 && type === 'push') {
      // 推进：上一镜头放大淡出，下一镜头从稍小放大到原尺寸
      draw(i - 1, 1 - mv, 1 + 0.6 * mv);
      draw(i, mv, 0.9 + 0.1 * mv);
    } else {
      if (mv < 1) draw(i - 1);
      draw(i);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    subtitle(t);
    // 进度条：主色走线，点睛色收笔
    const x = W * (t / TL.duration);
    c.fillStyle = C.accent; c.fillRect(0, H - 12, x, 12);
    c.fillStyle = C.green; c.fillRect(Math.max(0, x - 36), H - 12, Math.min(36, x), 12);
  };

  // 音效事件：从头到尾逐帧画一遍，返回 [{t, type}]，type 是 rise、pop、line、stroke、key（打字）和 cut（镜头切换）
  window.CUES = function (fps) {
    const ev = [];
    let prev = new Map();
    cue.on = true;
    for (let f = 0; f <= Math.ceil(TL.duration * fps); f++) {
      const t = f / fps;
      cue.list = []; cue.n = {};
      window.render(t);
      const now = new Map();
      for (const [type, key, p] of cue.list) now.set(key, [type, p]);
      for (const [key, [type, p]] of now) {
        const was = prev.has(key) ? prev.get(key)[1] : 0;
        if (type === 'type') { if (p > was && p < 1) ev.push({ t, type: 'key' }); }
        else if (p > 0 && was <= 0) ev.push({ t, type });
      }
      prev = now;
    }
    cue.on = false;
    for (let j = 1; j < TL.lines.length; j++) ev.push({ t: +shotStart(j).toFixed(3), type: kind(j) === 'pan' ? 'whoosh' : kind(j) });
    return ev.sort((a, b) => a.t - b.t);
  };
})();
