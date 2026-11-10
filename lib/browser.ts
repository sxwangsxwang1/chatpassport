import { browser } from "wxt/browser";
import { detectProvider } from "./core";
import { extractConversationFromPage } from "./adapters/page";
import { mergeHistory, scrollHistoryOnPage } from "./history";
import { fitCapturedPassport, passportSchema, type Passport, type PassportMessage, type Provider } from "./passport";

const SCROLL_POLL_MS = 600;
const BOUNDARY_IDLE_MS = 12_000;

export interface ActiveTabContext { id: number; url: string; provider: Provider | null }
export async function getActiveTabContext(): Promise<ActiveTabContext> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) throw new Error("No active browser tab is available.");
  const url = tab.url ?? "";
  return { id: tab.id, url, provider: url ? detectProvider(url) : null };
}

export async function extractActiveConversation(options: {
  mode?: 'history' | 'loaded';
  signal?: AbortSignal;
  onProgress?: (count: number, phase: string) => void;
} = {}): Promise<Passport> {
  const tab = await getActiveTabContext();
  if (!tab.provider) throw new Error("Open ChatGPT, Claude, Gemini, or DeepSeek first.");
  if (options.mode === 'loaded') {
    if (options.signal?.aborted) throw new Error('Capture cancelled. Try again when ready.');
    const [injection] = await browser.scripting.executeScript({
      target: { tabId: tab.id }, func: extractConversationFromPage,
    });
    const result = injection?.result;
    if (!result || result.provider !== tab.provider || result.url !== tab.url) throw new Error('The conversation changed during capture. Start again.');
    if (options.signal?.aborted) throw new Error('Capture cancelled. Try again when ready.');
    if (!result.messages.length) throw new Error('No messages were found. Open a conversation and try again.');
    options.onProgress?.(result.messages.length, 'Read currently loaded messages');
    return passportSchema.parse(fitCapturedPassport({
      format: 'chatpassport', version: '1.0', id: crypto.randomUUID(), title: result.title,
      source: { provider: tab.provider, url: tab.url, exportedAt: new Date().toISOString() },
      messages: result.messages,
      capture: { method: 'loaded', status: 'partial', reason: 'Only currently loaded messages were read. Older or virtualized messages may be missing. Choose Load history to collect more.' },
    }));
  }
  const token = crypto.randomUUID();
  const scroll = async (action: 'start' | 'up' | 'down' | 'restore') => {
    const [result] = await browser.scripting.executeScript({
      target: { tabId: tab.id }, func: scrollHistoryOnPage, args: [action, token, tab.url],
    });
    if (!result?.result) throw new Error("The page did not respond to history capture.");
    return result.result;
  };
  let messages: PassportMessage[] = [];
  let title = "";
  let gap = false;
  let ended = false;
  let countLimitReached = false;
  let sizeLimitReached = false;
  let reason = "Reached both ends of the page history. Server-side, collapsed, branched or unsupported content may still be absent.";
  const deadline = Date.now() + 120_000;
  let previousSnapshot = "";
  let previousObservation: string | undefined;
  let previousPosition = '';
  const passportId = crypto.randomUUID();
  const exportedAt = new Date().toISOString();
  const makePassport = (): Passport => ({
    format: 'chatpassport', version: '1.0', id: passportId, title,
    source: { provider: tab.provider!, url: tab.url, exportedAt },
    messages: messages.map((message, index) => ({ ...message, id: `captured-${index + 1}` })),
    capture: { method: 'scroll', status: ended || gap || countLimitReached || sizeLimitReached ? 'partial' : 'page-history', reason },
  });
  const collect = async (direction: 'up' | 'down', position: { top: number; height: number }) => {
    const [injection] = await browser.scripting.executeScript({ target: { tabId: tab.id }, func: extractConversationFromPage });
    const result = injection?.result;
    if (!result || result.provider !== tab.provider || result.url !== tab.url) throw new Error("The conversation changed during capture. Start again.");
    title = result.title;
    const fingerprint = JSON.stringify(result.messages);
    const positionKey = `${position.top}:${position.height}`;
    const unanchoredRepeat = fingerprint === previousSnapshot && result.messages.length > 0
      && result.messages.some((message) => !message.id.startsWith('dom:'))
      && positionKey !== previousPosition
      && (!result.observation || result.observation !== previousObservation);
    if (fingerprint !== previousSnapshot || unanchoredRepeat) {
      const merged = mergeHistory(messages, result.messages, direction, unanchoredRepeat);
      messages = merged.messages;
      gap ||= merged.gap;
      previousSnapshot = fingerprint;
    }
    previousObservation = result.observation;
    previousPosition = positionKey;
    if (messages.length > 20_000) {
      messages = messages.slice(-20_000);
      countLimitReached = true;
      if (direction === 'up') ended = true;
    }
    if (messages.length) {
      const fitted = fitCapturedPassport(makePassport());
      if (fitted.messages.length < messages.length) {
        messages = messages.slice(-fitted.messages.length);
        sizeLimitReached = true;
        if (direction === 'up') ended = true;
      }
    }
    options.onProgress?.(messages.length, direction === 'up' ? 'Loading older messages' : 'Checking through the latest messages');
    return fingerprint;
  };
  const startPosition = await scroll('start');
  try {
    await collect('down', startPosition);
    if (!messages.length) throw new Error('No messages were found. Open a conversation and try again.');
    if (startPosition.virtualized && startPosition.height <= startPosition.viewport + 2) {
      ended = true;
      reason = 'This page shows virtualized messages but has no scrollable history. Only currently rendered messages were read; older messages may be missing.';
    }
    // Visit the newest end first so a capacity limit never prevents us from
    // collecting the final turns when capture starts in the middle.
    for (const direction of ['down', 'up'] as const) {
      let boundarySince: number | undefined;
      let previous = "";
      let stalled = 0;
      while (!ended) {
        if (options.signal?.aborted || Date.now() >= deadline) {
          ended = true;
          reason = options.signal?.aborted ? "Capture stopped by you; only collected messages are included." : "Two-minute loading limit reached; the history may be incomplete.";
          break;
        }
        const position = await scroll(direction);
        await new Promise((resolve) => setTimeout(resolve, SCROLL_POLL_MS));
        const fingerprint = await collect(direction, position);
        const signature = JSON.stringify(position) + fingerprint;
        if (position.boundary) {
          if (signature !== previous || boundarySince === undefined) boundarySince = Date.now();
          else if (Date.now() - boundarySince >= BOUNDARY_IDLE_MS) break;
        } else {
          boundarySince = undefined;
        }
        stalled = signature === previous ? stalled + 1 : 0;
        previous = signature;
        if (stalled >= 8 && !position.boundary) {
          ended = true;
          reason = "The page stopped scrolling before a history boundary; capture is partial.";
        }
      }
    }
  } finally {
    await scroll('restore').catch(() => undefined);
  }
  if (!messages.length) throw new Error("No messages were found. Open a conversation and try again.");
  const defaultReason = "Reached both ends of the page history. Server-side, collapsed, branched or unsupported content may still be absent.";
  reason = [
    countLimitReached ? 'Capture message-count limit reached. Only the 20,000 most recent collected messages are included.' : '',
    sizeLimitReached ? 'The UTF-8 JSON file limit was reached. Only the most recent collected messages that fit are included; older messages were omitted without cutting any message.' : '',
    reason !== defaultReason || (!countLimitReached && !sizeLimitReached) ? reason : '',
    gap ? 'Some rendered windows could not be aligned reliably. Retained windows may contain gaps or duplicates.' : '',
  ].filter(Boolean).join(' ');
  return passportSchema.parse(fitCapturedPassport(makePassport()));
}
