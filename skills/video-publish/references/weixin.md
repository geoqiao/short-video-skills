# 视频号助手

发表页：`https://channels.weixin.qq.com/platform/post/create`。核对于 2026-10。

表单在 `wujie-app` 的 shadow root 里：`document.body.innerText` 读不到，playwright 的定位器能穿透；`evaluate` 里从 `document.querySelector('wujie-app').shadowRoot` 开始找。

| 环节 | 现象 | 做法 |
| --- | --- | --- |
| 登录 | 过期很快，二维码有时显示"加载失败" | 刷新页面，请用户用微信扫码 |
| 上传视频 | 拖放可用 | `playwright-cli -s=chrome drop ".ant-upload.ant-upload-btn" --path=<mp4>` |
| 描述和话题 | 话题直接写在描述里，`#词` 自动变成话题，不显示浏览量。编辑器里 `Meta+A` 不管用 | 先把 `.input-editor` 的 innerHTML 清空并派发 input 事件，再 `keyboard.insertText` 一次写入整段 |
| 短标题 | 另有输入框 | `input[placeholder*="短标题"]`，写主标题的前半句 |
| 封面 | "个人主页卡片 3:4"和"分享卡片 4:3"两张，默认从视频裁，会切掉标题。卡片上的"编辑"只在鼠标悬停时出现 | `page.mouse.move` 到 3:4 卡片上 → 点卡片底部的"编辑" → 弹窗标题是"编辑个人主页卡片" → 运行 `sh scripts/weixin-inject-image.sh <3:4 图> cover-3x4.png <out.js>` 生成的脚本 → 点"确认"。再悬停 4:3 卡片点"编辑"：会先弹出"使用此素材作为封面？"，问要不要沿用 3:4 那张，点"直接编辑" → 弹窗标题是"编辑分享卡片" → 注入 4:3 图 → "确认"。不要开"平铺展示"（放大填满，更糟）。必须用沙箱 iframe 里的 `File` 和 `DataTransfer`，主页面的不生效 |
| 位置 | 默认是城市名。点开后才出现"搜索附近位置"输入框 | 点位置那一栏，再点 `input[placeholder="搜索附近位置"]`，逐字输入完整地名（简称会搜到外区的同名地点），按地址文字选那一项 |
| 合集 | "推荐合集"旁有"添加" | 点 `a.add-btn`，再读一下"添加到合集"的值 |
| 活动 | 默认"不参与活动"。点开后才出现"搜索活动"输入框；选过一次后输入框又隐藏，按文字找当前值的元素也可能点不到（同样的文字还出现在左侧预览里） | 在 `evaluate` 里找到活动栏当前值的元素，`scrollIntoView` 后按坐标点开 → 清空输入框 → 逐字输入活动名 → 在结果里找文字完全相等的项点坐标 → 读一下"活动"后面的值。按部分文字过滤会选错 |
| 视频标注（AI 声明） | 选项显示成英文 | 点"选择视频标注"，选 "Contains AI-generated content" |
| 换视频 | 预览下方"删除"→ 确认"删除"，上传区重新出现。文字类的项都还在，两张封面会变回从新视频裁的 | 再拖放一次新视频，然后重传两张封面 |
| 发表 | 按钮文字是"发表"，点后跳到 `post/list` | 只在用户明确说发布这一条后点 |
