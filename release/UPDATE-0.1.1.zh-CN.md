# ChatPassport 0.1.1 商店更新

上传文件：`release/chatpassport-0.1.1-chrome.zip`。这是包含全部运行文件的完整扩展包，版本已从 0.1.0 升至 0.1.1，不需要自行修改或重新压缩。

## 本次变更

- 会话范围明确为全部检测到／导入的消息，并提示长会话可能不完整。
- Claude 新增 `.font-claude-response` 识别，兼容原有结构；保留同一回复中的多个 Markdown 区块，避免重复提取及混入按钮文字。
- 同步 README、商店说明；新增 4 个回归测试。
- 未增加扩展权限，仍由用户手动发送。

## 上传前试用

类型检查、36 个测试及生产构建已通过；尚未完成登录后的 Claude 实页验证。建议先将 ZIP 解压到独立文件夹，在 `chrome://extensions` 开启开发者模式，使用“加载已解压的扩展程序”选中含 `manifest.json` 的文件夹。测试时可临时停用商店版，避免两份扩展同时运行。

打开并刷新一条含多段回答和代码块的 Claude 对话，点击 Preview，检查导出的 JSON／Markdown 中消息顺序及内容；再转到另一平台，输入新问题，点击 Continue with context，确认草稿正确且未自动发送。确认预览页显示完整性提示。试用完成后可停用开发版并重新启用商店版。

## 更新现有商店项目

1. 使用发布时的 Google 账号登录 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)。
2. 打开已有的 **ChatPassport** 项目，核对 ID：`anmmhpfpbaafkgdhalbllhmaejeappmb`。这是对原项目的更新，无需创建新项目。
3. 在 **Package（软件包）** 页点击 **Upload New Package（上传新软件包）**，选择 `chatpassport-0.1.1-chrome.zip`。等待校验，确认新版本为 **0.1.1**。
4. 在 **Store listing（商店详情）** 的详细说明中同步 `store-assets/STORE_LISTING.md` 的 **Detailed description** 正文（到 **Optional listing URLs** 之前）。主要新增的是长会话捕获范围说明。
5. 本次可以保留线上原有截图。本地 `02-standby.png`、`03-review-and-send.png` 当前是 GitHub 登录页截图，不要上传；它们未包含在本次代码提交或扩展 ZIP 中。
6. 检查后台必填项，保存后点击 **Submit for Review（提交审核）**。确认框中可选择审核通过后自动发布；如果关闭自动发布，审核通过后再手动发布。
7. 发布后确认商店显示 0.1.1。已安装的商店版会通过 Chrome 更新机制获取新版本；GitHub push 本身不会更新商店。

以上流程依据 [Google 官方更新说明](https://developer.chrome.com/docs/webstore/update)。如果后台已经存在更高版本或待审核版本，先核对其状态；0.1.1 不能覆盖相同或更高的软件包版本。

## 可复制的更新说明

下面可用于更新公告，或后台如有提供的版本说明／审核备注字段；无需寻找必填的“更新日志”字段。

```text
ChatPassport 0.1.1

- Clarified that transfers and exports include detected or imported messages, which may not represent the complete conversation history.
- Added support for Claude's newer response containers while keeping legacy compatibility.
- Preserved multiple Markdown sections in Claude responses and avoided duplicate messages and UI control text.
- No new permissions. Messages are still sent only by the user.
```

## 后续重新打包

在项目根目录运行 `pnpm release:chrome`。它会执行检查、构建并将完整 ZIP 放入 `release/`。ZIP 按仓库约定不提交到 Git；本次可直接使用已生成的本地文件。
