import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Passport } from '../lib/passport';
const mocks = vi.hoisted(() => ({
  get: vi.fn(), set: vi.fn(), remove: vi.fn(), createAlarm: vi.fn(), clearAlarm: vi.fn(),
  createTab: vi.fn(), updateTab: vi.fn(), removeTab: vi.fn(),
}));
vi.mock('wxt/browser', () => ({ browser: {
  storage: { session: { get: mocks.get, set: mocks.set, remove: mocks.remove } },
  alarms: { create: mocks.createAlarm, clear: mocks.clearAlarm },
  tabs: { create: mocks.createTab, update: mocks.updateTab, remove: mocks.removeTab },
} }));
import { createPending, createSerialQueue, EXPIRY_PREFIX, PENDING_KEY, readPending, removePending, scheduleExpiry } from '../lib/transfer-store';
import { canCompleteRelay } from '../lib/relay';

const passport: Passport = {
  format: 'chatpassport', version: '1.0', id: 'same-passport', title: 'Test',
  source: { provider: 'chatgpt', url: 'https://chatgpt.com/c/test', exportedAt: '2026-09-20T00:00:00.000Z' },
  messages: [{ id: '1', role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
};
let stored: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks();
  stored = {};
  mocks.get.mockImplementation(async () => ({ ...stored }));
  mocks.set.mockImplementation(async (value: Record<string, unknown>) => { Object.assign(stored, value); });
  mocks.remove.mockImplementation(async (key: string) => { delete stored[key]; });
  mocks.createAlarm.mockResolvedValue(undefined);
  mocks.clearAlarm.mockResolvedValue(true);
  mocks.createTab.mockResolvedValue({ id: 42 });
  mocks.updateTab.mockResolvedValue({ id: 42 });
  mocks.removeTab.mockResolvedValue(undefined);
});

describe('pending transfer lifecycle', () => {
  it('binds the transfer and alarm before navigating to the destination', async () => {
    mocks.updateTab.mockImplementation(async () => {
      expect(stored[PENDING_KEY]).toMatchObject({ targetTabId: 42, target: 'claude' });
      expect(mocks.createAlarm).toHaveBeenCalled();
    });
    const pending = await createPending(passport, 'claude');
    expect(mocks.createTab).toHaveBeenCalledWith({ url: 'about:blank' });
    expect(mocks.createAlarm).toHaveBeenCalledWith(EXPIRY_PREFIX + pending.transferId, { when: pending.savedAt + 3_600_000 });
    expect(await readPending()).toEqual(pending);
    const second = await createPending(passport, 'claude');
    expect(second.transferId).not.toBe(pending.transferId);
  });
  it('expires at the one-hour boundary, even without an alarm firing', async () => {
    const pending = await createPending(passport, 'claude');
    stored[PENDING_KEY] = { ...pending, savedAt: Date.now() - 3_600_000 };
    expect(await readPending()).toBeNull();
    expect(stored[PENDING_KEY]).toBeUndefined();
    expect(mocks.clearAlarm).toHaveBeenCalledWith(EXPIRY_PREFIX + pending.transferId);
  });
  it('fails closed for legacy unbound transfers and future timestamps', async () => {
    stored[PENDING_KEY] = { passport, target: 'claude', savedAt: Date.now() };
    expect(await readPending()).toBeNull();
    const pending = await createPending(passport, 'claude');
    stored[PENDING_KEY] = { ...pending, savedAt: Date.now() + 100000 };
    expect(await readPending()).toBeNull();
  });
  it('can recreate an alarm on worker restart without extending expiry', async () => {
    const pending = await createPending(passport, 'claude');
    mocks.createAlarm.mockClear();
    await scheduleExpiry((await readPending())!);
    expect(mocks.createAlarm).toHaveBeenCalledWith(EXPIRY_PREFIX + pending.transferId, { when: pending.savedAt + 3_600_000 });
  });
  it('restores the previous transfer when destination navigation fails', async () => {
    const previous = await createPending(passport, 'claude');
    mocks.createTab.mockResolvedValue({ id: 43 });
    mocks.updateTab.mockRejectedValueOnce(new Error('Navigation failed'));
    await expect(createPending(passport, 'gemini')).rejects.toThrow('Navigation failed');
    expect(await readPending()).toEqual(previous);
    expect(mocks.removeTab).toHaveBeenCalledWith(43);
  });
  it('serializes replacement and stale completion; old completion cannot remove new data', async () => {
    const serial = createSerialQueue();
    const old = await serial(() => createPending(passport, 'claude'));
    const replacement = serial(() => createPending(passport, 'claude'));
    const staleCompletion = serial(async () => {
      const pending = await readPending();
      if (pending && canCompleteRelay(pending, old.transferId, { url: 'https://claude.ai/new', tabUrl: 'https://claude.ai/new', tabId: 42, frameId: 0 })) {
        await removePending(pending);
      }
    });
    await staleCompletion;
    expect(await readPending()).toEqual(await replacement);
  });
  it('keeps the operation queue usable after a failure', async () => {
    const serial = createSerialQueue();
    await expect(serial(async () => { throw new Error('failed'); })).rejects.toThrow('failed');
    expect(await serial(async () => 42)).toBe(42);
  });
});
