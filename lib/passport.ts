import { z } from "zod";

export const PROVIDERS = ["chatgpt", "claude", "gemini", "deepseek"] as const;

export const providerSchema = z.enum(PROVIDERS);
export type Provider = z.infer<typeof providerSchema>;

const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const messageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant", "system"]),
  content: z.array(textPartSchema).min(1),
  createdAt: z.string().datetime().optional(),
});

export const passportSchema = z.object({
  format: z.literal("chatpassport"),
  version: z.literal("1.0"),
  id: z.string().min(1),
  title: z.string().min(1),
  source: z.object({
    provider: providerSchema,
    url: z.string().url(),
    exportedAt: z.string().datetime(),
  }),
  messages: z.array(messageSchema).min(1),
  capture: z.object({
    method: z.literal("scroll"),
    status: z.enum(["page-history", "partial"]),
    reason: z.string(),
  }).optional(),
});

export type Passport = z.infer<typeof passportSchema>;
export type PassportMessage = z.infer<typeof messageSchema>;
export const PASSPORT_MAX_BYTES = 25 * 1024 * 1024;

function encodePassport(passport: Passport): string {
  return `${JSON.stringify(passport, null, 2)}\n`;
}

function checkFileSize(serialized: string): void {
  if (new TextEncoder().encode(serialized).byteLength > PASSPORT_MAX_BYTES) {
    throw new Error("The normalized JSON exceeds the 25 MiB file limit. Use a smaller conversation or split the file.");
  }
}

export function parsePassport(input: unknown): Passport {
  const passport = passportSchema.parse(input);
  checkFileSize(encodePassport(passport));
  return passport;
}

export function serializePassport(passport: Passport): string {
  const serialized = encodePassport(passportSchema.parse(passport));
  checkFileSize(serialized);
  return serialized;
}

export function passportSize(passport: Passport): number {
  return new TextEncoder().encode(encodePassport(passport)).byteLength;
}

/** Keep complete messages, including JSON formatting and metadata in the budget. */
export function fitCapturedPassport(passport: Passport, maxBytes = PASSPORT_MAX_BYTES): Passport {
  if (passportSize(passport) <= maxBytes) return passport;
  const sizeReason = 'The UTF-8 JSON file limit was reached. Only the collected messages that fit are included; later messages were omitted without cutting any message.';
  const previousReason = passport.capture?.status === 'partial' ? passport.capture.reason : '';
  const capture = {
    method: 'scroll' as const, status: 'partial' as const,
    reason: previousReason.startsWith(sizeReason) ? previousReason : sizeReason + (previousReason ? ` ${previousReason}` : ''),
  };
  let low = 1;
  let high = passport.messages.length;
  let best: Passport | undefined;
  while (low <= high) {
    const count = Math.floor((low + high) / 2);
    const candidate: Passport = { ...passport, capture, messages: passport.messages.slice(0, count) };
    if (passportSize(candidate) <= maxBytes) { best = candidate; low = count + 1; }
    else high = count - 1;
  }
  if (!best) throw new Error('A collected message is too large for a re-importable JSON file. No message was truncated. Use a smaller conversation.');
  return best;
}
