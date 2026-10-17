#!/bin/sh
# 用法：sh tools/covers.sh <slug>
# 横封面 4:3：16:9 封面上下补纸色，不裁内容。竖封面 3:4：tools/cover-vertical.mjs 单独排版
set -e
cd "$(dirname "$0")/.."
dir=$(ls -d episodes/*-"$1" 2>/dev/null)
[ -d "$dir" ] || { echo "episodes/ 下没有唯一的 <期号>-$1 目录"; exit 1; }
paper=$(node -e "const f='brand.json';const b=require('fs').existsSync(f)?JSON.parse(require('fs').readFileSync(f,'utf8')):{};console.log(((b.colors||{}).paper||'#FAF7F2').slice(1))")
ffmpeg -y -v error -i "$dir/out/cover.png" -vf "pad=1920:1440:0:180:color=0x$paper" "$dir/out/cover-4x3.png"
node tools/cover-vertical.mjs "$1" >/dev/null
echo "$dir/out/cover-4x3.png $dir/out/cover-3x4.png"
