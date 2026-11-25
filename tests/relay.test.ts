import { describe, expect, it } from "vitest";
import type { PendingTransfer } from "../lib/pending";
import {
  canCompleteRelay,
  composeRelayResponse,
  createRelayResponse,
  estimateContinuation,
  planContinuation,
  RELAY_MAX_DRAFT_CHARS,
  RELAY_MAX_REQUEST_CHARS,
} from "../lib/relay";

const sender = (url: string) => ({ url, tabUrl: url, tabId: 42, frameId: 0 });

const pending: PendingTransfer = {
  target: "deepseek",
  transferId: "transfer-1",
  targetTabId: 42,
  savedAt: Date.now(),
  passport: {
    format: "chatpassport",
    version: "1.0",
    id: "transfer-1",
    title: "Migration test",
    source: {
      provider: "chatgpt",
      url: "https://chatgpt.com/c/example",
      exportedAt: "2026-09-03T10:00:00.000Z",
    },
    messages: [
      { id: "1", role: "user", content: [{ type: "text", text: "Remember the launch date." }] },
      { id: "2", role: "assistant", content: [{ type: "text", text: "The launch is Friday." }] },
    ],
  },
};

describe("automatic relay authorization", () => {
  it('uses the source-approved question and omission count for a prepared relay', () => {
    const prepared = { ...pending, currentRequest: 'Approved question', approvedOmittedMessageCount: 0 };
    const ready = createRelayResponse(prepared, sender('https://chat.deepseek.com/'));
    expect(ready).toMatchObject({ status: 'ready', currentRequest: 'Approved question', approvedOmittedMessageCount: 0 });
    const composed = composeRelayResponse(prepared, prepared.transferId, 'Changed on destination', sender('https://chat.deepseek.com/'));
    expect(composed.status).toBe('composed');
    if (composed.status === 'composed') {
      expect(composed.text).toContain('<current_request>\nApproved question\n</current_request>');
      expect(composed.text).not.toContain('Changed on destination');
    }
  });
  it('preserves leading indentation, empty lines and trailing newlines in a new request', () => {
    const request = '  first\n\n    second\n';
    const response = composeRelayResponse(pending, pending.transferId, request, sender('https://chat.deepseek.com/'));
    expect(response.status).toBe('composed');
    if (response.status === 'composed') expect(response.text).toContain(`<current_request>\n${request}\n</current_request>`);
  });
  it('rejects a different tab, iframe, insecure scheme and stale transfer', () => {
    const identity = sender('https://chat.deepseek.com/');
    expect(createRelayResponse(pending, { ...identity, tabId: 43 })).toEqual({ status: 'none' });
    expect(createRelayResponse(pending, { ...identity, frameId: 1 })).toEqual({ status: 'none' });
    expect(createRelayResponse(pending, sender('http://chat.deepseek.com/'))).toEqual({ status: 'none' });
    expect(createRelayResponse({ ...pending, savedAt: Date.now() - 3_600_000 }, identity)).toEqual({ status: 'none' });
    const fresh = { ...pending, transferId: 'transfer-2' };
    expect(canCompleteRelay(fresh, 'transfer-1', identity)).toBe(false);
    expect(composeRelayResponse(fresh, 'transfer-1', 'Question', identity)).toEqual({ status: 'none' });
  });
  it("returns context only to the selected destination platform", () => {
    const response = createRelayResponse(pending, sender("https://chat.deepseek.com/"));
    expect(response).toMatchObject({
      status: "ready",
      transferId: "transfer-1",
      source: "chatgpt",
      target: "deepseek",
      messageCount: 2,
    });
    expect(response).not.toHaveProperty("context");
  });

  it("combines the transcript with the user's new request only on demand", () => {
    const response = composeRelayResponse(
      pending,
      "transfer-1",
      "What should I do next?",
      sender("https://chat.deepseek.com/"),
    );
    expect(response).toMatchObject({
      status: "composed",
      includedMessageCount: 2,
      omittedMessageCount: 0,
    });
    if (response.status === "composed") {
      expect(response.text).toContain("Remember the launch date.");
      expect(response.text).toContain("<current_request>\nWhat should I do next?\n</current_request>");
      expect(response.characterCount).toBe(response.text.length);
      expect(response.text.length).toBeLessThanOrEqual(RELAY_MAX_DRAFT_CHARS);
    }
  });

  it("keeps recent complete messages when the safe relay budget is exceeded", () => {
    const largePending: PendingTransfer = {
      ...pending,
      passport: {
        ...pending.passport,
        messages: [
          { id: "old", role: "user", content: [{ type: "text", text: "a".repeat(30_000) }] },
          { id: "newer", role: "assistant", content: [{ type: "text", text: "b".repeat(30_000) }] },
          { id: "latest", role: "user", content: [{ type: "text", text: "Latest decision" }] },
        ],
      },
    };
    const response = composeRelayResponse(
      largePending,
      "transfer-1",
      "Continue the plan",
      sender("https://chat.deepseek.com/"),
    );
    expect(response).toMatchObject({
      status: "composed",
      includedMessageCount: 2,
      omittedMessageCount: 1,
    });
    if (response.status === "composed") {
      expect(response.text).not.toContain("a".repeat(100));
      expect(response.text).toContain("b".repeat(100));
      expect(response.text).toContain("Latest decision");
    }
  });

  it("rejects an empty or oversized new request", () => {
    expect(composeRelayResponse(pending, "transfer-1", "  ", sender("https://chat.deepseek.com/")))
      .toMatchObject({ status: "error", code: "empty-request" });
    expect(composeRelayResponse(
      pending,
      "transfer-1",
      "x".repeat(RELAY_MAX_REQUEST_CHARS + 1),
      sender("https://chat.deepseek.com/"),
    )).toMatchObject({ status: "error", code: "request-too-large" });
  });

  it("does not expose a DeepSeek transfer to another supported platform", () => {
    expect(createRelayResponse(pending, sender("https://claude.ai/new"))).toEqual({ status: "none" });
  });

  it("rejects unsupported and malformed sender URLs", () => {
    expect(createRelayResponse(pending, sender("https://example.com/"))).toEqual({ status: "none" });
    expect(createRelayResponse(pending, sender("not a URL"))).toEqual({ status: "none" });
  });

  it("allows completion only for the same passport on the selected destination", () => {
    expect(canCompleteRelay(pending, "transfer-1", sender("https://chat.deepseek.com/"))).toBe(true);
    expect(canCompleteRelay(pending, "another-id", sender("https://chat.deepseek.com/"))).toBe(false);
    expect(canCompleteRelay(pending, "transfer-1", sender("https://chatgpt.com/"))).toBe(false);
  });

  it("matches planContinuation counts and character length identically in estimateContinuation", () => {
    const manyMessages = {
      ...pending.passport,
      messages: Array.from({ length: 30 }, (_, index) => ({
        id: `m-${index}`,
        role: index % 2 === 0 ? "user" as const : "assistant" as const,
        content: [{ type: "text" as const, text: `Turn ${index}: ${"x".repeat(2500)} <message>` }],
      })),
    };
    for (const target of ["chatgpt", "claude"] as const) {
      for (const request of ["Short question", "Check </current_request> tag\nwith lines", " ", "x".repeat(RELAY_MAX_REQUEST_CHARS + 1)]) {
        const estimated = estimateContinuation(manyMessages, request, target);
        const planned = planContinuation(manyMessages, request, target);
        if (planned.status === "composed") {
          expect(estimated).toEqual({
            status: "composed",
            includedMessageCount: planned.includedMessageCount,
            omittedMessageCount: planned.omittedMessageCount,
            characterCount: planned.characterCount,
          });
        } else {
          expect(estimated).toEqual(planned);
        }
      }
    }
  });

  it("uses same-platform wording when continuing on the same provider", () => {
    const samePlatform: PendingTransfer = { ...pending, target: "chatgpt" };
    const response = composeRelayResponse(samePlatform, "transfer-1", "Continue here", sender("https://chatgpt.com/"));
    expect(response.status).toBe("composed");
    if (response.status === "composed") {
      expect(response.text).toContain("I am continuing a previous conversation.");
      expect(response.text).not.toContain("another AI assistant");
    }
  });
});
