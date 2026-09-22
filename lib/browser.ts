import { browser } from "wxt/browser";
import { detectProvider } from "./core";
import { extractConversationFromPage } from "./adapters/page";
import { mergeHistory, scrollHistoryOnPage } from "./history";
import { fitCapturedPassport, passportSchema, type Passport, type PassportMessage, type Provider } from "./passport";

export interface ActiveTabContext { id: number; url: string; provider: Provider | null }
export async function getActiveTabContext(): Promise<ActiveTabContext> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) throw new Error("No active browser tab is available.");
  const url = tab.url ?? "";
  return { id: tab.id, url, provider: url ? detectProvider(url) : null };
}

export async function extractActiveConversation(options: {
  signal?: AbortSignal;
  onProgress?: (count: number, phase: string) => void;
} = {}): Promise<Passport> {
  const tab = await getActiveTabContext();
  if (!tab.provider) throw new Error("Open ChatGPT, Claude, Gemini, or DeepSeek first.");
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
    capture: { method: 'scroll', status: ended || gap ? 'partial' : 'page-history', reason },
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
      messages = messages.slice(0, 20_000);
      ended = true;
      reason = "Capture message-count limit reached; export this partial history or use a smaller conversation.";
    }
    if (messages.length) {
      const fitted = fitCapturedPassport(makePassport());
      if (fitted.messages.length < messages.length) {
        messages = messages.slice(0, fitted.messages.length);
        ended = true;
        reason = fitted.capture!.reason;
      }
    }
    options.onProgress?.(messages.length, direction === 'up' ? 'Loading older messages' : 'Checking through the latest messages');
    return fingerprint;
  };
  const startPosition = await scroll('start');
  try {
    await collect('up', startPosition);
    for (const direction of ['up', 'down'] as const) {
      let stable = 0;
      let previous = "";
      let stalled = 0;
      while (!ended && stable < 4) {
        if (options.signal?.aborted || Date.now() >= deadline) {
          ended = true;
          reason = options.signal?.aborted ? "Capture stopped by you; only collected messages are included." : "Two-minute loading limit reached; the history may be incomplete.";
          break;
        }
        const position = await scroll(direction);
        await new Promise((resolve) => setTimeout(resolve, 600));
        const fingerprint = await collect(direction, position);
        const signature = JSON.stringify(position) + fingerprint;
        stable = position.boundary && signature === previous ? stable + 1 : 0;
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
  if (gap) reason = `${ended ? reason + ' ' : ''}Some rendered windows could not be aligned reliably. Retained windows may contain gaps or duplicates.`;
  return passportSchema.parse(fitCapturedPassport(makePassport()));
}
