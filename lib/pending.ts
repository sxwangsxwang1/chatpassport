import { browser } from "wxt/browser";
import { z } from "zod";
import { PENDING_TTL_MS } from "./core";
import { passportSchema, providerSchema, type Passport, type Provider } from "./passport";

const PENDING_KEY = "pendingTransfer";

const pendingTransferSchema = z.object({
  passport: passportSchema,
  target: providerSchema,
  savedAt: z.number(),
});

export interface PendingTransfer {
  passport: Passport;
  target: Provider;
  savedAt: number;
}

function isPendingTransfer(value: unknown): value is PendingTransfer {
  return pendingTransferSchema.safeParse(value).success;
}

export async function savePendingTransfer(passport: Passport, target: Provider): Promise<void> {
  await browser.storage.session.set({
    [PENDING_KEY]: { passport, target, savedAt: Date.now() } satisfies PendingTransfer,
  });
}

export async function getPendingTransfer(): Promise<PendingTransfer | null> {
  const result = await browser.storage.session.get(PENDING_KEY);
  const value = result[PENDING_KEY];
  if (!isPendingTransfer(value)) {
    if (value !== undefined) await clearPendingTransfer();
    return null;
  }
  if (Date.now() - value.savedAt > PENDING_TTL_MS) {
    await clearPendingTransfer();
    return null;
  }
  return value;
}

export async function clearPendingTransfer(): Promise<void> {
  await browser.storage.session.remove(PENDING_KEY);
}
