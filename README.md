# short-video-skills

状态：`prototype`

三份给 coding agent 用的 skill：用代码做短视频，把视频发布到中文短视频平台（写文案、代填发布表单），每天定时采集作品数据。三份可以单独用：发布和采集不管视频是怎么做的，剪映剪的、实拍的都行。

*Three agent skills for short videos, usable on their own: make narrated videos with code (Canvas frames + TTS + ffmpeg, no video-generation model), publish any video to Douyin, WeChat Channels and Xiaohongshu (search-aware post copy, then filling the publish forms in the user's signed-in Chrome), and collect each day's creator-dashboard data on a configurable schedule. The docs are in Chinese because the platforms are.*

| skill | 做什么 | 附带 |
| --- | --- | --- |
| [code-video](skills/code-video/SKILL.md) | 写旁白脚本、用 Canvas 画镜头、edge-tts 配音并对齐画面节拍、跟着画面合成音效和配乐、镜头内推拉和转场、逐帧渲染成 mp4、出 16:9/4:3/3:4 封面；配音核对（语音识别转回文字比对）、阅读时长检查、静帧检查 | 一个能直接跑的项目模板 `template/`，含示例视频 |
| [video-publish](skills/video-publish/SKILL.md) | 读抖音、小红书、Google 的搜索联想词写标题、描述、话题、封面字和置顶评论；再用 playwright-cli 在抖音、视频号、小红书的发布页上传视频和封面、填好表单，默认停在发布按钮前 | 三个只读的联想词脚本、文件注入脚本、文案模板、平台规则表、三个平台的选择器和坑 |
| [video-data](skills/video-data/SKILL.md) | 每天按配置的时间，只读采集三个平台创作者后台的作品数据，存成快照，再排成每条作品的时间序列 | 采集脚本、定时配置、汇总脚本 |

code-video 适合以图形、文字、代码和数据图为主、配旁白的视频，例如知识讲解、软件教程、产品功能介绍、数据解读、清单盘点；不拍摄、不生成写实画面，所以不适合实拍、真人出镜、剧情和实物展示。

三份 skill 也可以连起来：code-video 出片和封面 → video-publish 写文案、填表单 → video-data 每天采数据。选题和查资料因人而异，不在这里。

## 安装

每个 skill 是 `skills/` 下的一个目录，按 [Agent Skills](https://agentskills.io) 的格式写（`SKILL.md` 加附带文件）。把需要的目录复制或软链接到你的 agent 读取 skill 的位置，例如项目里的 `.agents/skills/` 或 `.claude/skills/`：

```bash
git clone https://github.com/geoqiao/short-video-skills.git
mkdir -p .agents/skills
ln -s "$PWD/short-video-skills/skills/code-video" .agents/skills/code-video
```

## 依赖

- code-video：Node 20+、[uv](https://docs.astral.sh/uv/)、ffmpeg、本机的 Google Chrome。默认字体是 macOS 自带的宋体、苹方和 SF Mono，其他系统在模板的 `brand.json` 里换字体。配音用 [edge-tts](https://github.com/rany2/edge-tts)，走的是微软的非官方在线接口，会把旁白文本发过去。配音核对用 [faster-whisper](https://github.com/SYSTRAN/faster-whisper) 在本机识别，第一次运行下载约 1.6 GB 模型。
- video-publish 和 video-data：[playwright-cli](https://github.com/microsoft/playwright-cli) 和它配套的 Chrome 扩展，以及已登录各平台创作者后台的 Chrome。

## 试一下

```bash
cp -R short-video-skills/skills/code-video/template my-videos && cd my-videos
npm install
uv run tools/voice.py demo
node tools/render.mjs demo
open episodes/01-demo/out/video.mp4
```

## 说明

- 用代码逐帧渲染视频的做法来自 xilo 在 X 上的[一篇文章](https://x.com/xilo2991/status/2104912748794589515)（2026-09-29）。音效跟着画面走、运镜、配音核对和阅读时长检查参考了 [Lemo-Opuscar](https://github.com/lemomo-ai/lemo-opuscar)（2026-10-24 版）的做法，代码是重写的。Lemo 的转折前真静音试过后没有采用，讲解视频里听着像断音。
- 平台页面会改版。发布表单里的选择器和做法核对于 2026-10，失效时以页面为准，欢迎提 issue。
- video-publish 默认不替用户点发布，只在用户明确说发布某一条之后才点。
- video-data 只读：打开自己的标签页读后台数据，不点按钮、不改设置；定时任务只打印配置，由你或你的 agent 去建。

## 许可

[MIT](LICENSE)
