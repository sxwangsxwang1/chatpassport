import { browser } from "wxt/browser";
import { PENDING_COMMAND } from "../lib/pending";
import { createPending, createSerialQueue, EXPIRY_PREFIX, readPending, removePending, scheduleExpiry } from "../lib/transfer-store";
import { canCompleteRelay, COMPOSE_PENDING_RELAY, composeRelayResponse, COMPLETE_PENDING_RELAY, createRelayResponse, GET_PENDING_RELAY, isRelayRequest } from "../lib/relay";

export default defineBackground(() => {
  const serial = createSerialQueue();
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  void browser.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  void serial(async () => {
    const pending = await readPending();
    if (pending) await scheduleExpiry(pending);
  }).catch(console.error);

  browser.alarms.onAlarm.addListener((alarm) => {
    if (!alarm.name.startsWith(EXPIRY_PREFIX)) return;
    void serial(async () => {
      const pending = await readPending(); // expiration is enforced even for delayed alarms
      if (pending && alarm.name === EXPIRY_PREFIX + pending.transferId) await scheduleExpiry(pending);
    }).catch(console.error);
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    void serial(async () => {
      const pending = await readPending();
      if (pending?.targetTabId === tabId) await removePending(pending);
    }).catch(console.error);
  });

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    // Literal true + callback works on Chrome versions that cannot await a
    // returned Promise. Never make this listener itself async.
    const respond = (operation: () => Promise<unknown>): true => {
      void serial(operation).then(sendResponse, () => sendResponse({ status: 'error', ok: false, code: 'internal-error', error: 'Transfer failed.', message: 'The extension could not complete this transfer. Try again.' }))
        .catch(() => undefined); // The requesting tab/panel may have closed.
      return true;
    };
    if (sender.id !== browser.runtime.id) return undefined;
    if (message && typeof message === "object" && "type" in message && message.type === PENDING_COMMAND) {
      // Only the extension side panel may create, read raw data or clear transfers.
      if (sender.url !== browser.runtime.getURL("/sidepanel.html") || sender.tab) return undefined;
      const command = message as Record<string, unknown>;
      return respond(async () => {
        try {
          if (command.action === "save") return { ok: true, pending: await createPending(command.passport, command.target) };
          const pending = await readPending();
          if (command.action === "get") return { ok: true, pending };
          if (command.action === "clear" && pending && pending.transferId === command.transferId) {
            await removePending(pending);
            return { ok: true, pending: null };
          }
          return { ok: true, pending };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Transfer failed." };
        }
      });
    }
    if (!isRelayRequest(message)) return undefined;
    const identity = { url: sender.url ?? "", tabUrl: sender.tab?.url ?? "", tabId: sender.tab?.id ?? -1, frameId: sender.frameId ?? -1 };
    return respond(async () => {
      const pending = await readPending();
      if (message.type === GET_PENDING_RELAY) return createRelayResponse(pending, identity);
      if (message.type === COMPOSE_PENDING_RELAY) return composeRelayResponse(pending, message.transferId, message.currentRequest, identity);
      if (pending && message.type === COMPLETE_PENDING_RELAY && canCompleteRelay(pending, message.transferId, identity)) {
        await removePending(pending);
        return true;
      }
      return false;
    });
  });
});
