#!/bin/sh
# 联络表：sh tools/sheet.sh <slug>
# 从成片抽封面和每个镜头的末帧，拼成 episodes/<期号>-<slug>/build/sheet.png，用来快速复查整期画面。
cd "$(dirname "$0")/.." || exit 1
d=$(ls -d episodes/*-"$1" 2>/dev/null | head -1)
[ -f "$d/out/video.mp4" ] || { echo "没有找到 $1 的成片"; exit 1; }
tmp=$(mktemp -d)
ts=$(node -e "const x=require('fs').readFileSync('$d/build/timeline.js','utf8');const T=JSON.parse(x.slice(x.indexOf('{'),x.lastIndexOf('}')+1));console.log(T.lines.map(l=>(l.end-0.1).toFixed(2)).join(' '))")
i=0
for t in 0 $ts; do
  ffmpeg -y -v error -ss "$t" -i "$d/out/video.mp4" -frames:v 1 -vf scale=800:-1 "$tmp/f-$(printf %02d $i).png"
  i=$((i+1))
done
ffmpeg -y -v error -pattern_type glob -i "$tmp/f-*.png" -vf tile=4x3 -frames:v 1 "$d/build/sheet.png"
rm -rf "$tmp"
echo "$d/build/sheet.png"
