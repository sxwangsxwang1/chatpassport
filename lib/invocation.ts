import { browser } from "wxt/browser";

const ACTIVE_INVOCATION_KEY = "activeInvocation";

export interface ActiveInvocation {
  tabId: number;
  url: string;
  invokedAt: number;
}

function isActiveInvocation(value: unknown): value is ActiveInvocation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ActiveInvocation>;
  return (
    typeof candidate.tabId === "number" &&
    typeof candidate.url === "string" &&
    typeof candidate.invokedAt === "number"
  );
}

export async function saveActiveInvocation(tabId: number, url: string): Promise<void> {
  await browser.storage.session.set({
    [ACTIVE_INVOCATION_KEY]: { tabId, url, invokedAt: Date.now() } satisfies ActiveInvocation,
  });
}

export async function getActiveInvocation(): Promise<ActiveInvocation | null> {
  const result = await browser.storage.session.get(ACTIVE_INVOCATION_KEY);
  const value = result[ACTIVE_INVOCATION_KEY];
  return isActiveInvocation(value) ? value : null;
}

export async function clearActiveInvocation(tabId?: number): Promise<void> {
  if (tabId !== undefined) {
    const current = await getActiveInvocation();
    if (current?.tabId !== tabId) return;
  }
  await browser.storage.session.remove(ACTIVE_INVOCATION_KEY);
}

export function resolveInvokedUrl(
  activeTabId: number,
  activeTabUrl: string | undefined,
  invocation: ActiveInvocation | null,
): string {
  if (activeTabUrl) return activeTabUrl;
  return invocation?.tabId === activeTabId ? invocation.url : "";
}
