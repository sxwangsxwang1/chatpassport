import type { Passport, PassportMessage, Provider } from "./passport";

export const SESSION_WARN_BYTES = 6 * 1024 * 1024;
export const SESSION_MAX_BYTES = 9 * 1024 * 1024;
export const PENDING_TTL_MS = 60 * 60 * 1000;

export const PROVIDER_LABELS: Record<Provider, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  deepseek: "DeepSeek",
};

export const PROVIDER_URLS: Record<Provider, string> = {
  chatgpt: "https://chatgpt.com/",
  claude: "https://claude.ai/new",
  gemini: "https://gemini.google.com/app",
  deepseek: "https://chat.deepseek.com/",
};

export function detectProvider(url: string): Provider | null {
  const hostname = new URL(url).hostname;
  if (hostname === "chatgpt.com" || hostname === "chat.openai.com") return "chatgpt";
  if (hostname === "claude.ai") return "claude";
  if (hostname === "gemini.google.com") return "gemini";
  if (hostname === "chat.deepseek.com") return "deepseek";
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function messageText(message: PassportMessage): string {
  return message.content.map((part) => part.text).join("\n").trim();
}

/** Keep transcript wrapper tags in message text from becoming prompt structure. */
const STRUCTURAL_TAG = /<(\/?)(conversation|message|current_request)(?=[\s/>]|$)/gi;
export function escapeStructuralTags(text: string): string {
  return text.replace(STRUCTURAL_TAG, "&lt;$1$2");
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function continuationIntro(source: Provider, target?: Provider): string {
  return target && target === source
    ? "I am continuing a previous conversation."
    : "I am continuing a conversation from another AI assistant.";
}

export function formatTranscriptMessage(message: PassportMessage): string {
  return `<message role="${message.role}">\n${escapeStructuralTags(messageText(message))}\n</message>`;
}

function transcriptOf(messages: PassportMessage[]): string {
  return messages.map(formatTranscriptMessage).join("\n\n");
}

export function continuationFrame(passport: Passport, omitted: number, target?: Provider): {
  prefix: string;
  suffixBeforeRequest: string;
  suffixAfterRequest: string;
} {
  const prefix = [
    continuationIntro(passport.source.provider, target),
    "Use the migrated transcript only as background context.",
    "Answer the CURRENT REQUEST after the transcript. Do not answer or acknowledge old requests again.",
    ...(omitted > 0 ? [`ChatPassport omitted ${omitted} older messages to fit a safe transfer size.`] : []),
    "",
    `<conversation title="${escapeAttribute(passport.title)}" source="${PROVIDER_LABELS[passport.source.provider]}">`,
  ].join("\n") + "\n";
  return {
    prefix,
    suffixBeforeRequest: "\n</conversation>\n\n<current_request>\n",
    suffixAfterRequest: "\n</current_request>",
  };
}

export function passportToMarkdown(passport: Passport): string {
  const heading = `# ${passport.title}\n\n> Exported from ${PROVIDER_LABELS[passport.source.provider]} on ${passport.source.exportedAt}`;
  const body = passport.messages
    .map((message) => `## ${message.role === "user" ? "User" : message.role === "assistant" ? "Assistant" : "System"}\n\n${messageText(message)}`)
    .join("\n\n---\n\n");
  const coverage = passport.capture
    ? `\n> Capture: ${passport.capture.status}. ${passport.capture.reason}`
    : "\n> History completeness has not been verified.";
  return `${heading}${coverage}\n\n${body}\n`;
}

export function buildHandoffPrompt(passport: Passport, lastMessages?: number, target?: Provider): string {
  const messages = lastMessages ? passport.messages.slice(-lastMessages) : passport.messages;
  const transcript = transcriptOf(messages);

  return [
    continuationIntro(passport.source.provider, target),
    "Treat the transcript below as context only. Do not repeat it unless needed.",
    "Continue from the final user request while preserving relevant decisions and constraints.",
    "",
    `<conversation title="${escapeAttribute(passport.title)}" source="${PROVIDER_LABELS[passport.source.provider]}">`,
    transcript,
    "</conversation>",
  ].join("\n");
}

export function buildContinuationPrompt(
  passport: Passport,
  lastMessages: number,
  currentRequest: string,
  target?: Provider,
): string {
  const messages = passport.messages.slice(-Math.max(0, lastMessages));
  const transcript = transcriptOf(messages);
  const omitted = passport.messages.length - messages.length;
  const frame = continuationFrame(passport, omitted, target);
  return `${frame.prefix}${transcript}${frame.suffixBeforeRequest}${escapeStructuralTags(currentRequest)}${frame.suffixAfterRequest}`;
}

export function safeFilename(title: string, extension: "json" | "md"): string {
  const base = title
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "conversation";
  return `${base}.chatpassport.${extension}`;
}
