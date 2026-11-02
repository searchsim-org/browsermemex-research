/**
 * Profile system tests.
 * node packages/core/test/profiles.test.mjs
 */

import assert from "node:assert/strict";
import {
  ProfileStore,
  makeInMemoryStorageAdapter,
  makeDefaultProfile,
  PROFILES_KEY,
  ACTIVE_PROFILE_KEY,
  DEFAULT_PROFILE_ID,
} from "../src/profiles/index.js";

let testCount = 0;
async function test(name, fn) {
  testCount++;
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}`);
    process.exit(1);
  }
}

const NOW = Date.UTC(2026, 4, 17, 12, 0, 0);

function makeStore(initial = {}) {
  const storage = makeInMemoryStorageAdapter(initial);
  return { store: new ProfileStore({ storage }), storage };
}

await test("makeDefaultProfile: shape + id", () => {
  const p = makeDefaultProfile(NOW);
  assert.equal(p.id, DEFAULT_PROFILE_ID);
  assert.equal(p.name, "Default");
  assert.equal(p.privacy.memoryEnabled, true);
  assert.deepEqual(p.activeSkills, ["*"]);
});

await test("list: empty → []", async () => {
  const { store } = makeStore();
  assert.deepEqual(await store.list(), []);
});

await test("getActive: creates default on empty store, persists both keys", async () => {
  const { store, storage } = makeStore();
  const p = await store.getActive(NOW);
  assert.equal(p.id, DEFAULT_PROFILE_ID);
  const list = await storage.get(PROFILES_KEY);
  assert.equal(list.length, 1);
  assert.equal(await storage.get(ACTIVE_PROFILE_KEY), DEFAULT_PROFILE_ID);
});

await test("getActive: returns existing active profile when set", async () => {
  const { store, storage } = makeStore();
  await store.getActive(NOW); // creates default
  const created = await store.create({ name: "Work" }, NOW + 1);
  await store.setActive(created.id);
  const active = await store.getActive(NOW + 2);
  assert.equal(active.id, created.id);
  assert.equal(await storage.get(ACTIVE_PROFILE_KEY), created.id);
});

await test("getActive: falls back to first profile if activeId is invalid", async () => {
  const { store } = makeStore({
    [PROFILES_KEY]: [makeDefaultProfile(NOW)],
    [ACTIVE_PROFILE_KEY]: "ghost",
  });
  const active = await store.getActive(NOW);
  assert.equal(active.id, DEFAULT_PROFILE_ID);
});

await test("create: rejects empty name", async () => {
  const { store } = makeStore();
  await store.getActive(NOW);
  await assert.rejects(() => store.create({ name: "  " }, NOW), /name required/);
});

await test("create: rejects duplicate name (case-insensitive)", async () => {
  const { store } = makeStore();
  await store.getActive(NOW);
  await store.create({ name: "Work" }, NOW + 1);
  await assert.rejects(() => store.create({ name: "work" }, NOW + 2), /already exists/);
});

await test("update: bumps updatedAt and rejects collisions", async () => {
  const { store } = makeStore();
  await store.getActive(NOW);
  const work = await store.create({ name: "Work" }, NOW + 1);
  const personal = await store.create({ name: "Personal" }, NOW + 2);
  await assert.rejects(
    () => store.update(personal.id, { name: "Work" }, NOW + 3),
    /already exists/
  );
  const renamed = await store.update(personal.id, { name: "Home" }, NOW + 4);
  assert.equal(renamed.name, "Home");
  assert.ok(renamed.updatedAt > personal.updatedAt);
});

await test("delete: refuses last profile", async () => {
  const { store } = makeStore();
  await store.getActive(NOW);
  await assert.rejects(() => store.delete(DEFAULT_PROFILE_ID), /last remaining/);
});

await test("delete: refuses currently active", async () => {
  const { store } = makeStore();
  await store.getActive(NOW);
  await store.create({ name: "B" }, NOW + 1);
  await assert.rejects(() => store.delete(DEFAULT_PROFILE_ID), /currently active/);
});

await test("delete: removes a non-active profile", async () => {
  const { store } = makeStore();
  await store.getActive(NOW);
  const b = await store.create({ name: "B" }, NOW + 1);
  await store.delete(b.id);
  assert.equal((await store.list()).length, 1);
});

await test("duplicate: deep-clones a profile under a new name + id", async () => {
  const { store } = makeStore();
  await store.getActive(NOW);
  const src = await store.create(
    {
      name: "Work",
      privacy: { memoryEnabled: false, disabledDomains: ["bank.com"] },
    },
    NOW + 1
  );
  const copy = await store.duplicate(src.id, "Work Backup", NOW + 2);
  assert.notEqual(copy.id, src.id);
  assert.equal(copy.name, "Work Backup");
  assert.equal(copy.privacy.memoryEnabled, false);
  // Mutating the copy doesn't affect the source
  copy.privacy.disabledDomains.push("other.com");
  const reloaded = await store.get(src.id);
  assert.deepEqual(reloaded.privacy.disabledDomains, ["bank.com"]);
});

await test("setActive: unknown id rejects", async () => {
  const { store } = makeStore();
  await store.getActive(NOW);
  await assert.rejects(() => store.setActive("nope"), /not found/);
});

console.log(`\nAll ${testCount} tests passed.`);
