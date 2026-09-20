# ChatPassport Privacy Policy

Effective date: September 20, 2026

ChatPassport helps users carry the rendered text of an AI conversation between supported AI assistant websites. The extension is designed to operate locally in the user's browser and does not require a ChatPassport account or API key.

## Data ChatPassport handles

When the user explicitly selects **Capture conversation history**, ChatPassport scrolls the selected conversation to load older messages and reads the rendered conversation text and basic conversation metadata, such as message roles, the source platform, page title, and page URL, from the active supported tab.

When the user prepares a transfer, ChatPassport temporarily handles the captured conversation and the new question typed by the user. Imported `.chatpassport.json` files are also read locally at the user's request.

This information may contain website content, personal communications, and user-generated content. ChatPassport does not read passwords, authentication cookies, payment information, or content from unrelated websites.

## How data is used

The handled data is used only to provide ChatPassport's single purpose:

- preview and export a conversation selected by the user;
- prepare a temporary conversation transfer to another supported assistant;
- combine selected prior context with the user's new question; and
- place the combined draft into the destination editor for the user to review and send.

ChatPassport never clicks the destination platform's Send button automatically.

## Storage and retention

Pending quick-transfer data is stored in `chrome.storage.session`. It is bound to one destination tab, becomes inaccessible after one hour, and is removed on completion, manual clearing, or closure of that tab. A Chrome alarm schedules cleanup; sleeping or stopped browsers may delay deletion until Chrome resumes. Expiration is also checked on every access and worker startup. Session storage is cleared when the browser session ends. Previews remain in side-panel memory until replaced or the panel is closed.

Exported JSON or Markdown files are saved only through the browser's normal download flow at the user's request. Those files remain under the user's control until the user deletes them.

## Data transmission and sharing

ChatPassport has no developer-operated backend. The extension does not send conversation data, drafts, imported files, browsing history, or usage analytics to the developer or to advertising, analytics, or data-broker services.

Once you click Continue with context and the draft is inserted, the destination website and its scripts can read it and may sync or transmit it before you click Send. ChatPassport never clicks Send automatically. Scrolling history can also cause the source website to load older messages through its normal network requests. Each website handles data under its own terms and privacy policy.

ChatPassport does not sell user data, use it for advertising or credit decisions, or allow the developer or other humans to read it.

## Permissions

ChatPassport requests access only to the official ChatGPT, Claude, Gemini, and DeepSeek web domains. It also uses Chrome's `scripting`, `storage`, `sidePanel`, and `alarms` permissions to read a user-selected conversation, hold one temporary transfer, update a supported destination editor after a user action, and display the extension interface, and schedule expired-transfer cleanup.

## User controls

Users can clear a pending transfer from the ChatPassport side panel, remove exported files using their operating system, or uninstall the extension from Chrome. Uninstalling removes extension-managed local data.

## Security and policy compliance

ChatPassport does not execute remotely hosted code. Its use of information received from Chrome APIs complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. Data is used only to provide or improve the extension's disclosed, user-facing conversation-transfer functionality.

## Changes

If this policy changes, the effective date above will be updated. Material changes will be reflected in the Chrome Web Store listing or extension interface as appropriate.

## Contact

For privacy questions or support, open an issue at:

https://github.com/sxwangsxwang1/chatpassport/issues
