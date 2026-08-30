import { describe, expect, it } from "vitest";
import { parsePassport, passportSize, serializePassport, type Passport } from "../lib/passport";

const validPassport: Passport = {
  format: "chatpassport",
  version: "1.0",
  id: "test-id",
  title: "Test conversation",
  source: {
    provider: "claude",
    url: "https://claude.ai/chat/test",
    exportedAt: "2026-08-31T10:00:00.000Z",
  },
  messages: [
    { id: "message-1", role: "user", content: [{ type: "text", text: "Hello" }] },
    { id: "message-2", role: "assistant", content: [{ type: "text", text: "Hi" }] },
  ],
};

describe("ChatPassport schema", () => {
  it("round-trips a valid passport", () => {
    expect(parsePassport(JSON.parse(serializePassport(validPassport)))).toEqual(validPassport);
  });

  it("rejects unknown versions", () => {
    expect(() => parsePassport({ ...validPassport, version: "2.0" })).toThrow();
  });

  it("rejects empty conversations", () => {
    expect(() => parsePassport({ ...validPassport, messages: [] })).toThrow();
  });

  it("measures the serialized UTF-8 payload", () => {
    const serialized = serializePassport(validPassport);
    expect(passportSize(validPassport)).toBe(new TextEncoder().encode(serialized).byteLength);
  });
});
