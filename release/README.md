# Release output

Run the following command from the project root to verify the extension and create the Chrome Web Store upload package:

```bash
pnpm release:chrome
```

The generated `chatpassport-<version>-chrome.zip` file is intentionally ignored by Git. Upload that ZIP—not the repository root—to the Chrome Web Store Developer Dashboard. For local testing with Chrome's **Load unpacked** button, select `.output/chrome-mv3` after building.

The current upload package is `chatpassport-0.1.8-chrome.zip`. See [Chrome 商店更新流程（中文）](UPDATE-0.1.8.zh-CN.md).
