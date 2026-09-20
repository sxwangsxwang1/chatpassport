import type { PassportMessage } from './passport';

const same = (a: PassportMessage, b: PassportMessage) => a.role === b.role && (
  a.id.startsWith('dom:') && b.id.startsWith('dom:') ? a.id === b.id : JSON.stringify(a.content) === JSON.stringify(b.content)
);

/** Align overlapping DOM windows, not a Set of text (repeated messages are valid). */
export function mergeHistory(existing: PassportMessage[], incoming: PassportMessage[], direction: 'up' | 'down') {
  if (!existing.length) return { messages: incoming.slice(), gap: false };
  if (!incoming.length) return { messages: existing, gap: false };
  let best = 0;
  let offsets: number[] = [];
  for (let offset = -incoming.length + 1; offset < existing.length; offset++) {
    const start = Math.max(0, offset);
    const end = Math.min(existing.length, offset + incoming.length);
    const count = end - start;
    if (count < best) continue;
    let matches = true;
    for (let i = start; i < end; i++) {
      if (!same(existing[i]!, incoming[i - offset]!)) { matches = false; break; }
    }
    if (!matches) continue;
    if (count > best) { best = count; offsets = []; }
    offsets.push(offset);
  }
  if (!best || offsets.length !== 1) {
    // Do not silently drop messages when a virtualized window has no safe anchor.
    return { messages: direction === 'up' ? [...incoming, ...existing] : [...existing, ...incoming], gap: true };
  }
  const offset = offsets[0]!;
  const messages: PassportMessage[] = [];
  for (let i = Math.min(0, offset); i < Math.max(existing.length, offset + incoming.length); i++) {
    messages.push(incoming[i - offset] ?? existing[i]!);
  }
  return { messages, gap: false };
}

/** Isolated-world state holds only the scroll element/position, never credentials. */
export function scrollHistoryOnPage(action: 'start' | 'up' | 'down' | 'restore', token: string, expectedUrl: string) {
  type Session = { token: string; element: HTMLElement; original: number; height: number; lastDirection: 'up' | 'down'; url: string; expiresAt: number; timer?: ReturnType<typeof setTimeout> };
  const state = globalThis as typeof globalThis & { __chatpassportScroll?: Session };
  function release(session: Session) {
    if (location.href === session.url && session.element.isConnected) {
      const growth = session.lastDirection === 'up' ? Math.max(0, session.element.scrollHeight - session.height) : 0;
      session.element.scrollTop = session.original + growth;
    }
    clearTimeout(session.timer);
    if (state.__chatpassportScroll === session) delete state.__chatpassportScroll;
  }
  if (action === 'start') {
    if (state.__chatpassportScroll && Date.now() >= state.__chatpassportScroll.expiresAt) release(state.__chatpassportScroll);
    if (state.__chatpassportScroll) throw new Error('Another history capture is running on this page.');
    if (location.href !== expectedUrl) throw new Error('The conversation changed during capture.');
    const anchors = Array.from(document.querySelectorAll(
      '[data-message-author-role], [data-role="user"], [data-role="assistant"], [data-testid="user-message"], .font-claude-response, .font-claude-message, user-query, model-response, [class*="user-message"], [class*="assistant-message"]',
    ));
    const scores = new Map<HTMLElement, number>();
    for (const anchor of anchors) {
      for (let node = anchor.parentElement; node; node = node.parentElement) {
        if (node.clientHeight > 0
          && /auto|scroll|overlay/.test(getComputedStyle(node).overflowY)) {
          scores.set(node, (scores.get(node) ?? 0) + 1);
        }
      }
    }
    const element = [...scores].sort((a, b) => b[1] - a[1])[0]?.[0]
      ?? document.scrollingElement as HTMLElement;
    if (!element) throw new Error('Could not locate the conversation scroll area.');
    const session: Session = { token, element, original: element.scrollTop, height: element.scrollHeight, lastDirection: 'up', url: expectedUrl, expiresAt: Date.now() + 125_000 };
    state.__chatpassportScroll = session;
    // The panel may be destroyed before its finally block runs. Recover the page
    // independently so an abandoned capture cannot leave a permanent lock.
    session.timer = setTimeout(() => release(session), 125_000);
  }
  const session = state.__chatpassportScroll;
  if (!session || session.token !== token) throw new Error('History capture session ended.');
  // Older pages prepend content. Account for that growth when restoring the
  // user's original reading position, rather than jumping to an older message.
  if (session.lastDirection === 'up') session.original += Math.max(0, session.element.scrollHeight - session.height);
  session.height = session.element.scrollHeight;
  if (action === 'restore') {
    release(session);
    return { top: 0, height: 0, viewport: 0, boundary: true };
  }
  if (location.href !== session.url || !session.element.isConnected) throw new Error('The conversation changed during capture.');
  const element = session.element;
  if (action === 'up' || action === 'down') session.lastDirection = action;
  const step = Math.max(1, element.clientHeight * 0.55);
  if (action === 'up') element.scrollTop = Math.max(0, element.scrollTop - step);
  if (action === 'down') element.scrollTop = Math.min(element.scrollHeight - element.clientHeight, element.scrollTop + step);
  element.dispatchEvent(new Event('scroll', { bubbles: true }));
  return {
    top: element.scrollTop, height: element.scrollHeight, viewport: element.clientHeight,
    boundary: action === 'down' ? element.scrollTop + element.clientHeight >= element.scrollHeight - 2 : element.scrollTop <= 2,
  };
}
