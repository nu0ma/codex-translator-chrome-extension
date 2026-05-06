import { CLIENT_INFO } from "../shared/constants.js";
import { log } from "../shared/logger.js";
import type {
  ItemCompletedParams,
  ItemDeltaParams,
  JsonRpcId,
  JsonRpcRequest,
  JsonRpcResponse,
  ThreadStartResult,
  TurnCompletedParams,
} from "../shared/types.js";

const logger = log.child("codex-client");

// ---------- Pluggable WebSocket factory (lets tests inject a fake) ----------

/** Minimal WebSocket surface used by CodexClient. Handlers are properties so
 *  the standard `WebSocket` and our test fake both satisfy this shape. */
export interface WSLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev?: unknown) => void) | null;
  onclose: ((ev: { code: number; reason: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
}

export type WebSocketFactory = (url: string) => WSLike;

const defaultFactory: WebSocketFactory = (url) => new WebSocket(url) as unknown as WSLike;

// ---------- Public API ----------

export class CodexError extends Error {
  override readonly name = "CodexError";
  override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    if (cause !== undefined) this.cause = cause;
  }
}

export interface CodexTurnDelta {
  type: "delta";
  text: string;
}

export interface CodexTurnDone {
  type: "done";
  text: string;
}

export type CodexTurnEvent = CodexTurnDelta | CodexTurnDone;

export interface CodexClientOptions {
  /** WebSocket URL of codex-app-server. */
  url: string;
  /** Optional model name passed to thread/start. Empty string falls back to codex defaults. */
  model?: string;
  /** Hard timeout per turn (ms). Aborts the turn if no `turn/completed` arrives. */
  timeoutMs: number;
  /** Optional WebSocket factory (for tests). */
  webSocketFactory?: WebSocketFactory;
}

interface PendingResponse {
  resolve: (msg: JsonRpcResponse) => void;
  reject: (err: Error) => void;
}

/**
 * One-shot client: connect → initialize → start thread → run turn → close.
 *
 * The class is intentionally single-use to keep state simple. Service workers
 * can be torn down at any time, so building a long-lived connection adds
 * little reliability and a lot of complexity.
 */
export class CodexClient {
  readonly #url: string;
  readonly #model: string;
  readonly #timeoutMs: number;
  readonly #factory: WebSocketFactory;

  #ws: WSLike | null = null;
  #nextId = 1;
  #pending = new Map<JsonRpcId, PendingResponse>();
  #closed = false;
  #threadId: string | null = null;

  constructor(options: CodexClientOptions) {
    this.#url = options.url;
    this.#model = options.model?.trim() ?? "";
    this.#timeoutMs = options.timeoutMs;
    this.#factory = options.webSocketFactory ?? defaultFactory;
  }

  /** Open WebSocket and finish the JSON-RPC initialize handshake. */
  async connect(): Promise<void> {
    if (this.#ws !== null) throw new CodexError("CodexClient already connected");

    const ws = this.#factory(this.#url);
    this.#ws = ws;

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (ev) => {
        reject(
          new CodexError(
            `Failed to open WebSocket to ${this.#url}. Is codex-app-server running?`,
            ev,
          ),
        );
      };
    });

    ws.onmessage = (ev) => this.#onMessage(ev.data);
    ws.onclose = (ev) => this.#onClose(ev.code, ev.reason);
    ws.onerror = (ev) => logger.debug("ws error after open", ev);

    await this.#request("initialize", { clientInfo: CLIENT_INFO });
    this.#notify("initialized", {});
  }

  /** Start a fresh thread; resolves with the new thread id. */
  async startThread(): Promise<string> {
    const params: Record<string, string> = {};
    if (this.#model.length > 0) params.model = this.#model;
    const result = await this.#request<ThreadStartResult>("thread/start", params);
    const id = result.thread?.id ?? result.threadId;
    if (typeof id !== "string" || id.length === 0) {
      throw new CodexError("thread/start returned no thread id");
    }
    this.#threadId = id;
    return id;
  }

  /**
   * Run a turn. Async-iterates streaming deltas and yields a final `done`
   * event with the aggregated text once `turn/completed` arrives.
   *
   * Aborting the supplied `signal` closes the connection and rejects the
   * iterator with a CodexError.
   */
  async *runTurn(input: string, signal?: AbortSignal): AsyncGenerator<CodexTurnEvent> {
    if (this.#threadId === null) {
      throw new CodexError("runTurn called before startThread");
    }
    if (signal?.aborted) {
      throw new CodexError("Aborted before turn started");
    }

    const queue: CodexTurnEvent[] = [];
    let pendingResolve: ((v: void) => void) | null = null;
    let finished = false;
    const failureBox: { current: Error | null } = { current: null };
    let accumulated = "";
    let finalText: string | null = null;

    const wake = () => {
      const r = pendingResolve;
      pendingResolve = null;
      r?.();
    };

    const failWith = (err: Error) => {
      failureBox.current = err;
      finished = true;
      wake();
    };

    const onAbort = () => failWith(new CodexError("Translation cancelled"));
    signal?.addEventListener("abort", onAbort, { once: true });

    const timer = setTimeout(() => {
      failWith(new CodexError(`Turn timed out after ${this.#timeoutMs}ms`));
    }, this.#timeoutMs);

    const offDelta = this.#onNotification("item/agentMessage/delta", (params) => {
      const p = params as ItemDeltaParams;
      const chunk = p.text ?? p.delta ?? "";
      if (chunk.length === 0) return;
      accumulated += chunk;
      queue.push({ type: "delta", text: chunk });
      wake();
    });

    const offCompleted = this.#onNotification("item/completed", (params) => {
      const p = params as ItemCompletedParams;
      const item = p.item;
      if (!item) return;
      if (item.type === "agentMessage") {
        const full = item.text ?? item.content;
        if (typeof full === "string" && full.length > 0) finalText = full;
      }
    });

    const offTurn = this.#onNotification("turn/completed", (params) => {
      const p = params as TurnCompletedParams;
      const status = p.turn?.status;
      if (status === "completed") {
        const text = (finalText ?? accumulated).trim();
        queue.push({ type: "done", text });
        finished = true;
      } else {
        const msg = p.turn?.error?.message ?? `Turn ended with status=${String(status)}`;
        failureBox.current = new CodexError(msg);
        finished = true;
      }
      wake();
    });

    try {
      // Kick off the turn — fire-and-forget; outcome arrives via notifications.
      this.#notifyOrRequest("turn/start", {
        threadId: this.#threadId,
        input: [{ type: "text", text: input }],
      });

      while (true) {
        if (queue.length > 0) {
          const ev = queue.shift();
          if (ev) yield ev;
          if (ev?.type === "done") return;
          continue;
        }
        if (finished) {
          const fail = failureBox.current;
          if (fail) throw fail;
          return;
        }
        await new Promise<void>((resolve) => {
          pendingResolve = resolve;
        });
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      offDelta();
      offCompleted();
      offTurn();
    }
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    try {
      this.#ws?.close(1000, "client closed");
    } catch (err) {
      logger.debug("close() ignored", err);
    }
    const remaining = [...this.#pending.values()];
    this.#pending.clear();
    for (const p of remaining) {
      p.reject(new CodexError("Connection closed before response"));
    }
  }

  // ---------- internals ----------

  #notificationHandlers = new Map<string, Set<(params: unknown) => void>>();

  #onNotification(method: string, handler: (params: unknown) => void): () => void {
    let set = this.#notificationHandlers.get(method);
    if (!set) {
      set = new Set();
      this.#notificationHandlers.set(method, set);
    }
    set.add(handler);
    return () => set.delete(handler);
  }

  #onMessage(raw: string): void {
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch (err) {
      logger.warn("Ignoring non-JSON frame", err);
      return;
    }
    if (typeof msg !== "object" || msg === null) return;

    const obj = msg as Record<string, unknown>;
    const id = obj.id as JsonRpcId | undefined;

    // Response to a previous request
    if (id !== undefined && (obj.result !== undefined || obj.error !== undefined)) {
      const pending = this.#pending.get(id);
      if (!pending) return;
      this.#pending.delete(id);
      pending.resolve(msg as JsonRpcResponse);
      return;
    }

    // Notification
    const method = typeof obj.method === "string" ? obj.method : null;
    if (method === null) return;
    const handlers = this.#notificationHandlers.get(method);
    if (!handlers) return;
    const params = obj.params;
    for (const h of handlers) {
      try {
        h(params);
      } catch (err) {
        logger.error(`Notification handler for ${method} threw`, err);
      }
    }
  }

  #onClose(code: number, reason: string): void {
    if (this.#closed) return;
    this.#closed = true;
    const err = new CodexError(`WebSocket closed (code=${code} reason=${reason || "n/a"})`);
    const remaining = [...this.#pending.values()];
    this.#pending.clear();
    for (const p of remaining) p.reject(err);
  }

  #send(payload: JsonRpcRequest | { jsonrpc: "2.0"; method: string; params?: unknown }): void {
    if (this.#ws === null) throw new CodexError("WebSocket not connected");
    this.#ws.send(JSON.stringify(payload));
  }

  async #request<R = unknown>(method: string, params: unknown): Promise<R> {
    const id = this.#nextId++;
    const promise = new Promise<JsonRpcResponse>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
    });
    this.#send({ jsonrpc: "2.0", id, method, params });
    const response = await promise;
    if ("error" in response) {
      throw new CodexError(`${method} failed: ${response.error.message}`);
    }
    return response.result as R;
  }

  #notify(method: string, params: unknown): void {
    this.#send({ jsonrpc: "2.0", method, params });
  }

  /** turn/start expects an id (per docs). Use a request — discard the response. */
  #notifyOrRequest(method: string, params: unknown): void {
    const id = this.#nextId++;
    // We never await the result; the outcome is delivered via turn/completed.
    // But we still register the pending so that if the server returns an
    // error before the turn starts, we surface it.
    this.#pending.set(id, {
      resolve: (msg) => {
        if ("error" in msg) {
          for (const set of this.#notificationHandlers.values()) {
            for (const h of set) {
              try {
                h({ turn: { status: "failed", error: msg.error } });
              } catch (err) {
                logger.error("synthetic failure handler threw", err);
              }
            }
          }
        }
      },
      reject: () => {},
    });
    this.#send({ jsonrpc: "2.0", id, method, params });
  }
}

/** Convenience helper used by background.ts. */
export async function translateOnce(opts: {
  text: string;
  url: string;
  model: string;
  targetLang: string;
  timeoutMs: number;
  signal: AbortSignal;
  onDelta: (chunk: string) => void;
  webSocketFactory?: WebSocketFactory;
}): Promise<string> {
  const prompt = buildTranslationPrompt(opts.text, opts.targetLang);
  const factoryOpt =
    opts.webSocketFactory !== undefined ? { webSocketFactory: opts.webSocketFactory } : {};
  const client = new CodexClient({
    url: opts.url,
    model: opts.model,
    timeoutMs: opts.timeoutMs,
    ...factoryOpt,
  });
  try {
    await client.connect();
    await client.startThread();
    let final = "";
    for await (const ev of client.runTurn(prompt, opts.signal)) {
      if (ev.type === "delta") opts.onDelta(ev.text);
      else final = ev.text;
    }
    return final;
  } finally {
    client.close();
  }
}

export function buildTranslationPrompt(text: string, targetLang: string): string {
  return [
    `Translate the following text into ${targetLang}.`,
    "Output ONLY the translation. Do not add quotes, explanations, romanization, transliteration, or the original text.",
    "Preserve line breaks and inline punctuation. If the input is already in the target language, return it unchanged.",
    "",
    "---",
    text,
    "---",
  ].join("\n");
}
