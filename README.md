<p align="center">
  <img src="public/icons/icon-128.png" alt="ChatPassport" width="64">
</p>

<h1 align="center">ChatPassport</h1>

<p align="center"><strong>Switch assistants. Keep your context.</strong></p>

<p align="center">
  Continue a conversation in ChatGPT, Claude, Gemini, or DeepSeek.
  ChatPassport prepares an editable draft; you review and send it.
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/chatpassport/anmmhpfpbaafkgdhalbllhmaejeappmb">
    <img src="https://img.shields.io/badge/Install-Chrome%20Web%20Store-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Install from the Chrome Web Store">
  </a>
</p>

<p align="center">
  <a href="#how-it-works">How it works</a> ·
  <a href="#capture-modes">Capture modes</a> ·
  <a href="#privacy">Privacy</a> ·
  <a href="#build-from-source">Build from source</a>
</p>

<p align="center">
  <img src="store-assets/screenshots/01-capture.png" alt="ChatPassport capture preview with demonstration data" width="800">
</p>

<p align="center"><sub>Screenshots show demonstration conversations.</sub></p>

## How it works

1. [Install ChatPassport](https://chromewebstore.google.com/detail/chatpassport/anmmhpfpbaafkgdhalbllhmaejeappmb). Open a conversation on a [supported website](#supported-websites), then open the side panel. If the tab was already open when you installed the extension, refresh it once.
2. Choose a destination and a capture mode. You can also choose the current assistant to start a new chat there. Click **Prepare for [destination]**. Review or search the full captured conversation, choose individual messages if needed, write your next question, and confirm any older selected messages that will be omitted.
3. Click **Open editable draft in [destination]**. ChatPassport fills an empty destination editor when it becomes ready. Review the draft and click the website's **Send** button yourself. If automatic insertion cannot complete, use **Insert prepared draft** or **Copy prepared draft** on the destination card. You can also copy the draft from the card if the editor clears it after insertion.

> [!IMPORTANT]
> ChatPassport does not click Send. Once context is inserted into the editor, the destination website may read or sync the draft before you send it.

## Capture modes

| Mode | What it reads |
| --- | --- |
| **Quick** | Messages currently loaded on the page. No scrolling; coverage is marked partial. |
| **Load history** (default) | Scrolls to collect older rendered messages, then restores your position. It can take up to two minutes. You can stop and keep the messages collected so far. |

Websites may hide, collapse, or virtualize history. A scan that reaches both page boundaries still cannot guarantee that every past message was captured. If a history scan reaches the capture limits, it keeps the most recent complete messages that fit and shows the reason in the side panel.

## What moves

ChatPassport transfers message order and roles, plus the text, code, links, tables, and math it can read from the page. It keeps Markdown formatting where available. Images become text placeholders; image and file contents, artifacts, citation cards, and hidden reasoning are not included.

Before continuing, choose all captured messages, the latest 20, 50, or 100, or individual messages. A destination draft can contain up to **48,000 characters**, including your next question. ChatPassport shows the exact number of older selected messages that will be omitted and asks you to confirm before opening the draft. It never cuts a message in half or summarizes it with AI.

You can save the full captured preview as Markdown or a portable `.chatpassport.json` file, and import saved JSON later. JSON files have a **25 MiB** limit; pending transfers have a separate **9 MB** limit. See the [file format](docs/format.md) for compatibility details.

When a draft omits messages, you can download the complete captured transcript as Markdown and attach it yourself on the destination website. ChatPassport does not upload or verify that attachment; the draft still contains only the included messages.

## Privacy

Capture begins only when you click **Prepare for [destination]**. ChatPassport needs no account or API key and has no developer-operated server, analytics, or tracking. The selected conversation and your next question are held in `chrome.storage.session` for one pending transfer, bound to one destination tab, and expire after one hour. After insertion, the draft stays in the destination card's memory until you dismiss the card or the page unloads.

Loading history may trigger the source website's normal requests. After insertion, the destination website handles the draft under its own policies. Read the [privacy policy](PRIVACY.md) for details.

## Supported websites

| Assistant | Website |
| --- | --- |
| ChatGPT | `chatgpt.com`, `chat.openai.com` |
| Claude | `claude.ai` |
| Gemini | `gemini.google.com` |
| DeepSeek | `chat.deepseek.com` |

A browser with Chrome Manifest V3 and side panel support is required. If a website layout change breaks capture or insertion, [open an issue](https://github.com/sxwangsxwang1/chatpassport/issues) with the website and steps to reproduce. Remove private conversation text first.

## Build from source

Use Node.js 22 and pnpm. The repository pins pnpm 11.19.0.

```bash
pnpm install
pnpm check
```

`pnpm check` runs type checking, tests, and a production build. To try the extension locally, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `.output/chrome-mv3`. Use `pnpm dev` for development or `pnpm release:chrome` to create an upload ZIP in `release/`.

## Star history

If ChatPassport is useful, give the project a star. The chart below shows new stars per UTC day over the past 60 days.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/star-history-dark.svg" />
  <img alt="ChatPassport daily GitHub star growth" src="assets/star-history.svg" />
</picture>

<div align="center">

[⭐ Star ChatPassport](https://github.com/sxwangsxwang1/chatpassport) · [View stargazers](https://github.com/sxwangsxwang1/chatpassport/stargazers)

</div>
