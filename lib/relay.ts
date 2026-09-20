import { buildContinuationPrompt, detectProvider } from "./core";
import { PENDING_TTL_MS } from "./core";
import type { PendingTransfer } from "./pending";
import { PROVIDERS, type Provider } from "./passport";

export const GET_PENDING_RELAY = "chatpassport:get-pending-relay";
export const COMPOSE_PENDING_RELAY = "chatpassport:compose-pending-relay";
export const COMPLETE_PENDING_RELAY = "chatpassport:complete-pending-relay";
export const RELAY_MAX_DRAFT_CHARS = 48_000;
export const RELAY_MAX_REQUEST_CHARS = 8_000;

export interface GetPendingRelayRequest {
  type: typeof GET_PENDING_RELAY;
}

export interface ComposePendingRelayRequest {
  type: typeof COMPOSE_PENDING_RELAY;
  transferId: string;
  currentRequest: string;
}

export interface CompletePendingRelayRequest {
  type: typeof COMPLETE_PENDING_RELAY;
  transferId: string;
}

export type RelayRequest =
  | GetPendingRelayRequest
  | ComposePendingRelayRequest
  | CompletePendingRelayRequest;

export interface ReadyRelayResponse {
  status: "ready";
  transferId: string;
  title: string;
  source: Provider;
  target: Provider;
  messageCount: number;
}

export interface ComposedRelayResponse {
  status: "composed";
  transferId: string;
  text: string;
  includedMessageCount: number;
  omittedMessageCount: number;
  characterCount: number;
}

export interface RelayErrorResponse {
  status: "error";
  code: "empty-request" | "request-too-large" | "context-too-large";
  message: string;
}

export interface EmptyRelayResponse {
  status: "none";
}

export type RelayResponse =
  | ReadyRelayResponse
  | ComposedRelayResponse
  | RelayErrorResponse
  | EmptyRelayResponse;

export function isRelayRequest(value: unknown): value is RelayRequest {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  if (message.type === GET_PENDING_RELAY) return true;
  if (message.type === COMPOSE_PENDING_RELAY) {
    return typeof message.transferId === "string" && typeof message.currentRequest === "string";
  }
  return message.type === COMPLETE_PENDING_RELAY && typeof message.transferId === "string";
}

function isProvider(value: unknown): value is Provider {
  return typeof value === "string" && PROVIDERS.includes(value as Provider);
}

export function isRelayResponse(value: unknown): value is RelayResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  if (response.status === "none") return true;
  if (response.status === "error") {
    return typeof response.code === "string" && typeof response.message === "string";
  }
  if (response.status === "ready") {
    return typeof response.transferId === "string"
      && typeof response.title === "string"
      && isProvider(response.source)
      && isProvider(response.target)
      && typeof response.messageCount === "number";
  }
  return response.status === "composed"
    && typeof response.transferId === "string"
    && typeof response.text === "string"
    && typeof response.includedMessageCount === "number"
    && typeof response.omittedMessageCount === "number"
    && typeof response.characterCount === "number";
}

export interface RelaySender { url: string; tabId: number; frameId: number; tabUrl: string }

function authorizedPending(
  pending: PendingTransfer | null,
  sender: RelaySender,
): PendingTransfer | null {
  if (!pending || sender.frameId !== 0 || sender.tabId !== pending.targetTabId
    || Date.now() >= pending.savedAt + PENDING_TTL_MS || pending.savedAt > Date.now()) return null;
  try {
    return new URL(sender.url).protocol === 'https:' && new URL(sender.tabUrl).protocol === 'https:'
      && detectProvider(sender.url) === pending.target && detectProvider(sender.tabUrl) === pending.target ? pending : null;
  } catch {
    return null;
  }
}

export function createRelayResponse(
  pending: PendingTransfer | null,
  sender: RelaySender,
): RelayResponse {
  const authorized = authorizedPending(pending, sender);
  if (!authorized) return { status: "none" };

  return {
    status: "ready",
    transferId: authorized.transferId,
    title: authorized.passport.title,
    source: authorized.passport.source.provider,
    target: authorized.target,
    messageCount: authorized.passport.messages.length,
  };
}

export function composeRelayResponse(
  pending: PendingTransfer | null,
  transferId: string,
  currentRequest: string,
  sender: RelaySender,
): RelayResponse {
  const authorized = authorizedPending(pending, sender);
  if (!authorized || authorized.transferId !== transferId) return { status: "none" };

  const request = currentRequest;
  if (!request.trim()) {
    return { status: "error", code: "empty-request", message: "Type your next question first." };
  }
  if (request.length > RELAY_MAX_REQUEST_CHARS) {
    return {
      status: "error",
      code: "request-too-large",
      message: `Your new request is over ${RELAY_MAX_REQUEST_CHARS.toLocaleString()} characters. Shorten it before continuing.`,
    };
  }

  const total = authorized.passport.messages.length;
  let low = 1;
  let high = total - 1;
  let bestCount = 0;
  let bestText = "";

  const fullCandidate = buildContinuationPrompt(authorized.passport, total, request);
  if (fullCandidate.length <= RELAY_MAX_DRAFT_CHARS) {
    bestCount = total;
    bestText = fullCandidate;
  }

  while (bestCount !== total && low <= high) {
    const count = Math.floor((low + high) / 2);
    const candidate = buildContinuationPrompt(authorized.passport, count, request);
    if (candidate.length <= RELAY_MAX_DRAFT_CHARS) {
      bestCount = count;
      bestText = candidate;
      low = count + 1;
    } else {
      high = count - 1;
    }
  }

  if (bestCount === 0) {
    return {
      status: "error",
      code: "context-too-large",
      message: "Even the latest message is too large for a safe relay. Choose fewer or smaller messages.",
    };
  }

  return {
    status: "composed",
    transferId,
    text: bestText,
    includedMessageCount: bestCount,
    omittedMessageCount: total - bestCount,
    characterCount: bestText.length,
  };
}

export function canCompleteRelay(
  pending: PendingTransfer | null,
  transferId: string,
  sender: RelaySender,
): boolean {
  const authorized = authorizedPending(pending, sender);
  return authorized?.transferId === transferId;
}
