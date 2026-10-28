// 示例：四个镜头讲这套做法本身。每个镜头是 (c, k) => {}，k.at(i) 是第 i 个分句开始后的进度。
(function () {
  const { C, F, txt, rise, pop, rrect, arrow, chip, title, code, sign } = window.E;

  const shots = [
    // 1 结论先行：每一帧都是代码。先贴近大字，第 2 个分句起拉远露出右边的帧
    (c, k) => {
      k.cam(c, [{ at: 1, delay: 0.1, dur: 1.0 }], { x: 700, y: 420, z: 1.15 });
      rise(c, k.at(0, -0.3, 0.8), () => txt(c, '每一帧', 132, 330, { size: 170, font: F.serif, weight: 900 }), 0, -60);
      rise(c, k.at(1, 0), () => txt(c, '都是代码画的', 132, 520, { size: 120, font: F.serif, weight: 900, color: C.accent }), 0, -40);
      [0, 1, 2, 3].forEach((i) => pop(c, k.at(1, 0.3 + i * 0.2), 1240 + i * 130, 700, () => {
        rrect(c, 1180 + i * 130, 640, 110, 120, 10, C.white, C.ink, 3);
        txt(c, 'f' + (i + 1), 1235 + i * 130, 712, { size: 30, font: F.mono, align: 'center' });
      }));
    },
    // 2 唯一的接口：render(t)
    (c, k) => {
      title(c, k, '只有一个函数');
      rise(c, k.at(0, 0.3), () => {
        rrect(c, 140, 320, 900, 300, 18, C.white, C.ink, 3);
        code(c, ['// 页面暴露的唯一接口', 'window.render = (t) => {', '  drawShot(t);', '};'], 190, 400, k.raw(0, 0.4, 1.6), { size: 36 });
      }, -30);
      rise(c, k.at(1, 0), () => chip(c, 't = 12.4 秒', 1160, 360, { size: 40, fill: C.accent, color: C.white, stroke: null }), 0, -20);
      arrow(c, [[1300, 470], [1300, 600]], k.at(2, 0, 0.6), C.ink, 5);
      rise(c, k.at(2, 0.3), () => {
        rrect(c, 1160, 630, 400, 220, 14, C.paper, C.ink, 3);
        txt(c, '那一刻的画面', 1360, 750, { size: 40, align: 'center', weight: 600 });
      }, -20);
    },
    // 3 流水线：截图 → 合成
    (c, k) => {
      title(c, k, '怎么变成视频');
      const box = (x, s, p) => rise(c, p, () => chip(c, s, x, 420, { h: 120, size: 44, font: F.sans, w: 380 }), 0, -20);
      box(140, '浏览器逐帧截图', k.at(0, 0.2));
      arrow(c, [[540, 480], [680, 480]], k.at(1, 0, 0.5), C.ink, 5);
      box(700, '截图 + 配音', k.at(1, 0.3));
      arrow(c, [[1100, 480], [1240, 480]], k.at(1, 0.8, 0.5), C.ink, 5);
      rise(c, k.at(1, 1.1), () => chip(c, 'video.mp4', 1260, 420, { h: 120, size: 44, w: 380, fill: C.accent, color: C.white, stroke: null }), 0, -20);
      rise(c, k.at(1, 1.4), () => txt(c, '每秒 30 帧，ffmpeg 编码', 140, 700, { size: 36, color: C.mute }), 0);
    },
    // 4 收尾：改代码，重渲染
    (c, k) => {
      title(c, k, '想改画面');
      rise(c, k.at(0, 0.2), () => {
        rrect(c, 140, 320, 1000, 200, 18, C.white, C.ink, 3);
        txt(c, "- txt(c, '旧标题', 140, 190)", 190, 400, { size: 34, font: F.mono, color: C.mute });
        txt(c, "+ txt(c, '新标题', 140, 190)", 190, 470, { size: 34, font: F.mono, color: C.accent });
      }, -30);
      rise(c, k.at(1, 0.3), () => txt(c, '重新渲染，一分钟出片', 140, 680, { size: 64, font: F.serif, weight: 900 }), 0, -30);
      sign(c, k.at(1, 0.8), 1780, 980, 'right');
    },
  ];

  window.SHOTS = shots;
})();
