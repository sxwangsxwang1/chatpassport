import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { extractConversationFromPage, type PageExtraction } from "../lib/adapters/page";

function extract(html: string, url: string, title: string): PageExtraction {
  const dom = new JSDOM(html, { url, runScripts: "outside-only" });
  dom.window.document.title = title;
  return dom.window.eval(`(${extractConversationFromPage.toString()})()`) as PageExtraction;
}

describe("page adapters", () => {
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

  it("extracts Claude semantic message markers", () => {
    const result = extract(`
      <div data-testid="user-message"><p>Review this</p></div>
      <div data-testid="assistant-message"><p>Looks good</p></div>
    `, "https://claude.ai/chat/test", "Review - Claude");

    expect(result.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  });

  it("extracts Gemini custom elements", () => {
    const result = extract(`
      <user-query><p>Explain this</p></user-query>
      <model-response><p>Here is an explanation</p></model-response>
    `, "https://gemini.google.com/app/test", "Explanation - Gemini");

    expect(result.messages).toHaveLength(2);
    expect(result.messages[1]?.content[0]?.text).toBe("Here is an explanation");
  });

  it("extracts DeepSeek role attributes", () => {
    const result = extract(`
      <div data-role="user"><p>Find the bug</p></div>
      <div data-role="assistant"><p>The index is off by one.</p></div>
    `, "https://chat.deepseek.com/a/chat/s/test", "Debug - DeepSeek");

    expect(result.messages).toHaveLength(2);
    expect(result.messages[1]?.role).toBe("assistant");
  });

  it("rejects unsupported pages", () => {
    const result = extract("<p>Hello</p>", "https://example.com/", "Example");
    expect(result.provider).toBeNull();
    expect(result.error).toContain("not a supported");
  });
});
