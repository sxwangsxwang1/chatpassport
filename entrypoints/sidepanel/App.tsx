import { useEffect, useMemo, useRef, useState } from "react";
import { browser } from "wxt/browser";
import {
  buildHandoffPrompt,
  formatBytes,
  passportToMarkdown,
  PROVIDER_LABELS,
  safeFilename,
  SESSION_MAX_BYTES,
  SESSION_WARN_BYTES,
} from "../../lib/core";
import { extractActiveConversation, getActiveTabContext } from "../../lib/browser";
import {
  clearPendingTransfer,
  getPendingTransfer,
  savePendingTransfer,
  type PendingTransfer,
} from "../../lib/pending";
import {
  parsePassport,
  PASSPORT_MAX_BYTES,
  passportSize,
  PROVIDERS,
  serializePassport,
  type Passport,
  type Provider,
} from "../../lib/passport";
import { RELAY_MAX_DRAFT_CHARS } from "../../lib/relay";

type MessageLimit = "all" | "20" | "50" | "100";

function triggerDownload(contents: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

export default function App() {
  const fileInput = useRef<HTMLInputElement>(null);
  const captureController = useRef<AbortController | null>(null);
  const refreshGeneration = useRef(0);
  const [capturing, setCapturing] = useState(false);
  const [activeProvider, setActiveProvider] = useState<Provider | null>(null);
  const [passport, setPassport] = useState<Passport | null>(null);
  const [previewOrigin, setPreviewOrigin] = useState<"page" | "file">("page");
  const [pending, setPending] = useState<PendingTransfer | null>(null);
  const [target, setTarget] = useState<Provider>("claude");
  const [limit, setLimit] = useState<MessageLimit>("all");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>("");
  const [noticeKind, setNoticeKind] = useState<"info" | "success" | "error">("info");

  const previewSize = useMemo(() => passport ? passportSize(passport) : 0, [passport]);
  const transferablePassport = useMemo(() => {
    if (!passport || limit === "all") return passport;
    return { ...passport, messages: passport.messages.slice(-Number(limit)) };
  }, [passport, limit]);
  const transferableSize = useMemo(
    () => transferablePassport ? passportSize(transferablePassport) : 0,
    [transferablePassport],
  );
  const context = useMemo(() => {
    return pending ? buildHandoffPrompt(pending.passport) : "";
  }, [pending]);

  function showNotice(message: string, kind: "info" | "success" | "error" = "info") {
    setNotice(message);
    setNoticeKind(kind);
  }

  async function refreshContext() {
    const generation = ++refreshGeneration.current;
    try {
      const [tab, stored] = await Promise.all([getActiveTabContext(), getPendingTransfer()]);
      if (generation !== refreshGeneration.current) return;
      setActiveProvider(tab.provider);
      setPending(stored);
    } catch (error) {
      if (generation === refreshGeneration.current) showNotice(errorMessage(error), "error");
    }
  }

  useEffect(() => {
    void refreshContext();
    const onTabChanged = () => void refreshContext();
    const onWindowFocus = () => void refreshContext();
    const onStorageChanged = () => void refreshContext();
    browser.tabs.onActivated.addListener(onTabChanged);
    browser.tabs.onUpdated.addListener(onTabChanged);
    browser.storage.onChanged.addListener(onStorageChanged);
    window.addEventListener("focus", onWindowFocus);
    return () => {
      captureController.current?.abort();
      refreshGeneration.current++;
      browser.tabs.onActivated.removeListener(onTabChanged);
      browser.tabs.onUpdated.removeListener(onTabChanged);
      browser.storage.onChanged.removeListener(onStorageChanged);
      window.removeEventListener("focus", onWindowFocus);
    };
  }, []);

  async function scanConversation() {
    setBusy(true);
    setCapturing(true);
    const controller = new AbortController();
    captureController.current = controller;
    showNotice("Loading conversation history. Please leave this conversation unchanged…");
    try {
      const extracted = await extractActiveConversation({
        signal: controller.signal,
        onProgress: (count, phase) => showNotice(`${phase}… ${count} messages collected. You can stop and keep partial results.`),
      });
      setPassport(extracted);
      setPreviewOrigin("page");
      setLimit("all");
      setTarget((current) => current !== extracted.source.provider ? current : PROVIDERS.find((provider) => provider !== extracted.source.provider)!);
      showNotice(`Captured ${extracted.messages.length} messages. ${extracted.capture?.reason}`, extracted.capture?.status === "partial" ? "info" : "success");
    } catch (error) {
      showNotice(errorMessage(error), "error");
    } finally {
      setBusy(false);
      setCapturing(false);
      captureController.current = null;
    }
  }

  async function prepareTransfer() {
    if (!transferablePassport) return;
    if (transferableSize > SESSION_MAX_BYTES) {
      showNotice("This conversation is over 9 MB. Save it as a file or choose fewer messages.", "error");
      return;
    }

    setBusy(true);
    try {
      ++refreshGeneration.current;
      const stored = await savePendingTransfer(transferablePassport, target);
      ++refreshGeneration.current;
      setPending(stored);
      showNotice(`Opening ${PROVIDER_LABELS[target]}. Type your next question there, then choose Continue with context.`, "success");
    } catch (error) {
      showNotice(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function copyContext() {
    if (!context) return;
    try {
      const stored = await getPendingTransfer();
      if (!stored || stored.transferId !== pending?.transferId) {
        await refreshContext();
        showNotice("This transfer expired or was replaced. Start a new transfer.", "error");
        return;
      }
      const currentContext = buildHandoffPrompt(stored.passport);
      if (currentContext.length > RELAY_MAX_DRAFT_CHARS) {
        showNotice("This saved transfer is too large to copy. Prepare a new transfer with fewer messages, or export the preview as a file.", "error");
        return;
      }
      await navigator.clipboard.writeText(currentContext);
      showNotice("Context copied. Paste it into any assistant and review before sending.", "success");
    } catch {
      showNotice("Clipboard access failed. Export the conversation as Markdown instead.", "error");
    }
  }

  async function clearPending() {
    if (!pending) return;
    try {
      await clearPendingTransfer(pending.transferId);
      await refreshContext();
      showNotice("Temporary transfer cleared.", "success");
    } catch (error) { showNotice(errorMessage(error), "error"); }
  }

  async function importFile(file: File) {
    setBusy(true);
    try {
      if (file.size > PASSPORT_MAX_BYTES) throw new Error("Files larger than 25 MiB are not supported.");
      const imported = parsePassport(JSON.parse(await file.text()));
      setPassport(imported);
      setPreviewOrigin("file");
      setLimit("all");
      setTarget((current) => current !== imported.source.provider ? current : PROVIDERS.find((provider) => provider !== imported.source.provider)!);
      showNotice(`Imported ${imported.messages.length} messages from ${file.name}.`, "success");
    } catch (error) {
      showNotice(`Could not import this file: ${errorMessage(error)}`, "error");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
      setBusy(false);
    }
  }

  const sourceLabel = passport ? PROVIDER_LABELS[passport.source.provider] : null;
  const currentLabel = activeProvider ? PROVIDER_LABELS[activeProvider] : "Unsupported page";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">CP</div>
        <div>
          <h1>ChatPassport</h1>
          <p>Carry the context. Keep control.</p>
        </div>
        <span className={`platform-dot ${activeProvider ? "online" : ""}`} title={currentLabel} />
      </header>

      <section className="current-page">
        <span>Current page</span>
        <strong>{currentLabel}</strong>
      </section>

      {pending && (
        <section className="card pending-card">
          <div className="eyebrow">Pending transfer</div>
          <h2>{pending.passport.title}</h2>
          <p>
            {pending.passport.messages.length} messages · {formatBytes(passportSize(pending.passport))}
            <br />Destination: {PROVIDER_LABELS[pending.target]}
            <br />Type a new question on the destination, then choose Continue with context.
          </p>
          <div className="button-row">
            <button className="secondary" onClick={copyContext} disabled={busy}>Copy context only</button>
            <button className="text-button danger" onClick={clearPending} disabled={busy}>Clear</button>
          </div>
        </section>
      )}

      <section className="card capture-card">
        <div className="step-number">1</div>
        <div className="section-heading">
          <div className="eyebrow">Capture</div>
          <h2>Read this conversation</h2>
        </div>
        <p>Loads older messages by scrolling the active conversation, collects rendered history, then restores your scroll position. Keep this conversation unchanged during capture.</p>
        <button className="primary" onClick={scanConversation} disabled={busy || !activeProvider}>
          {busy ? "Working…" : "Capture conversation history"}
        </button>
        {capturing && <button className="secondary" onClick={() => captureController.current?.abort()}>Stop and keep collected messages</button>}
      </section>

      <div className="or-divider"><span>or</span></div>

      <button className="import-button" onClick={() => fileInput.current?.click()} disabled={busy}>
        <span aria-hidden="true">↑</span>
        Import a .chatpassport.json file
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".json,.chatpassport.json,application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importFile(file);
        }}
      />

      {passport && (
        <section className="card preview-card">
          <div className="step-number">2</div>
          <div className="section-heading">
            <div className="eyebrow">Preview</div>
            <h2>{passport.title}</h2>
          </div>
          <dl className="stats">
            <div><dt>Source</dt><dd>{sourceLabel}</dd></div>
            <div><dt>{previewOrigin === "page" ? "Detected" : "Imported"}</dt><dd>{passport.messages.length}</dd></div>
            <div><dt>Size</dt><dd>{formatBytes(previewSize)}</dd></div>
          </dl>
          <p className="warning">
            {previewOrigin === "page"
              ? passport.capture?.reason ?? "History completeness has not been verified."
              : "Only messages in this file are included. The original capture may not contain the complete conversation."}
          </p>
          {previewSize > SESSION_WARN_BYTES && (
            <p className="warning">
              This is a large conversation. Use a recent-message limit or save it as a file.
            </p>
          )}
          <div className="export-row">
            <button
              className="secondary"
              onClick={() => triggerDownload(serializePassport(passport), safeFilename(passport.title, "json"), "application/json")}
            >
              Save JSON
            </button>
            <button
              className="secondary"
              onClick={() => triggerDownload(passportToMarkdown(passport), safeFilename(passport.title, "md"), "text/markdown")}
            >
              Save Markdown
            </button>
          </div>
        </section>
      )}

      {passport && (
        <section className="card transfer-card">
          <div className="step-number">3</div>
          <div className="section-heading">
            <div className="eyebrow">Transfer</div>
            <h2>Choose a destination</h2>
          </div>
          <div className="provider-grid">
            {PROVIDERS.filter((provider) => provider !== passport.source.provider).map((provider) => (
              <button
                key={provider}
                disabled={busy}
                className={target === provider ? "provider selected" : "provider"}
                onClick={() => setTarget(provider)}
              >
                {PROVIDER_LABELS[provider]}
              </button>
            ))}
          </div>
          <label className="field-label" htmlFor="message-limit">Context range</label>
          <select id="message-limit" disabled={busy} value={limit} onChange={(event) => setLimit(event.target.value as MessageLimit)}>
            <option value="all">{previewOrigin === "page" ? "All detected messages" : "All imported messages"}</option>
            <option value="100">Latest 100 available messages</option>
            <option value="50">Latest 50 available messages</option>
            <option value="20">Latest 20 available messages</option>
          </select>
          <button className="primary" onClick={prepareTransfer} disabled={busy || transferableSize > SESSION_MAX_BYTES}>
            Import into {PROVIDER_LABELS[target]}
          </button>
          <p className="privacy-note">
            Opens one destination tab in standby mode. After you click Continue with context, that website can read or sync the inserted draft before Send. ChatPassport never sends it automatically.
          </p>
        </section>
      )}

      {notice && <div className={`notice ${noticeKind}`} role="status">{notice}</div>}

      <footer>
        Local only · No account · No tracking
      </footer>
    </main>
  );
}
