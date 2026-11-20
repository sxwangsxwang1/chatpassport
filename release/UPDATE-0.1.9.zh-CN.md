# ChatPassport 0.1.9 更新与发布

运行 `pnpm release:chrome` 生成完整上传包 `release/chatpassport-0.1.9-chrome.zip`。

## 本次修复

1. 长对话触及抓取条数或 JSON 文件大小上限时，优先保留能容纳的最新完整消息，并在侧栏说明限制。
2. 草稿插入后，目标页的 **Copy prepared draft** 仍可复制原草稿。目标网站清空输入框时，可以重新粘贴。
3. 更新 Zod 和构建、测试依赖，修复依赖审计报告中的已知问题。

## 验证

- 运行 `pnpm release:chrome` 检查类型、执行自动测试、构建扩展并生成 ZIP，再运行 `pnpm audit` 检查依赖。
- 提交审核前，用同一版本在 ChatGPT、Claude、Gemini 和 DeepSeek 的登录页面验证抓取和草稿插入。重点检查长对话的保留顺序，以及清空目标输入框后能否复制原草稿。

## 更新现有商店项目

1. 登录 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)，打开扩展 ID 为 `anmmhpfpbaafkgdhalbllhmaejeappmb` 的项目。
2. 在 **Package** 页上传 `chatpassport-0.1.9-chrome.zip`，确认版本为 **0.1.9**。
3. 用[商店文案](../store-assets/STORE_LISTING.md)更新流程说明，核对 **Privacy practices** 和公开隐私政策。
4. 保存并提交审核。发布后，在商店详情页核对版本和文案。

## 审核备注（可粘贴）

```text
ChatPassport 0.1.9 keeps the latest complete messages that fit when a history capture reaches its limits. The destination card can still copy the original draft after insertion. This update also includes dependency security fixes. Users review and send drafts manually.
```
