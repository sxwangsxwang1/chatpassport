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

async function setup(initialDraft = 'My question') {
  const dom = new JSDOM('<html><body></body></html>', { url: 'https://claude.ai/new' });
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('defineContentScript', (configuration: unknown) => configuration);
  const attachShadow = dom.window.Element.prototype.attachShadow;
  dom.window.Element.prototype.attachShadow = function () {
    return attachShadow.call(this, { mode: 'open' });
  };
  const transaction = {
    original: initialDraft, dispose: vi.fn(),
    replace: vi.fn(async () => ({ success: true, message: 'Draft ready.' })),
  };
  mocks.begin.mockReturnValue(transaction);
  const script = await import('../entrypoints/relay.content');
  script.default.main({} as NonNullable<Parameters<typeof script.default.main>[0]>);
  await vi.waitFor(() => expect(dom.window.document.getElementById('chatpassport-relay-status')).not.toBeNull());
  const host = dom.window.document.getElementById('chatpassport-relay-status')!;
  const buttons = Array.from(host.shadowRoot!.querySelectorAll('button'));
  const continueButton = buttons.find((button) => button.textContent === 'Add context to draft' || button.textContent === 'Insert prepared draft');
  const dismissButton = buttons.find((button) => button.textContent === 'Dismiss');
  return { dom, host, continueButton: continueButton!, dismissButton: dismissButton!, transaction };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('prepared draft on arrival', () => {
  const prepared: ReadyRelayResponse = { ...ready, currentRequest: 'Prepared question', approvedOmittedMessageCount: 0 };
  it('inserts into an empty editor automatically and leaves Send to the website', async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText: copy } });
    mocks.sendMessage.mockImplementation(({ type }: { type: string }) => {
      if (type === GET_PENDING_RELAY) return Promise.resolve(prepared);
      if (type === COMPOSE_PENDING_RELAY) return Promise.resolve({ ...composed, text: 'Context\n\nPrepared question' });
      return Promise.resolve(true);
    });
    const { dom, host, transaction } = await setup('');
    await vi.waitFor(() => expect(transaction.replace).toHaveBeenCalledWith('Context\n\nPrepared question'));
    expect(host.shadowRoot!.textContent).toContain('review and send');
    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: COMPLETE_PENDING_RELAY, transferId: prepared.transferId });
    const copyButton = Array.from(host.shadowRoot!.querySelectorAll('button')).find((button) => button.textContent === 'Copy prepared draft')!;
    expect(copyButton.hidden).toBe(false);
    mocks.sendMessage.mockResolvedValue({ status: 'none' });
    copyButton.click();
    await vi.waitFor(() => expect(copy).toHaveBeenCalledWith('Context\n\nPrepared question'));
    expect(mocks.sendMessage).toHaveBeenCalledTimes(4);
    dom.window.close();
  });
  it('does not overwrite an existing destination draft', async () => {
    mocks.sendMessage.mockResolvedValue(prepared);
    const { dom, host, continueButton, transaction } = await setup('Existing text');
    await vi.waitFor(() => expect(host.shadowRoot!.textContent).toContain('already has a draft'));
    expect(transaction.replace).not.toHaveBeenCalled();
    expect(continueButton.disabled).toBe(false);
    dom.window.close();
  });
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
    const { dom, host, continueButton, transaction } = await setup();
    continueButton.click();
    await vi.waitFor(() => expect(transaction.dispose).toHaveBeenCalled());

    expect(transaction.replace).toHaveBeenCalledWith(composed.text);
    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: COMPLETE_PENDING_RELAY, transferId: ready.transferId });
    expect(Array.from(host.shadowRoot!.querySelectorAll('button')).find((button) => button.textContent === 'Copy prepared draft')?.hidden).toBe(false);
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

describe('omission approval and recovery', () => {
  const trimmed = { ...composed, includedMessageCount: 2, omittedMessageCount: 5 };
  function respond() {
    mocks.sendMessage.mockImplementation(({ type }: { type: string }) => {
      if (type === GET_PENDING_RELAY) return Promise.resolve(ready);
      if (type === COMPOSE_PENDING_RELAY) return Promise.resolve(trimmed);
      return Promise.resolve(true);
    });
  }
  const action = (host: HTMLElement, label: string) => Array.from(host.shadowRoot!.querySelectorAll('button')).find((item) => item.textContent === label)!;
  it('requires explicit approval before insertion, then checks the transfer again', async () => {
    respond();
    const { dom, host, continueButton, transaction } = await setup();
    continueButton.click();
    await vi.waitFor(() => expect(host.shadowRoot!.textContent).toContain('5 older messages'));
    expect(transaction.replace).not.toHaveBeenCalled();
    action(host, 'Confirm and add context').click();
    await vi.waitFor(() => expect(transaction.replace).toHaveBeenCalledWith(trimmed.text));
    expect(mocks.sendMessage.mock.calls.filter(([arg]) => arg.type === GET_PENDING_RELAY)).toHaveLength(2);
    dom.window.close();
  });
  it.each(['Go back', 'Dismiss'])('leaves the editor alone on %s and disposes the transaction', async (label) => {
    respond();
    const { dom, host, continueButton, transaction } = await setup();
    continueButton.click();
    await vi.waitFor(() => expect(host.shadowRoot!.querySelector('.confirmation')).not.toBeNull());
    action(host, label).click();
    await vi.waitFor(() => expect(transaction.dispose).toHaveBeenCalled());
    expect(transaction.replace).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: COMPLETE_PENDING_RELAY }));
    dom.window.close();
  });
  it('does not insert a transfer that expires while the user reviews omissions', async () => {
    respond();
    const { dom, host, continueButton, transaction } = await setup();
    continueButton.click();
    await vi.waitFor(() => expect(host.shadowRoot!.querySelector('.confirmation')).not.toBeNull());
    mocks.sendMessage.mockResolvedValue({ status: 'none' });
    action(host, 'Confirm and add context').click();
    await vi.waitFor(() => expect(transaction.dispose).toHaveBeenCalled());
    expect(transaction.replace).not.toHaveBeenCalled();
    expect(host.shadowRoot!.textContent).toContain('no longer available');
    dom.window.close();
  });
  it('offers the original question for recovery when an editor rejects the draft', async () => {
    respond();
    const copy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText: copy } });
    const { dom, host, continueButton, transaction } = await setup();
    transaction.replace.mockResolvedValue({ success: false, message: 'Draft changed.' });
    continueButton.click();
    await vi.waitFor(() => expect(host.shadowRoot!.querySelector('.confirmation')).not.toBeNull());
    action(host, 'Confirm and add context').click();
    await vi.waitFor(() => expect(transaction.dispose).toHaveBeenCalled());
    const recover = action(host, 'Copy original question');
    expect(recover.hidden).toBe(false);
    recover.click();
    await vi.waitFor(() => expect(copy).toHaveBeenCalledWith('My question'));
    expect(mocks.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: COMPLETE_PENDING_RELAY }));
    dom.window.close();
  });
});
