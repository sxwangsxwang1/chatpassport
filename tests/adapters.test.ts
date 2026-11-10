import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  extractConversationFromPage,
  type PageExtraction,
} from "../lib/adapters/page";

function extract(html: string, url: string, title: string): PageExtraction {
  const dom = new JSDOM(html, { url, runScripts: "outside-only" });
  dom.window.document.title = title;
  return dom.window.eval(`(${extractConversationFromPage.toString()})()`) as PageExtraction;
}

describe("page adapters", () => {
  it.each([
    'text = """a\n\n\nb"""\nprint(text)',
    '\n    first()  \n\tsecond()\n\n',
    'value = "a\u00a0b"\n',
    '```md\ninside a fence\n```',
  ])('preserves exact code whitespace and nested fences: %s', (code) => {
    const dom = new JSDOM('<article data-message-author-role="assistant"><div class="markdown"><p>Before</p><pre></pre><p>After</p></div></article>', { url: 'https://chatgpt.com/c/code', runScripts: 'outside-only' });
    dom.window.document.querySelector('pre')!.textContent = code;
    const result = dom.window.eval(`(${extractConversationFromPage.toString()})()`) as PageExtraction;
    const content = result.messages[0]!.content[0]!.text;
    expect(content).toContain(`\n${code}\n`);
    expect(content).toContain('Before');
    expect(content).toContain('After');
    if (code.includes('```')) expect(content).toContain(`\`\`\`\`\n${code}\n\`\`\`\``);
    dom.window.close();
  });
  it("extracts ChatGPT role attributes", () => {
    const result = extract(`
      <main>
        <article data-message-author-role="user"><div class="whitespace-pre-wrap">Plan a launch</div></article>
        <article data-message-author-role="assistant"><div class="markdown"><p>Start with research.</p><pre>pnpm test</pre></div></article>
      </main>
    `, "https://chatgpt.com/c/test", "Launch plan - ChatGPT");

    expect(result.provider).toBe("chatgpt");
    expect(result.title).toBe("Launch plan");
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]?.role).toBe("user");
    expect(result.messages[1]?.content[0]?.text).toContain("```\npnpm test\n```");
  });

  it("extracts current ChatGPT search units without controls or duplicate nested content", () => {
    const result = extract(`
      <div data-chatgpt-conversation-selection-target="true">
        <div data-chatgpt-search-unit-key="fallback-turn-0:0:user" data-chatgpt-search-message-ids="user-1">
          <div data-content-search-unit-key="fallback-turn-0:0:user">
            <div data-user-message-bubble="true"><p>Plan a launch</p></div>
          </div><button>Copy message</button>
        </div>
        <div data-chatgpt-search-unit-key="fallback-turn-0:2:assistant" data-chatgpt-search-message-ids="assistant-1 assistant-1">
          <h4 class="sr-only" data-conversation-role="assistant">ChatGPT said:</h4>
          <div data-chatgpt-selection-message-id="assistant-1">
            <div data-markdown-text-style="assistant-message"><p>Start with research.</p><pre>pnpm test</pre></div>
          </div><button>Copy</button>
        </div>
        <div data-chatgpt-search-unit-key="fallback-turn-1:0:user" data-chatgpt-search-message-ids="user-2">
          <div data-user-message-bubble="true">What next?</div><button>Edit message</button>
        </div>
        <div data-chatgpt-search-unit-key="fallback-turn-1:2:assistant" data-chatgpt-search-message-ids="assistant-2">
          <div data-markdown-text-style="assistant-message">Ship the fix.</div><button>Retry</button>
        </div>
      </div>
    `, "https://chatgpt.com/c/test", "Launch plan - ChatGPT");

    expect(result.messages.map(({ id, role }) => ({ id, role }))).toEqual([
      { id: "dom:user:user-1", role: "user" },
      { id: "dom:assistant:assistant-1", role: "assistant" },
      { id: "dom:user:user-2", role: "user" },
      { id: "dom:assistant:assistant-2", role: "assistant" },
    ]);
    expect(result.messages[0]?.content[0]?.text).toBe("Plan a launch");
    expect(result.messages[1]?.content[0]?.text).toBe("Start with research.\n\n```\npnpm test\n```");
    expect(result.messages[2]?.content[0]?.text).toBe("What next?");
    expect(result.messages[3]?.content[0]?.text).toBe("Ship the fix.");
  });

  it("extracts Claude semantic message markers", () => {
    const result = extract(`
      <div data-testid="user-message"><p>Review this</p></div>
      <div data-testid="assistant-message"><p>Looks good</p></div>
    `, "https://claude.ai/chat/test", "Review - Claude");

    expect(result.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  });

  it.each(["font-claude-response", "font-claude-message"])(
    "captures Claude %s bodies including every Markdown block in order",
    (bodyClass) => {
      // Synthetic compatibility fixture; no personal conversation data.
      const result = extract(`
        <div data-testid="user-message"><p>Review this</p></div>
        <div class="${bodyClass}">
          <div class="standard-markdown prose"><p>First finding.</p></div>
          <div class="progressive-markdown prose"><p>Second finding.</p><pre><code>pnpm test</code></pre></div>
        </div>
        <div data-testid="user-message"><p>What next?</p></div>
        <div class="${bodyClass}"><p>Ship the fix.</p></div>
      `, "https://claude.ai/chat/test", "Review - Claude");

      expect(result.messages.map((message) => message.role)).toEqual(["user", "assistant", "user", "assistant"]);
      expect(result.messages[1]?.content[0]?.text).toMatch(/^First finding\.\s+Second finding\.\s+```\npnpm test\n```$/);
      expect(result.messages[3]?.content[0]?.text).toBe("Ship the fix.");
    },
  );

  it("deduplicates nested Claude role, test-id and body selectors without exporting controls", () => {
    const result = extract(`
      <article data-message-author-role="user">
        <h2 class="sr-only">You said:</h2>
        <div data-testid="user-message"><p>Review this</p></div>
      </article>
      <article data-message-author-role="assistant" data-testid="assistant-message">
        <h2 class="sr-only">Claude responded:</h2>
        <div class="font-claude-response font-claude-message">
          <p>Keep this answer.</p>
          <button>Copy</button><span aria-hidden="true">Decoration</span>
          <span hidden>Hidden text</span><span class="sr-only">Read aloud</span>
        </div>
        <button>Retry</button>
      </article>
    `, "https://claude.ai/chat/test", "Review - Claude");

    expect(result.messages.map((message) => ({ role: message.role, text: message.content[0]?.text }))).toEqual([
      { role: "user", text: "Review this" },
      { role: "assistant", text: "Keep this answer." },
    ]);
  });

  it("filters many message candidates without pairwise containment checks", () => {
    const html = Array.from({ length: 500 }, (_, index) =>
      `<article data-message-author-role="user"><p>Message ${index}</p></article>`).join("");
    const dom = new JSDOM(html, { url: "https://chatgpt.com/c/long", runScripts: "outside-only" });
    let containmentChecks = 0;
    const contains = dom.window.Element.prototype.contains;
    dom.window.Element.prototype.contains = function (node) {
      containmentChecks++;
      return contains.call(this, node);
    };
    const result = dom.window.eval(`(${extractConversationFromPage.toString()})()`) as PageExtraction;
    expect(result.messages).toHaveLength(500);
    // jsdom uses contains internally; the old candidate filter alone added
    // roughly 250,000 calls for this fixture.
    expect(containmentChecks).toBeLessThan(5_000);
    dom.window.close();
  });

  it("keeps all Claude legacy test-id content when no font body marker exists", () => {
    const result = extract(`
      <div data-testid="assistant-message">
        <h2 class="sr-only">Claude responded:</h2>
        <div class="prose"><p>First section.</p></div>
        <div class="prose"><p>Last section.</p></div>
        <button>Copy</button>
      </div>
    `, "https://claude.ai/chat/test", "Review - Claude");

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.content[0]?.text).toMatch(/^First section\.\s+Last section\.$/);
  });

  it("extracts Gemini custom elements", () => {
    const result = extract(`
      <user-query><p>Explain this</p></user-query>
      <model-response><p>Here is an explanation</p></model-response>
    `, "https://gemini.google.com/app/test", "Explanation - Gemini");

    expect(result.messages).toHaveLength(2);
    expect(result.messages[1]?.content[0]?.text).toBe("Here is an explanation");
  });

  it("omits Gemini's screen-reader heading from user messages", () => {
    const result = extract(`
      <user-query><user-query-content>
        <h5 class="cdk-visually-hidden screen-reader-user-query-label"><span>You said</span> Explain this</h5>
        <p class="query-text-line">Explain this</p>
      </user-query-content></user-query>
    `, "https://gemini.google.com/app/test", "Explanation - Gemini");

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.content[0]?.text).toBe("Explain this");
  });

  it("extracts DeepSeek role attributes", () => {
    const result = extract(`
      <div data-role="user"><p>Find the bug</p></div>
      <div data-role="assistant"><p>The index is off by one.</p></div>
    `, "https://chat.deepseek.com/a/chat/s/test", "Debug - DeepSeek");

    expect(result.messages).toHaveLength(2);
    expect(result.messages[1]?.role).toBe("assistant");
  });

  it("extracts DeepSeek's current user bubble and assistant body", () => {
    const result = extract(`
      <div class="ds-message"><div><div class="ds-collapsible-text">Test question</div></div><button>Copy</button></div>
      <div class="ds-message"><div class="ds-markdown ds-assistant-message-main-content"><p>Test answer</p></div><button>Copy</button></div>
    `, "https://chat.deepseek.com/a/chat/s/test", "Test - DeepSeek");

    expect(result.messages.map((message) => [message.role, message.content[0]?.text])).toEqual([
      ["user", "Test question"], ["assistant", "Test answer"],
    ]);
  });

  it("rejects unsupported pages", () => {
    const result = extract("<p>Hello</p>", "https://example.com/", "Example");
    expect(result.provider).toBeNull();
    expect(result.error).toContain("not a supported");
  });

});
