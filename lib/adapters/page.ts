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

  // ChatGPT's current conversation view no longer uses data-message-author-role.
  // Its search units identify both the rendered message and its role.
  if (provider === "chatgpt") {
    document.querySelectorAll("[data-chatgpt-search-unit-key]").forEach((element) => {
      const role = element.getAttribute("data-chatgpt-search-unit-key")?.match(/:(user|assistant|system)$/)?.[1] as Role | undefined;
      if (role && !seen.has(element)) {
        seen.add(element);
        candidates.push({ element, role });
      }
    });
  }

  if (candidates.length === 0) {
    document
      .querySelectorAll("[data-message-author-role], [data-role], [data-author]")
      .forEach((element) => {
        const role = roleFromAttribute(element);
        if (role && !seen.has(element)) {
          seen.add(element);
          candidates.push({ element, role });
        }
      });
  }

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
    // Current DeepSeek renders both roles as .ds-message; the user bubble
    // contains a collapsible text body while the assistant has a main body.
    document.querySelectorAll('.ds-message').forEach((element) => {
      if (seen.has(element)) return;
      const role = element.querySelector(':scope > .ds-assistant-message-main-content')
        ? 'assistant' : element.querySelector('.ds-collapsible-text') ? 'user' : null;
      if (role) {
        seen.add(element);
        candidates.push({ element, role });
      }
    });
  }

  candidates.sort((a, b) => {
    const position = a.element.compareDocumentPosition(b.element);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });

  // A candidate is redundant only when one of its ancestors has the same
  // role. Walk the ancestor chain instead of comparing every candidate pair.
  const roleByElement = new Map(candidates.map(({ element, role }) => [element, role]));
  const filtered = candidates.filter(({ element, role }) => {
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (roleByElement.get(ancestor) === role) return false;
    }
    return true;
  });

  function richText(element: Element, role: Role): string {
    // Claude responses can contain several separately rendered Markdown blocks.
    // Select the message body, rather than just its first .prose descendant.
    const claudeBodySelector = '[data-testid="user-message"], .font-claude-response, .font-claude-message';
    const chatgptBodySelector = '[data-user-message-bubble], [data-markdown-text-style="assistant-message"]';
    const content = provider === "claude"
      ? element.matches(claudeBodySelector)
        ? element
        : element.querySelector(claudeBodySelector) ?? element
      : provider === "chatgpt" && element.querySelectorAll(chatgptBodySelector).length === 1
        ? element.querySelector(chatgptBodySelector)!
      : element.querySelectorAll(".markdown, .prose, .message-content, .whitespace-pre-wrap").length === 1
        ? element.querySelector(".markdown, .prose, .message-content, .whitespace-pre-wrap")!
        : element;
    const clone = content.cloneNode(true) as HTMLElement;

    // KaTeX's visual copy is aria-hidden, so removing hidden nodes leaves one
    // MathML copy whose TeX annotation is read below.
    clone.querySelectorAll('button, [hidden], [aria-hidden="true"], .sr-only, .cdk-visually-hidden').forEach((node) => node.remove());

    // Protected segments (code, math) skip whitespace normalization and are
    // restored at the end. The marker never occurs in the message text.
    const segments: string[] = [];
    let marker = '\uE000CODE';
    while ((clone.textContent ?? '').includes(marker)) marker += 'X';
    const protect = (value: string) => `${marker}${segments.push(value) - 1}\uE001`;
    const expand = (value: string) => value.replace(new RegExp(`${marker}(\\d+)\uE001`, 'g'),
      (_, index: string) => segments[Number(index)]!);
    // Nested list continuation lines use this placeholder so whitespace
    // cleanup cannot remove their indentation; it becomes spaces at the end.
    const INDENT = '\uE002';
    // Users type plain text: keep their whitespace and add no Markdown markup.
    const preserve = role === 'user';

    type Context = { inTable: boolean };
    const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'TEXTAREA', 'SELECT']);
    const BLOCKS = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'FIGURE',
      'FIGCAPTION', 'DETAILS', 'SUMMARY', 'DL', 'DT', 'DD', 'ADDRESS', 'LI']);

    const tidy = (value: string) => value.replace(/[ \t]*\n[ \t]*/g, '\n');
    const block = (value: string) => preserve ? `${value}\n` : value.trim() ? `\n\n${value}\n\n` : '';
    // Escape source text so literal Markdown punctuation stays literal. Table
    // pipes are escaped once, after all cell content has been rendered.
    const escapeText = (value: string, inTable: boolean) => {
      const escaped = value.replace(
        inTable ? /[\\`*_\[\]#><~&]/g : /[\\`*_\[\]#>|<~&]/g,
        '\\$&',
      );
      return escaped.replace(/^(\s*)(\d+[.)]|[-+])(?=\s)/, (_, space: string, marker: string) =>
        `${space}${marker.slice(0, -1)}\\${marker.slice(-1)}`);
    };
    function longestBacktickRun(value: string): number {
      let longest = 0;
      for (const match of value.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
      return longest;
    }

    function children(node: Node, ctx: Context): string {
      let result = '';
      node.childNodes.forEach((child) => { result += render(child, ctx); });
      return result;
    }

    function wrap(value: string, mark: string): string {
      if (preserve) return value;
      const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(value)!;
      return match[2] ? `${match[1]}${mark}${match[2]}${mark}${match[3]}` : value;
    }

    function math(node: Element, display: boolean, ctx: Context): string {
      const tex = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim();
      if (!tex) return (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (ctx.inTable) return `$${tex}$`;
      return display ? block(protect(`$$\n${tex}\n$$`)) : protect(`$${tex}$`);
    }

    function inlineCode(text: string, ctx: Context): string {
      const value = text.replace(/\s*\n\s*/g, ' ');
      if (!value.trim() || preserve) return value;
      const fence = '`'.repeat(longestBacktickRun(value) + 1);
      const pad = value.startsWith('`') || value.endsWith('`') ? ' ' : '';
      const code = `${fence}${pad}${value}${pad}${fence}`;
      // Table cells escape "|" afterwards, so they must see the raw text.
      return ctx.inTable ? code : protect(code);
    }

    function codeBlock(pre: Element, ctx: Context): string {
      // Read only the <code> element so header labels inside <pre>
      // (language name, Copy controls) do not leak into the code.
      const codeElement = pre.querySelector('code');
      const code = (codeElement ?? pre).textContent ?? '';
      if (ctx.inTable) return inlineCode(code, ctx);
      const classes = `${codeElement?.getAttribute('class') ?? ''} ${pre.getAttribute('class') ?? ''}`;
      const language = (/(?:^|\s)(?:language|lang)-([\w#+.-]+)/.exec(classes)?.[1]
        ?? codeElement?.getAttribute('data-language') ?? pre.getAttribute('data-language') ?? '')
        .replace(/[^\w#+.-]/g, '');
      // A longer fence preserves code that itself contains Markdown backticks.
      const fence = '`'.repeat(Math.max(3, longestBacktickRun(code) + 1));
      return block(protect(`${fence}${language}\n${code}\n${fence}`));
    }

    function list(node: Element, ctx: Context): string {
      const ordered = node.tagName.toUpperCase() === 'OL';
      let number = Number.parseInt(node.getAttribute('start') ?? '1', 10);
      if (!Number.isFinite(number)) number = 1;
      const items: string[] = [];
      node.childNodes.forEach((child) => {
        if (!(child instanceof Element) || child.tagName.toUpperCase() !== 'LI') {
          const other = expand(tidy(render(child, ctx)).trim());
          if (other) items.push(other);
          return;
        }
        const prefix = ordered ? `${number++}. ` : '- ';
        // Expand protected code before indenting each line. Otherwise only the
        // placeholder is indented and a fenced block escapes the list item.
        const paragraphs = Array.from(child.children).filter((element) => element.tagName.toUpperCase() === 'P');
        let compact = tidy(children(child, ctx))
          .replace(paragraphs.length > 1 ? /\n{3,}/g : /\n{2,}/g, paragraphs.length > 1 ? '\n\n' : '\n')
          .trim();
        if (!preserve) compact = compact.replace(/ {2,}/g, ' ');
        const lines = expand(compact).split('\n');
        items.push(lines.map((line, index) => index === 0 ? prefix + line
          : line ? INDENT.repeat(prefix.length) + line : line).join('\n'));
      });
      const result = items.join('\n').replaceAll(INDENT, ' ');
      // Keep indentation and code whitespace intact through final cleanup.
      return block(ctx.inTable ? result : protect(result));
    }

    function blockquote(node: Element, ctx: Context): string {
      let compact = tidy(children(node, ctx)).replace(/\n{3,}/g, '\n\n').trim();
      if (!preserve) compact = compact.replace(/ {2,}/g, ' ');
      const inner = expand(compact);
      if (preserve) return block(protect(inner));
      // Quote every restored line, including lines inside code and nested lists.
      const quoted = inner.split('\n').map((line) => line ? `> ${line}` : '>').join('\n');
      return block(protect(quoted));
    }

    function table(node: Element): string {
      const rows = Array.from(node.querySelectorAll('tr')).filter((row) => row.closest('table') === node);
      const grid = rows.map((row) => {
        const cells: string[] = [];
        Array.from(row.children).forEach((cell) => {
          const tag = cell.tagName.toUpperCase();
          if (tag !== 'TD' && tag !== 'TH') return;
          const text = children(cell, { inTable: true })
            .replace(/[ \t]+/g, ' ')
            .trim()
            .replace(/\s*\n\s*/g, '<br>')
            .replace(/\|/g, '\\|');
          cells.push(text);
          const span = Number.parseInt(cell.getAttribute('colspan') ?? '1', 10);
          for (let i = 1; i < Math.min(Number.isFinite(span) ? span : 1, 50); i++) cells.push('');
        });
        return cells;
      }).filter((cells) => cells.length > 0);
      if (!grid.length) return block(children(node, { inTable: false }));
      const width = Math.max(...grid.map((cells) => cells.length));
      const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`;
      return block([line(grid[0]!), line(Array(width).fill('---')), ...grid.slice(1).map(line)].join('\n'));
    }

    function link(node: Element, ctx: Context): string {
      const text = children(node, ctx);
      const href = node.getAttribute('href') ?? '';
      if (preserve || !href || href.startsWith('#') || /^\s*javascript:/i.test(href)) return text;
      let url: string;
      try {
        url = new URL(href, location.href).href;
      } catch {
        return text;
      }
      const [, before, label, after] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
      const safeUrl = url.replace(/\(/g, '%28').replace(/\)/g, '%29');
      const rawLabel = (node.textContent ?? '').trim();
      if (!label || rawLabel === url || rawLabel === href) return `${before}<${safeUrl}>${after}`;
      return `${before}[${label}](${safeUrl})${after}`;
    }

    function image(node: Element): string {
      const alt = node.getAttribute('alt');
      // alt="" marks a decorative image in HTML.
      if (alt === '' || node.getAttribute('role') === 'presentation') return '';
      const description = (alt ?? '').replace(/\s+/g, ' ').trim();
      const placeholder = description ? `[image: ${description}]` : '[image]';
      // In plain user text an attachment sits on its own line.
      return preserve ? `${placeholder}\n` : placeholder;
    }

    function render(node: Node, ctx: Context): string {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = (node.textContent ?? '').replace(/\u00a0/g, ' ').replaceAll(INDENT, '');
        return preserve ? text : escapeText(text.replace(/[ \t\n\r\f]+/g, ' '), ctx.inTable);
      }
      if (!(node instanceof Element)) return '';
      const tag = node.tagName.toUpperCase();
      if (SKIP.has(tag)) return '';
      if (node.classList.contains('katex-display')) return math(node, true, ctx);
      if (node.classList.contains('katex')) return math(node, false, ctx);
      switch (tag) {
        case 'MATH': return math(node, node.getAttribute('display') === 'block', ctx);
        case 'PRE': return codeBlock(node, ctx);
        case 'CODE': return inlineCode(node.textContent ?? '', ctx);
        case 'BR': return '\n';
        case 'HR': return preserve ? '\n' : block('---');
        case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6': {
          const text = children(node, ctx).replace(/\s+/g, ' ').trim();
          return block(preserve || !text ? text : `${'#'.repeat(Number(tag[1]))} ${text}`);
        }
        case 'UL': case 'OL': return list(node, ctx);
        case 'BLOCKQUOTE': return blockquote(node, ctx);
        case 'TABLE': return ctx.inTable ? children(node, ctx) : table(node);
        case 'A': return link(node, ctx);
        case 'STRONG': case 'B': return wrap(children(node, ctx), '**');
        case 'EM': case 'I': return wrap(children(node, ctx), '*');
        case 'DEL': case 'S': return wrap(children(node, ctx), '~~');
        case 'IMG': return image(node);
        case 'INPUT':
          return node.getAttribute('type') === 'checkbox' ? ((node as HTMLInputElement).checked ? '[x] ' : '[ ] ') : '';
      }
      return BLOCKS.has(tag) ? block(children(node, ctx)) : children(node, ctx);
    }

    let text = render(clone, { inTable: false });
    text = preserve
      ? text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
      : tidy(text).replace(/ {2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
    text = text.replaceAll(INDENT, ' ').trim();
    return expand(text);
  }

  const messages = filtered
    .map((candidate, index) => ({
      id: provider === "chatgpt" && candidate.element.getAttribute("data-chatgpt-search-message-ids")?.trim().split(/\s+/)[0]
        ? `dom:${candidate.role}:${candidate.element.getAttribute("data-chatgpt-search-message-ids")!.trim().split(/\s+/)[0]}`
        : candidate.element.getAttribute("data-message-id")
        ? `dom:${candidate.role}:${candidate.element.getAttribute("data-message-id")}`
        : candidate.element.closest('[data-message-id]')?.getAttribute('data-message-id')
          ? `dom:${candidate.role}:${candidate.element.closest('[data-message-id]')!.getAttribute('data-message-id')}`
          : `position:${provider}-${index + 1}`,
      role: candidate.role,
      content: [{ type: "text" as const, text: richText(candidate.element, candidate.role) }],
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
