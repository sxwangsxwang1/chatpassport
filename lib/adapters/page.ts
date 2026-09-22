import type { PassportMessage, Provider } from "../passport";
export interface PageExtraction {
  provider: Provider | null;
  title: string;
  url: string;
  messages: PassportMessage[];
  /** Capture-only evidence; not exported as conversation content. */
  observation?: string;
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

    // Keep code out of prose whitespace normalization. A longer fence also
    // preserves code that itself contains Markdown backticks.
    const codeBlocks: string[] = [];
    let marker = '\uE000CODE';
    while ((clone.textContent ?? '').includes(marker)) marker += 'X';
    clone.querySelectorAll("pre").forEach((pre) => {
      const code = pre.textContent ?? "";
      let longest = 0;
      for (const match of code.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
      const fence = '`'.repeat(Math.max(3, longest + 1));
      const index = codeBlocks.push(`${fence}\n${code}\n${fence}`) - 1;
      pre.replaceWith(document.createTextNode(`\n${marker}${index}\uE001\n`));
    });
    clone.querySelectorAll("br").forEach((br) => br.replaceWith(document.createTextNode("\n")));
    clone.querySelectorAll("p, li, blockquote, h1, h2, h3, h4, h5, h6").forEach((block) => {
      block.append(document.createTextNode("\n"));
    });

    const prose = (clone.textContent ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return prose.replace(new RegExp(`${marker}(\\d+)\uE001`, 'g'), (_, index: string) => codeBlocks[Number(index)]!);
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

  // Node identity plus content-space position distinguishes a genuinely new
  // virtualized window from scrolling over an unchanged, fully rendered DOM.
  const state = globalThis as typeof globalThis & {
    __chatpassportObservations?: { url: string; nodes: WeakMap<Element, number>; next: number };
  };
  if (state.__chatpassportObservations?.url !== location.href) {
    state.__chatpassportObservations = { url: location.href, nodes: new WeakMap(), next: 0 };
  }
  const observations = state.__chatpassportObservations!;
  const observation = JSON.stringify(filtered.map(({ element }) => {
    if (!observations.nodes.has(element)) observations.nodes.set(element, ++observations.next);
    let offset = element.getBoundingClientRect().top;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) offset += parent.scrollTop;
    return [observations.nodes.get(element), Math.round(offset)];
  }));

  return {
    provider,
    title: rawTitle || `${provider} conversation`,
    url: location.href,
    messages,
    observation,
    ...(messages.length === 0
      ? { error: "No messages were found. Open a conversation and try again." }
      : {}),
  };
}
