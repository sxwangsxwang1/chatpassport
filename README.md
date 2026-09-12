<div align="center">

# ChatPassport

### Carry the context. Keep control.

Move an AI conversation between ChatGPT, Claude, Gemini, and DeepSeek — locally, without API keys or a ChatPassport account.

[![GitHub Stars](assets/star-badge.svg)](https://github.com/sxwangsxwang1/chatpassport/stargazers)
![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?style=flat-square&logo=googlechrome&logoColor=white)
![Local only](https://img.shields.io/badge/data-local%20only-176044?style=flat-square)
![No API key](https://img.shields.io/badge/API%20key-not%20required-C6923A?style=flat-square)
![Status](https://img.shields.io/badge/status-experimental-EA580C?style=flat-square)

[How it works](#how-it-works) · [Install](#install-from-source) · [Privacy policy](PRIVACY.md) · [Development](#development)

</div>

> [!IMPORTANT]
> ChatPassport is an early experimental release. AI websites change their page structure frequently, so an adapter may occasionally need an update.

![ChatPassport standby continuation flow](store-assets/screenshots/02-standby.png)

## Why ChatPassport?

Copying an entire conversation by hand is slow, loses structure, and creates an awkward first message on the destination platform. Sending the copied transcript by itself can also make the new assistant answer an old request or produce a useless “context received” reply.

ChatPassport uses a **standby continuation** flow instead:

1. Capture the visible conversation in the source tab.
2. Open the destination with the migrated context waiting locally.
3. Type the new question you actually want to ask.
4. Combine the recent context and that question into one reviewed continuation.
5. Send it yourself using the destination platform's normal Send button.

The destination receives one useful continuation request, not a context-only message.

## Features

- Transfer conversations across **ChatGPT, Claude, Gemini, and DeepSeek**.
- Keep transfer data inside the current browser session.
- Continue with the latest 20, 50, 100, or all captured messages.
- Wait for a new user request before inserting migrated context.
- Never click Send automatically.
- Preserve the user's draft if the page changes during preparation.
- Verify the completed editor value and detect incomplete insertion.
- Keep the newest complete messages when a continuation exceeds the safe relay budget.
- Export conversations as structured `.chatpassport.json` or readable Markdown.
- Import previously exported ChatPassport JSON files.
- Use **Copy context only** as a manual fallback.
- Require no ChatPassport server, account, analytics, tracking, or API key.

## Supported platforms

| Platform | Read conversation | Standby continuation | Manual context | Status |
| --- | :---: | :---: | :---: | --- |
| ChatGPT | ✓ | ✓ | ✓ | Experimental |
| Claude | ✓ | ✓ | ✓ | Experimental |
| Gemini | ✓ | ✓ | ✓ | Experimental |
| DeepSeek | ✓ | ✓ | ✓ | Experimental |

Text and fenced code blocks are currently supported. Images, uploaded files, citations, artifacts, and hidden reasoning are not transferred.

## How it works

### 1. Capture

Open a supported conversation, select the ChatPassport extension icon, and choose **Preview current conversation**. ChatPassport reads the active tab only after this action.

### 2. Choose a destination

Select the context range and choose **Import into ChatGPT**, **Claude**, **Gemini**, or **DeepSeek**. ChatPassport stores one pending transfer in `chrome.storage.session` and opens the selected destination.

### 3. Write the next request

The destination editor stays untouched. An on-page card reports that the context is ready. Type the new question you want the destination assistant to answer.

### 4. Continue with context

Select **Continue with context** in the ChatPassport card. The extension creates one continuation containing:

```text
migrated conversation context
+
your new request
```

ChatPassport then reads the editor back to verify that the full continuation was accepted. Review it and click the platform's native Send button yourself.

## Size and truncation protection

Browser session storage and an AI model's usable input are different limits. A conversation may fit in browser storage while still being too large for a destination editor or model.

ChatPassport therefore applies two layers of protection:

- **Temporary storage:** warns above 6 MB and rejects pending transfers above 9 MB.
- **Continuation draft:** uses a conservative 48,000-character budget and reserves up to 8,000 characters for the new request.

If the full transcript does not fit, ChatPassport keeps the newest complete messages and tells you exactly how many older messages were omitted. It does not silently cut a message in half. If the destination modifies or truncates the inserted draft, ChatPassport reports the failure and attempts to restore the user's original question.

The relay budget reduces failures but cannot guarantee every model's server-side token limit. Models and plans may use different context windows.

## Install from source

ChatPassport is not yet published in an extension store. Install the development build as an unpacked Chrome extension.

### Requirements

- Google Chrome or another Chromium browser with side-panel support
- Node.js 20 or newer
- pnpm

If `pnpm` is not installed:

```bash
npm install --global pnpm
```

On macOS, Homebrew is another option:

```bash
brew install node pnpm
```

### Build

```bash
git clone https://github.com/sxwangsxwang1/chatpassport.git
cd chatpassport
pnpm install
pnpm build
```

### Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the generated `.output/chrome-mv3` directory — not the repository root.
5. Pin ChatPassport if desired.
6. Open or refresh a supported AI conversation and select the extension icon.

After rebuilding, return to `chrome://extensions` and select **Reload** on the ChatPassport card.

## Export and import

ChatPassport provides two export formats:

| Format | Best for |
| --- | --- |
| `.chatpassport.json` | Re-importing, automation, and preserving normalized roles and message order |
| `.chatpassport.md` | Reading, searching, archiving, and use in note-taking tools |

The JSON schema is documented in [docs/format.md](docs/format.md).

Exported files use the browser's normal download flow. Imported files are read locally and are not uploaded by ChatPassport.

## Privacy and permissions

ChatPassport has no backend. Conversation processing happens in the browser, and temporary transfers expire after one hour.

| Permission | Why it is needed |
| --- | --- |
| Official platform host access | Read conversations and work with editors only on ChatGPT, Claude, Gemini, and DeepSeek |
| `scripting` | Extract the visible conversation and update the destination editor after a user action |
| `storage` | Hold one pending transfer in browser-session storage |
| `sidePanel` | Display the ChatPassport interface |

The extension does **not** request `<all_urls>`, browsing history, download management, permanent filesystem access, or access to unrelated websites.

The pending transcript is not exposed directly to a destination content script. The content script first receives transfer metadata; the background worker releases the composed continuation only after validating the selected destination domain and receiving the user's explicit **Continue with context** action.

See the full [ChatPassport Privacy Policy](PRIVACY.md).

## Troubleshooting

### Chrome says `manifest.json` is missing

Run `pnpm build`, then load `.output/chrome-mv3`. The repository root is source code and is not the unpacked extension directory.

### The side panel says “Unsupported page”

- Confirm the current tab is on an official supported domain.
- Reload the extension from `chrome://extensions`.
- Refresh the AI platform tab after reloading the extension.

Supported domains are:

```text
chatgpt.com
chat.openai.com
claude.ai
gemini.google.com
chat.deepseek.com
```

### The destination card does not appear

- Make sure the transfer destination matches the page you opened.
- Reload the destination page once.
- Start a new transfer if the previous one is more than one hour old.
- Check the ChatPassport card on `chrome://extensions` for runtime errors.

### The context is too large

Choose the latest 20, 50, or 100 messages instead of the entire conversation. For archival use, export the full conversation as JSON or Markdown.

## Development

ChatPassport is built with TypeScript, React, WXT, Zod, Vitest, and Chrome Manifest V3.

```bash
pnpm dev        # Start the WXT development build
pnpm typecheck  # Run TypeScript checks
pnpm test       # Run unit and DOM adapter tests
pnpm build      # Create .output/chrome-mv3
pnpm zip        # Create a distributable extension archive
pnpm release:chrome # Verify and copy the store-ready ZIP into release/
pnpm check      # Typecheck, test, and build
```

### Project structure

```text
entrypoints/
  background.ts          Background relay and session-storage bridge
  relay.content.ts       Destination standby-continuation card
  sidepanel/             React side-panel interface
lib/
  adapters/page.ts       Conversation extraction and editor adapters
  browser.ts             Active-tab scripting helpers
  core.ts                Rendering, limits, URLs, and shared utilities
  passport.ts            Portable conversation schema
  pending.ts             Expiring session transfer storage
  relay.ts               Relay authorization and continuation budgeting
tests/                    Core, schema, adapter, and relay tests
docs/format.md            ChatPassport JSON format
store-assets/             Chrome Web Store images, listing copy, and checklist
```

## Known limitations

- Platform extraction and editor adapters depend on website DOM structures that can change without notice.
- Rich formatting is reduced to portable text and fenced code blocks.
- Attachments, images, citations, artifacts, and hidden reasoning are not transferred.
- Only one pending quick transfer is stored at a time.
- The safe character budget is not the same as a model-specific token guarantee.
- Chrome Web Store review has not yet been completed; the included listing materials remain subject to Google's review.

## Roadmap

- Improve parser resilience as supported platforms change.
- Add fixtures for more editor variants and multilingual conversations.
- Preserve more structured content, including tables and citations.
- Add optional local summaries for conversations that exceed the relay budget.
- Prepare signed browser-store releases after the adapter layer stabilizes.

## Contributing

Issues and pull requests are welcome. For platform parsing bugs, include:

- the affected platform and URL pattern;
- what ChatPassport displayed;
- the expected message count or editor behavior;
- extension runtime errors with personal conversation content removed.

Before submitting a pull request, run:

```bash
pnpm check
```

## License

No open-source license has been selected yet. Until a license is added, the repository remains available for inspection and contribution under GitHub's default copyright terms.

## Star history

If ChatPassport is useful, consider giving the project a star. The chart below is generated inside this repository by GitHub Actions and tracks its recent star growth.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/star-history-dark.svg" />
  <img alt="ChatPassport GitHub star history" src="assets/star-history.svg" />
</picture>

<div align="center">

[⭐ Star ChatPassport](https://github.com/sxwangsxwang1/chatpassport) · [View stargazers](https://github.com/sxwangsxwang1/chatpassport/stargazers)

</div>
