# ChatPassport 0.1.2 更新

完整上传包：`release/chatpassport-0.1.2-chrome.zip`。无需自行拼接文件。

## 本次修复

1. 保留富文本编辑器中的换行、空行和代码缩进。
2. 插入操作绑定原编辑器和页面；用户修改、导航或替换编辑器时停止。校验失败不再自动回滚覆盖草稿，而是提供原问题供手动恢复。
3. 每次转移使用独立随机 ID，并绑定新开的目标标签页；其他标签页、子框架和旧转移不能领取或清除新数据。后台串行处理存储操作。
4. 预览范围与待转移内容分离；刷新不再覆盖目标选择；导入时避免选择源平台；保存时锁定相关选择。
5. 使用 Chrome alarms 安排到期清理，在每次读取及后台重启时检查一小时有效期。浏览器休眠可能延迟物理删除，但不会延长访问有效期。
6. 修正隐私说明：内容一旦插入目标网站输入框，网站即可读取或同步，不需要等到点击发送。

历史抓取现在会自动向前、向后滚动加载，合并重叠的消息窗口，处理虚拟列表，并恢复阅读位置。可中途停止并保留已抓取消息；有两分钟和体积保护。未能对齐、超时或停止会明确标记部分结果。JSON 和 Markdown 均保留完整性说明。

注意：“到达页面历史边界”不代表已经验证服务器完整历史。隐藏分支、折叠内容、页面不提供的数据及尚未适配的结构仍可能缺失。也没有取消跨平台续聊的 48,000 字符预算：完整捕获与实际发送的上下文范围是两件事。

## 上传前验证

自动检查覆盖富文本、编辑期间变动、转移隔离、到期清理、并发替换、侧栏状态及模拟长历史加载。登录后的四个平台实页仍需冒烟测试，不能用模拟测试代替。

1. 在 `chrome://extensions` 重新加载 `.output/chrome-mv3`，或者解压 ZIP 并加载包含 `manifest.json` 的目录。避免开发版和商店版同时运行。
2. 刷新一条长对话，点击 **Capture conversation history**，等待滚动结束；导出 JSON，对照第一条、中间及最后一条消息。留意部分捕获提示。
3. 再抓取一次，中途点击停止，确认保留部分结果且恢复阅读位置。
4. 转移到另一平台，新开同平台的其他标签页不应获得待转移内容。输入多行新问题，点击 Continue，核对换行和内容，确认没有自动发送。
5. 准备期间修改问题、切换会话，确认不会覆盖新输入。检查失败时可查看原问题。
6. 保留线上原有合格截图，或重新制作符合当前界面的截图。仓库已有 PNG 修改未纳入本次修复，上传前必须自行核对，不能直接假定是可用截图。

## 更新商店原项目

1. 登录 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)，打开原 ChatPassport 项目，核对 ID：`anmmhpfpbaafkgdhalbllhmaejeappmb`。
2. 在 Package 页上传 `chatpassport-0.1.2-chrome.zip`，确认版本 0.1.2。如果后台已有相同或更高版本，先核对状态，不能覆盖该版本。
3. 更新详细说明，使用 `store-assets/STORE_LISTING.md` 的 Detailed description 正文。
4. 本次新增 **alarms** 权限，用于到期清理。将同一文件中的 alarms justification 同步到隐私实践／权限说明，核对草稿可被网站读取的披露。
5. 同步发布 `docs/privacy.html` 到现有隐私政策网址；上传前打开网页确认新内容已经生效。
6. 保存，提交审核，按需选择审核通过后自动发布或手动发布。仅生成 ZIP 或 push GitHub 都不会更新商店。

流程依据 [Google 官方更新说明](https://developer.chrome.com/docs/webstore/update)；清理时序参见 [Chrome alarms 文档](https://developer.chrome.com/docs/extensions/reference/api/alarms)。

## 可复制更新说明

```text
ChatPassport 0.1.2
- Automatically load and merge rendered conversation history, with progress, cancellation and capture coverage metadata.
- Preserve multiline drafts and stop replacement when the user edits or navigates.
- Bind each transfer to its destination tab with independent transfer IDs and serialized storage operations.
- Separate preview settings from pending-transfer state.
- Schedule expired-transfer cleanup using the alarms permission.
- Clarify that destination websites can read or sync inserted drafts before Send.
ChatPassport never submits messages automatically.
```

重新打包：运行 `pnpm release:chrome`。ZIP 按仓库约定不提交 Git。
