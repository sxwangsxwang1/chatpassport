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

function virtualPage(lazy = false, repeated = false, recycled = false, staticDom = false, modernChatgpt = false, reverse = false) {
  const dom = new JSDOM(`<main ${modernChatgpt ? 'data-app-action-timeline-scroll' : ''} style="overflow-y:auto${reverse ? ';display:flex;flex-direction:column-reverse' : ''}"></main>`, { url: 'https://chatgpt.com/c/test', runScripts: 'outside-only' });
  const area = dom.window.document.querySelector('main')!;
  let top = reverse ? 0 : lazy ? 300 : 1800;
  let loadedStart = lazy ? 30 : 0;
  const height = () => (40 - loadedStart) * 50;
  const render = () => {
    if (staticDom && area.children.length) return;
    const start = reverse ? Math.max(0, 33 - Math.floor(-top / 50)) : Math.max(loadedStart, loadedStart + Math.floor(top / 50) - 1);
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
      if (modernChatgpt) {
        const role = index % 2 ? 'assistant' : 'user';
        const body = role === 'user'
          ? `<div data-user-message-bubble="true">Message ${index}</div>`
          : `<div data-markdown-text-style="assistant-message"><p>Message ${index}</p></div>`;
        return `<div data-chatgpt-search-unit-key="fallback-turn-${Math.floor(index / 2)}:${index % 2 ? 2 : 0}:${role}" data-chatgpt-search-message-ids="m${index}">${body}<button>Copy</button></div>`;
      }
      return `<article data-message-id="m${index}" data-message-author-role="${index % 2 ? 'assistant' : 'user'}"><p>${index % 4 === 0 ? 'Repeated question' : `Message ${index}`}</p></article>`;
    }).join('');
  };
  Object.defineProperties(area, {
    clientHeight: { get: () => 200 }, scrollHeight: { get: height, configurable: true },
    scrollTop: {
      get: () => top,
      set: (value: number) => {
        top = reverse ? Math.max(200 - height(), Math.min(0, value)) : Math.max(0, Math.min(height() - 200, value));
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

function providerMarkerPage(provider: 'deepseek' | 'gemini', marker: 'class' | 'data-test-id' | 'element') {
  const url = provider === 'deepseek'
    ? 'https://chat.deepseek.com/a/chat/s/test'
    : 'https://gemini.google.com/app/test';
  const dom = new JSDOM('<main style="overflow-y:auto"></main>', { url, runScripts: 'outside-only' });
  const area = dom.window.document.querySelector('main')!;
  const root = dom.window.document.documentElement;
  let top = 1800;
  let furthest = top;
  const row = (index: number) => {
    const role = index % 2 === 0 ? 'user' : 'assistant';
    if (provider === 'deepseek') return `<div data-message-id="m${index}" class="message_${role}"><p>Message ${index}</p></div>`;
    const tag = role === 'user' ? 'user-query' : 'model-response';
    return marker === 'element'
      ? `<${tag} data-message-id="m${index}"><p>Message ${index}</p></${tag}>`
      : `<div data-message-id="m${index}" data-test-id="${tag}"><p>Message ${index}</p></div>`;
  };
  const render = () => {
    const start = Math.max(0, Math.min(34, Math.floor(top / 50) - 1));
    area.innerHTML = Array.from({ length: 6 }, (_, index) => row(start + index)).join('');
  };
  Object.defineProperty(dom.window.document, 'scrollingElement', { value: root });
  Object.defineProperties(root, {
    clientHeight: { get: () => 800 }, scrollHeight: { get: () => 800 },
    scrollTop: { get: () => 0, set: () => undefined },
  });
  Object.defineProperties(area, {
    clientHeight: { get: () => 200 }, scrollHeight: { get: () => 2000 },
    scrollTop: {
      get: () => top,
      set: (value: number) => {
        top = Math.max(0, Math.min(1800, value));
        furthest = Math.min(furthest, top);
        render();
      },
    },
  });
  render();
  mocks.query.mockResolvedValue([{ id: 7, url }]);
  mocks.executeScript.mockImplementation(async ({ func, args = [] }: { func: (...args: never[]) => unknown; args?: unknown[] }) => {
    const callable = dom.window.eval(`(${func.toString()})`) as (...args: unknown[]) => unknown;
    return [{ result: await callable(...args) }];
  });
  return { dom, area, original: top, furthest: () => furthest };
}

describe('history capture integration', () => {
  it('keeps newer turns when the initial window already exceeds the message limit', async () => {
    const url = 'https://chatgpt.com/c/large-count';
    const controller = new AbortController();
    let reads = 0;
    mocks.query.mockResolvedValue([{ id: 7, url }]);
    mocks.executeScript.mockImplementation(async ({ args }: { args?: string[] }) => [{ result: args
      ? { top: args[0] === 'down' ? 1 : 0, height: 2, viewport: 1, boundary: false }
      : { provider: 'chatgpt', title: 'Large count', url, messages: ++reads === 1
        ? Array.from({ length: 20_001 }, (_, id) => message(id))
        : [message(20_000), message(20_001)] },
    }]);
    const result = await extractActiveConversation({ onProgress: () => { if (reads === 2) controller.abort(); }, signal: controller.signal });
    expect(mocks.executeScript.mock.calls.map(([call]) => call.args?.[0]).filter(Boolean)).toEqual(['start', 'down', 'restore']);
    expect(result.messages).toHaveLength(20_000);
    expect(result.messages[0]?.content[0]?.text).toBe('2');
    expect(result.messages.at(-1)?.content[0]?.text).toBe('20001');
    expect(result.capture?.status).toBe('partial');
    expect(result.capture?.reason).toContain('20,000 most recent');
  });
  it.each([
    ['deepseek', 'class'],
    ['gemini', 'data-test-id'],
    ['gemini', 'element'],
  ] as const)('scrolls the actual %s conversation for %s markers', async (provider, marker) => {
    vi.useFakeTimers();
    const { dom, area, original, furthest } = providerMarkerPage(provider, marker);
    const capture = extractActiveConversation();
    await vi.advanceTimersByTimeAsync(119_000);
    const passport = await capture;
    expect(furthest()).toBe(0);
    expect(passport.messages.map((message) => message.content[0]?.text))
      .toEqual(Array.from({ length: 40 }, (_, index) => `Message ${index}`));
    expect(passport.capture?.status).toBe('page-history');
    expect(area.scrollTop).toBe(original);
    dom.window.close();
  });
  it('enforces the file byte budget in the capture pipeline and restores scrolling', async () => {
    const controller = new AbortController();
    mocks.query.mockResolvedValue([{ id: 7, url: 'https://chatgpt.com/c/large' }]);
    mocks.executeScript.mockImplementation(async ({ args }: { args?: string[] }) => [{ result: args
      ? { top: 0, height: 200, viewport: 200, boundary: true }
      : { provider: 'chatgpt', title: 'Large', url: 'https://chatgpt.com/c/large', messages: [0, 1, 2].map((id) => message(id, `${id}${'中'.repeat(3_000_000)}`)) },
    }]);
    const result = await extractActiveConversation({ signal: controller.signal, onProgress: () => controller.abort() });
    expect(result.messages).toHaveLength(2);
    expect(result.messages.map((item) => item.content[0]?.text[0])).toEqual(['1', '2']);
    expect(result.messages.map((item) => item.id)).toEqual(['captured-1', 'captured-2']);
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
  it('collects modern ChatGPT virtualized messages and restores the real scroll area', async () => {
    vi.useFakeTimers();
    const { dom, area, original } = virtualPage(false, false, false, false, true);
    const capture = extractActiveConversation();
    await vi.advanceTimersByTimeAsync(119_000);
    const result = await capture;
    expect(result.messages.map((item) => item.content[0]?.text))
      .toEqual(Array.from({ length: 40 }, (_, index) => `Message ${index}`));
    expect(result.capture?.status).toBe('page-history');
    expect(area.scrollTop).toBe(original);
    dom.window.close();
  });
  it('loads older messages from a column-reverse ChatGPT scroller and restores the latest position', async () => {
    vi.useFakeTimers();
    const { dom, area, original } = virtualPage(false, false, false, false, true, true);
    const capture = extractActiveConversation();
    await vi.advanceTimersByTimeAsync(119_000);
    const result = await capture;
    expect(result.messages.map((item) => item.content[0]?.text))
      .toEqual(Array.from({ length: 40 }, (_, index) => `Message ${index}`));
    expect(result.capture?.status).toBe('page-history');
    expect(area.scrollTop).toBe(original);
    dom.window.close();
  });
  it('marks a non-scrollable virtualized ChatGPT page as partial immediately', async () => {
    const { dom, area } = virtualPage(false, false, false, false, true, true);
    Object.defineProperty(area, 'scrollHeight', { get: () => 200 });
    area.insertAdjacentHTML('beforeend', '<span data-turn-key="virtual-turn" hidden></span>');
    const result = await extractActiveConversation();
    expect(result.capture?.status).toBe('partial');
    expect(result.capture?.reason).toContain('no scrollable history');
    expect(mocks.executeScript.mock.calls.filter(([call]) => call.args?.[0] === 'up')).toHaveLength(0);
    dom.window.close();
  });
  it('fails promptly when a page has no recognizable messages', async () => {
    const { dom } = virtualPage();
    dom.window.document.querySelector('main')!.replaceChildren();
    await expect(extractActiveConversation()).rejects.toThrow('No messages were found');
    expect(mocks.executeScript.mock.calls.filter(([call]) => call.args?.[0] === 'up')).toHaveLength(0);
    expect(mocks.executeScript.mock.calls.some(([call]) => call.args?.[0] === 'restore')).toBe(false);
    dom.window.close();
  });
  it('waits for older messages that arrive after the former boundary timeout', async () => {
    vi.useFakeTimers();
    const url = 'https://chatgpt.com/c/delayed';
    let requestedOlder = false;
    let loadedOlder = false;
    let restored = false;
    mocks.query.mockResolvedValue([{ id: 7, url }]);
    mocks.executeScript.mockImplementation(async ({ args }: { args?: string[] }) => {
      if (args) {
        if (args[0] === 'restore') restored = true;
        if (args[0] === 'up' && !requestedOlder) {
          requestedOlder = true;
          setTimeout(() => { loadedOlder = true; }, 10_000);
        }
        return [{ result: { top: 0, height: loadedOlder ? 400 : 200, viewport: 200, boundary: true } }];
      }
      return [{ result: {
        provider: 'chatgpt', title: 'Delayed history', url,
        messages: loadedOlder ? [message(0), message(1)] : [message(1)],
      } }];
    });

    const capture = extractActiveConversation();
    await vi.advanceTimersByTimeAsync(119_000);
    const result = await capture;
    expect(result.messages.map((item) => item.content[0]?.text)).toEqual(['0', '1']);
    expect(result.capture?.status).toBe('page-history');
    expect(restored).toBe(true);
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

describe('quick loaded-message capture', () => {
  it('reads current ChatGPT search units immediately', async () => {
    const { dom, area, original } = virtualPage(false, false, false, false, true);
    const result = await extractActiveConversation({ mode: 'loaded' });
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.messages.every((item) => item.id.startsWith('dom:'))).toBe(true);
    expect(area.scrollTop).toBe(original);
    dom.window.close();
  });
  it('returns the rendered virtual window without scrolling or waiting and round-trips its coverage', async () => {
    vi.useFakeTimers();
    const { dom, area, original } = virtualPage();
    const startedAt = Date.now();
    const result = await extractActiveConversation({ mode: 'loaded' });
    expect(Date.now()).toBe(startedAt);
    expect(area.scrollTop).toBe(original);
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.messages.length).toBeLessThan(40);
    expect(result.capture).toMatchObject({ method: 'loaded', status: 'partial' });
    expect(mocks.executeScript).toHaveBeenCalledTimes(1);
    expect(parsePassport(JSON.parse(serializePassport(result))).capture).toEqual(result.capture);
    dom.window.close();
  });
  it('discards a quick capture if navigation happens before extraction returns', async () => {
    mocks.query.mockResolvedValue([{ id: 7, url: 'https://chatgpt.com/c/first' }]);
    mocks.executeScript.mockResolvedValue([{ result: {
      provider: 'chatgpt', url: 'https://chatgpt.com/c/other', title: 'Other', messages: [message(1)],
    } }]);
    await expect(extractActiveConversation({ mode: 'loaded' })).rejects.toThrow('changed');
  });
  it('does not extract after cancellation', async () => {
    mocks.query.mockResolvedValue([{ id: 7, url: 'https://chatgpt.com/c/test' }]);
    const controller = new AbortController();
    controller.abort();
    await expect(extractActiveConversation({ mode: 'loaded', signal: controller.signal })).rejects.toThrow('cancelled');
    expect(mocks.executeScript).not.toHaveBeenCalled();
  });
});
