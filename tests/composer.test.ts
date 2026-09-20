import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { beginComposerTransaction, composerToolsOnPage } from '../lib/adapters/composer';

function setup(html = '<textarea>My question</textarea>') {
  const dom = new JSDOM(html, { url: 'https://chatgpt.com/c/one', runScripts: 'outside-only' });
  dom.window.document.querySelectorAll<HTMLElement>('textarea,[contenteditable]').forEach((element) => {
    element.getClientRects = () => ({ length: 1 }) as DOMRectList;
  });
  const tools = dom.window.eval(`(${composerToolsOnPage.toString()})()`) as ReturnType<typeof composerToolsOnPage>;
  const begin = dom.window.eval(`(${beginComposerTransaction.toString()})`) as typeof beginComposerTransaction;
  return { dom, tools, begin: () => begin(tools), element: tools.find()! };
}

describe('draft preservation', () => {
  it.each([
    ['<p>第一行</p><p>第二行</p>', '第一行\n第二行'],
    ['第一行<br>第二行', '第一行\n第二行'],
    ['<p>first</p><p><br></p><p>last</p>', 'first\n\nlast'],
    ['<div>first</div><div>second<br>third</div>', 'first\nsecond\nthird'],
    ['<pre>  x\n    y\n</pre>', '  x\n    y\n'],
  ])('preserves multiline rich text: %s', (html, expected) => {
    const { tools, element } = setup(`<div contenteditable="true" role="textbox">${html}</div>`);
    expect(tools.read(element)).toBe(expected);
    tools.write(element, expected);
    expect(tools.read(element)).toBe(expected);
  });
  it('finds a visible editor even if an earlier matching editor is hidden', () => {
    const { dom, tools } = setup('<textarea>hidden</textarea><textarea>visible</textarea>');
    dom.window.document.querySelector('textarea')!.getClientRects = () => ({ length: 0 }) as DOMRectList;
    expect(tools.read(tools.find()!)).toBe('visible');
  });
  it('writes and verifies a complete draft', async () => {
    const { begin, tools, element } = setup();
    const transaction = begin()!;
    expect(await transaction.replace('Context\n\nMy question')).toMatchObject({ success: true });
    expect(tools.read(element)).toBe('Context\n\nMy question');
    transaction.dispose();
  });
  it('does not overwrite edits made while awaiting composition', async () => {
    const { begin, tools, element } = setup();
    const transaction = begin()!;
    tools.write(element, 'New question');
    expect(await transaction.replace('Context')).toMatchObject({ success: false });
    expect(tools.read(element)).toBe('New question');
    transaction.dispose();
  });
  it('aborts after trusted user activity even if text returns to its original value', async () => {
    const { begin, element, tools } = setup();
    const listeners: EventListener[] = [];
    const add = element.addEventListener.bind(element);
    element.addEventListener = ((type: string, listener: EventListener, options: boolean) => {
      if (type === 'beforeinput') listeners.push(listener);
      add(type, listener, options);
    }) as typeof element.addEventListener;
    const transaction = begin()!;
    listeners[0]!({ isTrusted: true } as Event);
    expect(await transaction.replace('Context')).toMatchObject({ success: false });
    expect(tools.read(element)).toBe('My question');
    transaction.dispose();
  });
  it('never rolls back over edits after insertion', async () => {
    const { begin, tools, element } = setup();
    const transaction = begin()!;
    const result = transaction.replace('Context');
    tools.write(element, 'New input while verifying');
    expect(await result).toMatchObject({ success: false });
    expect(tools.read(element)).toBe('New input while verifying');
    transaction.dispose();
  });
  it('refuses a replaced editor or a changed conversation URL', async () => {
    const first = setup();
    const transaction = first.begin()!;
    first.element.replaceWith(first.element.cloneNode(true));
    expect(await transaction.replace('Context')).toMatchObject({ success: false });
    transaction.dispose();
    const second = setup();
    const other = second.begin()!;
    second.dom.window.history.pushState({}, '', '/c/two');
    expect(await other.replace('Context')).toMatchObject({ success: false });
    expect(second.tools.read(second.element)).toBe('My question');
    other.dispose();
  });
  it('reports truncation without attempting a destructive rollback', async () => {
    const { begin, tools, element } = setup();
    element.addEventListener('input', () => { (element as HTMLTextAreaElement).value = 'truncated'; });
    const transaction = begin()!;
    expect(await transaction.replace('Complete context')).toMatchObject({ success: false });
    expect(tools.read(element)).toBe('truncated');
    expect(transaction.original).toBe('My question');
    transaction.dispose();
  });
});
