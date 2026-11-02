/**
 * Profile system — types.
 *
 * A Profile is a named bundle of:
 *   - routing policy (Router Policy from @browser-memex/core/router)
 *   - privacy settings (memory capture toggle + per-domain disable list)
 *   - activeAgents (subset of installed agents that the profile uses)
 *   - activeSkills (skill ids visible/usable in this profile)
 *   - llmFallback toggle
 *
 * One profile is "active" at any time. Switching profiles changes which
 * policy the Router uses, which agents the Side Panel surfaces, etc.
 * Profiles live in chrome.storage.local under the keys defined here.
 *
 * The store is backed by an injected StorageAdapter — `chrome.storage.local`
 * in production, an in-memory map in tests.
 */

export const PROFILES_KEY = "browser-memex.profiles";
export const ACTIVE_PROFILE_KEY = "browser-memex.activeProfileId";

export const DEFAULT_PROFILE_ID = "default";

/**
 * @typedef {Object} ProfilePrivacy
 * @property {boolean} memoryEnabled
 * @property {string[]} disabledDomains
 */

/**
 * @typedef {Object} Profile
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {object} policy                  — Router Policy
 * @property {ProfilePrivacy} privacy
 * @property {string[]} activeAgents          — agent ids
 * @property {string[]} activeSkills          — skill ids ('*' = all)
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/**
 * @typedef {Object} StorageAdapter
 * @property {(key: string) => Promise<*>} get
 * @property {(key: string, value: *) => Promise<void>} set
 * @property {(key: string) => Promise<void>} remove
 */

/** Build the canonical "Default" profile used on first run. */
export function makeDefaultProfile(now = Date.now()) {
  return {
    id: DEFAULT_PROFILE_ID,
    name: "Default",
    description: "Initial profile created on first run.",
    policy: {
      rules: [],
      fallback: "claude-code",
      overrides: [],
      llmFallbackEnabled: false,
    },
    privacy: {
      memoryEnabled: true,
      disabledDomains: [],
    },
    activeAgents: [],
    activeSkills: ["*"],
    createdAt: now,
    updatedAt: now,
  };
}
