#!/bin/sh
# 用法：sh xhs-inject-image.sh <图片> <文件名> <输出.js>  先打开小红书"设置封面"弹窗，再运行生成的脚本
b64=$(base64 -i "$1" | tr -d '\n')
cat > "$3" <<EOF
async page => {
  if (!page.url().includes('creator.xiaohongshu.com')) return 'wrong tab ' + page.url();
  return await page.evaluate(async ([b64, name]) => {
    const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const file = new File([u8], name, { type: 'image/png' });
    const input = [...document.querySelectorAll('input[type=file]')].find(i => /image/.test(i.accept));
    if (!input) return 'no input';
    const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return 'set ' + input.files.length + ' ' + file.size;
  }, ["$b64", "$2"]);
}
EOF
