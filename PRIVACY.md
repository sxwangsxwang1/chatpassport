# ChatPassport Privacy Policy

Effective November 20, 2026

ChatPassport helps users carry the rendered text of an AI conversation between supported AI assistant websites. The extension is designed to operate locally in the user's browser and does not require a ChatPassport account or API key.

## Data ChatPassport handles

When the user explicitly selects **Prepare for [destination]**, ChatPassport reads rendered conversation text and basic metadata (message roles, source platform, page title and page URL) from the active supported tab. **Quick** reads only currently loaded messages without scrolling; **Load history** scrolls to collect older rendered messages.

When the user opens a destination draft, ChatPassport temporarily handles the selected conversation, the new question typed in the side panel, and the user's confirmation of any omitted messages. Imported `.chatpassport.json` files are also read locally at the user's request.

This information may contain website content, personal communications, and user-generated content. ChatPassport does not read passwords, authentication cookies, payment information, or content from unrelated websites.

## How data is used

The handled data is used only to provide ChatPassport's single purpose:

- preview and export a conversation selected by the user;
- prepare a temporary conversation transfer to another supported assistant;
- combine selected prior context with the user's new question; and
- place the combined draft into the destination editor for the user to review and send.

After the user clicks **Open editable draft**, ChatPassport attempts to fill an empty destination editor automatically. The user can insert or copy the prepared draft manually if needed. ChatPassport never clicks the destination platform's Send button automatically.

## Storage and retention

Pending quick-transfer data is stored in `chrome.storage.session`. It is bound to one destination tab, becomes inaccessible after one hour, and is removed on completion, manual clearing, or closure of that tab. A Chrome alarm schedules cleanup; sleeping or stopped browsers may delay deletion until Chrome resumes. Expiration is also checked on every access and worker startup. Session storage is cleared when the browser session ends. Previews remain in side-panel memory until replaced or the panel is closed.

Starting with version 0.1.9, after insertion the destination card keeps the draft in memory so the user can copy it again. The copy is discarded when the user dismisses the card or the destination page unloads.

Exported JSON or Markdown files are saved only through the browser's normal download flow at the user's request. Those files remain under the user's control until the user deletes them.

## Data transmission and sharing

ChatPassport has no developer-operated backend. The extension does not send conversation data, drafts, imported files, browsing history, or usage analytics to the developer or to advertising, analytics, or data-broker services.

Once you click **Open editable draft** and ChatPassport inserts the draft, the destination website and its scripts can read it and may sync or transmit it before you click Send. The same applies if you use the manual insertion or copy fallback. ChatPassport never clicks Send automatically. Scrolling history can also cause the source website to load older messages through its normal network requests. Each website handles data under its own terms and privacy policy.

ChatPassport does not sell user data, use it for advertising or credit decisions, or allow the developer or other humans to read it.

## Permissions

ChatPassport requests access only to the official ChatGPT, Claude, Gemini, and DeepSeek web domains. It also uses Chrome's `scripting`, `storage`, `sidePanel`, and `alarms` permissions to read a user-selected conversation, hold one temporary transfer, fill a supported destination editor after the user opens a draft, display the extension interface, and schedule expired-transfer cleanup.

## User controls

Users can clear a pending transfer from the ChatPassport side panel, remove exported files using their operating system, or uninstall the extension from Chrome. Uninstalling removes extension-managed local data.

## Security and policy compliance

ChatPassport does not execute remotely hosted code. Its use of information received from Chrome APIs complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. Data is used only to provide or improve the extension's disclosed, user-facing conversation-transfer functionality.

## Changes

If this policy changes, the effective date above will be updated. Material changes will be reflected in the Chrome Web Store listing or extension interface as appropriate.

## Contact

For privacy questions or support, open an issue at:

https://github.com/sxwangsxwang1/chatpassport/issues
