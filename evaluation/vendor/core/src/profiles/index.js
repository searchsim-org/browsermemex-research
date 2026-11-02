/**
 * @browser-memex/core/profiles — profile bundle management.
 */

export * from "./types.js";
export {
  ProfileStore,
  makeBrowserStorageAdapter,
  makeInMemoryStorageAdapter,
} from "./profile-store.js";
