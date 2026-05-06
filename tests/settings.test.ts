import { describe, expect, it } from "vitest";
import { isLoopbackWsUrl, validateSettings } from "../src/shared/settings.js";

describe("isLoopbackWsUrl", () => {
  it("accepts the canonical loopback hosts on ws:// and wss://", () => {
    expect(isLoopbackWsUrl("ws://127.0.0.1:4500")).toBe(true);
    expect(isLoopbackWsUrl("ws://localhost:4500")).toBe(true);
    expect(isLoopbackWsUrl("ws://[::1]:4500")).toBe(true);
    expect(isLoopbackWsUrl("wss://localhost:4500")).toBe(true);
    expect(isLoopbackWsUrl("ws://LOCALHOST:4500")).toBe(true);
  });

  it("rejects external hostnames", () => {
    expect(isLoopbackWsUrl("ws://attacker.example.com")).toBe(false);
    expect(isLoopbackWsUrl("ws://192.168.1.5:4500")).toBe(false);
    expect(isLoopbackWsUrl("ws://10.0.0.1:4500")).toBe(false);
    expect(isLoopbackWsUrl("ws://127.0.0.1.attacker.com:4500")).toBe(false);
  });

  it("rejects non-ws schemes that could be smuggled into chrome.storage.sync", () => {
    expect(isLoopbackWsUrl("http://127.0.0.1:4500")).toBe(false);
    expect(isLoopbackWsUrl("javascript:alert(1)")).toBe(false);
    expect(isLoopbackWsUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(isLoopbackWsUrl("")).toBe(false);
    expect(isLoopbackWsUrl("not a url")).toBe(false);
    expect(isLoopbackWsUrl(123)).toBe(false);
    expect(isLoopbackWsUrl(undefined)).toBe(false);
    expect(isLoopbackWsUrl(null)).toBe(false);
  });

  it("rejects 127.0.0.0/8 addresses other than 127.0.0.1 (no DNS-rebinding wiggle room)", () => {
    expect(isLoopbackWsUrl("ws://127.0.0.2:4500")).toBe(false);
    expect(isLoopbackWsUrl("ws://127.1.2.3:4500")).toBe(false);
  });
});

describe("validateSettings", () => {
  it("returns no errors for the default settings shape", () => {
    expect(
      validateSettings({
        wsUrl: "ws://127.0.0.1:4500",
        model: "",
        targetLang: "Japanese",
        timeoutMs: 60_000,
      }),
    ).toEqual([]);
  });

  it("rejects non-loopback wsUrl", () => {
    const errs = validateSettings({ wsUrl: "ws://attacker.example.com" });
    expect(errs).toHaveLength(1);
    expect(errs[0]!.field).toBe("wsUrl");
  });

  it("rejects http(s) wsUrl that previously slipped past the scheme-only regex", () => {
    const errs = validateSettings({ wsUrl: "http://127.0.0.1:4500" });
    expect(errs).toHaveLength(1);
    expect(errs[0]!.field).toBe("wsUrl");
  });

  it("rejects out-of-range timeoutMs", () => {
    expect(validateSettings({ timeoutMs: 1_000 })).toHaveLength(1);
    expect(validateSettings({ timeoutMs: 1_000_000 })).toHaveLength(1);
    expect(validateSettings({ timeoutMs: Number.NaN })).toHaveLength(1);
  });

  it("rejects empty target language", () => {
    expect(validateSettings({ targetLang: "   " })).toHaveLength(1);
  });
});
