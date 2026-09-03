import { describe, expect, it } from "vitest";
import type { PendingTransfer } from "../lib/pending";
import {
  canCompleteRelay,
  composeRelayResponse,
  createRelayResponse,
  RELAY_MAX_DRAFT_CHARS,
  RELAY_MAX_REQUEST_CHARS,
} from "../lib/relay";

const pending: PendingTransfer = {
  target: "deepseek",
  savedAt: Date.now(),
  passport: {
    format: "chatpassport",
    version: "1.0",
    id: "passport-1",
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
  it("returns context only to the selected destination platform", () => {
    const response = createRelayResponse(pending, "https://chat.deepseek.com/");
    expect(response).toMatchObject({
      status: "ready",
      passportId: "passport-1",
      source: "chatgpt",
      target: "deepseek",
      messageCount: 2,
    });
    expect(response).not.toHaveProperty("context");
  });

  it("combines the transcript with the user's new request only on demand", () => {
    const response = composeRelayResponse(
      pending,
      "passport-1",
      "What should I do next?",
      "https://chat.deepseek.com/",
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
      "passport-1",
      "Continue the plan",
      "https://chat.deepseek.com/",
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
    expect(composeRelayResponse(pending, "passport-1", "  ", "https://chat.deepseek.com/"))
      .toMatchObject({ status: "error", code: "empty-request" });
    expect(composeRelayResponse(
      pending,
      "passport-1",
      "x".repeat(RELAY_MAX_REQUEST_CHARS + 1),
      "https://chat.deepseek.com/",
    )).toMatchObject({ status: "error", code: "request-too-large" });
  });

  it("does not expose a DeepSeek transfer to another supported platform", () => {
    expect(createRelayResponse(pending, "https://claude.ai/new")).toEqual({ status: "none" });
  });

  it("rejects unsupported and malformed sender URLs", () => {
    expect(createRelayResponse(pending, "https://example.com/")).toEqual({ status: "none" });
    expect(createRelayResponse(pending, "not a URL")).toEqual({ status: "none" });
  });

  it("allows completion only for the same passport on the selected destination", () => {
    expect(canCompleteRelay(pending, "passport-1", "https://chat.deepseek.com/")).toBe(true);
    expect(canCompleteRelay(pending, "another-id", "https://chat.deepseek.com/")).toBe(false);
    expect(canCompleteRelay(pending, "passport-1", "https://chatgpt.com/")).toBe(false);
  });
});
