# 抖音创作者中心

发布页：`https://creator.douyin.com/creator-micro/content/upload`。核对于 2026-10。

| 环节 | 现象 | 做法 |
| --- | --- | --- |
| 上传视频 | 文件选择框在扩展模式下用不了，CDP 的 `DOM.setFileInputFiles` 报 "Not allowed" | 先试 `playwright-cli -s=chrome drop "[class*=container-drag-info]" --path=<mp4>`。拖放不触发上传时，`sh scripts/douyin-inject-video.sh <mp4> <文件名> <out.js>` 再 `run-code` |
| 标题 | 页面上有两个 placeholder 含"标题"的输入框（另一个是付费视频标题），上限 30 字 | `input[placeholder*="作品标题"]` |
| 描述和话题 | 描述是 contenteditable。网页端最多 5 个话题，第 6 个不生效还会弄乱光标 | 正文用 `keyboard.insertText`；每个话题 `keyboard.insertText('#词')`，等约 2 秒出下拉，按空格确认。用 `[contenteditable] [data-mention]` 核对个数。下拉里没有的词不会变成话题（例如没有 #ClaudeOpus，换 #Claude）。下拉没出来、描述里留下残字时，不要按退格删：光标可能停在正文中间，会删掉正文。清空整个描述框，重填正文和话题，再把描述逐字和文案比对 |
| 话题浏览量 | 输入 `#词` 后下拉每项右侧是浏览量 | 选词时读一下 |
| 封面 | 要横封面 4:3 和竖封面 3:4 | 点"选择封面"打开弹窗 → `sh scripts/douyin-inject-image.sh <4:3 图> cover-4x3.png <out.js>` 生成脚本再 `run-code` → 点"设置竖封面" → 同样注入 3:4 → 截图核对两张 → 点"完成"。弹窗的上传区不接受拖放 |
| 合集 | 选合集后集数自动排到下一集，下拉只能选到已有集数 + 1 | 点"请选择合集"，选合集名，核对"第 N 集"和期号一致。对不上说明中间漏发或顺序变了 |
| 自主声明 | 单选项的文字被 label 挡住，按文字点不中 | 点"请选择自主声明"，取"内容由AI生成"文字的 `boundingBox`，点它左侧约 14px 的单选圆圈，再点"确定" |
| 位置 | 在"扩展信息 → 添加标签"，选项带地址和距离 | 点"输入地理位置"，逐字输入地名，按地址文字选那一项（例如按街道门牌过滤）。同一个地名常有几个同名选项，记下选的是哪个地址，下次保持一致 |
| 关联热点 | 不是普通 input，按 placeholder 找不到 | 点"点击输入热点词"这几个字，再逐字输入。只匹配热点标题里的字：搜"编程""Agent"常没结果，搜"知识""AI"才有。用完整热点名精确选择，再读一下"关联热点"后面的值 |
| 官方活动 | 标题下方只列出几个活动卡片，不能搜索 | 有对口的就点，没有就不选 |
| 定时发布 | 在"发布设置"里选"定时发布"（单选圆圈在文字左侧约 18px）。"日期和时间"输入框不接受键入；日历标题是"YYYY年M月"，同一行最后一个按钮是下个月；时间是时、分两列滚轮，只显示当前值附近几项 | 改 `scripts/douyin-schedule.js` 开头的 `DATE`、`HH`、`MM` 后 `run-code`，再读一下输入框的值 |
| 换视频 | 预览下方"重新上传"里有一个 video 的 file input。换完后标题、描述、话题、声明、位置、热点都在，封面和合集会被清空 | `sh scripts/douyin-inject-video.sh <mp4> <文件名> <out.js>` 再 `run-code`，然后重传两张封面、重选合集 |
| 发布 | 按钮 `getByRole('button', { name: '发布', exact: true })`，点后跳到作品管理页 | 只在用户明确说发布这一条后点。新作品约 15 秒后刷新作品列表才出现。定时作品在列表里显示发布时间，审核中显示"审核中"，过审后显示"修改定时" |
