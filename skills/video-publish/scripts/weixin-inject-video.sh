#!/bin/sh
# 用法：sh weixin-inject-video.sh <视频> <文件名> <输出.js>  在视频号发表页上传视频（拖放不生效时用）。和封面一样，要用沙箱 iframe 里的 File 和 DataTransfer
b64=$(base64 -i "$1" | tr -d '\n')
cat > "$3" <<EOF
async page => {
  await page.bringToFront();
  return await page.evaluate(async ([b64, name]) => {
    const w = [...document.querySelectorAll('iframe')].map(f => f.contentWindow).find(x => { try { return x.document && x.File; } catch (e) { return false; } });
    const bin = atob(b64); const u8 = new w.Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const file = new w.File([u8], name, { type: 'video/mp4' });
    const r = document.querySelector('wujie-app').shadowRoot;
    const input = [...r.querySelectorAll('input[type=file]')].find(i => (i.accept || '').includes('video'));
    if (!input) return 'no input';
    const dt = new w.DataTransfer(); dt.items.add(file); input.files = dt.files;
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    return 'set ' + input.files.length + ' ' + (input.files[0] instanceof w.File);
  }, ["$b64", "$2"]);
}
EOF
