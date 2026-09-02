# ChatPassport

ChatPassport is a local-first Chrome extension for carrying conversation
context between ChatGPT, Claude, Gemini, and DeepSeek.

It does not replay old messages or send anything automatically. ChatPassport
turns a conversation into portable context, places it in the destination
message box, and leaves the final review and send action to you.

## Current features

- Preview the conversation in the active AI tab.
- Transfer one conversation through temporary browser-session storage.
- Limit a transfer to the latest 20, 50, or 100 messages.
- Export an open `.chatpassport.json` file or readable Markdown.
- Import a previously exported ChatPassport file.
- Open a supported destination and fill its empty message box automatically.
- Keep manual Fill and Copy context actions as transfer fallbacks.
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
5. ChatPassport opens the destination, waits for its message box, and fills the
   context automatically.
6. Review the inserted context and send it yourself. ChatPassport never clicks
   Send.

If the destination editor already contains a draft, ChatPassport leaves it
untouched. Clear the editor and use **Retry filling**, or use **Copy context** as
a manual fallback. A successful automatic fill clears the pending transfer so
refreshing the page cannot insert it twice.

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
apps. It asks the background worker for a transfer addressed to the current
platform, waits for the editor, fills it, and shows an on-page confirmation.

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
  even when they fit in browser storage.
- Platform parsers and editor selectors may need updates when AI sites change.

## License

License information will be added before the first public release.
