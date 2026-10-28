#!/bin/sh
# 用法：sh douyin-inject-video.sh <视频> <文件名> <输出.js>  上传视频：已有预览时放进"重新上传"的 file input（换视频），否则放进发布页第一个收视频的 file input（拖放不生效时用）
b64=$(base64 -i "$1" | tr -d '\n')
cat > "$3" <<EOF
async page => {
  if (!page.url().includes('creator.douyin.com')) return 'wrong tab ' + page.url();
  return await page.evaluate(async ([b64, name]) => {
    const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const file = new File([u8], name, { type: 'video/mp4' });
    const input = document.querySelector('[class*=preview-button] input[type=file]') || [...document.querySelectorAll('input[type=file]')].find(i => (i.accept || '').includes('video'));
    if (!input) return 'no input';
    const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return 'set ' + input.files.length + ' ' + file.size;
  }, ["$b64", "$2"]);
}
EOF
