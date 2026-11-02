/**
 * i18n tests (Phase 7.5).
 * node packages/core/test/i18n.test.mjs
 */

import assert from "node:assert/strict";
import { t, setLocale, getLocale, availableLocales, registerLocale } from "../src/i18n/index.js";

let testCount = 0;
function test(name, fn) {
  testCount++;
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}`);
    process.exit(1);
  }
}

test("english locale is the default", () => {
  assert.equal(getLocale(), "en");
  assert.deepEqual(availableLocales(), ["en"]);
});

test("t resolves a known dotted key", () => {
  assert.equal(t("app.title"), "BrowserMemex");
  assert.equal(t("tabs.tasks"), "Tasks");
});

test("t falls back to the key when missing in all bundles", () => {
  assert.equal(t("totally.unknown.key"), "totally.unknown.key");
});

test("t interpolates {param} placeholders", () => {
  registerLocale("test", { hello: "Hi {name}, you have {count} messages" });
  setLocale("test");
  assert.equal(t("hello", { name: "Alice", count: 3 }), "Hi Alice, you have 3 messages");
  setLocale("en");
});

test("t falls back to English when current locale lacks the key", () => {
  registerLocale("fr", { app: { tagline: "" } });
  setLocale("fr");
  assert.equal(t("app.title"), "BrowserMemex"); // missing in fr → fallback
  setLocale("en");
});

test("unknown locale still set, falls back to en", () => {
  setLocale("xx-NOPE");
  assert.equal(getLocale(), "xx-NOPE");
  assert.equal(t("app.title"), "BrowserMemex");
  setLocale("en");
});

test("interpolation leaves unmatched placeholders alone", () => {
  registerLocale("test2", { msg: "Hi {a}, hi {b}" });
  setLocale("test2");
  assert.equal(t("msg", { a: "x" }), "Hi x, hi {b}");
  setLocale("en");
});

console.log(`\nAll ${testCount} tests passed.`);
