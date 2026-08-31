import { browser } from "wxt/browser";
import { clearActiveInvocation, saveActiveInvocation } from "../lib/invocation";
import { getPendingTransfer } from "../lib/pending";

export default defineBackground(() => {
  // Handle action clicks ourselves so Chrome grants activeTab before the side
  // panel tries to identify the current page.
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

  browser.action.onClicked.addListener((tab) => {
    if (tab.id === undefined || tab.windowId === undefined || !tab.url) return;
    // sidePanel.open must be invoked synchronously in the user-click task.
    // Awaiting storage first would consume Chrome's transient user gesture.
    const openingPanel = browser.sidePanel.open({ windowId: tab.windowId });
    const savingInvocation = saveActiveInvocation(tab.id, tab.url);
    void Promise.all([openingPanel, savingInvocation]).catch((error: unknown) => {
      console.error("Could not open ChatPassport", error);
    });
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === "loading") void clearActiveInvocation(tabId);
  });
  browser.tabs.onRemoved.addListener((tabId) => void clearActiveInvocation(tabId));

  void browser.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  void getPendingTransfer();
});
