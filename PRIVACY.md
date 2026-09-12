# ChatPassport Privacy Policy

Effective date: September 9, 2026

ChatPassport helps users carry the visible text of an AI conversation between supported AI assistant websites. The extension is designed to operate locally in the user's browser and does not require a ChatPassport account or API key.

## Data ChatPassport handles

When the user explicitly selects **Preview current conversation**, ChatPassport reads the visible conversation text and basic conversation metadata, such as message roles, the source platform, page title, and page URL, from the active supported tab.

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

Pending quick-transfer data is stored in `chrome.storage.session`. It is removed when the transfer is completed or cleared and expires after one hour. Session storage is also cleared when the browser session ends.

Exported JSON or Markdown files are saved only through the browser's normal download flow at the user's request. Those files remain under the user's control until the user deletes them.

## Data transmission and sharing

ChatPassport has no developer-operated backend. The extension does not send conversation data, drafts, imported files, browsing history, or usage analytics to the developer or to advertising, analytics, or data-broker services.

Conversation data reaches a supported AI service only when the user reviews the prepared draft and manually sends it through that service's website. That service then handles the submitted content under its own terms and privacy policy.

ChatPassport does not sell user data, use it for advertising or credit decisions, or allow the developer or other humans to read it.

## Permissions

ChatPassport requests access only to the official ChatGPT, Claude, Gemini, and DeepSeek web domains. It also uses Chrome's `scripting`, `storage`, and `sidePanel` permissions to read a user-selected conversation, hold one temporary transfer, update a supported destination editor after a user action, and display the extension interface.

## User controls

Users can clear a pending transfer from the ChatPassport side panel, remove exported files using their operating system, or uninstall the extension from Chrome. Uninstalling removes extension-managed local data.

## Security and policy compliance

ChatPassport does not execute remotely hosted code. Its use of information received from Chrome APIs complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. Data is used only to provide or improve the extension's disclosed, user-facing conversation-transfer functionality.

## Changes

If this policy changes, the effective date above will be updated. Material changes will be reflected in the Chrome Web Store listing or extension interface as appropriate.

## Contact

For privacy questions or support, open an issue at:

https://github.com/sxwangsxwang1/chatpassport/issues
