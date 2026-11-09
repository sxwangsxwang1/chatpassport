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
  PENDING_KEY,
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
import { planContinuation, RELAY_MAX_DRAFT_CHARS, RELAY_MAX_REQUEST_CHARS } from "../../lib/relay";

type MessageLimit = "all" | "20" | "50" | "100" | "custom";
const PREVIEW_PAGE_SIZE = 30;

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
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
  const [messageSearch, setMessageSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PREVIEW_PAGE_SIZE);
  const [mode, setMode] = useState<"loaded" | "history">("history");
  const [nextQuestion, setNextQuestion] = useState("");
  const [omissionsApproved, setOmissionsApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>("");
  const [noticeKind, setNoticeKind] = useState<"info" | "success" | "error">("info");

  const previewSize = useMemo(() => passport ? passportSize(passport) : 0, [passport]);
  const transferablePassport = useMemo(() => {
    if (!passport) return null;
    if (limit === "all") return passport;
    const messages = limit === "custom"
      ? passport.messages.filter((_, index) => selectedIndexes.has(index))
      : passport.messages.slice(-Number(limit));
    return messages.length ? { ...passport, messages } : null;
  }, [passport, limit, selectedIndexes]);
  const transferableSize = useMemo(
    () => transferablePassport ? passportSize(transferablePassport) : 0,
    [transferablePassport],
  );
  const plan = useMemo(
    () => transferablePassport ? planContinuation(transferablePassport, nextQuestion) : null,
    [transferablePassport, nextQuestion],
  );
  const previewMessages = useMemo(() => {
    if (!passport) return [];
    const query = messageSearch.trim().toLocaleLowerCase();
    return passport.messages.flatMap((message, index) => {
      const text = message.content.map((part) => part.text).join("\n");
      return !query || text.toLocaleLowerCase().includes(query) ? [{ index, message, text }] : [];
    });
  }, [passport, messageSearch]);
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
    const onTabUpdated = (_tabId: number, changeInfo: { url?: string }, tab: { active?: boolean }) => {
      if (tab.active && changeInfo.url) void refreshContext();
    };
    const onWindowFocus = () => void refreshContext();
    const onStorageChanged = (changes: Record<string, unknown>, areaName: string) => {
      if (areaName === "session" && PENDING_KEY in changes) void refreshContext();
    };
    browser.tabs.onActivated.addListener(onTabChanged);
    browser.tabs.onUpdated.addListener(onTabUpdated);
    browser.storage.onChanged.addListener(onStorageChanged);
    window.addEventListener("focus", onWindowFocus);
    return () => {
      captureController.current?.abort();
      refreshGeneration.current++;
      browser.tabs.onActivated.removeListener(onTabChanged);
      browser.tabs.onUpdated.removeListener(onTabUpdated);
      browser.storage.onChanged.removeListener(onStorageChanged);
      window.removeEventListener("focus", onWindowFocus);
    };
  }, []);

  async function scanConversation() {
    setBusy(true);
    setCapturing(true);
    const controller = new AbortController();
    captureController.current = controller;
    showNotice(mode === "history" ? "Loading conversation history. Keep this conversation open…" : "Reading currently loaded messages…");
    try {
      const extracted = await extractActiveConversation({
        mode,
        signal: controller.signal,
        onProgress: (count, phase) => showNotice(`${phase}… ${count} messages collected. You can stop and keep partial results.`),
      });
      setPassport(extracted);
      setLimit("all");
      setSelectedIndexes(new Set());
      setMessageSearch("");
      setVisibleCount(PREVIEW_PAGE_SIZE);
      setNextQuestion("");
      setOmissionsApproved(false);
      setPreviewOrigin("page");
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
    if (!transferablePassport || plan?.status !== "composed") return;
    if (plan.omittedMessageCount > 0 && !omissionsApproved) return;
    if (transferableSize > SESSION_MAX_BYTES) {
      showNotice("This conversation is over 9 MB. Save it as a file or choose fewer messages.", "error");
      return;
    }

    setBusy(true);
    try {
      ++refreshGeneration.current;
      const stored = await savePendingTransfer(transferablePassport, selectedTarget, nextQuestion, omissionsApproved);
      ++refreshGeneration.current;
      setPending(stored);
      showNotice(`Opening an editable draft in ${PROVIDER_LABELS[selectedTarget]}. Review it there, then click Send.`, "success");
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
      setNextQuestion("");
      setOmissionsApproved(false);
      setPreviewOrigin("file");
      setLimit("all");
      setSelectedIndexes(new Set());
      setMessageSearch("");
      setVisibleCount(PREVIEW_PAGE_SIZE);
      showNotice(`Imported ${imported.messages.length} messages from ${file.name}.`, "success");
    } catch (error) {
      showNotice(`Could not import this file: ${errorMessage(error)}`, "error");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
      setBusy(false);
    }
  }

  const sourceLabel = passport ? PROVIDER_LABELS[passport.source.provider] : null;
  const sourceProvider = passport?.source.provider ?? activeProvider;
  const selectedTarget = target;
  const selectedMessageCount = transferablePassport?.messages.length ?? 0;
  function isSelected(index: number): boolean {
    if (limit === "all") return true;
    if (limit === "custom") return selectedIndexes.has(index);
    return index >= (passport?.messages.length ?? 0) - Number(limit);
  }
  function selectMessage(index: number, checked: boolean) {
    setSelectedIndexes((current) => {
      const next = new Set(current);
      if (checked) next.add(index); else next.delete(index);
      return next;
    });
    setOmissionsApproved(false);
  }
  const currentLabel = activeProvider ? PROVIDER_LABELS[activeProvider] : "Unsupported page";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">CP</div>
        <div>
          <h1>ChatPassport</h1>
          <p>Switch assistants. Keep your context.</p>
        </div>
        <span className={`platform-dot ${activeProvider ? "online" : ""}`} title={currentLabel} />
      </header>

      <section className="current-page">
        <span>Current page</span>
        <strong>{currentLabel}</strong>
      </section>

      {pending && (
        <section className="card pending-card">
          <div className="eyebrow">Ready in another tab</div>
          <h2>{pending.passport.title}</h2>
          <p>
            {pending.passport.messages.length} messages · {formatBytes(passportSize(pending.passport))}
            <br />Destination: {PROVIDER_LABELS[pending.target]}
            <br />{pending.currentRequest ? "The prepared draft will appear in the destination editor. Review it before sending." : "Type a new question on the destination, then add context to the draft."}
          </p>
          <div className="button-row">
            <button className="secondary" onClick={copyContext} disabled={busy}>Copy saved context</button>
            <button className="text-button danger" onClick={clearPending} disabled={busy}>Clear</button>
          </div>
        </section>
      )}

      <section className="card transfer-card">
        <div className="eyebrow">Keep the conversation going</div>
        <h2>Where would you like to continue?</h2>
        <div className="provider-grid" aria-label="Destination assistant">
          {PROVIDERS.map((provider) => (
            <button key={provider} disabled={busy} aria-pressed={selectedTarget === provider}
              className={selectedTarget === provider ? "provider selected" : "provider"}
              onClick={() => setTarget(provider)}>{PROVIDER_LABELS[provider]}{provider === sourceProvider ? " · new chat" : ""}</button>
          ))}
        </div>
        {!activeProvider && !passport && <p>Open a conversation on ChatGPT, Claude, Gemini, or DeepSeek to begin. You can also import a saved file below.</p>}
        {!passport && <>
          <label className="field-label" htmlFor="capture-mode">Messages to read</label>
          <select id="capture-mode" value={mode} disabled={busy} onChange={(event) => setMode(event.target.value as "loaded" | "history")}>
            <option value="history">Load history — scroll to find older messages</option>
            <option value="loaded">Quick — currently loaded messages only</option>
          </select>
          <p>{mode === "loaded"
            ? "No scrolling or history wait. Older or virtualized messages may be missing."
            : "Loads older messages, then restores your position. May take up to two minutes; keep this conversation unchanged."}</p>
          <button className="primary" onClick={scanConversation} disabled={busy || !activeProvider}>
            {capturing ? "Reading messages…" : `Prepare for ${PROVIDER_LABELS[selectedTarget]}`}
          </button>
        </>}
        {capturing && <button className="secondary stop-button" onClick={() => captureController.current?.abort()}>Stop and use collected messages</button>}
        {notice && !passport && <div className={`notice ${noticeKind}`} role="status">{notice}</div>}
        {passport && <>
          <div className="conversation-summary">
            <strong>{passport.title}</strong>
            <p>{sourceLabel} · {passport.messages.length} messages read · {formatBytes(previewSize)}</p>
          </div>
          <p className={passport.capture?.status === "page-history" ? "coverage" : "warning"}>
            {previewOrigin === "page"
              ? passport.capture?.reason ?? "History completeness has not been verified."
              : "Only messages in the imported file are included; source history may be incomplete."}
          </p>
          <p>{selectedMessageCount} of {passport.messages.length} messages selected{limit !== "all" ? `; ${passport.messages.length - selectedMessageCount} excluded by your selection.` : "."}</p>
          <label className="field-label" htmlFor="message-limit">Messages to transfer</label>
          <select id="message-limit" disabled={busy} value={limit} onChange={(event) => {
            const nextLimit = event.target.value as MessageLimit;
            if (nextLimit === "custom" && limit !== "custom") {
              const start = limit === "all" ? 0 : Math.max(0, passport.messages.length - Number(limit));
              setSelectedIndexes(new Set(passport.messages.map((_, index) => index).filter((index) => index >= start)));
            }
            setLimit(nextLimit);
            setOmissionsApproved(false);
          }}>
            <option value="all">All captured messages</option>
            <option value="100">Latest 100 available messages</option>
            <option value="50">Latest 50 available messages</option>
            <option value="20">Latest 20 available messages</option>
            <option value="custom">Choose individual messages</option>
          </select>
          {limit === "custom" && <div className="selection-actions">
            <button className="text-button" disabled={busy} onClick={() => { setSelectedIndexes(new Set(passport.messages.map((_, index) => index))); setOmissionsApproved(false); }}>Select all</button>
            <button className="text-button" disabled={busy} onClick={() => { setSelectedIndexes(new Set()); setOmissionsApproved(false); }}>Clear selection</button>
          </div>}
          <details className="message-preview">
            <summary>Review all messages and choose what to transfer</summary>
            <label className="field-label" htmlFor="message-search">Find a message</label>
            <input id="message-search" type="search" value={messageSearch} onChange={(event) => { setMessageSearch(event.target.value); setVisibleCount(PREVIEW_PAGE_SIZE); }} placeholder="Search conversation text" />
            <p>{previewMessages.length} matching messages. Showing full text in capture order.</p>
            <ol>
              {previewMessages.slice(0, visibleCount).map(({ index, message, text }) => <li key={`${index}-${message.id}`}>
                <label className="message-heading">
                  <input type="checkbox" checked={isSelected(index)} disabled={busy || limit !== "custom"} onChange={(event) => selectMessage(index, event.target.checked)} />
                  <strong>{message.role === "assistant" ? "Assistant" : message.role === "user" ? "You" : "System"} · {index + 1}</strong>
                </label>
                <p>{text}</p>
              </li>)}
            </ol>
            {visibleCount < previewMessages.length && <button className="secondary preview-more" onClick={() => setVisibleCount((count) => count + PREVIEW_PAGE_SIZE)}>Show next {Math.min(PREVIEW_PAGE_SIZE, previewMessages.length - visibleCount)} messages</button>}
            {limit !== "custom" && <p>Choose “Choose individual messages” above to change the checked messages.</p>}
          </details>
          {selectedMessageCount === 0 && <p className="warning">Select at least one message to continue.</p>}
          <label className="field-label" htmlFor="next-question">Your next question</label>
          <textarea id="next-question" value={nextQuestion} maxLength={RELAY_MAX_REQUEST_CHARS} disabled={busy}
            placeholder="What would you like to ask next?" onChange={(event) => {
              setNextQuestion(event.target.value);
              setOmissionsApproved(false);
            }} />
          <p className="question-count">{nextQuestion.length.toLocaleString()} / {RELAY_MAX_REQUEST_CHARS.toLocaleString()} characters</p>
          {plan?.status === "error" && nextQuestion.trim() && <p className="warning">{plan.message}</p>}
          {plan?.status === "composed" && <p className={plan.omittedMessageCount > 0 ? "warning" : "coverage"}>
            {plan.includedMessageCount} of {transferablePassport?.messages.length} selected messages will be included.
            {plan.omittedMessageCount > 0 ? ` ${plan.omittedMessageCount} older messages will be omitted.` : " No additional messages will be omitted."}
            {" "}{plan.characterCount.toLocaleString()} / 48,000 draft characters. The destination may have a smaller limit.
          </p>}
          {plan?.status === "composed" && plan.omittedMessageCount > 0 && <label className="omission-confirmation">
            <input type="checkbox" checked={omissionsApproved} onChange={(event) => setOmissionsApproved(event.target.checked)} />
            <span>I understand that {plan.omittedMessageCount} older messages will be omitted.</span>
          </label>}
          {plan?.status === "composed" && (plan.omittedMessageCount > 0 || selectedMessageCount < passport.messages.length) && <div className="transcript-option">
            <strong>Need the complete captured conversation?</strong>
            <p>Save its Markdown transcript, then attach the file on the destination website before you send. ChatPassport cannot verify or upload that attachment for you. The draft itself contains only the messages counted above.</p>
            <button className="secondary" onClick={() => triggerDownload(passportToMarkdown(passport), safeFilename(passport.title, "md"), "text/markdown")}>Download complete transcript to attach</button>
          </div>}
          {transferableSize > SESSION_WARN_BYTES && <p className="warning">Large transfer. Select fewer messages above or export a file.</p>}
          <button className="primary" onClick={prepareTransfer} disabled={busy || transferableSize > SESSION_MAX_BYTES || plan?.status !== "composed" || (plan.omittedMessageCount > 0 && !omissionsApproved)}>
            {busy ? "Opening…" : `Open editable draft in ${PROVIDER_LABELS[selectedTarget]}`}
          </button>
          <button className="text-button reread" disabled={busy} onClick={() => { setPassport(null); setNotice(""); }}>Read another conversation / change capture mode</button>
          <p className="privacy-note">The draft will be inserted automatically on the destination page. Review it, then click Send yourself. The website can read the draft once inserted.</p>
        </>}
      </section>

      <details className="card more-options">
        <summary>More options</summary>
        {passport && <>
          <div className="export-row">
            <button className="secondary" onClick={() => triggerDownload(serializePassport(passport), safeFilename(passport.title, "json"), "application/json")}>Save JSON</button>
            <button className="secondary" onClick={() => triggerDownload(passportToMarkdown(passport), safeFilename(passport.title, "md"), "text/markdown")}>Save Markdown</button>
          </div>
        </>}
        <button className="import-button" onClick={() => fileInput.current?.click()} disabled={busy}>Import saved conversation (.chatpassport.json)</button>
        <p>Text, code, tables, links and math, as Markdown. Non-decorative images become [image: description] or [image] placeholders; files, artifacts, and hidden reasoning are not transferred.</p>
      </details>
      <input ref={fileInput} type="file" accept=".json,.chatpassport.json,application/json" hidden onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void importFile(file);
      }} />
      {notice && passport && <div className={`notice ${noticeKind}`} role="status">{notice}</div>}

      <footer>
        Local only · No account · No tracking
      </footer>
    </main>
  );
}
