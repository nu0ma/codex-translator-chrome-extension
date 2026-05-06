/** User-configurable settings persisted via chrome.storage.sync. */
export interface Settings {
  /** WebSocket URL for codex-app-server, e.g. ws://127.0.0.1:4500 */
  wsUrl: string;
  /** Optional model name passed to thread/start. Empty string means "let codex pick". */
  model: string;
  /** Target language name embedded in the prompt (e.g. "Japanese", "English"). */
  targetLang: string;
  /** Per-request hard timeout in milliseconds. */
  timeoutMs: number;
}

/** JSON-RPC 2.0 primitives. */
export type JsonRpcId = number | string;

export interface JsonRpcRequest<P = unknown> {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: P;
}

export interface JsonRpcNotification<P = unknown> {
  jsonrpc: "2.0";
  method: string;
  params?: P;
}

export interface JsonRpcSuccess<R = unknown> {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: R;
}

export interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  id: JsonRpcId | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcResponse<R = unknown> = JsonRpcSuccess<R> | JsonRpcErrorResponse;

/** Codex protocol — only the subset we depend on. */
export interface ThreadStartResult {
  thread?: { id: string };
  threadId?: string;
}

export interface AgentMessageItem {
  type: string;
  text?: string;
  content?: string;
}

export interface ItemDeltaParams {
  itemId?: string;
  text?: string;
  delta?: string;
}

export interface ItemCompletedParams {
  item?: AgentMessageItem;
}

/** Codex documents `completed | interrupted | failed`, but we keep this open
 *  to forward-compatibility with new states. */
export type TurnStatus = string;

export interface TurnCompletedParams {
  turn?: {
    id?: string;
    status: TurnStatus;
    error?: { message: string; code?: string } | null;
  };
}
