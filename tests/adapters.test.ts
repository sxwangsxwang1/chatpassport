import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  extractConversationFromPage,
  fillComposerOnPage,
  readComposerOnPage,
  replaceComposerOnPage,
  type FillResult,
  type PageExtraction,
} from "../lib/adapters/page";

function extract(html: string, url: string, title: string): PageExtraction {
  const dom = new JSDOM(html, { url, runScripts: "outside-only" });
  dom.window.document.title = title;
  return dom.window.eval(`(${extractConversationFromPage.toString()})()`) as PageExtraction;
}

function fill(html: string, text: string): { result: FillResult; value: string } {
  const dom = new JSDOM(html, { url: "https://chat.deepseek.com/", runScripts: "outside-only" });
  const composer = dom.window.document.querySelector<HTMLElement>("textarea, [contenteditable='true']");
  if (!composer) throw new Error("Fixture must contain a composer.");
  composer.getClientRects = () => ({ length: 1 }) as DOMRectList;
  const result = dom.window.eval(`(${fillComposerOnPage.toString()})(${JSON.stringify(text)})`) as FillResult;
  const value = composer instanceof dom.window.HTMLTextAreaElement ? composer.value : composer.textContent ?? "";
  return { result, value };
}

function replace(
  initialText: string,
  replacement: string,
  expectedText: string,
  simulateTruncation = false,
): { result: FillResult; value: string } {
  const dom = new JSDOM(`<textarea placeholder="Send a message">${initialText}</textarea>`, {
    url: "https://chat.deepseek.com/",
    runScripts: "outside-only",
  });
  const composer = dom.window.document.querySelector<HTMLTextAreaElement>("textarea");
  if (!composer) throw new Error("Fixture must contain a composer.");
  composer.getClientRects = () => ({ length: 1 }) as DOMRectList;
  if (simulateTruncation) {
    dom.window.eval(`{
      const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
      Object.defineProperty(HTMLTextAreaElement.prototype, "value", {
        configurable: true,
        get: descriptor.get,
        set(value) {
          descriptor.set.call(this, String(value).startsWith("Combined") ? "partial" : value);
        }
      });
    }`);
  }
  const result = dom.window.eval(
    `(${replaceComposerOnPage.toString()})(${JSON.stringify(replacement)}, ${JSON.stringify(expectedText)})`,
  ) as FillResult;
  return { result, value: composer.value };
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

  it("fills an empty destination composer", () => {
    const { result, value } = fill('<textarea placeholder="Send a message"></textarea>', "Imported context");
    expect(result).toMatchObject({ success: true, code: "filled" });
    expect(value).toBe("Imported context");
  });

  it("does not overwrite an existing draft", () => {
    const { result, value } = fill('<textarea placeholder="Send a message">My draft</textarea>', "Imported context");
    expect(result).toMatchObject({ success: false, code: "not-empty" });
    expect(value).toBe("My draft");
  });

  it("reads a user's current destination request without changing it", () => {
    const dom = new JSDOM('<textarea placeholder="Send a message">What next?</textarea>', {
      url: "https://chat.deepseek.com/",
      runScripts: "outside-only",
    });
    const composer = dom.window.document.querySelector<HTMLTextAreaElement>("textarea");
    if (!composer) throw new Error("Fixture must contain a composer.");
    composer.getClientRects = () => ({ length: 1 }) as DOMRectList;
    const result = dom.window.eval(`(${readComposerOnPage.toString()})()`);
    expect(result).toEqual({ found: true, text: "What next?" });
    expect(composer.value).toBe("What next?");
  });

  it("combines context only if the user's draft is unchanged", () => {
    const { result, value } = replace("What next?", "Combined context", "What next?");
    expect(result).toMatchObject({ success: true, code: "filled" });
    expect(value).toBe("Combined context");

    const changed = replace("Changed draft", "Combined context", "Original draft");
    expect(changed.result).toMatchObject({ success: false, code: "changed" });
    expect(changed.value).toBe("Changed draft");
  });

  it("restores the user's question when a platform truncates the combined draft", () => {
    const { result, value } = replace("My next question", "Combined context", "My next question", true);
    expect(result).toMatchObject({ success: false, code: "truncated" });
    expect(value).toBe("My next question");
  });
});
