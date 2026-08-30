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
});

export type Passport = z.infer<typeof passportSchema>;
export type PassportMessage = z.infer<typeof messageSchema>;

export function parsePassport(input: unknown): Passport {
  return passportSchema.parse(input);
}

export function serializePassport(passport: Passport): string {
  return `${JSON.stringify(passportSchema.parse(passport), null, 2)}\n`;
}

export function passportSize(passport: Passport): number {
  return new TextEncoder().encode(serializePassport(passport)).byteLength;
}
