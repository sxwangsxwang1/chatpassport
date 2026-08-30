import { browser } from "wxt/browser";
import { getPendingTransfer } from "../lib/pending";

export default defineBackground(() => {
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  void browser.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  void getPendingTransfer();
});
