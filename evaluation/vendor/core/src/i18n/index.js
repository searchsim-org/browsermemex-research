/**
 * i18n infrastructure (Phase 7.5).
 *
 * Minimal-but-real: a `t(key, params?)` translator that:
 *   - resolves keys against a flat string dictionary (the active locale)
 *   - interpolates `{name}` placeholders
 *   - falls back to the English bundle when a key is missing in the
 *     current locale
 *   - falls back to the key itself if even English is missing
 *
 * Bundles live under `locales/<lang>.json`. v1.0 ships English only;
 * structure is in place so a translator can drop in another file
 * without touching code.
 */

import en from "./locales/en.js";

const BUNDLES = { en };

let currentLocale = "en";

export function setLocale(locale) {
  if (typeof locale !== "string") throw new Error("setLocale: locale must be string");
  if (!(locale in BUNDLES)) {
    // Permit setting an unknown locale; t() will fall back to English.
    currentLocale = locale;
    return;
  }
  currentLocale = locale;
}

export function getLocale() {
  return currentLocale;
}

export function availableLocales() {
  return Object.keys(BUNDLES);
}

/**
 * Translate a dotted-key path. Returns the resolved string with `{param}`
 * placeholders substituted.
 */
export function t(key, params) {
  if (typeof key !== "string") return String(key ?? "");
  const tryBundle = (bundleName) => {
    const bundle = BUNDLES[bundleName];
    if (!bundle) return undefined;
    return key.split(".").reduce((cur, part) => (cur && typeof cur === "object" ? cur[part] : undefined), bundle);
  };
  const resolved = tryBundle(currentLocale) ?? tryBundle("en") ?? key;
  if (typeof resolved !== "string") return key;
  return interpolate(resolved, params);
}

/**
 * Register a new locale bundle at runtime. Useful if translations are
 * loaded lazily from a server in a future build.
 */
export function registerLocale(locale, bundle) {
  BUNDLES[locale] = bundle;
}

function interpolate(template, params) {
  if (!params || typeof params !== "object") return template;
  return template.replace(/\{(\w+)\}/g, (m, name) => {
    return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m;
  });
}
