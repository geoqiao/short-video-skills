// 读项目根目录的 brand.json，头像转成 data URL（file:// 下直接加载的图片会污染画布、无法导出）。
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

export function loadBrand(root) {
  const file = join(root, 'brand.json');
  const brand = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  let avatar = null;
  if (brand.avatar) {
    const path = join(root, brand.avatar);
    const type = /\.jpe?g$/i.test(extname(path)) ? 'image/jpeg' : 'image/png';
    avatar = 'data:' + type + ';base64,' + readFileSync(path).toString('base64');
  }
  return { brand, avatar };
}
