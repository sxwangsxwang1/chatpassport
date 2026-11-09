import { browser } from "wxt/browser";
import { z } from "zod";
import { passportSchema, providerSchema, type Passport, type Provider } from "./passport";

export const PENDING_COMMAND = "chatpassport:pending";
export const PENDING_KEY = "pendingTransfer";
export const pendingTransferSchema = z.object({
  passport: passportSchema, target: providerSchema, savedAt: z.number().finite(),
  transferId: z.string().uuid(), targetTabId: z.number().int().nonnegative(),
  currentRequest: z.string().optional(),
  approvedOmittedMessageCount: z.number().int().nonnegative().optional(),
});
export type PendingTransfer = z.infer<typeof pendingTransferSchema>;

async function command(action: string, fields: Record<string, unknown> = {}) {
  const response = await browser.runtime.sendMessage({ type: PENDING_COMMAND, action, ...fields });
  if (!response || !response.ok) throw new Error(response?.error ?? "The transfer could not be updated.");
  return response.pending ? pendingTransferSchema.parse(response.pending) : null;
}
export async function savePendingTransfer(
  passport: Passport, target: Provider, currentRequest: string, approveOmissions: boolean,
): Promise<PendingTransfer | null> {
  return command("save", { passport, target, currentRequest, approveOmissions });
}
export async function getPendingTransfer(): Promise<PendingTransfer | null> { return command("get"); }
export async function clearPendingTransfer(transferId: string): Promise<void> {
  await command("clear", { transferId });
}
