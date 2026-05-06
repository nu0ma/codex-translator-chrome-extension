/**
 * Tiny structured logger. Wraps `console` so we can:
 *   - silence verbose logs in production builds via __DEV__
 *   - prefix every line with a tag for easy filtering in DevTools
 */

declare const __DEV__: boolean;

type LogFn = (...args: unknown[]) => void;

export interface Logger {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  child(tag: string): Logger;
}

function makeLogger(prefix: string): Logger {
  const tag = `[codex-translator${prefix}]`;
  return {
    debug: (...args) => {
      if (__DEV__) console.debug(tag, ...args);
    },
    info: (...args) => console.info(tag, ...args),
    warn: (...args) => console.warn(tag, ...args),
    error: (...args) => console.error(tag, ...args),
    child: (sub) => makeLogger(`${prefix}:${sub}`),
  };
}

export const log: Logger = makeLogger("");
