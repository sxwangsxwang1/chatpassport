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

export function buildHandoffPrompt(passport: Passport, lastMessages?: number): string {
  const messages = lastMessages ? passport.messages.slice(-lastMessages) : passport.messages;
  const transcript = messages
    .map((message) => `<message role="${message.role}">\n${messageText(message)}\n</message>`)
    .join("\n\n");

  return [
    "I am continuing a conversation from another AI assistant.",
    "Treat the transcript below as context only. Do not repeat it unless needed.",
    "Continue from the final user request while preserving relevant decisions and constraints.",
    "",
    `<conversation title="${passport.title.replaceAll('"', "&quot;")}" source="${PROVIDER_LABELS[passport.source.provider]}">`,
    transcript,
    "</conversation>",
  ].join("\n");
}

export function buildContinuationPrompt(
  passport: Passport,
  lastMessages: number,
  currentRequest: string,
): string {
  const messages = passport.messages.slice(-Math.max(0, lastMessages));
  const transcript = messages
    .map((message) => `<message role="${message.role}">\n${messageText(message)}\n</message>`)
    .join("\n\n");
  const omitted = passport.messages.length - messages.length;

  return [
    "I am continuing a conversation from another AI assistant.",
    "Use the migrated transcript only as background context.",
    "Answer the CURRENT REQUEST after the transcript. Do not answer or acknowledge old requests again.",
    omitted > 0 ? `ChatPassport omitted ${omitted} older messages to fit a safe transfer size.` : "",
    "",
    `<conversation title="${passport.title.replaceAll('"', "&quot;")}" source="${PROVIDER_LABELS[passport.source.provider]}">`,
    transcript,
    "</conversation>",
    "",
    "<current_request>",
    currentRequest,
    "</current_request>",
  ].filter((line, index, lines) => line !== "" || lines[index - 1] !== "").join("\n");
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
