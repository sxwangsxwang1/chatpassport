import { describe, expect, it } from "vitest";
import { resolveInvokedUrl, type ActiveInvocation } from "../lib/invocation";

const invocation: ActiveInvocation = {
  tabId: 42,
  url: "https://chatgpt.com/c/test",
  invokedAt: 1,
};

describe("active invocation context", () => {
  it("prefers a URL returned directly by Chrome", () => {
    expect(resolveInvokedUrl(42, "https://claude.ai/new", invocation)).toBe("https://claude.ai/new");
  });

  it("uses the action-click URL when Chrome hides tab.url", () => {
    expect(resolveInvokedUrl(42, undefined, invocation)).toBe("https://chatgpt.com/c/test");
  });

  it("does not reuse context from a different tab", () => {
    expect(resolveInvokedUrl(99, undefined, invocation)).toBe("");
  });
});
