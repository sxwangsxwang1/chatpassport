import { browser } from 'wxt/browser';
import { PENDING_TTL_MS, PROVIDER_URLS, SESSION_MAX_BYTES } from './core';
import { passportSchema, passportSize, providerSchema } from './passport';
import { PENDING_KEY, pendingTransferSchema, type PendingTransfer } from './pending';
import { planContinuation } from './relay';

export { PENDING_KEY } from './pending';
export const EXPIRY_PREFIX = 'chatpassport:expire:';

/** All reads, writes, completion and alarms run through the background's queue. */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation);
    tail = result.catch(() => undefined);
    return result;
  };
}

export async function removePending(pending?: PendingTransfer): Promise<void> {
  await browser.storage.session.remove(PENDING_KEY);
  if (pending) await browser.alarms.clear(EXPIRY_PREFIX + pending.transferId);
}

export async function readPending(): Promise<PendingTransfer | null> {
  const result = await browser.storage.session.get(PENDING_KEY);
  const parsed = pendingTransferSchema.safeParse(result[PENDING_KEY]);
  if (!parsed.success) {
    if (result[PENDING_KEY] !== undefined) await removePending();
    return null;
  }
  const pending = parsed.data;
  if (pending.savedAt > Date.now() || Date.now() >= pending.savedAt + PENDING_TTL_MS) {
    await removePending(pending);
    return null;
  }
  return pending;
}

export async function scheduleExpiry(pending: PendingTransfer): Promise<void> {
  await browser.alarms.create(EXPIRY_PREFIX + pending.transferId, { when: pending.savedAt + PENDING_TTL_MS });
}

export async function createPending(
  passportInput: unknown, targetInput: unknown, currentRequestInput?: unknown, approveOmissionsInput?: unknown,
): Promise<PendingTransfer> {
  const passport = passportSchema.parse(passportInput);
  const target = providerSchema.parse(targetInput);
  if (passportSize(passport) > SESSION_MAX_BYTES) throw new Error('This transfer exceeds the 9 MB limit.');
  if (currentRequestInput !== undefined && typeof currentRequestInput !== 'string') throw new Error('The next question is invalid.');
  const currentRequest = currentRequestInput;
  const plan = currentRequest === undefined ? undefined : planContinuation(passport, currentRequest);
  if (plan?.status === 'error') throw new Error(plan.message);
  if (plan?.status === 'composed' && plan.omittedMessageCount > 0 && approveOmissionsInput !== true) {
    throw new Error(`Confirm the ${plan.omittedMessageCount} older messages that will be omitted before opening the draft.`);
  }
  const previous = await readPending();
  // Bind before navigation: content scripts can never claim an unbound transfer.
  const tab = await browser.tabs.create({ url: 'about:blank' });
  if (tab.id === undefined) throw new Error('Could not create the destination tab.');
  const pending: PendingTransfer = {
    passport, target, savedAt: Date.now(), transferId: crypto.randomUUID(), targetTabId: tab.id,
    ...(currentRequest === undefined ? {} : { currentRequest, approvedOmittedMessageCount: plan!.status === 'composed' ? plan!.omittedMessageCount : 0 }),
  };
  try {
    await browser.storage.session.set({ [PENDING_KEY]: pending });
    await scheduleExpiry(pending);
    await browser.tabs.update(tab.id, { url: PROVIDER_URLS[target] });
    if (previous) await browser.alarms.clear(EXPIRY_PREFIX + previous.transferId);
    return pending;
  } catch (error) {
    await removePending(pending);
    if (previous && Date.now() < previous.savedAt + PENDING_TTL_MS) {
      await browser.storage.session.set({ [PENDING_KEY]: previous });
      await scheduleExpiry(previous);
    }
    await browser.tabs.remove(tab.id).catch(() => undefined);
    throw error;
  }
}
