import { describe, expect, it } from "vitest";
import { fitCapturedPassport, PASSPORT_MAX_BYTES, parsePassport, passportSize, serializePassport, type Passport } from "../lib/passport";

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
  it('fits a formerly exportable 27 MB Chinese history into a re-importable file', () => {
    const large: Passport = { ...validPassport, messages: [0, 1, 2].map((id) => ({
      id: String(id), role: 'assistant', content: [{ type: 'text', text: '中'.repeat(3_000_000) }],
    })) };
    expect(passportSize(large)).toBeGreaterThan(PASSPORT_MAX_BYTES);
    const fitted = fitCapturedPassport(large);
    const json = serializePassport(fitted);
    expect(new TextEncoder().encode(json).byteLength).toBeLessThanOrEqual(PASSPORT_MAX_BYTES);
    expect(fitted.messages).toHaveLength(2);
    expect(fitted.messages[0]).toEqual(large.messages[0]);
    expect(fitted.capture?.status).toBe('partial');
    expect(parsePassport(JSON.parse(json))).toEqual(fitted);
  });
  it('counts actual formatted JSON bytes including escaped text and metadata', () => {
    const large: Passport = { ...validPassport, messages: [0, 1, 2].map((id) => ({
      id: String(id), role: 'user', content: [{ type: 'text', text: '\\"\n😀'.repeat(100) }],
    })) };
    const fitted = fitCapturedPassport(large, 2800);
    expect(passportSize(fitted)).toBeLessThanOrEqual(2800);
    expect(fitted.messages.length).toBeLessThan(3);
    expect(parsePassport(JSON.parse(serializePassport(fitted)))).toEqual(fitted);
  });
  it('accepts the exact byte boundary, rejects over-budget exports and oversized single messages', () => {
    expect(fitCapturedPassport(validPassport, passportSize(validPassport))).toBe(validPassport);
    expect(() => fitCapturedPassport(validPassport, 10)).toThrow('No message was truncated');
    const oversized: Passport = { ...validPassport, messages: [{ id: '1', role: 'user', content: [{ type: 'text', text: 'x'.repeat(PASSPORT_MAX_BYTES) }] }] };
    expect(() => serializePassport(oversized)).toThrow('25 MiB');
    expect(() => parsePassport(oversized)).toThrow('25 MiB');
  });
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
