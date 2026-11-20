# Chrome Web Store listing copy

English (`en`) listing copy for ChatPassport 0.1.9.

## Product details

**Name**

ChatPassport — Move Chats Across ChatGPT, Claude & Gemini

**Summary**

Continue chats across ChatGPT, Claude, Gemini, and DeepSeek. Local processing. No account or API key required.

**Category**

Productivity / Tools (select the available matching category in the dashboard)

**Language**

English

**Detailed description**

Hit a chat limit? Continue your conversation in another AI assistant without copying messages one by one.

ChatPassport carries text and code between ChatGPT, Claude, Gemini, and DeepSeek. Choose where to continue, bring the context, and ask your next question. You review the draft and send it yourself.

KEEP YOUR WORK MOVING

• Switch assistants or open a fresh chat on the current assistant without manually rebuilding the conversation.
• Choose Quick to read currently loaded messages, or Load history to collect older messages by scrolling.
• Search and review the full capture, choose individual messages, write your next question, and confirm the exact number of older selected messages that will be omitted before opening the destination.
• If messages are omitted, download the full captured transcript as Markdown to attach yourself at the destination.
• Keep a portable copy as Markdown or ChatPassport JSON. Import saved JSON when you need it.

THREE SIMPLE STEPS

1. Open a supported conversation, choose a destination and click Prepare.
2. Review the capture, choose a message range or individual messages, write your next question, and confirm any omissions.
3. Open an editable draft in your chosen assistant. ChatPassport fills an empty message box when ready. Review the draft and click Send yourself. If the editor clears it, use Copy prepared draft on the destination card to recover it.

LOCAL PROCESSING, YOUR CONTROL

No ChatPassport account, API key, developer-operated server, analytics or tracking. Processing happens in your browser. A pending transfer is bound to the destination tab and expires after one hour. After insertion, the destination card keeps the draft in memory for copying until you dismiss the card or the page unloads.

ChatPassport never clicks Send. Once the draft is inserted automatically or manually, the destination website can read or sync it before you send. Loading older history may trigger the source website's normal requests.

WHAT IS INCLUDED

Text as Markdown, including tables, lists, links, fenced code blocks and TeX math. Non-decorative images appear as [image: description] or [image] placeholders; image and attachment contents, citation cards, artifacts and hidden reasoning are not transferred. Quick capture includes only currently rendered messages; history capture is limited to two minutes and cannot guarantee hidden, collapsed or server-side history. Coverage and any uncertainty are shown in the panel.

If a history capture reaches the message count or file size limit, it keeps the most recent complete messages that fit and shows the limit in the side panel.

Drafts have a 48,000-character budget including your next question (up to 8,000 characters). Oversized drafts retain complete recent selected messages, with explicit approval for omissions. This is not AI summarization; destination models may impose smaller limits. Captured JSON files have a 25 MiB limit. ChatPassport does not upload or verify downloaded transcript attachments.

ChatPassport is not affiliated with OpenAI, Anthropic, Google, or DeepSeek.

## Optional listing URLs

- Homepage: `https://github.com/sxwangsxwang1/chatpassport`
- Support: `https://github.com/sxwangsxwang1/chatpassport/issues`
- Privacy policy: `https://sxwangsxwang1.github.io/chatpassport/privacy.html`

## Reviewer test instructions

1. Sign in to a supported AI website and open a conversation with at least two text messages.
2. Open ChatPassport, choose another assistant or a fresh chat on the current assistant, and select Quick or Load history.
3. Click Prepare for the chosen assistant. Check the captured count, coverage notice, and full searchable message preview.
4. Choose a message range or individual messages, enter a next question, and confirm any displayed omission count. When the draft omits messages, download the full transcript if you want to attach it manually.
5. Click Open editable draft. The destination tab should fill its empty editor automatically. If it cannot, try Insert prepared draft or Copy prepared draft on the card.
6. Review the inserted draft. Clear the editor, then use Copy prepared draft and paste to verify you can recover the draft. Sending requires the website's Send button.
7. More options exposes JSON/Markdown export and JSON import.

No ChatPassport account, license key, backend or API key is required. Normal accounts for the supported AI websites are required under their own terms.

## Privacy practices fields

**Single purpose**

Allow users to locally capture the visible text of an AI conversation and continue it on another supported AI assistant website under the user's control.

**`scripting` justification**

Used after explicit user actions to extract the visible conversation from the active supported tab and to place a prepared continuation into an empty supported destination editor. The user reviews and sends the draft. It is not used on unrelated websites.

**`storage` justification**

Used to hold one pending transfer in `chrome.storage.session` while the user moves between supported websites. The transfer becomes inaccessible after one hour and is removed on completion, manual clearing, or destination-tab closure. Cleanup alarms may be delayed while Chrome is asleep or stopped.

**`alarms` justification**

Used to schedule cleanup of expired pending transfers. Expiry is also checked on every access and worker startup. No browsing, tracking, or periodic network activity is performed by the alarm.

**`sidePanel` justification**

Used to show the ChatPassport capture, preview, message selection, next-question, export, import, and destination-selection interface alongside the active conversation.

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
