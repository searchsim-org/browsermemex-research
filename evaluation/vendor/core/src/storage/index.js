/**
 * Storage adapter.
 *
 * Wraps `browser.storage` with:
 * - Namespacing: each feature area (memory, scheduler, router, skills, settings)
 *   gets its own keyspace; collisions impossible
 * - Typed get/set with default values
 * - Migration hooks
 * - JSON serialization handled transparently
 *
 * Use `local` for everyday data, `session` for ephemeral (cleared on browser
 * close), `sync` only for explicitly cross-device settings (not used in v1.0).
 *
 * Note: secrets do NOT live here. See ADR 0001 — credentials use OS keychain
 * via the native host, not browser.storage.
 */

import { browser } from "../browser/index.js";

const NAMESPACES = Object.freeze({
  SETTINGS: "settings",
  MEMORY: "memory",
  SCHEDULER: "scheduler",
  ROUTER: "router",
  SKILLS: "skills",
  TELEMETRY: "telemetry",
});

const BACKENDS = Object.freeze({
  LOCAL: "local",
  SESSION: "session",
  SYNC: "sync",
});

function key(namespace, k) {
  return `${namespace}::${k}`;
}

/**
 * Create a typed namespace-scoped store.
 *
 * @param {string} namespace - one of NAMESPACES
 * @param {string} backend - one of BACKENDS, defaults to LOCAL
 */
export function createStore(namespace, backend = BACKENDS.LOCAL) {
  if (!Object.values(NAMESPACES).includes(namespace)) {
    throw new Error(`Unknown storage namespace: ${namespace}`);
  }
  if (!Object.values(BACKENDS).includes(backend)) {
    throw new Error(`Unknown storage backend: ${backend}`);
  }

  const area = browser.storage[backend];

  return {
    async get(k, defaultValue = undefined) {
      const full = key(namespace, k);
      const result = await area.get(full);
      return full in result ? result[full] : defaultValue;
    },

    async set(k, value) {
      await area.set({ [key(namespace, k)]: value });
    },

    async remove(k) {
      await area.remove(key(namespace, k));
    },

    async list() {
      const all = await area.get(null);
      const prefix = `${namespace}::`;
      const out = {};
      for (const [k, v] of Object.entries(all)) {
        if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
      }
      return out;
    },

    async clear() {
      const all = await area.get(null);
      const prefix = `${namespace}::`;
      const toRemove = Object.keys(all).filter((k) => k.startsWith(prefix));
      if (toRemove.length > 0) await area.remove(toRemove);
    },
  };
}

export { NAMESPACES, BACKENDS };
