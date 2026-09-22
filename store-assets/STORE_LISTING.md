# Chrome Web Store listing copy

Use these fields as the English (`en`) listing for version 0.1.3.

## Product details

**Name**

ChatPassport

**Summary**

Carry AI conversation context between ChatGPT, Claude, Gemini, and DeepSeek locally—without API keys or automatic sending.

**Category**

Productivity

**Language**

English

**Detailed description**

ChatPassport lets you continue a conversation on another AI assistant without manually rebuilding the context.

Automatically load and capture the rendered text of a conversation on ChatGPT, Claude, Gemini, or DeepSeek, choose a destination, and type the new question you actually want to ask. ChatPassport then combines the selected recent context with that question in the destination editor. You review the completed draft and use the website's own Send button.

WHY IT IS DIFFERENT

• Standby continuation: context waits until you write the next request.
• No accidental reply: ChatPassport never sends a message automatically.
• Local processing: no ChatPassport server, account, API key, analytics, or tracking.
• Transfer control: choose the latest 20, 50, 100, or all captured messages.
• Size protection: oversized continuations keep the newest complete messages and report what was omitted.
• Verification: the extension reads the destination editor back and reports if the site truncated or changed the inserted draft.
• Portable backup: export to ChatPassport JSON or readable Markdown and import JSON later.

SUPPORTED WEBSITES

• ChatGPT
• Claude
• Gemini
• DeepSeek

CURRENT LIMITATIONS

ChatPassport transfers text and fenced code blocks. Images, attachments, citations, artifacts, and hidden reasoning are not transferred. Supported websites may change their page structure, so this first release is marked experimental.

History capture scrolls through the conversation and merges rendered windows, including virtualized messages. You can stop and keep partial results. Capture is bounded to two minutes and a safety size limit. Reaching page boundaries is not proof of complete server history: hidden branches, collapsed content, slow or unsupported loaders may still be absent. Capture status is shown in the preview and included in JSON.

Repeated windows without reliable message IDs are retained with an explicit warning about possible duplicates or gaps. JSON capture, export and import share a 25 MiB UTF-8 limit, including formatting and metadata. Oversized captures retain whole messages that fit and are marked partial; an individually oversized message is rejected rather than truncated. Code-block whitespace is preserved.

PRIVACY

Conversation processing takes place in the browser. One pending transfer is stored temporarily in Chrome session storage, bound to one destination tab, and becomes inaccessible after one hour. Alarms schedule cleanup; sleeping or stopped browsers may delay deletion until Chrome resumes. Access and worker startup also enforce expiry. ChatPassport does not transmit conversation data to the developer. Once you click Continue with context, the destination website can read or sync the inserted draft before Send. ChatPassport never sends it automatically. Scrolling history may trigger normal requests by the source website.

## Optional listing URLs

These links work publicly only after the repository is public. If it remains private, replace them with equivalent pages on a public website you control.

- Homepage: `https://github.com/sxwangsxwang1/chatpassport`
- Support: `https://github.com/sxwangsxwang1/chatpassport/issues`
- Privacy policy: `https://sxwangsxwang1.github.io/chatpassport/privacy.html`

## Reviewer test instructions

1. Sign in to any supported website and open a conversation containing at least two messages.
2. Click the ChatPassport toolbar icon to open its side panel.
3. Click **Capture conversation history**. Confirm the title, source, message count, and size appear.
4. Select a different supported assistant and click **Import into [destination]**.
5. On the destination page, confirm the **ChatPassport context is ready** card appears.
6. Type a short new question in the destination message box, then click **Continue with context** on the ChatPassport card.
7. Confirm the editor now contains prior context plus the new question and that ChatPassport did not submit the message.
8. Review the editor and use the destination website's Send button manually if desired.

No special account, license key, ChatPassport server, or API credential is required. Reviewer accounts for supported AI services are governed by those services.

## Privacy practices fields

**Single purpose**

Allow users to locally capture the visible text of an AI conversation and continue it on another supported AI assistant website under the user's control.

**`scripting` justification**

Used after explicit user actions to extract the visible conversation from the active supported tab and to place a user-reviewed continuation into the supported destination editor. It is not used on unrelated websites.

**`storage` justification**

Used to hold one pending transfer in `chrome.storage.session` while the user moves between supported websites. The transfer becomes inaccessible after one hour and is removed on completion, manual clearing, or destination-tab closure. Cleanup alarms may be delayed while Chrome is asleep or stopped.

**`alarms` justification**

Used to schedule cleanup of expired pending transfers. Expiry is also checked on every access and worker startup. No browsing, tracking, or periodic network activity is performed by the alarm.

**`sidePanel` justification**

Used to show the ChatPassport capture, preview, export, import, and destination-selection interface alongside the active conversation.

**Host permission justification**

Access is limited to the official ChatGPT, Claude, Gemini, and DeepSeek domains. It is required to read a conversation selected by the user and work with the destination message editor. No unrelated domains are requested.

**Remote code**

Select: **No, I am not using remote code.** All executable extension code is included in the uploaded package.

**Data types handled**

Disclose the following because Chrome policy treats locally processed data as handled data:

- Website content
- Personal communications
- User-generated content

Do not select personally identifiable information, health information, financial and payment information, authentication information, location, or web history: ChatPassport does not intentionally read or store those categories. A user may place sensitive information inside a conversation, but the extension treats it only as user-selected conversation content and does not inspect it by category.

**Data-use certifications**

Certify that data is used only for the extension's user-facing single purpose; is not sold; is not used or transferred for advertising, creditworthiness, or unrelated purposes; and is not exposed to human review. These statements must remain consistent with `PRIVACY.md` and the shipped behavior.
