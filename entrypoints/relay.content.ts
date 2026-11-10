import { browser } from "wxt/browser";
import { beginComposerTransaction } from "../lib/adapters/composer";
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
  main(ctx) {
    ctx.onInvalidated?.(() => document.getElementById(STATUS_ELEMENT_ID)?.remove());
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
  let dismissed = false;
  const isActive = () => !dismissed && host.isConnected;
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
  heading.textContent = relay.currentRequest === undefined ? "Context ready · write your next question" : "Preparing your editable draft…";

  const detail = document.createElement("p");
  detail.textContent = relay.currentRequest === undefined
    ? `${relay.messageCount} selected messages from ${PROVIDER_LABELS[relay.source]}. Type in ${PROVIDER_LABELS[relay.target]}’s message box, then click Add context to draft. The website can read the draft once inserted; you send it yourself.`
    : `${relay.messageCount} selected messages from ${PROVIDER_LABELS[relay.source]}. Your draft will appear in the message box when it is ready. Review it, then use ${PROVIDER_LABELS[relay.target]}’s Send button yourself.`;

  const feedback = document.createElement("p");
  feedback.className = "feedback";
  feedback.hidden = true;

  const actions = document.createElement("div");
  actions.className = "actions";

  const continueButton = document.createElement("button");
  continueButton.type = "button";
  continueButton.className = "primary";
  continueButton.textContent = relay.currentRequest === undefined ? "Add context to draft" : "Insert prepared draft";
  continueButton.disabled = relay.currentRequest !== undefined;

  const recoveryButton = document.createElement("button");
  recoveryButton.type = "button";
  recoveryButton.textContent = relay.currentRequest === undefined ? "Copy original question" : "Copy next question";
  recoveryButton.hidden = true;
  const copyDraftButton = document.createElement("button");
  copyDraftButton.type = "button";
  copyDraftButton.textContent = "Copy prepared draft";
  copyDraftButton.hidden = relay.currentRequest === undefined;
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.textContent = "Dismiss";
  const elements: RelayElements = { host, card, heading, detail, feedback, continueButton, copyDraftButton, recoveryButton, dismissButton: dismiss };
  dismiss.addEventListener("click", () => {
    dismissed = true;
    elements.preparedDraft = undefined;
    host.remove();
  });

  continueButton.addEventListener("click", () => {
    void prepareContinuation(relay, elements, isActive);
  });
  copyDraftButton.addEventListener("click", () => {
    void copyPreparedDraft(relay, elements, isActive);
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
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    [hidden] { display: none !important; }
    .confirmation { margin-top: 12px; padding: 12px; background: #fff0cc; border-radius: 8px; }
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

  actions.append(continueButton, copyDraftButton, dismiss, recoveryButton);
  card.append(heading, detail, feedback, actions);
  shadow.append(style, card);
  if (relay.currentRequest !== undefined) {
    void autoPrepareContinuation(relay, elements, isActive);
  }
}

async function copyPreparedDraft(
  relay: ReadyRelayResponse, elements: RelayElements, isActive: () => boolean,
): Promise<void> {
  const button = elements.copyDraftButton;
  button.disabled = true;
  try {
    let text = elements.preparedDraft;
    if (text === undefined) {
      const response: unknown = await browser.runtime.sendMessage({
        type: COMPOSE_PENDING_RELAY, transferId: relay.transferId, currentRequest: relay.currentRequest ?? "",
      });
      if (!isActive()) return;
      if (!isRelayResponse(response) || response.status !== "composed" || response.transferId !== relay.transferId
        || response.omittedMessageCount !== relay.approvedOmittedMessageCount) {
        showError(elements, "The prepared draft is no longer available or its message count changed. Start the transfer again.");
        return;
      }
      text = response.text;
    }
    await navigator.clipboard.writeText(text);
    if (!isActive()) return;
    elements.feedback.hidden = false;
    elements.feedback.textContent = elements.preparedDraft === undefined
      ? "Draft copied. Paste it into the destination editor, review it, then click Send."
      : "Draft copied. You can paste it back if the website loses the inserted text. Review it before sending.";
  } catch {
    if (isActive()) showError(elements, elements.preparedDraft === undefined
      ? "Clipboard access failed. Try inserting the prepared draft after the editor loads."
      : "Clipboard access failed. Select the draft in the editor and copy it manually.");
  } finally {
    button.disabled = false;
  }
}

interface RelayElements {
  host: HTMLElement;
  card: HTMLElement;
  heading: HTMLElement;
  detail: HTMLElement;
  feedback: HTMLElement;
  continueButton: HTMLButtonElement;
  copyDraftButton: HTMLButtonElement;
  dismissButton: HTMLButtonElement;
  recoveryButton: HTMLButtonElement;
  preparedDraft?: string;
}

async function autoPrepareContinuation(relay: ReadyRelayResponse, elements: RelayElements, isActive: () => boolean): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (isActive() && Date.now() < deadline) {
    const transaction = beginComposerTransaction();
    if (transaction) {
      const hasExistingDraft = !!transaction.original.trim();
      transaction.dispose();
      if (hasExistingDraft) {
        showError(elements, "The destination already has a draft. Nothing was changed. Clear it, then click Insert prepared draft.");
        resetButton(elements.continueButton, relay);
        return;
      }
      await prepareContinuation(relay, elements, isActive);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (isActive()) {
    showError(elements, "The message box is not ready yet. Wait for it to appear, then click Insert prepared draft.");
    resetButton(elements.continueButton, relay);
  }
}

async function prepareContinuation(relay: ReadyRelayResponse, elements: RelayElements, isActive: () => boolean): Promise<void> {
  const transaction = beginComposerTransaction();
  if (!transaction) {
    showError(elements, "The message box is not ready yet. Wait for the page to finish loading and try again.");
    resetButton(elements.continueButton, relay);
    return;
  }
  const request = relay.currentRequest ?? transaction.original;
  elements.recoveryButton.hidden = true;
  elements.recoveryButton.onclick = async () => {
    try {
      await navigator.clipboard.writeText(request);
      elements.feedback.hidden = false;
      elements.feedback.textContent = "Question copied. You can paste it back into the message box.";
    } catch {
      showError(elements, `Clipboard unavailable. Your question: ${request}`);
    }
  };
  try {
    if (relay.currentRequest !== undefined && transaction.original.trim()) {
      showError(elements, "The destination already has a draft. Nothing was changed. Clear it, then click Insert prepared draft.");
      resetButton(elements.continueButton, relay);
      return;
    }
    if (!request.trim()) {
      showError(elements, "Type your next question in the message box first.");
      return;
    }

    elements.feedback.hidden = true;
    elements.continueButton.disabled = true;
    elements.continueButton.textContent = "Preparing…";
    elements.card.className = "card";
    elements.heading.textContent = "Preparing your draft…";

    let response: unknown;
    try {
      response = await browser.runtime.sendMessage({
        type: COMPOSE_PENDING_RELAY,
        transferId: relay.transferId,
        currentRequest: request,
      });
    } catch {
      if (!isActive()) return;
      showError(elements, "The extension could not prepare this transfer. Open ChatPassport and try again.");
      resetButton(elements.continueButton, relay);
      return;
    }
    if (!isActive()) return;

    if (!isRelayResponse(response) || response.status === "none") {
      showError(elements, "This transfer is no longer available. Start it again from the source conversation.");
      resetButton(elements.continueButton, relay);
      return;
    }
    if (response.status === "error") {
      showError(elements, response.message);
      resetButton(elements.continueButton, relay);
      return;
    }
    if (response.status !== "composed" || response.transferId !== relay.transferId) {
      showError(elements, "The extension returned an unexpected transfer response.");
      resetButton(elements.continueButton, relay);
      return;
    }

    if (response.omittedMessageCount > 0 && response.omittedMessageCount !== relay.approvedOmittedMessageCount) {
      const accepted = await confirmOmissions(response, elements);
      if (!accepted || !isActive()) {
        resetButton(elements.continueButton, relay);
        return;
      }
    }

    // A transfer may have been cleared or replaced after composition was queued.
    let current: unknown;
    try {
      current = await browser.runtime.sendMessage({ type: GET_PENDING_RELAY });
    } catch {
      if (!isActive()) return;
      showError(elements, "The extension could not verify this transfer. Open ChatPassport and try again.");
      resetButton(elements.continueButton, relay);
      return;
    }
    if (!isActive()) return;
    if (!isRelayResponse(current) || current.status !== "ready" || current.transferId !== relay.transferId) {
      showError(elements, "This transfer is no longer available. Start it again from the source conversation.");
      resetButton(elements.continueButton, relay);
      return;
    }

    await finishComposerReplacement(relay, response, transaction, elements, isActive);
  } catch {
    if (!isActive()) return;
    elements.recoveryButton.hidden = false;
    showError(elements, `The draft could not be verified. Review the editor. Your question: ${request}`);
    resetButton(elements.continueButton, relay);
  } finally {
    transaction.dispose();
  }
}

async function finishComposerReplacement(
  relay: ReadyRelayResponse,
  composed: ComposedRelayResponse,
  transaction: NonNullable<ReturnType<typeof beginComposerTransaction>>,
  elements: RelayElements,
  isActive: () => boolean,
): Promise<void> {
  if (!isActive()) return;
  // Once the synchronous write starts, Dismiss must not appear to cancel it.
  elements.dismissButton.disabled = true;
  let result: Awaited<ReturnType<typeof transaction.replace>>;
  try {
    result = await transaction.replace(composed.text);
  } finally {
    elements.dismissButton.disabled = false;
  }
  if (!result.success) {
    elements.recoveryButton.hidden = false;
    showError(elements, `${result.message}\nYour question: ${relay.currentRequest ?? transaction.original}`);
    resetButton(elements.continueButton, relay);
    return;
  }

  elements.card.className = "card success";
  elements.host.style.bottom = "auto";
  elements.host.style.top = "20px";
  elements.heading.textContent = "Draft added · review and send";
  elements.detail.textContent = composed.omittedMessageCount > 0
    ? `${composed.includedMessageCount} selected messages were added; ${composed.omittedMessageCount} older selected messages were omitted to stay within the safe size. If you downloaded the complete transcript, attach it here yourself before sending. Review the message, then click ${PROVIDER_LABELS[relay.target]}'s Send button.`
    : `All ${composed.includedMessageCount} selected messages and your new request were added. This does not verify that the source history was complete. Review the message, then click ${PROVIDER_LABELS[relay.target]}'s Send button.`;
  elements.feedback.hidden = true;
  elements.continueButton.remove();
  // The pending transfer is cleared below. Keep the verified draft on this
  // card so Copy prepared draft remains useful if the website later loses it.
  elements.preparedDraft = composed.text;
  elements.copyDraftButton.hidden = false;

  void browser.runtime.sendMessage({
    type: COMPLETE_PENDING_RELAY,
    transferId: relay.transferId,
  }).catch(() => false);
}

function showError(elements: RelayElements, message: string): void {
  elements.card.className = "card error";
  elements.heading.textContent = "Needs your attention";
  elements.feedback.textContent = message;
  elements.feedback.hidden = false;
}

function resetButton(button: HTMLButtonElement, relay?: ReadyRelayResponse): void {
  button.disabled = false;
  button.textContent = relay?.currentRequest === undefined ? "Add context to draft" : "Insert prepared draft";
}

/** Keep the editor untouched until the user approves the exact omission count. */
function confirmOmissions(composed: ComposedRelayResponse, elements: RelayElements): Promise<boolean> {
  elements.heading.textContent = "Review what will be included";
  elements.continueButton.hidden = true;
  const box = document.createElement("div");
  box.className = "confirmation";
  const text = document.createElement("p");
  text.textContent = `${composed.includedMessageCount} recent messages will be included; ${composed.omittedMessageCount} older messages will be left out. Your next question is included. Nothing has been inserted yet.`;
  const accept = document.createElement("button");
  accept.textContent = "Confirm and add context";
  accept.className = "primary";
  const cancel = document.createElement("button");
  cancel.textContent = "Go back";
  box.append(text, accept, cancel);
  elements.card.append(box);
  return new Promise((resolve) => {
    const finish = (accepted: boolean) => {
      elements.dismissButton.removeEventListener("click", onDismiss);
      box.remove();
      elements.continueButton.hidden = false;
      elements.heading.textContent = accepted ? "Preparing your draft…" : "Context ready · write your next question";
      resolve(accepted);
    };
    const onDismiss = () => finish(false);
    elements.dismissButton.addEventListener("click", onDismiss, { once: true });
    accept.addEventListener("click", () => finish(true), { once: true });
    cancel.addEventListener("click", () => finish(false), { once: true });
    accept.focus();
  });
}
