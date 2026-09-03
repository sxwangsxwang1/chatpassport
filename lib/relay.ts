import { buildContinuationPrompt, detectProvider } from "./core";
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
  passportId: string;
  currentRequest: string;
}

export interface CompletePendingRelayRequest {
  type: typeof COMPLETE_PENDING_RELAY;
  passportId: string;
}

export type RelayRequest =
  | GetPendingRelayRequest
  | ComposePendingRelayRequest
  | CompletePendingRelayRequest;

export interface ReadyRelayResponse {
  status: "ready";
  passportId: string;
  title: string;
  source: Provider;
  target: Provider;
  messageCount: number;
}

export interface ComposedRelayResponse {
  status: "composed";
  passportId: string;
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
    return typeof message.passportId === "string" && typeof message.currentRequest === "string";
  }
  return message.type === COMPLETE_PENDING_RELAY && typeof message.passportId === "string";
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
    return typeof response.passportId === "string"
      && typeof response.title === "string"
      && isProvider(response.source)
      && isProvider(response.target)
      && typeof response.messageCount === "number";
  }
  return response.status === "composed"
    && typeof response.passportId === "string"
    && typeof response.text === "string"
    && typeof response.includedMessageCount === "number"
    && typeof response.omittedMessageCount === "number"
    && typeof response.characterCount === "number";
}

function authorizedPending(
  pending: PendingTransfer | null,
  senderUrl: string,
): PendingTransfer | null {
  if (!pending) return null;
  try {
    return detectProvider(senderUrl) === pending.target ? pending : null;
  } catch {
    return null;
  }
}

export function createRelayResponse(
  pending: PendingTransfer | null,
  senderUrl: string,
): RelayResponse {
  const authorized = authorizedPending(pending, senderUrl);
  if (!authorized) return { status: "none" };

  return {
    status: "ready",
    passportId: authorized.passport.id,
    title: authorized.passport.title,
    source: authorized.passport.source.provider,
    target: authorized.target,
    messageCount: authorized.passport.messages.length,
  };
}

export function composeRelayResponse(
  pending: PendingTransfer | null,
  passportId: string,
  currentRequest: string,
  senderUrl: string,
): RelayResponse {
  const authorized = authorizedPending(pending, senderUrl);
  if (!authorized || authorized.passport.id !== passportId) return { status: "none" };

  const request = currentRequest.trim();
  if (!request) {
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
    passportId,
    text: bestText,
    includedMessageCount: bestCount,
    omittedMessageCount: total - bestCount,
    characterCount: bestText.length,
  };
}

export function canCompleteRelay(
  pending: PendingTransfer | null,
  passportId: string,
  senderUrl: string,
): boolean {
  const authorized = authorizedPending(pending, senderUrl);
  return authorized?.passport.id === passportId;
}
