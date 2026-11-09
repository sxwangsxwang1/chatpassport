# ChatPassport 0.1.8 更新与发布

上传包：`release/chatpassport-0.1.8-chrome.zip`。这是完整扩展包，直接上传，不要再次压缩。

## 本次修复

1. 修复 Gemini 草稿编辑器定位，避免将页面中的剪贴板辅助节点误认为编辑器。
2. 抓取 Gemini 消息时排除屏幕阅读器专用的隐藏标题，避免用户消息重复。
3. 识别 DeepSeek 当前页面的用户消息与助手消息节点，修复用户消息漏抓。
4. 侧栏只在当前标签页 URL 或待传输草稿变化时刷新，避免无关的标签页与存储事件打断操作。

没有新增权限、服务端或遥测。草稿仍由用户检查并手动发送。

## 验证

- `pnpm release:chrome` 执行类型检查、自动测试、生产构建并生成 ZIP。
- 在本地加载的新版扩展中，ChatGPT、Claude、Gemini、DeepSeek 各抓取到测试会话的 1 条用户消息与 1 条助手回复；四个目标站点均成功插入可编辑草稿，未点击发送。
- Claude 和 ChatGPT 的页面提示历史消息可能被虚拟化；测试只能确认当前显示的消息，不能保证长会话完整。

## 更新现有商店项目

1. 登录 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)，打开现有 ChatPassport 项目，核对扩展 ID `anmmhpfpbaafkgdhalbllhmaejeappmb`。
2. 在 **Package** 页点击 **Upload New Package**，选择本页顶部的 ZIP，确认版本为 **0.1.8**。
3. 核对 **Store listing** 和 **Privacy practices**，保存草稿。本次没有新增权限，现有商店文案无需随包重复上传。
4. 点击 **Submit for Review**。若希望审核通过后自己选择上线时间，取消自动发布选项；否则保留自动发布。
5. 审核发布后，在商店详情页核对版本为 **0.1.8**。

## 审核备注（可粘贴）

```text
ChatPassport 0.1.8 fixes Gemini draft editor detection and duplicate hidden screen-reader text, restores user-message extraction on current DeepSeek pages, and limits side-panel refreshes to relevant events. No new permissions, server, or telemetry. Users review and send drafts manually. Tested capture and draft insertion on ChatGPT, Claude, Gemini, and DeepSeek.
```
