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
vi.mock('../lib/pending', () => ({ getPendingTransfer: mocks.get, savePendingTransfer: mocks.save, clearPendingTransfer: mocks.clear }));
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

describe('independent preview and transfer state', () => {
  it('does not reset the selected target on background tab/storage refresh', async () => {
    await click('Capture conversation history');
    await click('Gemini');
    await act(async () => { for (const [listener] of mocks.add.mock.calls) listener(); });
    expect(button('Gemini').className).toContain('selected');
    expect(button('Claude').className).not.toContain('selected');
  });
  it('copies all of the saved pending transfer, independently of preview range', async () => {
    await click('Capture conversation history');
    await act(async () => {
      const select = document.querySelector('select')!;
      select.value = '20';
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    await click('Copy context only');
    const copied = mocks.clipboard.mock.calls[0]?.[0];
    expect(copied).toContain('Message-0');
    expect(copied).toContain('Message-49');
  });
  it('keeps imported source and selected destination different on the source platform', async () => {
    await act(async () => {
      const input = document.querySelector('input[type="file"]')!;
      Object.defineProperty(input, 'files', { value: [{ size: 100, name: 'test.json', text: async () => JSON.stringify(passport) }] });
      input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    expect(document.querySelector('.provider.selected')?.textContent).toBe('Claude');
    expect(Array.from(document.querySelectorAll('.provider')).some((node) => node.textContent === 'ChatGPT')).toBe(false);
  });
  it('does not copy expired or replaced pending context', async () => {
    mocks.get.mockResolvedValue(null);
    await click('Copy context only');
    expect(mocks.clipboard).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('expired or was replaced');
  });
});
