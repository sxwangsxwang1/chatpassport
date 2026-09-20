import type { PassportMessage, Provider } from "../passport";
export interface PageExtraction {
  provider: Provider | null;
  title: string;
  url: string;
  messages: PassportMessage[];
  error?: string;
}

/**
 * Runs inside the active AI page. Keep this function self-contained because
 * Chrome serializes it before injection.
 */
export function extractConversationFromPage(): PageExtraction {
  type Role = "user" | "assistant" | "system";
  type Candidate = { element: Element; role: Role };

  const hostname = location.hostname;
  const provider = hostname === "chatgpt.com" || hostname === "chat.openai.com"
    ? "chatgpt"
    : hostname === "claude.ai"
      ? "claude"
      : hostname === "gemini.google.com"
        ? "gemini"
        : hostname === "chat.deepseek.com"
          ? "deepseek"
          : null;

  if (!provider) {
    return {
      provider: null,
      title: document.title || "Untitled conversation",
      url: location.href,
      messages: [],
      error: "This page is not a supported AI conversation.",
    };
  }

  const candidates: Candidate[] = [];
  const seen = new Set<Element>();

  function add(selector: string, role: Role): void {
    document.querySelectorAll(selector).forEach((element) => {
      if (!seen.has(element)) {
        seen.add(element);
        candidates.push({ element, role });
      }
    });
  }

  function roleFromAttribute(element: Element): Role | null {
    const value = (
      element.getAttribute("data-message-author-role") ??
      element.getAttribute("data-role") ??
      element.getAttribute("data-author") ??
      ""
    ).toLowerCase();
    if (value.includes("user") || value.includes("human")) return "user";
    if (value.includes("assistant") || value.includes("model") || value.includes("bot")) return "assistant";
    if (value.includes("system")) return "system";
    return null;
  }

  document
    .querySelectorAll("[data-message-author-role], [data-role], [data-author]")
    .forEach((element) => {
      const role = roleFromAttribute(element);
      if (role && !seen.has(element)) {
        seen.add(element);
        candidates.push({ element, role });
      }
    });

  if (provider === "claude") {
    add('[data-testid="user-message"]', "user");
    add('[data-testid="assistant-message"]', "assistant");
    add(".font-claude-response", "assistant");
    add(".font-claude-message", "assistant");
  } else if (provider === "gemini") {
    add("user-query", "user");
    add("model-response", "assistant");
    add('[data-test-id="user-query"]', "user");
    add('[data-test-id="model-response"]', "assistant");
  } else if (provider === "deepseek") {
    add('[class*="user-message"]', "user");
    add('[class*="assistant-message"]', "assistant");
    add('[class*="message_user"]', "user");
    add('[class*="message_assistant"]', "assistant");
  }

  candidates.sort((a, b) => {
    const position = a.element.compareDocumentPosition(b.element);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });

  const filtered = candidates.filter((candidate, index) => {
    return !candidates.some((other, otherIndex) => {
      return otherIndex !== index && other.role === candidate.role && other.element.contains(candidate.element);
    });
  });

  function richText(element: Element): string {
    // Claude responses can contain several separately rendered Markdown blocks.
    // Select the message body, rather than just its first .prose descendant.
    const claudeBodySelector = '[data-testid="user-message"], .font-claude-response, .font-claude-message';
    const content = provider === "claude"
      ? element.matches(claudeBodySelector)
        ? element
        : element.querySelector(claudeBodySelector) ?? element
      : element.querySelectorAll(".markdown, .prose, .message-content, .whitespace-pre-wrap").length === 1
        ? element.querySelector(".markdown, .prose, .message-content, .whitespace-pre-wrap")!
        : element;
    const clone = content.cloneNode(true) as HTMLElement;

    clone.querySelectorAll('button, [hidden], [aria-hidden="true"], .sr-only').forEach((node) => node.remove());

    clone.querySelectorAll("pre").forEach((pre) => {
      const code = pre.textContent?.trim() ?? "";
      const replacement = document.createTextNode(`\n\`\`\`\n${code}\n\`\`\`\n`);
      pre.replaceWith(replacement);
    });
    clone.querySelectorAll("br").forEach((br) => br.replaceWith(document.createTextNode("\n")));
    clone.querySelectorAll("p, li, blockquote, h1, h2, h3, h4, h5, h6").forEach((block) => {
      block.append(document.createTextNode("\n"));
    });

    return (clone.textContent ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  const messages = filtered
    .map((candidate, index) => ({
      id: candidate.element.getAttribute("data-message-id")
        ? `dom:${candidate.role}:${candidate.element.getAttribute("data-message-id")}`
        : candidate.element.closest('[data-message-id]')?.getAttribute('data-message-id')
          ? `dom:${candidate.role}:${candidate.element.closest('[data-message-id]')!.getAttribute('data-message-id')}`
          : `position:${provider}-${index + 1}`,
      role: candidate.role,
      content: [{ type: "text" as const, text: richText(candidate.element) }],
    }))
    .filter((message) => (message.content[0]?.text.length ?? 0) > 0);

  const rawTitle = document.title
    .replace(/\s*[|\-]\s*(ChatGPT|Claude|Gemini|DeepSeek).*$/i, "")
    .trim();

  return {
    provider,
    title: rawTitle || `${provider} conversation`,
    url: location.href,
    messages,
    ...(messages.length === 0
      ? { error: "No messages were found. Open a conversation and try again." }
      : {}),
  };
}
