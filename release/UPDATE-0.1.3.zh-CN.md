# ChatPassport 0.1.3 更新

完整包：`release/chatpassport-0.1.3-chrome.zip`。使用此包替代 0.1.2；不需要自己重新压缩。

## 四项修复

1. 无稳定消息 ID 的重复虚拟窗口不再静默去重。能可靠匹配时正常合并，无法确定时保留窗口并标记“可能重复或缺失”。这不是对服务器完整历史的保证。
2. 后台消息使用 `return true` 加 `sendResponse`，不再要求浏览器支持 Promise 型消息监听器。侧栏和转移各个消息分支、异常回复均有回归测试。
3. 代码块独立保留原始文本，不参与普通段落的空白清理；保留缩进、空行、尾部空白与不换行空格，并处理代码中的反引号围栏。
4. 抓取、JSON 导出和导入统一使用 25 MiB UTF-8 预算，包括格式化和元数据。超限只保留能容纳的整条消息并标记部分结果；单条消息过大时明确报错，不生成无法重新导入的超限 JSON。

相对 0.1.2 没有新增权限。若商店仍是 0.1.1 或更早版本，需要沿用 0.1.2 的 `alarms` 权限说明和更新后的隐私政策。

## 上传

1. 登录原 Chrome Web Store 项目，核对扩展 ID：`anmmhpfpbaafkgdhalbllhmaejeappmb`。
2. 在 Package 页上传 `chatpassport-0.1.3-chrome.zip`，确认版本 0.1.3；不要新建扩展。如果后台已有相同或更高版本，先处理版本冲突。
3. 同步 `store-assets/STORE_LISTING.md` 中的详细说明和权限披露；核对线上隐私政策已更新。
4. 保留线上合格截图。仓库已有三张 PNG 修改不属于这次修复，未经核对不要上传。
5. 保存并提交审核。此文档和 ZIP 的生成不代表已提交或发布。

详细后台流程见 [0.1.2 更新指南](UPDATE-0.1.2.zh-CN.md)，上传时将版本和文件名改为 0.1.3。

## 发布前实页检查

自动测试使用模拟 DOM 和浏览器 API，不能代替四个平台登录后的验证。请重新加载开发版、刷新目标网站，测试长对话和重复问答；对照导出代码的空行与缩进，重新导入导出的 JSON，再验证多行续聊草稿没有被自动发送。

## 更新说明

```text
ChatPassport 0.1.3
- Retain ambiguous repeated virtualized message windows and report uncertain coverage.
- Use callback-based asynchronous messaging for older Chrome compatibility.
- Preserve exact whitespace inside captured code blocks.
- Apply a shared 25 MiB UTF-8 JSON budget so new exports can be re-imported.
- No new permissions compared with 0.1.2. Messages are never sent automatically.
```

重新构建完整包：`pnpm release:chrome`。
