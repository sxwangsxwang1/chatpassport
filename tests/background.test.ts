import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  listener: vi.fn(), read: vi.fn(), create: vi.fn(), remove: vi.fn(), schedule: vi.fn(),
  setBehavior: vi.fn().mockResolvedValue(undefined), access: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('wxt/browser', () => ({ browser: {
  runtime: { id: 'extension', getURL: (path: string) => `chrome-extension://extension${path}`, onMessage: { addListener: mocks.listener } },
  sidePanel: { setPanelBehavior: mocks.setBehavior },
  storage: { session: { setAccessLevel: mocks.access } },
  alarms: { onAlarm: { addListener: vi.fn() } },
  tabs: { onRemoved: { addListener: vi.fn() } },
} }));
vi.mock('../lib/transfer-store', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/transfer-store')>(),
  readPending: mocks.read, createPending: mocks.create, removePending: mocks.remove, scheduleExpiry: mocks.schedule,
}));
import { COMPOSE_PENDING_RELAY, COMPLETE_PENDING_RELAY, GET_PENDING_RELAY } from '../lib/relay';
import { PENDING_COMMAND } from '../lib/pending';

const pending = {
  transferId: 'transfer', targetTabId: 42, target: 'claude', savedAt: Date.now(),
  passport: { format: 'chatpassport', version: '1.0', id: 'p', title: 'Test',
    source: { provider: 'chatgpt', url: 'https://chatgpt.com/c/test', exportedAt: new Date().toISOString() },
    messages: [{ id: '1', role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
  },
};
const panel = { id: 'extension', url: 'chrome-extension://extension/sidepanel.html' };
const target = { id: 'extension', url: 'https://claude.ai/new', frameId: 0, tab: { id: 42, url: 'https://claude.ai/new' } };
let listener: (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => unknown;
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue(pending);
  mocks.create.mockResolvedValue(pending);
  vi.stubGlobal('defineBackground', (main: () => void) => main);
  const background = await import('../entrypoints/background');
  (background.default as unknown as () => void)();
  listener = mocks.listener.mock.calls[0]![0];
  await vi.waitFor(() => expect(mocks.schedule).toHaveBeenCalled());
  vi.unstubAllGlobals();
});

async function legacyMessage(message: unknown, sender: unknown) {
  const callback = vi.fn();
  const result = listener(message, sender, callback);
  // A pre-148 Chrome channel only remains open for literal true, not a Promise.
  expect(result).toBe(true);
  await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
  return callback.mock.calls[0]![0];
}

describe('legacy Chrome asynchronous response channels', () => {
  it.each(['get', 'save', 'clear'])('responds to side-panel %s commands using sendResponse', async (action) => {
    expect(await legacyMessage({ type: PENDING_COMMAND, action, transferId: 'transfer', passport: pending.passport, target: 'claude' }, panel))
      .toMatchObject({ ok: true });
  });
  it('responds to relay lookup, composition and completion', async () => {
    expect(await legacyMessage({ type: GET_PENDING_RELAY }, target)).toMatchObject({ status: 'ready' });
    expect(await legacyMessage({ type: COMPOSE_PENDING_RELAY, transferId: 'transfer', currentRequest: 'Continue' }, target)).toMatchObject({ status: 'composed' });
    expect(await legacyMessage({ type: COMPLETE_PENDING_RELAY, transferId: 'transfer' }, target)).toBe(true);
  });
  it('does not claim unrelated or unauthorized messages', () => {
    const response = vi.fn();
    expect(listener({ type: 'unrelated' }, panel, response)).toBeUndefined();
    expect(listener({ type: PENDING_COMMAND, action: 'get' }, target, response)).toBeUndefined();
    expect(response).not.toHaveBeenCalled();
  });
  it('settles failures through the same callback and keeps the queue usable', async () => {
    mocks.read.mockRejectedValueOnce(new Error('Storage unavailable'));
    expect(await legacyMessage({ type: GET_PENDING_RELAY }, target)).toMatchObject({ status: 'error' });
    expect(await legacyMessage({ type: GET_PENDING_RELAY }, target)).toMatchObject({ status: 'ready' });
  });
});
