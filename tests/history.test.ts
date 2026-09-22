import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeHistory } from '../lib/history';
import { PASSPORT_MAX_BYTES, parsePassport, serializePassport, type PassportMessage } from '../lib/passport';

const mocks = vi.hoisted(() => ({ query: vi.fn(), executeScript: vi.fn() }));
vi.mock('wxt/browser', () => ({ browser: { tabs: { query: mocks.query }, scripting: { executeScript: mocks.executeScript } } }));
import { extractActiveConversation } from '../lib/browser';

const message = (id: number, text = String(id)): PassportMessage => ({ id: `dom:user:${id}`, role: 'user', content: [{ type: 'text', text }] });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('history window alignment', () => {
  it('keeps identical unanchored windows instead of mistaking repeated messages for the same turn', () => {
    const window = ['Continue', 'OK'].map((text, index) => ({ ...message(index, text), id: `position:${index}` }));
    const merged = mergeHistory(window, window, 'up', true);
    expect(merged.messages).toHaveLength(4);
    expect(merged.gap).toBe(true);
  });
  it('merges overlapping windows in either direction', () => {
    const a = [1, 2, 3].map((id) => message(id));
    expect(mergeHistory(a, [3, 4, 5].map((id) => message(id)), 'down').messages.map((m) => m.id))
      .toEqual([1, 2, 3, 4, 5].map((id) => `dom:user:${id}`));
    expect(mergeHistory(a, [0, 1].map((id) => message(id)), 'up').messages.map((m) => m.id))
      .toEqual([0, 1, 2, 3].map((id) => `dom:user:${id}`));
  });
  it('does not deduplicate distinct repeated messages', () => {
    expect(mergeHistory([message(1, 'Again'), message(2, 'Again')], [message(2, 'Again'), message(3, 'Again')], 'down').messages)
      .toHaveLength(3);
  });
  it('updates streaming content with the same stable ID', () => {
    expect(mergeHistory([message(1, 'part')], [message(1, 'complete')], 'down').messages[0]?.content[0]?.text).toBe('complete');
  });
  it('keeps unaligned windows and flags uncertainty', () => {
    const merged = mergeHistory([message(1)], [message(3)], 'down');
    expect(merged.gap).toBe(true);
    expect(merged.messages).toHaveLength(2);
  });
  it('uses ordered text overlap when platform IDs are unavailable', () => {
    const fallback = (text: string) => ({ ...message(0, text), id: 'position:1' });
    expect(mergeHistory(['A', 'B'].map(fallback), ['B', 'C'].map(fallback), 'down').messages.map((m) => m.content[0]?.text))
      .toEqual(['A', 'B', 'C']);
  });
});

function virtualPage(lazy = false, repeated = false, recycled = false, staticDom = false) {
  const dom = new JSDOM('<main style="overflow-y:auto"></main>', { url: 'https://chatgpt.com/c/test', runScripts: 'outside-only' });
  const area = dom.window.document.querySelector('main')!;
  let top = lazy ? 300 : 1800;
  let loadedStart = lazy ? 30 : 0;
  const height = () => (40 - loadedStart) * 50;
  const render = () => {
    if (staticDom && area.children.length) return;
    const start = Math.max(loadedStart, loadedStart + Math.floor(top / 50) - 1);
    const end = Math.min(40, start + 7);
    if (repeated) {
      const first = staticDom ? 0 : Math.min(36, Math.floor(top / 100) * 2);
      const count = staticDom ? 40 : 4;
      if (!recycled || !area.children.length) area.innerHTML = Array.from({ length: count }, (_, i) =>
        `<article data-message-author-role="${i % 2 ? 'assistant' : 'user'}"><p>${i % 2 ? 'OK' : 'Continue'}</p></article>`).join('');
      Array.from(area.children).forEach((element, index) => {
        element.getBoundingClientRect = () => ({ top: (first + index) * 50 - top }) as DOMRect;
      });
      return;
    }
    area.innerHTML = Array.from({ length: end - start }, (_, i) => {
      const index = start + i;
      return `<article data-message-id="m${index}" data-message-author-role="${index % 2 ? 'assistant' : 'user'}"><p>${index % 4 === 0 ? 'Repeated question' : `Message ${index}`}</p></article>`;
    }).join('');
  };
  Object.defineProperties(area, {
    clientHeight: { get: () => 200 }, scrollHeight: { get: height },
    scrollTop: {
      get: () => top,
      set: (value: number) => {
        top = Math.max(0, Math.min(height() - 200, value));
        if (lazy && top === 0 && loadedStart > 0) {
          loadedStart -= 10;
          top += 500; // preserve visible anchor when older pages are prepended
        }
        render();
      },
    },
  });
  render();
  mocks.query.mockResolvedValue([{ id: 7, url: dom.window.location.href }]);
  mocks.executeScript.mockImplementation(async ({ func, args = [] }: { func: (...args: never[]) => unknown; args?: unknown[] }) => {
    const callable = dom.window.eval(`(${func.toString()})`) as (...args: unknown[]) => unknown;
    return [{ result: await callable(...args) }];
  });
  return { dom, area, original: top };
}

describe('history capture integration', () => {
  it('enforces the file byte budget in the capture pipeline and restores scrolling', async () => {
    mocks.query.mockResolvedValue([{ id: 7, url: 'https://chatgpt.com/c/large' }]);
    mocks.executeScript.mockImplementation(async ({ args }: { args?: string[] }) => [{ result: args
      ? { top: 0, height: 200, viewport: 200, boundary: true }
      : { provider: 'chatgpt', title: 'Large', url: 'https://chatgpt.com/c/large', messages: [0, 1, 2].map((id) => message(id, '中'.repeat(3_000_000))) },
    }]);
    const result = await extractActiveConversation();
    expect(result.messages).toHaveLength(2);
    expect(result.capture?.status).toBe('partial');
    expect(result.capture?.reason).toContain('UTF-8');
    const json = serializePassport(result);
    expect(new TextEncoder().encode(json).byteLength).toBeLessThanOrEqual(PASSPORT_MAX_BYTES);
    expect(parsePassport(JSON.parse(json)).messages).toEqual(result.messages);
    expect(mocks.executeScript.mock.calls.some(([call]) => call.args?.[0] === 'restore')).toBe(true);
  });
  it('rejects an individually oversized message and still restores the page', async () => {
    mocks.query.mockResolvedValue([{ id: 7, url: 'https://chatgpt.com/c/large' }]);
    mocks.executeScript.mockImplementation(async ({ args }: { args?: string[] }) => [{ result: args
      ? { top: 0, height: 200, viewport: 200, boundary: true }
      : { provider: 'chatgpt', title: 'Large', url: 'https://chatgpt.com/c/large', messages: [message(1, '中'.repeat(9_000_000))] },
    }]);
    await expect(extractActiveConversation()).rejects.toThrow('No message was truncated');
    expect(mocks.executeScript.mock.calls.some(([call]) => call.args?.[0] === 'restore')).toBe(true);
  });
  it.each([false, true])('retains repeated ID-less virtual windows and flags uncertainty, recycled nodes=%s', async (recycled) => {
    vi.useFakeTimers();
    const { dom } = virtualPage(false, true, recycled);
    const promise = extractActiveConversation();
    await vi.advanceTimersByTimeAsync(119_000);
    const result = await promise;
    expect(result.messages.length).toBeGreaterThanOrEqual(40);
    expect(result.capture?.status).toBe('partial');
    expect(result.capture?.reason).toContain('duplicates');
    dom.window.close();
  });
  it('does not duplicate a fully rendered static conversation when scrolling', async () => {
    vi.useFakeTimers();
    const { dom } = virtualPage(false, true, false, true);
    const promise = extractActiveConversation();
    await vi.advanceTimersByTimeAsync(119_000);
    const result = await promise;
    expect(result.messages).toHaveLength(40);
    expect(result.capture?.status).toBe('page-history');
    dom.window.close();
  });
  it.each([false, true])('collects all 40 virtualized messages, lazy loading=%s', async (lazy) => {
    vi.useFakeTimers();
    const { area, original } = virtualPage(lazy);
    const result = extractActiveConversation();
    await vi.advanceTimersByTimeAsync(119_000);
    const passport = await result;
    expect(passport.messages).toHaveLength(40);
    expect(passport.messages.map((m) => m.content[0]?.text)).toEqual(Array.from({ length: 40 }, (_, i) => i % 4 === 0 ? 'Repeated question' : `Message ${i}`));
    expect(passport.capture?.status).toBe('page-history');
    expect(area.scrollTop).toBe(lazy ? original + 1500 : original);
  });
  it('returns partial results on cancel and restores scrolling', async () => {
    vi.useFakeTimers();
    const { area, original } = virtualPage();
    const controller = new AbortController();
    const result = await extractActiveConversation({ signal: controller.signal, onProgress: () => controller.abort() });
    expect(result.capture?.status).toBe('partial');
    expect(result.capture?.reason).toContain('stopped');
    expect(area.scrollTop).toBe(original);
  });
  it('returns explicit partial results when the deadline is reached', async () => {
    vi.useFakeTimers();
    const { area, original } = virtualPage();
    let changedTime = false;
    const result = await extractActiveConversation({ onProgress: () => {
      if (!changedTime) { changedTime = true; vi.setSystemTime(Date.now() + 121_000); }
    } });
    expect(result.capture?.status).toBe('partial');
    expect(result.capture?.reason).toContain('limit');
    expect(area.scrollTop).toBe(original);
  });
  it('discards results if the user navigates to another conversation', async () => {
    const { dom } = virtualPage();
    await expect(extractActiveConversation({ onProgress: () => dom.window.history.pushState({}, '', '/c/other') }))
      .rejects.toThrow('changed');
    expect((dom.window as unknown as Record<string, unknown>).__chatpassportScroll).toBeUndefined();
  });
});
