# ChatPassport

ChatPassport is a local-first Chrome extension for carrying conversation
context between ChatGPT, Claude, Gemini, and DeepSeek.

It does not replay old messages or send anything automatically. ChatPassport
keeps the migrated context on standby until you type a new request, then places
the combined continuation in the destination message box for review.

## Current features

- Preview the conversation in the active AI tab.
- Transfer one conversation through temporary browser-session storage.
- Limit a transfer to the latest 20, 50, or 100 messages.
- Export an open `.chatpassport.json` file or readable Markdown.
- Import a previously exported ChatPassport file.
- Open a supported destination with the migrated context waiting in standby.
- Combine that context with the user's next request instead of sending a
  context-only message.
- Verify that the complete combined draft was accepted before reporting
  success.
- Keep Copy context as a manual fallback.
- Clear temporary transfer data manually or automatically after one hour.

All processing happens in the browser. There is no ChatPassport server,
account, analytics, or tracking.

## Supported platforms

| Platform | Read conversation | Fill message box |
| --- | --- | --- |
| ChatGPT | Experimental | Experimental |
| Claude | Experimental | Experimental |
| Gemini | Experimental | Experimental |
| DeepSeek | Experimental | Experimental |

AI websites change their HTML frequently. Export a JSON backup before relying
on a transfer, and report pages the parser does not recognize.

## Install for development

Requirements: a current Node.js release, pnpm, and Chrome.

```bash
pnpm install
pnpm build
```

Then open `chrome://extensions`, enable **Developer mode**, choose
**Load unpacked**, and select:

```text
.output/chrome-mv3
```

Pin ChatPassport if desired. Open a supported conversation and click the
extension icon to open its side panel.

## How a transfer works

1. Open a conversation and click ChatPassport.
2. Select **Preview current conversation**.
3. Review the detected title, message count, and size.
4. Choose a destination and select **Import into ...**.
5. ChatPassport opens the destination and shows that the context is ready. The
   destination message box remains empty.
6. Type the new question you actually want the destination assistant to answer.
7. Select **Continue with context** in the on-page ChatPassport card.
8. Review the combined context and new request, then use the destination's Send
   button yourself.

Before inserting the combined draft, ChatPassport checks a conservative
48,000-character relay budget and keeps the newest complete messages that fit.
It tells you how many older messages were omitted. After insertion it reads the
editor back and checks the entire draft; if the platform truncated it, your
original new question is restored and an error is shown.

Quick transfers use `chrome.storage.session`. ChatPassport keeps only one
pending transfer, warns above 6 MB, refuses session storage above 9 MB, and
clears expired data after one hour. Large conversations should be saved as a
file or transferred using only their latest messages.

## Permissions

- Scoped site access: read and fill conversations only on the official
  ChatGPT, Claude, Gemini, and DeepSeek web apps.
- `scripting`: read the visible conversation or manually fill the destination
  editor.
- `storage`: hold one temporary transfer inside the current browser session.
- `sidePanel`: display the ChatPassport interface.

The extension also runs a small content script only on those four official web
apps. It asks the background worker only for transfer metadata addressed to the
current platform. The transcript stays in session storage until the user types
a new request and explicitly chooses **Continue with context**.

The extension does not request `<all_urls>`, access to unrelated websites,
download-management, browsing history, or permanent filesystem access.

## Development

```bash
pnpm dev        # start the extension development build
pnpm typecheck  # run TypeScript checks
pnpm test       # run unit and adapter fixture tests
pnpm build      # create a production extension
pnpm zip        # create a distributable archive
pnpm check      # typecheck, test, and build
```

The open conversation format is documented in [docs/format.md](docs/format.md).

## Known limitations

- The first release handles text and code blocks only.
- Images, uploaded files, citations, artifacts, and hidden reasoning are not
  transferred.
- Rich formatting is reduced to portable text and fenced code blocks.
- Very large transcripts may exceed the destination model's context window
  even when they fit in browser storage. The conservative relay budget reduces
  this risk but cannot know every model's server-side token limit.
- Platform parsers and editor selectors may need updates when AI sites change.

## License

License information will be added before the first public release.
