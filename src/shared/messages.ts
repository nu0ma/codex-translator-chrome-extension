/**
 * Strongly-typed messages exchanged between the content script and the
 * background service worker.
 *
 * The content script opens a long-lived `chrome.runtime.connect` port so the
 * background can stream translation deltas as they arrive from codex-app-server.
 */

export interface PortRequestStart {
  type: "start";
  text: string;
  requestId: string;
}

export interface PortRequestCancel {
  type: "cancel";
  requestId: string;
}

export type PortRequest = PortRequestStart | PortRequestCancel;

export interface PortResponseDelta {
  type: "delta";
  requestId: string;
  text: string;
}

export interface PortResponseDone {
  type: "done";
  requestId: string;
  text: string;
}

export interface PortResponseError {
  type: "error";
  requestId: string;
  message: string;
}

export interface PortResponseCancelled {
  type: "cancelled";
  requestId: string;
}

export type PortResponse =
  | PortResponseDelta
  | PortResponseDone
  | PortResponseError
  | PortResponseCancelled;

/** One-shot message used by the right-click context menu handler. */
export interface ContextMenuTriggerMessage {
  type: "context-menu-translate";
  text: string;
}

export type RuntimeMessage = ContextMenuTriggerMessage;
