import { browser } from "wxt/browser";
import { fillComposerOnPage, type FillResult } from "../lib/adapters/page";
import { PROVIDER_LABELS } from "../lib/core";
import {
  COMPLETE_PENDING_RELAY,
  GET_PENDING_RELAY,
  isRelayResponse,
  type ReadyRelayResponse,
} from "../lib/relay";

const STATUS_ELEMENT_ID = "chatpassport-relay-status";
const MAX_ATTEMPTS = 60;
const RETRY_DELAY_MS = 500;

export default defineContentScript({
  matches: [
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*",
    "https://chat.deepseek.com/*",
  ],
  runAt: "document_idle",
  main() {
    void startAutomaticRelay();
  },
});

async function startAutomaticRelay(): Promise<void> {
  let response: unknown;
  try {
    response = await browser.runtime.sendMessage({ type: GET_PENDING_RELAY });
  } catch {
    return;
  }

  if (!isRelayResponse(response) || response.status !== "ready") return;

  const result = await waitForComposer(response.context);
  if (result.code === "filled") {
    showRelayStatus(response, "success");
    await browser.runtime.sendMessage({
      type: COMPLETE_PENDING_RELAY,
      passportId: response.passportId,
    }).catch(() => false);
    return;
  }

  showRelayStatus(response, result.code === "not-empty" ? "draft" : "error");
}

async function waitForComposer(context: string): Promise<FillResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const result = fillComposerOnPage(context);
    if (result.code !== "not-found") return result;
    await new Promise<void>((resolve) => window.setTimeout(resolve, RETRY_DELAY_MS));
  }

  return {
    success: false,
    code: "not-found",
    message: "The destination message box did not become available.",
  };
}

function showRelayStatus(
  relay: ReadyRelayResponse,
  kind: "success" | "draft" | "error",
): void {
  document.getElementById(STATUS_ELEMENT_ID)?.remove();

  const host = document.createElement("div");
  host.id = STATUS_ELEMENT_ID;
  host.style.position = "fixed";
  host.style.right = "20px";
  host.style.bottom = "20px";
  host.style.zIndex = "2147483647";
  document.documentElement.append(host);

  const shadow = host.attachShadow({ mode: "closed" });
  const card = document.createElement("section");
  card.setAttribute("role", kind === "success" ? "status" : "alert");
  card.className = `card ${kind}`;

  const heading = document.createElement("strong");
  heading.textContent = kind === "success"
    ? "ChatPassport imported the conversation"
    : kind === "draft"
      ? "ChatPassport protected your draft"
      : "ChatPassport could not fill this page";

  const detail = document.createElement("p");
  detail.textContent = kind === "success"
    ? `${relay.messageCount} messages from ${PROVIDER_LABELS[relay.source]} are in the message box. Review them, then send when ready.`
    : kind === "draft"
      ? "The message box already contains text, so nothing was overwritten. Clear it and use Fill in the side panel, or copy the context."
      : "The page loaded, but its message box was not found. Open ChatPassport and use Fill or Copy context.";

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.textContent = "Dismiss";
  dismiss.addEventListener("click", () => host.remove());

  const style = document.createElement("style");
  style.textContent = `
    .card {
      box-sizing: border-box;
      width: min(360px, calc(100vw - 40px));
      padding: 16px;
      border: 1px solid #d8d3c5;
      border-left: 5px solid #176044;
      border-radius: 12px;
      color: #17201c;
      background: #fffdf7;
      box-shadow: 0 14px 45px rgba(22, 28, 25, 0.2);
      font: 14px/1.45 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .card.draft { border-left-color: #c6923a; }
    .card.error { border-left-color: #a43e34; }
    strong { display: block; margin-right: 50px; font: 700 16px/1.25 Georgia, serif; }
    p { margin: 8px 0 13px; color: #5f6862; }
    button {
      padding: 6px 10px;
      border: 1px solid #c9c5b8;
      border-radius: 7px;
      color: #17201c;
      background: transparent;
      cursor: pointer;
      font: 600 12px/1.2 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    button:hover { background: #f3f0e8; }
  `;

  card.append(heading, detail, dismiss);
  shadow.append(style, card);
}
