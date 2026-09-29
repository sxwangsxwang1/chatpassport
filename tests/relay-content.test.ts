import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMPOSE_PENDING_RELAY, COMPLETE_PENDING_RELAY, GET_PENDING_RELAY, type ReadyRelayResponse } from '../lib/relay';

const mocks = vi.hoisted(() => ({ sendMessage: vi.fn(), begin: vi.fn() }));
vi.mock('wxt/browser', () => ({ browser: { runtime: { sendMessage: mocks.sendMessage } } }));
vi.mock('../lib/adapters/composer', () => ({ beginComposerTransaction: mocks.begin }));

const ready: ReadyRelayResponse = {
  status: 'ready', transferId: 'transfer-1', title: 'Source',
  source: 'chatgpt', target: 'claude', messageCount: 1,
};
const composed = {
  status: 'composed', transferId: ready.transferId, text: 'Context\n\nMy question',
  includedMessageCount: 1, omittedMessageCount: 0, characterCount: 20,
};

async function setup() {
  const dom = new JSDOM('<html><body></body></html>', { url: 'https://claude.ai/new' });
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('defineContentScript', (configuration: unknown) => configuration);
  const attachShadow = dom.window.Element.prototype.attachShadow;
  dom.window.Element.prototype.attachShadow = function () {
    return attachShadow.call(this, { mode: 'open' });
  };
  const transaction = {
    original: 'My question', dispose: vi.fn(),
    replace: vi.fn(async () => ({ success: true, message: 'Draft ready.' })),
  };
  mocks.begin.mockReturnValue(transaction);
  const script = await import('../entrypoints/relay.content');
  script.default.main({} as NonNullable<Parameters<typeof script.default.main>[0]>);
  await vi.waitFor(() => expect(dom.window.document.getElementById('chatpassport-relay-status')).not.toBeNull());
  const host = dom.window.document.getElementById('chatpassport-relay-status')!;
  const [continueButton, dismissButton] = Array.from(host.shadowRoot!.querySelectorAll('button'));
  return { dom, host, continueButton: continueButton!, dismissButton: dismissButton!, transaction };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('destination relay cancellation', () => {
  it('does not insert after Dismiss while composition is in flight', async () => {
    let resolveCompose!: (value: unknown) => void;
    const compose = new Promise<unknown>((resolve) => { resolveCompose = resolve; });
    mocks.sendMessage.mockImplementation(({ type }: { type: string }) => {
      if (type === GET_PENDING_RELAY) return Promise.resolve(ready);
      if (type === COMPOSE_PENDING_RELAY) return compose;
      return Promise.resolve(true);
    });
    const { dom, host, continueButton, dismissButton, transaction } = await setup();
    continueButton.click();
    dismissButton.click();
    resolveCompose(composed);
    await vi.waitFor(() => expect(transaction.dispose).toHaveBeenCalled());

    expect(host.isConnected).toBe(false);
    expect(transaction.replace).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: COMPLETE_PENDING_RELAY }));
    dom.window.close();
  });

  it('rechecks that the transfer was not cleared before inserting', async () => {
    let lookupCount = 0;
    mocks.sendMessage.mockImplementation(({ type }: { type: string }) => {
      if (type === GET_PENDING_RELAY) return Promise.resolve(++lookupCount === 1 ? ready : { status: 'none' });
      if (type === COMPOSE_PENDING_RELAY) return Promise.resolve(composed);
      return Promise.resolve(true);
    });
    const { dom, continueButton, transaction } = await setup();
    continueButton.click();
    await vi.waitFor(() => expect(transaction.dispose).toHaveBeenCalled());

    expect(lookupCount).toBe(2);
    expect(transaction.replace).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: COMPLETE_PENDING_RELAY }));
    dom.window.close();
  });

  it('still inserts and completes a current transfer', async () => {
    mocks.sendMessage.mockImplementation(({ type }: { type: string }) => {
      if (type === GET_PENDING_RELAY) return Promise.resolve(ready);
      if (type === COMPOSE_PENDING_RELAY) return Promise.resolve(composed);
      return Promise.resolve(true);
    });
    const { dom, continueButton, transaction } = await setup();
    continueButton.click();
    await vi.waitFor(() => expect(transaction.dispose).toHaveBeenCalled());

    expect(transaction.replace).toHaveBeenCalledWith(composed.text);
    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: COMPLETE_PENDING_RELAY, transferId: ready.transferId });
    dom.window.close();
  });

  it('does not offer cancellation after the editor write has begun', async () => {
    mocks.sendMessage.mockImplementation(({ type }: { type: string }) => {
      if (type === GET_PENDING_RELAY) return Promise.resolve(ready);
      if (type === COMPOSE_PENDING_RELAY) return Promise.resolve(composed);
      return Promise.resolve(true);
    });
    const { dom, host, continueButton, dismissButton, transaction } = await setup();
    let finishWrite!: (value: { success: boolean; message: string }) => void;
    transaction.replace.mockImplementation(() => new Promise((resolve) => { finishWrite = resolve; }));
    continueButton.click();
    await vi.waitFor(() => expect(transaction.replace).toHaveBeenCalled());
    expect(dismissButton.disabled).toBe(true);
    dismissButton.click();
    expect(host.isConnected).toBe(true);
    finishWrite({ success: true, message: 'Draft ready.' });
    await vi.waitFor(() => expect(transaction.dispose).toHaveBeenCalled());
    expect(dismissButton.disabled).toBe(false);
    dom.window.close();
  });
});
