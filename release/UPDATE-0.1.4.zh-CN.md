# ChatPassport 0.1.4 更新

商店上传包：`release/chatpassport-0.1.4-chrome.zip`，是可直接上传的完整扩展包。

## 修复内容

1. 历史滚动区域识别覆盖抓取器支持的消息结构，包括 DeepSeek 的 `message_user`／`message_assistant`，以及 Gemini 的自定义元素和 `data-test-id`。避免只抓当前窗口却误认为已到达历史边界。
2. 富文本目标编辑器保留不换行空格（NBSP）。含有此字符的代码和草稿在写入后按原样校验，避免内容完整却误报失败。

本次没有新增权限。无法可靠识别的虚拟消息窗口仍会标记为部分结果；页面端未提供的隐藏历史无法保证抓取。

## 提交商店

1. 用原账号打开 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)，进入已有的 ChatPassport 项目，核对 ID：`anmmhpfpbaafkgdhalbllhmaejeappmb`。
2. 在 Package 页上传 `chatpassport-0.1.4-chrome.zip`，确认版本 0.1.4。不要建立新项目。
3. 使用 `store-assets/STORE_LISTING.md` 的 Detailed description 更新商店详情。若线上仍早于 0.1.2，还需同步 `alarms` 权限说明及新版隐私政策。
4. 核对截图。仓库中三张 PNG 的本地改动没有纳入这次修复。
5. 保存、提交审核，选择审核通过后自动发布或之后手动发布。

建议先在登录状态下验证 DeepSeek 和 Gemini 的长会话，并核对含不换行空格的代码续聊草稿。自动测试无法代替真实网站验证。

审核备注可复制：

```text
ChatPassport 0.1.4
- Locate conversation scrolling for all supported DeepSeek and Gemini message markers.
- Preserve nonbreaking spaces when reading and verifying a destination draft.
- No new permissions. Messages are never sent automatically.
```

重新生成完整包：运行 `pnpm release:chrome`。详细后台流程亦可参照 [0.1.3 更新指南](UPDATE-0.1.3.zh-CN.md)。
