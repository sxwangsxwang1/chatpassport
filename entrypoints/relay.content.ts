import { browser } from "wxt/browser";
import { readComposerOnPage, replaceComposerOnPage } from "../lib/adapters/page";
import { PROVIDER_LABELS } from "../lib/core";
import {
  COMPOSE_PENDING_RELAY,
  COMPLETE_PENDING_RELAY,
  GET_PENDING_RELAY,
  isRelayResponse,
  type ComposedRelayResponse,
  type ReadyRelayResponse,
} from "../lib/relay";

const STATUS_ELEMENT_ID = "chatpassport-relay-status";

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
    void startStandbyRelay();
  },
});

async function startStandbyRelay(): Promise<void> {
  let response: unknown;
  try {
    response = await browser.runtime.sendMessage({ type: GET_PENDING_RELAY });
  } catch {
    return;
  }
  if (!isRelayResponse(response) || response.status !== "ready") return;
  showRelayReady(response);
}

function showRelayReady(relay: ReadyRelayResponse): void {
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
  card.setAttribute("role", "status");
  card.className = "card";

  const heading = document.createElement("strong");
  heading.textContent = "ChatPassport context is ready";

  const detail = document.createElement("p");
  detail.textContent = `${relay.messageCount} messages from ${PROVIDER_LABELS[relay.source]} are waiting. Type your next question in the message box, then continue with context.`;

  const feedback = document.createElement("p");
  feedback.className = "feedback";
  feedback.hidden = true;

  const actions = document.createElement("div");
  actions.className = "actions";

  const continueButton = document.createElement("button");
  continueButton.type = "button";
  continueButton.className = "primary";
  continueButton.textContent = "Continue with context";

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.textContent = "Dismiss";
  dismiss.addEventListener("click", () => host.remove());

  continueButton.addEventListener("click", () => {
    void prepareContinuation(relay, { card, heading, detail, feedback, continueButton });
  });

  const style = document.createElement("style");
  style.textContent = `
    .card {
      box-sizing: border-box;
      width: min(380px, calc(100vw - 40px));
      padding: 16px;
      border: 1px solid #d8d3c5;
      border-left: 5px solid #176044;
      border-radius: 12px;
      color: #17201c;
      background: #fffdf7;
      box-shadow: 0 14px 45px rgba(22, 28, 25, 0.2);
      font: 14px/1.45 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .card.error { border-left-color: #a43e34; }
    .card.success { border-left-color: #176044; }
    strong { display: block; font: 700 16px/1.25 Georgia, serif; }
    p { margin: 8px 0 13px; color: #5f6862; }
    .feedback { padding: 8px 10px; border-radius: 7px; color: #8a302a; background: #f8e7e4; }
    .actions { display: flex; gap: 8px; }
    button {
      padding: 7px 10px;
      border: 1px solid #c9c5b8;
      border-radius: 7px;
      color: #17201c;
      background: transparent;
      cursor: pointer;
      font: 600 12px/1.2 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    button.primary { border-color: #164c3a; color: #fff; background: #164c3a; }
    button:hover:not(:disabled) { filter: brightness(0.94); }
    button:disabled { cursor: wait; opacity: 0.55; }
  `;

  actions.append(continueButton, dismiss);
  card.append(heading, detail, feedback, actions);
  shadow.append(style, card);
}

interface RelayElements {
  card: HTMLElement;
  heading: HTMLElement;
  detail: HTMLElement;
  feedback: HTMLElement;
  continueButton: HTMLButtonElement;
}

async function prepareContinuation(relay: ReadyRelayResponse, elements: RelayElements): Promise<void> {
  const snapshot = readComposerOnPage();
  if (!snapshot.found) {
    showError(elements, "The message box is not ready yet. Wait for the page to finish loading and try again.");
    return;
  }
  if (!snapshot.text.trim()) {
    showError(elements, "Type your next question in the message box first.");
    return;
  }

  elements.feedback.hidden = true;
  elements.continueButton.disabled = true;
  elements.continueButton.textContent = "Preparing…";

  let response: unknown;
  try {
    response = await browser.runtime.sendMessage({
      type: COMPOSE_PENDING_RELAY,
      passportId: relay.passportId,
      currentRequest: snapshot.text,
    });
  } catch {
    showError(elements, "The extension could not prepare this transfer. Open ChatPassport and try again.");
    resetButton(elements.continueButton);
    return;
  }

  if (!isRelayResponse(response) || response.status === "none") {
    showError(elements, "This transfer is no longer available. Start it again from the source conversation.");
    resetButton(elements.continueButton);
    return;
  }
  if (response.status === "error") {
    showError(elements, response.message);
    resetButton(elements.continueButton);
    return;
  }
  if (response.status !== "composed") {
    showError(elements, "The extension returned an unexpected transfer response.");
    resetButton(elements.continueButton);
    return;
  }

  await finishComposerReplacement(relay, response, snapshot.text, elements);
}

async function finishComposerReplacement(
  relay: ReadyRelayResponse,
  composed: ComposedRelayResponse,
  originalRequest: string,
  elements: RelayElements,
): Promise<void> {
  const result = replaceComposerOnPage(composed.text, originalRequest);
  if (!result.success) {
    showError(elements, result.message);
    resetButton(elements.continueButton);
    return;
  }

  await new Promise<void>((resolve) => window.setTimeout(resolve, 150));
  const verification = readComposerOnPage();
  if (!verification.found || verification.text !== composed.text) {
    if (verification.found && verification.text !== originalRequest) {
      replaceComposerOnPage(originalRequest, verification.text);
    }
    showError(
      elements,
      "The platform changed or truncated the combined draft after insertion. Your original question was restored when possible.",
    );
    resetButton(elements.continueButton);
    return;
  }

  elements.card.className = "card success";
  elements.heading.textContent = "Continuation is ready";
  elements.detail.textContent = composed.omittedMessageCount > 0
    ? `${composed.includedMessageCount} recent messages were added; ${composed.omittedMessageCount} older messages were omitted to stay within the safe size. Review the message, then click ${PROVIDER_LABELS[relay.target]}'s Send button.`
    : `All ${composed.includedMessageCount} selected messages and your new request were added. This does not verify that the source history was complete. Review the message, then click ${PROVIDER_LABELS[relay.target]}'s Send button.`;
  elements.feedback.hidden = true;
  elements.continueButton.remove();

  void browser.runtime.sendMessage({
    type: COMPLETE_PENDING_RELAY,
    passportId: relay.passportId,
  }).catch(() => false);
}

function showError(elements: RelayElements, message: string): void {
  elements.card.className = "card error";
  elements.feedback.textContent = message;
  elements.feedback.hidden = false;
}

function resetButton(button: HTMLButtonElement): void {
  button.disabled = false;
  button.textContent = "Continue with context";
}
