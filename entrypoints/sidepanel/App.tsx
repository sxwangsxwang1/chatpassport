import { useEffect, useMemo, useRef, useState } from "react";
import { browser } from "wxt/browser";
import {
  buildHandoffPrompt,
  formatBytes,
  passportToMarkdown,
  PROVIDER_LABELS,
  PROVIDER_URLS,
  safeFilename,
  SESSION_MAX_BYTES,
  SESSION_WARN_BYTES,
} from "../../lib/core";
import { extractActiveConversation, fillActiveComposer, getActiveTabContext } from "../../lib/browser";
import {
  clearPendingTransfer,
  getPendingTransfer,
  savePendingTransfer,
  type PendingTransfer,
} from "../../lib/pending";
import {
  parsePassport,
  passportSize,
  PROVIDERS,
  serializePassport,
  type Passport,
  type Provider,
} from "../../lib/passport";

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
  const [activeProvider, setActiveProvider] = useState<Provider | null>(null);
  const [passport, setPassport] = useState<Passport | null>(null);
  const [pending, setPending] = useState<PendingTransfer | null>(null);
  const [target, setTarget] = useState<Provider>("claude");
  const [limit, setLimit] = useState<MessageLimit>("all");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>("");
  const [noticeKind, setNoticeKind] = useState<"info" | "success" | "error">("info");

  const selected = pending?.passport ?? passport ?? null;
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
    if (!selected) return "";
    return buildHandoffPrompt(selected, limit === "all" ? undefined : Number(limit));
  }, [selected, limit]);

  function showNotice(message: string, kind: "info" | "success" | "error" = "info") {
    setNotice(message);
    setNoticeKind(kind);
  }

  async function refreshContext() {
    try {
      const [tab, stored] = await Promise.all([getActiveTabContext(), getPendingTransfer()]);
      setActiveProvider(tab.provider);
      setPending(stored);
      if (stored) setTarget(stored.target);
    } catch (error) {
      showNotice(errorMessage(error), "error");
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
      browser.tabs.onActivated.removeListener(onTabChanged);
      browser.tabs.onUpdated.removeListener(onTabChanged);
      browser.storage.onChanged.removeListener(onStorageChanged);
      window.removeEventListener("focus", onWindowFocus);
    };
  }, []);

  async function scanConversation() {
    setBusy(true);
    showNotice("Reading the visible conversation…");
    try {
      const extracted = await extractActiveConversation();
      setPassport(extracted);
      const nextTarget = PROVIDERS.find((provider) => provider !== extracted.source.provider);
      if (nextTarget) setTarget(nextTarget);
      showNotice(`Found ${extracted.messages.length} messages. Nothing has been saved yet.`, "success");
    } catch (error) {
      showNotice(errorMessage(error), "error");
    } finally {
      setBusy(false);
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
      await savePendingTransfer(transferablePassport, target);
      const stored = await getPendingTransfer();
      setPending(stored);
      showNotice(`Opening ${PROVIDER_LABELS[target]}. ChatPassport will fill its empty message box automatically.`, "success");
      await browser.tabs.create({ url: PROVIDER_URLS[target] });
    } catch (error) {
      showNotice(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function fillComposer() {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await fillActiveComposer(context);
      if (result.success && pending) {
        await clearPendingTransfer();
        setPending(null);
      }
      showNotice(result.message, result.success ? "success" : "error");
    } catch (error) {
      showNotice(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function copyContext() {
    if (!context) return;
    try {
      await navigator.clipboard.writeText(context);
      showNotice("Context copied. Paste it into any assistant and review before sending.", "success");
    } catch {
      showNotice("Clipboard access failed. Export the conversation as Markdown instead.", "error");
    }
  }

  async function clearPending() {
    await clearPendingTransfer();
    setPending(null);
    showNotice("Temporary transfer cleared.", "success");
  }

  async function importFile(file: File) {
    setBusy(true);
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error("Files larger than 25 MB are not supported.");
      const imported = parsePassport(JSON.parse(await file.text()));
      setPassport(imported);
      const nextTarget = activeProvider ?? PROVIDERS.find((provider) => provider !== imported.source.provider);
      if (nextTarget) setTarget(nextTarget);
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
            <br />The destination will fill automatically when its message box is ready.
          </p>
          {activeProvider === pending.target && (
            <button className="primary" onClick={fillComposer} disabled={busy}>
              Retry filling {PROVIDER_LABELS[activeProvider]}
            </button>
          )}
          <div className="button-row">
            <button className="secondary" onClick={copyContext} disabled={busy}>Copy context</button>
            <button className="text-button danger" onClick={clearPending}>Clear</button>
          </div>
        </section>
      )}

      <section className="card capture-card">
        <div className="step-number">1</div>
        <div className="section-heading">
          <div className="eyebrow">Capture</div>
          <h2>Read this conversation</h2>
        </div>
        <p>ChatPassport only reads the active tab after you click the button.</p>
        <button className="primary" onClick={scanConversation} disabled={busy || !activeProvider}>
          {busy ? "Working…" : "Preview current conversation"}
        </button>
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
            <div><dt>Messages</dt><dd>{passport.messages.length}</dd></div>
            <div><dt>Size</dt><dd>{formatBytes(previewSize)}</dd></div>
          </dl>
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
                className={target === provider ? "provider selected" : "provider"}
                onClick={() => setTarget(provider)}
              >
                {PROVIDER_LABELS[provider]}
              </button>
            ))}
          </div>
          <label className="field-label" htmlFor="message-limit">Context range</label>
          <select id="message-limit" value={limit} onChange={(event) => setLimit(event.target.value as MessageLimit)}>
            <option value="all">Entire conversation</option>
            <option value="100">Latest 100 messages</option>
            <option value="50">Latest 50 messages</option>
            <option value="20">Latest 20 messages</option>
          </select>
          <button className="primary" onClick={prepareTransfer} disabled={busy || transferableSize > SESSION_MAX_BYTES}>
            Import into {PROVIDER_LABELS[target]}
          </button>
          <p className="privacy-note">
            Opens the destination and fills an empty message box. You review and send it yourself.
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
