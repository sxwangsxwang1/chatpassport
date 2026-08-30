import { describe, expect, it } from "vitest";
import {
  buildHandoffPrompt,
  detectProvider,
  formatBytes,
  passportToMarkdown,
  safeFilename,
} from "../lib/core";
import type { Passport } from "../lib/passport";

const passport: Passport = {
  format: "chatpassport",
  version: "1.0",
  id: "passport-1",
  title: "Architecture / review",
  source: {
    provider: "chatgpt",
    url: "https://chatgpt.com/c/example",
    exportedAt: "2026-08-31T10:00:00.000Z",
  },
  messages: [
    { id: "1", role: "user", content: [{ type: "text", text: "First request" }] },
    { id: "2", role: "assistant", content: [{ type: "text", text: "First answer" }] },
    { id: "3", role: "user", content: [{ type: "text", text: "Latest request" }] },
  ],
};

describe("detectProvider", () => {
  it.each([
    ["https://chatgpt.com/c/123", "chatgpt"],
    ["https://chat.openai.com/c/123", "chatgpt"],
    ["https://claude.ai/chat/123", "claude"],
    ["https://gemini.google.com/app/123", "gemini"],
    ["https://chat.deepseek.com/a/chat/s/123", "deepseek"],
  ] as const)("detects %s", (url, expected) => {
    expect(detectProvider(url)).toBe(expected);
  });

  it("rejects unrelated hosts", () => {
    expect(detectProvider("https://example.com/chatgpt.com")).toBeNull();
  });
});

describe("conversation rendering", () => {
  it("creates readable Markdown", () => {
    const markdown = passportToMarkdown(passport);
    expect(markdown).toContain("# Architecture / review");
    expect(markdown).toContain("## User\n\nFirst request");
    expect(markdown).toContain("## Assistant\n\nFirst answer");
  });

  it("can hand off only the latest messages", () => {
    const prompt = buildHandoffPrompt(passport, 1);
    expect(prompt).toContain("Latest request");
    expect(prompt).not.toContain("First request");
    expect(prompt).not.toContain("First answer");
  });

  it("escapes quotes in transcript metadata", () => {
    const prompt = buildHandoffPrompt({ ...passport, title: 'A "quoted" title' });
    expect(prompt).toContain('title="A &quot;quoted&quot; title"');
  });
});

describe("display helpers", () => {
  it("formats byte sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.00 MB");
  });

  it("creates filesystem-safe export names", () => {
    expect(safeFilename(' Plan: Q3 / "launch" ', "json")).toBe("Plan- Q3 - -launch-.chatpassport.json");
  });
});
