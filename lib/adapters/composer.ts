/** Shared reader/writer, also serializable into a page without module dependencies. */
export function composerToolsOnPage() {
  const selectorsByHost: Record<string, string[]> = {
    'chatgpt.com': ['#prompt-textarea', 'main [contenteditable="true"][role="textbox"]'],
    'chat.openai.com': ['#prompt-textarea', 'main [contenteditable="true"][role="textbox"]'],
    'claude.ai': ['.ProseMirror[contenteditable="true"]', 'main [contenteditable="true"][role="textbox"]'],
    // Gemini also has a visible .ql-clipboard contenteditable inside rich-textarea.
    // Target the actual editor so the clipboard cannot make the match ambiguous.
    'gemini.google.com': ['rich-textarea .ql-editor[contenteditable="true"]', '.ql-editor[contenteditable="true"]'],
    'chat.deepseek.com': ['.ql-editor[contenteditable="true"]', 'textarea[placeholder*="message" i]'],
  };
  const selectors = selectorsByHost[location.hostname] ?? [];
  function find(): HTMLElement | undefined {
    for (const selector of selectors) {
      const matches = Array.from(document.querySelectorAll<HTMLElement>(selector))
        .filter((element) => element.getClientRects().length > 0
          && !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true'
          && !(element instanceof HTMLTextAreaElement && element.readOnly));
      if (matches.length === 1) return matches[0];
      if (matches.length > 1) return undefined;
    }
  }
  function read(element: HTMLElement): string {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) return element.value;
    // innerText depends on CSS/layout and collapses code whitespace. Preserve logical
    // block boundaries and explicit line breaks instead (including empty paragraphs).
    const blocks = new Set(['P', 'DIV', 'LI', 'PRE', 'BLOCKQUOTE', 'H1', 'H2', 'H3']);
    function text(node: Node): string {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
      if (!(node instanceof Element)) return '';
      if (node.tagName === 'BR') return '\n';
      const children = Array.from(node.childNodes);
      if (children.length === 1 && children[0] instanceof Element && children[0].tagName === 'BR') return '';
      let result = '';
      children.forEach((child, index) => {
        const previous = children[index - 1];
        if (index > 0 && ((child instanceof Element && blocks.has(child.tagName))
          || (previous instanceof Element && blocks.has(previous.tagName)))) result += '\n';
        result += text(child);
      });
      return result;
    }
    return text(element);
  }
  function write(element: HTMLElement, value: string): void {
    element.focus();
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value);
    } else {
      // Real paragraphs survive rich-editor normalization and render line breaks.
      element.replaceChildren(...value.split('\n').map((line) => {
        const paragraph = document.createElement('p');
        paragraph.append(line ? document.createTextNode(line) : document.createElement('br'));
        return paragraph;
      }));
    }
    element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: value }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return { find, read, write };
}

/** Hold the exact node and watch for user activity throughout the async request. */
export function beginComposerTransaction(tools = composerToolsOnPage()) {
  const found = tools.find();
  if (!found) return null;
  const element: HTMLElement = found;
  const original = tools.read(element);
  const url = location.href;
  let edited = false;
  let disposed = false;
  const onEdit = (event: Event) => { if (event.isTrusted) edited = true; };
  const events = ['beforeinput', 'input', 'keydown', 'paste', 'cut', 'drop', 'compositionstart'];
  events.forEach((name) => element.addEventListener(name, onEdit, true));
  const valid = () => !disposed && !edited && element.isConnected && location.href === url && tools.find() === element;
  function dispose() {
    events.forEach((name) => element.removeEventListener(name, onEdit, true));
    disposed = true;
  }
  return {
    original,
    dispose,
    async replace(value: string): Promise<{ success: boolean; message: string }> {
      if (!valid() || tools.read(element) !== original) {
        return { success: false, message: 'The page or your draft changed. Nothing was overwritten.' };
      }
      tools.write(element, value);
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (valid() && tools.read(element) === value) return { success: true, message: 'Draft ready.' };
      // Never guess whether a changed draft belongs to the user. In particular,
      // do not "restore" over edits made during framework reconciliation.
      return { success: false, message: 'The page changed or did not retain the complete draft. No automatic rollback was performed. Review the editor; your original question is shown below for recovery.' };
    },
  };
}
