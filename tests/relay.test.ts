import { describe, expect, it } from "vitest";
import type { PendingTransfer } from "../lib/pending";
import { canCompleteRelay, createRelayResponse } from "../lib/relay";

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
    if (response.status === "ready") {
      expect(response.context).toContain("Remember the launch date.");
    }
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
