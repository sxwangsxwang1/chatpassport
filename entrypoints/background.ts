import { browser } from "wxt/browser";
import { clearPendingTransfer, getPendingTransfer } from "../lib/pending";
import {
  canCompleteRelay,
  COMPLETE_PENDING_RELAY,
  createRelayResponse,
  GET_PENDING_RELAY,
  isRelayRequest,
} from "../lib/relay";

export default defineBackground(() => {
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  void browser.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  void getPendingTransfer();

  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    if (!isRelayRequest(message)) return undefined;

    const senderUrl = sender.tab?.url ?? sender.url ?? "";
    if (message.type === GET_PENDING_RELAY) {
      return getPendingTransfer().then((pending) => createRelayResponse(pending, senderUrl));
    }

    if (message.type === COMPLETE_PENDING_RELAY) {
      return getPendingTransfer().then(async (pending) => {
        if (!canCompleteRelay(pending, message.passportId, senderUrl)) return false;
        await clearPendingTransfer();
        return true;
      });
    }

    return undefined;
  });
});
