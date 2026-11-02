/**
 * ProfileStore — manages profiles via an injected StorageAdapter.
 *
 * Operations:
 *   - list()              → Profile[]
 *   - get(id)             → Profile | null
 *   - getActive()         → Profile (creates default on first call if none exist)
 *   - setActive(id)
 *   - create(spec)        → Profile  (rejects duplicate id/name)
 *   - update(id, patch)   → Profile  (bumps updatedAt)
 *   - delete(id)          (rejects deleting the active profile; refuse if last)
 *   - duplicate(id, newName) → Profile  (deep clones a profile)
 *
 * All methods are async — the underlying chrome.storage.local API is async.
 */

import {
  PROFILES_KEY,
  ACTIVE_PROFILE_KEY,
  DEFAULT_PROFILE_ID,
  makeDefaultProfile,
} from "./types.js";

function newProfileId(now) {
  const r = Math.floor(Math.random() * 0xfffff).toString(16).padStart(5, "0");
  return `profile-${now.toString(36)}-${r}`;
}

function cloneJson(v) {
  return JSON.parse(JSON.stringify(v));
}

export class ProfileStore {
  /**
   * @param {object} options
   * @param {import("./types.js").StorageAdapter} options.storage
   */
  constructor({ storage }) {
    if (!storage || typeof storage.get !== "function" || typeof storage.set !== "function") {
      throw new Error("ProfileStore: storage adapter with get/set required");
    }
    this.storage = storage;
  }

  async list() {
    const profiles = (await this.storage.get(PROFILES_KEY)) ?? [];
    return Array.isArray(profiles) ? profiles : [];
  }

  async get(id) {
    const profiles = await this.list();
    return profiles.find((p) => p.id === id) ?? null;
  }

  /**
   * Get the active profile. If none exists, lazily creates the Default
   * profile and marks it active. This means callers never have to handle
   * "no profiles yet" — the store always returns a valid profile.
   */
  async getActive(now = Date.now()) {
    let profiles = await this.list();
    let activeId = await this.storage.get(ACTIVE_PROFILE_KEY);

    if (profiles.length === 0) {
      const defaultP = makeDefaultProfile(now);
      profiles = [defaultP];
      await this.storage.set(PROFILES_KEY, profiles);
      await this.storage.set(ACTIVE_PROFILE_KEY, defaultP.id);
      return defaultP;
    }

    if (!activeId || !profiles.some((p) => p.id === activeId)) {
      activeId = profiles[0].id;
      await this.storage.set(ACTIVE_PROFILE_KEY, activeId);
    }

    return profiles.find((p) => p.id === activeId);
  }

  async setActive(id) {
    const profiles = await this.list();
    if (!profiles.some((p) => p.id === id)) {
      throw new Error(`setActive: profile '${id}' not found`);
    }
    await this.storage.set(ACTIVE_PROFILE_KEY, id);
  }

  async create(spec, now = Date.now()) {
    if (!spec || typeof spec.name !== "string" || spec.name.trim().length === 0) {
      throw new Error("create: name required");
    }
    const profiles = await this.list();
    if (profiles.some((p) => p.name.toLowerCase() === spec.name.trim().toLowerCase())) {
      throw new Error(`create: profile name '${spec.name}' already exists`);
    }
    const profile = {
      id: spec.id ?? newProfileId(now),
      name: spec.name.trim(),
      description: spec.description ?? null,
      policy:
        spec.policy ?? {
          rules: [],
          fallback: "claude-code",
          overrides: [],
          llmFallbackEnabled: false,
        },
      privacy: spec.privacy ?? { memoryEnabled: true, disabledDomains: [] },
      activeAgents: Array.isArray(spec.activeAgents) ? spec.activeAgents : [],
      activeSkills: Array.isArray(spec.activeSkills) ? spec.activeSkills : ["*"],
      createdAt: now,
      updatedAt: now,
    };
    await this.storage.set(PROFILES_KEY, [...profiles, profile]);
    return profile;
  }

  async update(id, patch, now = Date.now()) {
    const profiles = await this.list();
    const idx = profiles.findIndex((p) => p.id === id);
    if (idx < 0) throw new Error(`update: profile '${id}' not found`);

    // If the patch renames, ensure the new name doesn't collide
    if (typeof patch.name === "string") {
      const newName = patch.name.trim().toLowerCase();
      const conflict = profiles.find(
        (p) => p.id !== id && p.name.trim().toLowerCase() === newName
      );
      if (conflict) {
        throw new Error(`update: profile name '${patch.name}' already exists`);
      }
    }

    const next = {
      ...profiles[idx],
      ...patch,
      id: profiles[idx].id,
      createdAt: profiles[idx].createdAt,
      updatedAt: now,
    };
    const updated = [...profiles];
    updated[idx] = next;
    await this.storage.set(PROFILES_KEY, updated);
    return next;
  }

  async delete(id) {
    const profiles = await this.list();
    if (profiles.length <= 1) {
      throw new Error("delete: cannot remove the last remaining profile");
    }
    const activeId = await this.storage.get(ACTIVE_PROFILE_KEY);
    if (id === activeId) {
      throw new Error("delete: cannot remove the currently active profile; switch first");
    }
    const next = profiles.filter((p) => p.id !== id);
    if (next.length === profiles.length) {
      throw new Error(`delete: profile '${id}' not found`);
    }
    await this.storage.set(PROFILES_KEY, next);
  }

  async duplicate(id, newName, now = Date.now()) {
    const source = await this.get(id);
    if (!source) throw new Error(`duplicate: source profile '${id}' not found`);
    const clone = cloneJson(source);
    clone.id = newProfileId(now);
    clone.name = newName ?? `${source.name} (copy)`;
    clone.createdAt = now;
    clone.updatedAt = now;
    const profiles = await this.list();
    if (profiles.some((p) => p.name.toLowerCase() === clone.name.toLowerCase())) {
      throw new Error(`duplicate: name '${clone.name}' already exists`);
    }
    await this.storage.set(PROFILES_KEY, [...profiles, clone]);
    return clone;
  }
}

/**
 * Build a StorageAdapter backed by chrome.storage.local. Used in production
 * service-worker code; tests pass an in-memory adapter instead.
 */
export function makeBrowserStorageAdapter(browser) {
  if (!browser?.storage?.local) {
    throw new Error("makeBrowserStorageAdapter: browser.storage.local not available");
  }
  return {
    async get(key) {
      const result = await browser.storage.local.get([key]);
      return result?.[key];
    },
    async set(key, value) {
      await browser.storage.local.set({ [key]: value });
    },
    async remove(key) {
      await browser.storage.local.remove(key);
    },
  };
}

/**
 * Build an in-memory StorageAdapter for tests.
 */
export function makeInMemoryStorageAdapter(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    async get(key) {
      return map.has(key) ? map.get(key) : undefined;
    },
    async set(key, value) {
      map.set(key, value);
    },
    async remove(key) {
      map.delete(key);
    },
  };
}
