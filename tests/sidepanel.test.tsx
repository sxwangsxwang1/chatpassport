// @vitest-environment jsdom
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Passport } from '../lib/passport';
const mocks = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), clear: vi.fn(), tab: vi.fn(), extract: vi.fn(), add: vi.fn(), remove: vi.fn(), clipboard: vi.fn() }));
vi.mock('wxt/browser', () => ({ browser: {
  tabs: { onActivated: { addListener: mocks.add, removeListener: mocks.remove }, onUpdated: { addListener: mocks.add, removeListener: mocks.remove } },
  storage: { onChanged: { addListener: mocks.add, removeListener: mocks.remove } },
} }));
vi.mock('../lib/pending', () => ({ PENDING_KEY: 'pendingTransfer', getPendingTransfer: mocks.get, savePendingTransfer: mocks.save, clearPendingTransfer: mocks.clear }));
vi.mock('../lib/browser', () => ({ getActiveTabContext: mocks.tab, extractActiveConversation: mocks.extract }));
import App from '../entrypoints/sidepanel/App';

const passport: Passport = {
  format: 'chatpassport', version: '1.0', id: 'test', title: 'Conversation',
  source: { provider: 'chatgpt', url: 'https://chatgpt.com/c/test', exportedAt: '2026-09-20T00:00:00.000Z' },
  messages: Array.from({ length: 50 }, (_, i) => ({ id: String(i), role: 'user', content: [{ type: 'text', text: `Message-${i}` }] })),
};
const pending = { passport, target: 'claude', transferId: 'a', targetTabId: 1, savedAt: Date.now() };
let dom: JSDOM;
let root: Root;
beforeEach(async () => {
  vi.clearAllMocks();
  dom = new JSDOM('<div id="root"></div>', { url: 'https://extension.test/sidepanel.html' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', { clipboard: { writeText: mocks.clipboard } });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.tab.mockResolvedValue({ id: 1, url: passport.source.url, provider: 'chatgpt' });
  mocks.get.mockResolvedValue(pending);
  mocks.extract.mockResolvedValue(passport);
  mocks.save.mockResolvedValue(pending);
  root = createRoot(document.getElementById('root')!);
  await act(async () => { root.render(<App />); });
});
afterEach(async () => { await act(async () => root.unmount()); dom.window.close(); vi.unstubAllGlobals(); });
const button = (label: string) => Array.from(document.querySelectorAll('button')).find((node) => node.textContent === label)!;
const click = async (label: string) => act(async () => { button(label).click(); });
const writeQuestion = async (value: string) => act(async () => {
  const input = document.querySelector<HTMLTextAreaElement>('#next-question')!;
  Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
});

describe('independent preview and transfer state', () => {
  it('does not reset the selected target on background tab/storage refresh', async () => {
    await click('Prepare for Claude');
    await click('Gemini');
    await act(async () => { mocks.add.mock.calls[0]![0](); });
    expect(button('Gemini').className).toContain('selected');
    expect(button('Claude').className).not.toContain('selected');
  });
  it('refreshes only for active URL changes and pending transfer storage changes', async () => {
    const onUpdated = mocks.add.mock.calls[1]![0];
    const onStorageChanged = mocks.add.mock.calls[2]![0];
    const initialReads = mocks.get.mock.calls.length;
    await act(async () => {
      onUpdated(2, { status: 'loading' }, { active: true });
      onUpdated(3, { url: 'https://claude.ai/new' }, { active: false });
      onStorageChanged({ other: {} }, 'session');
      onStorageChanged({ pendingTransfer: {} }, 'local');
    });
    expect(mocks.get).toHaveBeenCalledTimes(initialReads);
    await act(async () => {
      onUpdated(2, { url: 'https://claude.ai/new' }, { active: true });
      onStorageChanged({ pendingTransfer: {} }, 'session');
    });
    expect(mocks.get).toHaveBeenCalledTimes(initialReads + 2);
  });
  it('copies all of the saved pending transfer, independently of preview range', async () => {
    await click('Prepare for Claude');
    await act(async () => {
      const select = document.querySelector<HTMLSelectElement>('#message-limit')!;
      select.value = '20';
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    await click('Copy saved context');
    const copied = mocks.clipboard.mock.calls[0]?.[0];
    expect(copied).toContain('Message-0');
    expect(copied).toContain('Message-49');
  });
  it('offers a new chat on the imported source platform', async () => {
    await act(async () => {
      const input = document.querySelector('input[type="file"]')!;
      Object.defineProperty(input, 'files', { value: [{ size: 100, name: 'test.json', text: async () => JSON.stringify(passport) }] });
      input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    expect(document.querySelector('.provider.selected')?.textContent).toBe('Claude');
    expect(button('ChatGPT · new chat')).toBeTruthy();
  });
  it('does not copy expired or replaced pending context', async () => {
    mocks.get.mockResolvedValue(null);
    await click('Copy saved context');
    expect(mocks.clipboard).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('expired or was replaced');
  });
});

describe('guided capture and capacity estimates', () => {
  it('uses quick mode only when explicitly chosen', async () => {
    await act(async () => {
      const select = document.querySelector<HTMLSelectElement>('#capture-mode')!;
      select.value = 'loaded';
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    await click('Prepare for Claude');
    expect(mocks.extract).toHaveBeenCalledWith(expect.objectContaining({ mode: 'loaded' }));
  });
  it('shows omissions before opening the destination and keeps the captured source identity', async () => {
    const large = { ...passport, messages: passport.messages.map((message) => ({ ...message, content: [{ type: 'text' as const, text: 'x'.repeat(3000) }] })) };
    mocks.extract.mockResolvedValue(large);
    await click('Prepare for Claude');
    await writeQuestion('Continue the plan');
    expect(document.body.textContent).toContain('older messages will be omitted');
    expect(mocks.save).not.toHaveBeenCalled();
    await click('Gemini');
    expect(button('Open editable draft in Gemini').disabled).toBe(true);
    await act(async () => {
      const checkbox = document.querySelector<HTMLInputElement>('.omission-confirmation input')!;
      checkbox.click();
    });
    await click('Open editable draft in Gemini');
    expect(mocks.save).toHaveBeenCalledWith(large, 'gemini', 'Continue the plan', true);
  });
  it('prepares an exact draft without omission approval when everything fits', async () => {
    await click('Prepare for Claude');
    await writeQuestion('What is the next step?');
    expect(document.body.textContent).toContain('No additional messages will be omitted.');
    await click('Open editable draft in Claude');
    expect(mocks.save).toHaveBeenCalledWith(passport, 'claude', 'What is the next step?', false);
  });
  it('keeps a same-platform new-chat choice through capture and handoff', async () => {
    await click('ChatGPT · new chat');
    await click('Prepare for ChatGPT');
    await writeQuestion('Continue in a fresh chat');
    await click('Open editable draft in ChatGPT');
    expect(mocks.save).toHaveBeenCalledWith(passport, 'chatgpt', 'Continue in a fresh chat', false);
  });
  it('offers the current source as a new-chat destination before reading', async () => {
    mocks.tab.mockResolvedValue({ id: 2, url: 'https://claude.ai/new', provider: 'claude' });
    await act(async () => { mocks.add.mock.calls[0]![0](); });
    expect(button('Claude · new chat')).toBeTruthy();
    expect(document.querySelector('.provider.selected')?.textContent).toBe('Claude · new chat');
  });
  it('searches full messages and transfers only checked messages', async () => {
    await click('Prepare for Claude');
    await act(async () => {
      const select = document.querySelector<HTMLSelectElement>('#message-limit')!;
      select.value = 'custom';
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    await click('Clear selection');
    await writeQuestion('Continue');
    expect(button('Open editable draft in Claude').disabled).toBe(true);
    await act(async () => {
      const search = document.querySelector<HTMLInputElement>('#message-search')!;
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(search, 'Message-37');
      search.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, data: 'Message-37', inputType: 'insertText' }));
      search.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    expect(document.querySelectorAll('.message-preview li')).toHaveLength(1);
    expect(document.querySelector('.message-preview li')?.textContent).toContain('Message-37');
    await act(async () => { document.querySelector<HTMLInputElement>('.message-preview li input')!.click(); });
    await click('Open editable draft in Claude');
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [passport.messages[37]] }), 'claude', 'Continue', false,
    );
  });
  it('shows later full messages and a complete transcript option when the draft omits history', async () => {
    const large = { ...passport, messages: passport.messages.map((message) => ({ ...message, content: [{ type: 'text' as const, text: `Message-${message.id} ${'x'.repeat(3000)}` }] })) };
    mocks.extract.mockResolvedValue(large);
    await click('Prepare for Claude');
    expect(document.querySelectorAll('.message-preview li')).toHaveLength(30);
    await click('Show next 20 messages');
    expect(document.querySelectorAll('.message-preview li')).toHaveLength(50);
    await writeQuestion('Continue');
    expect(button('Download complete transcript to attach')).toBeTruthy();
  });
});
