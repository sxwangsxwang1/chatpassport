import { buildHandoffPrompt, detectProvider } from "./core";
import type { PendingTransfer } from "./pending";
import type { Provider } from "./passport";

export const GET_PENDING_RELAY = "chatpassport:get-pending-relay";
export const COMPLETE_PENDING_RELAY = "chatpassport:complete-pending-relay";

export interface GetPendingRelayRequest {
  type: typeof GET_PENDING_RELAY;
}

export interface CompletePendingRelayRequest {
  type: typeof COMPLETE_PENDING_RELAY;
  passportId: string;
}

export type RelayRequest = GetPendingRelayRequest | CompletePendingRelayRequest;

export interface ReadyRelayResponse {
  status: "ready";
  passportId: string;
  title: string;
  source: Provider;
  target: Provider;
  messageCount: number;
  context: string;
}

export interface EmptyRelayResponse {
  status: "none";
}

export type RelayResponse = ReadyRelayResponse | EmptyRelayResponse;

export function isRelayRequest(value: unknown): value is RelayRequest {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  if (message.type === GET_PENDING_RELAY) return true;
  return message.type === COMPLETE_PENDING_RELAY && typeof message.passportId === "string";
}

export function isRelayResponse(value: unknown): value is RelayResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  if (response.status === "none") return true;
  return response.status === "ready"
    && typeof response.passportId === "string"
    && typeof response.title === "string"
    && typeof response.source === "string"
    && typeof response.target === "string"
    && typeof response.messageCount === "number"
    && typeof response.context === "string";
}

export function createRelayResponse(
  pending: PendingTransfer | null,
  senderUrl: string,
): RelayResponse {
  if (!pending) return { status: "none" };

  let senderProvider: Provider | null = null;
  try {
    senderProvider = detectProvider(senderUrl);
  } catch {
    return { status: "none" };
  }

  if (!senderProvider || pending.target !== senderProvider) return { status: "none" };

  return {
    status: "ready",
    passportId: pending.passport.id,
    title: pending.passport.title,
    source: pending.passport.source.provider,
    target: pending.target,
    messageCount: pending.passport.messages.length,
    context: buildHandoffPrompt(pending.passport),
  };
}

export function canCompleteRelay(
  pending: PendingTransfer | null,
  passportId: string,
  senderUrl: string,
): boolean {
  const response = createRelayResponse(pending, senderUrl);
  return response.status === "ready" && response.passportId === passportId;
}
