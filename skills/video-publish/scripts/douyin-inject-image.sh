#!/bin/sh
# 用法：sh douyin-inject-image.sh <图片> <文件名> <输出.js>  先打开抖音"设置封面"弹窗，生成的脚本把图片放进弹窗里可见的上传区
b64=$(base64 -i "$1" | tr -d '\n')
cat > "$3" <<EOF
async page => {
  return await page.evaluate(async ([b64, name]) => {
    const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const file = new File([u8], name, { type: 'image/png' });
    const ups = [...document.querySelectorAll('.semi-upload[class*=upload-]')].filter(e => e.getBoundingClientRect().width > 0);
    const input = ups[0] && ups[0].querySelector('input[type=file]');
    if (!input) return 'no visible input, n=' + ups.length;
    const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return 'set ' + input.files.length;
  }, ["$b64", "$2"]);
}
EOF
