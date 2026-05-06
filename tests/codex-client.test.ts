import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CodexClient,
  CodexError,
  buildTranslationPrompt,
  translateOnce,
  type WSLike,
  type WebSocketFactory,
} from "../src/background/codex-client.js";

class FakeWebSocket implements WSLike {
  readyState = 0;
  readonly url: string;
  onopen: ((ev?: unknown) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  readonly sent: string[] = [];
  closed = false;

  constructor(url: string) {
    this.url = url;
  }

  send(data: string): void {
    if (this.closed) throw new Error("send() after close");
    this.sent.push(data);
  }

  close(code = 1000, reason = ""): void {
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3;
    queueMicrotask(() => this.onclose?.({ code, reason }));
  }

  // Test helpers
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(payload: unknown): void {
    const data = typeof payload === "string" ? payload : JSON.stringify(payload);
    this.onmessage?.({ data });
  }

  fail(err: Error): void {
    this.onerror?.(err);
  }

  /** Parse the most recent JSON sent and return it. */
  lastSent(): { id?: number; method: string; params?: unknown } {
    const last = this.sent.at(-1);
    if (last === undefined) throw new Error("No frames sent");
    return JSON.parse(last) as { id?: number; method: string; params?: unknown };
  }

  findSent(method: string): { id?: number; method: string; params?: unknown } | undefined {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      const frame = JSON.parse(this.sent[i]!) as { id?: number; method: string };
      if (frame.method === method) return frame;
    }
    return undefined;
  }
}

let lastSocket: FakeWebSocket | null = null;
const factory: WebSocketFactory = (url) => {
  const ws = new FakeWebSocket(url);
  lastSocket = ws;
  return ws;
};

afterEach(() => {
  lastSocket = null;
});

function nextTick() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("buildTranslationPrompt", () => {
  it("includes the target language and source text", () => {
    const prompt = buildTranslationPrompt("Hello, world.", "Japanese");
    expect(prompt).toContain("Japanese");
    expect(prompt).toContain("Hello, world.");
    expect(prompt).toContain("Output ONLY the translation");
  });
});

describe("CodexClient handshake", () => {
  it("sends initialize then initialized after open", async () => {
    const client = new CodexClient({
      url: "ws://test/4500",
      timeoutMs: 1000,
      webSocketFactory: factory,
    });

    const connectPromise = client.connect();
    await nextTick();
    expect(lastSocket).not.toBeNull();
    const ws = lastSocket!;
    ws.open();
    await nextTick();

    const initFrame = ws.findSent("initialize");
    expect(initFrame).toBeDefined();
    expect(initFrame!.id).toBe(1);

    // Reply to initialize
    ws.receive({ jsonrpc: "2.0", id: initFrame!.id, result: { ok: true } });
    await connectPromise;

    expect(ws.findSent("initialized")).toBeDefined();
    client.close();
  });

  it("rejects connect() when the socket errors", async () => {
    const client = new CodexClient({
      url: "ws://nope",
      timeoutMs: 1000,
      webSocketFactory: factory,
    });
    const promise = client.connect();
    await nextTick();
    lastSocket!.fail(new Error("ECONNREFUSED"));
    await expect(promise).rejects.toBeInstanceOf(CodexError);
  });
});

describe("CodexClient runTurn streaming", () => {
  it("yields deltas and a final aggregated done event", async () => {
    const client = new CodexClient({
      url: "ws://test",
      timeoutMs: 5000,
      webSocketFactory: factory,
    });

    // Drive the handshake.
    const connectPromise = client.connect();
    await nextTick();
    const ws = lastSocket!;
    ws.open();
    await nextTick();
    ws.receive({ jsonrpc: "2.0", id: 1, result: {} });
    await connectPromise;

    const startPromise = client.startThread();
    await nextTick();
    const startFrame = ws.findSent("thread/start")!;
    ws.receive({
      jsonrpc: "2.0",
      id: startFrame.id,
      result: { thread: { id: "thr_1" } },
    });
    await startPromise;

    // Run turn — push deltas asynchronously.
    const events: Array<{ type: string; text: string }> = [];
    const runPromise = (async () => {
      for await (const ev of client.runTurn("hi")) events.push(ev);
    })();

    await nextTick();
    expect(ws.findSent("turn/start")).toBeDefined();

    ws.receive({
      jsonrpc: "2.0",
      method: "item/agentMessage/delta",
      params: { text: "Hello" },
    });
    ws.receive({
      jsonrpc: "2.0",
      method: "item/agentMessage/delta",
      params: { text: ", world" },
    });
    ws.receive({
      jsonrpc: "2.0",
      method: "turn/completed",
      params: { turn: { id: "t1", status: "completed" } },
    });

    await runPromise;
    expect(events).toEqual([
      { type: "delta", text: "Hello" },
      { type: "delta", text: ", world" },
      { type: "done", text: "Hello, world" },
    ]);
    client.close();
  });

  it("prefers item/completed full text over accumulated deltas", async () => {
    const client = new CodexClient({
      url: "ws://test",
      timeoutMs: 5000,
      webSocketFactory: factory,
    });
    const connectPromise = client.connect();
    await nextTick();
    const ws = lastSocket!;
    ws.open();
    await nextTick();
    ws.receive({ jsonrpc: "2.0", id: 1, result: {} });
    await connectPromise;

    const startPromise = client.startThread();
    await nextTick();
    const startFrame = ws.findSent("thread/start")!;
    ws.receive({ jsonrpc: "2.0", id: startFrame.id, result: { thread: { id: "thr" } } });
    await startPromise;

    let final = "";
    const runPromise = (async () => {
      for await (const ev of client.runTurn("hi")) {
        if (ev.type === "done") final = ev.text;
      }
    })();
    await nextTick();
    ws.receive({
      jsonrpc: "2.0",
      method: "item/agentMessage/delta",
      params: { text: "partial" },
    });
    ws.receive({
      jsonrpc: "2.0",
      method: "item/completed",
      params: { item: { type: "agentMessage", text: "complete answer" } },
    });
    ws.receive({
      jsonrpc: "2.0",
      method: "turn/completed",
      params: { turn: { status: "completed" } },
    });
    await runPromise;
    expect(final).toBe("complete answer");
    client.close();
  });

  it("rejects when AbortSignal fires", async () => {
    const client = new CodexClient({
      url: "ws://test",
      timeoutMs: 60_000,
      webSocketFactory: factory,
    });
    const connectPromise = client.connect();
    await nextTick();
    const ws = lastSocket!;
    ws.open();
    await nextTick();
    ws.receive({ jsonrpc: "2.0", id: 1, result: {} });
    await connectPromise;

    const startPromise = client.startThread();
    await nextTick();
    const startFrame = ws.findSent("thread/start")!;
    ws.receive({ jsonrpc: "2.0", id: startFrame.id, result: { thread: { id: "thr" } } });
    await startPromise;

    const ac = new AbortController();
    const consume = (async () => {
      for await (const _ of client.runTurn("text", ac.signal)) {
        /* drain */
      }
    })();
    await nextTick();
    ac.abort();
    await expect(consume).rejects.toBeInstanceOf(CodexError);
    client.close();
  });

  it("rejects when turn/completed reports failure", async () => {
    const client = new CodexClient({
      url: "ws://test",
      timeoutMs: 60_000,
      webSocketFactory: factory,
    });
    const connectPromise = client.connect();
    await nextTick();
    const ws = lastSocket!;
    ws.open();
    await nextTick();
    ws.receive({ jsonrpc: "2.0", id: 1, result: {} });
    await connectPromise;

    const startPromise = client.startThread();
    await nextTick();
    ws.receive({
      jsonrpc: "2.0",
      id: ws.findSent("thread/start")!.id,
      result: { thread: { id: "x" } },
    });
    await startPromise;

    const consume = (async () => {
      for await (const _ of client.runTurn("text")) {
        /* drain */
      }
    })();
    await nextTick();
    ws.receive({
      jsonrpc: "2.0",
      method: "turn/completed",
      params: {
        turn: { status: "failed", error: { message: "ContextWindowExceeded" } },
      },
    });
    await expect(consume).rejects.toThrow(/ContextWindowExceeded/);
    client.close();
  });

  it("times out when no turn/completed arrives", async () => {
    vi.useFakeTimers();
    try {
      const client = new CodexClient({
        url: "ws://test",
        timeoutMs: 100,
        webSocketFactory: factory,
      });
      const connectPromise = client.connect();
      await Promise.resolve();
      const ws = lastSocket!;
      ws.open();
      await Promise.resolve();
      ws.receive({ jsonrpc: "2.0", id: 1, result: {} });
      await connectPromise;

      const startPromise = client.startThread();
      await Promise.resolve();
      ws.receive({
        jsonrpc: "2.0",
        id: ws.findSent("thread/start")!.id,
        result: { thread: { id: "x" } },
      });
      await startPromise;

      // Capture the error in-band so we never produce a pending rejection.
      const captured = (async (): Promise<Error | null> => {
        try {
          for await (const _ of client.runTurn("text")) {
            /* drain */
          }
          return null;
        } catch (err) {
          return err instanceof Error ? err : new Error(String(err));
        }
      })();
      await vi.advanceTimersByTimeAsync(150);
      const result = await captured;
      expect(result).toBeInstanceOf(CodexError);
      expect(result?.message).toMatch(/timed out/);
      client.close();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("translateOnce convenience", () => {
  it("invokes onDelta and resolves with final text", async () => {
    const onDelta = vi.fn();
    const promise = translateOnce({
      text: "Hello",
      url: "ws://test",
      model: "",
      targetLang: "Japanese",
      timeoutMs: 5_000,
      signal: new AbortController().signal,
      onDelta,
      webSocketFactory: factory,
    });

    await nextTick();
    const ws = lastSocket!;
    ws.open();
    await nextTick();
    ws.receive({ jsonrpc: "2.0", id: 1, result: {} });
    await nextTick();
    ws.receive({ jsonrpc: "2.0", id: 2, result: { thread: { id: "t" } } });
    await nextTick();
    ws.receive({
      jsonrpc: "2.0",
      method: "item/agentMessage/delta",
      params: { text: "こんにちは" },
    });
    ws.receive({
      jsonrpc: "2.0",
      method: "turn/completed",
      params: { turn: { status: "completed" } },
    });

    const final = await promise;
    expect(final).toBe("こんにちは");
    expect(onDelta).toHaveBeenCalledWith("こんにちは");
  });
});
