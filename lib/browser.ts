import { browser } from "wxt/browser";
import { detectProvider } from "./core";
import { extractConversationFromPage, fillComposerOnPage, type FillResult } from "./adapters/page";
import { passportSchema, type Passport, type Provider } from "./passport";

export interface ActiveTabContext {
  id: number;
  url: string;
  provider: Provider | null;
}

export async function getActiveTabContext(): Promise<ActiveTabContext> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active browser tab is available.");
  const url = tab.url ?? "";
  return { id: tab.id, url, provider: url ? detectProvider(url) : null };
}

export async function extractActiveConversation(): Promise<Passport> {
  const tab = await getActiveTabContext();
  if (!tab.provider) throw new Error("Open ChatGPT, Claude, Gemini, or DeepSeek first.");

  const [injection] = await browser.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractConversationFromPage,
  });
  const result = injection?.result;
  if (!result) throw new Error("The page did not return a conversation.");
  if (result.error) throw new Error(result.error);
  if (result.provider !== tab.provider) throw new Error("The active platform changed during export.");

  return passportSchema.parse({
    format: "chatpassport",
    version: "1.0",
    id: crypto.randomUUID(),
    title: result.title,
    source: {
      provider: result.provider,
      url: result.url,
      exportedAt: new Date().toISOString(),
    },
    messages: result.messages,
  });
}

export async function fillActiveComposer(text: string): Promise<FillResult> {
  const tab = await getActiveTabContext();
  if (!tab.provider) throw new Error("Open a supported AI assistant first.");

  const [injection] = await browser.scripting.executeScript({
    target: { tabId: tab.id },
    func: fillComposerOnPage,
    args: [text],
  });
  return injection?.result ?? {
    success: false,
    message: "The page did not accept the conversation context.",
  };
}
