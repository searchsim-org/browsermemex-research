/**
 * HMAC signing for skill export/import.
 *
 * Goal: tamper detection when transferring skills between machines. Not
 * cryptographic identity — we accept anyone can re-sign by knowing the key.
 * The signature ensures the skill content matches what was signed; if a
 * downloaded skill has been edited in transit (e.g., a step pointing at a
 * different URL), import fails loudly.
 *
 * Algorithm: FNV-1a 64-bit over a canonical JSON serialization (sorted keys,
 * recursive). Fast, deterministic, no Web Crypto required.
 */

/**
 * Canonicalize a value to a stable JSON string: object keys are sorted, arrays
 * preserve order. Null / boolean / number / string passthrough.
 *
 * Important: the `hmac` field itself is excluded from serialization when
 * signing a Skill object — otherwise signing the result of signing would
 * be unstable.
 */
export function canonicalize(value, { excludeKey } = {}) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map((v) => canonicalize(v, { excludeKey })).join(",") + "]";
  }
  const keys = Object.keys(value)
    .filter((k) => k !== excludeKey)
    .sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k], { excludeKey })}`);
  return "{" + parts.join(",") + "}";
}

/**
 * FNV-1a 64-bit hash of a string. Returns 16-char hex.
 */
export function fnv1a64(input) {
  let hash = 0xcbf29ce484222325n;
  const PRIME = 0x100000001b3n;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * PRIME) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

/**
 * Compute the HMAC tag for a skill. The `hmac` field on the skill (if any) is
 * excluded from the canonicalization so this is idempotent.
 */
export function signSkill(skill) {
  return fnv1a64(canonicalize(skill, { excludeKey: "hmac" }));
}

/**
 * Verify that a skill's `hmac` matches its content. Returns true if valid.
 * Used by import paths to reject tampered exports.
 */
export function verifySkill(skill) {
  if (!skill || typeof skill.hmac !== "string") return false;
  return signSkill(skill) === skill.hmac;
}

/**
 * Produce a portable export envelope. Includes a version tag for future
 * format upgrades.
 */
export function exportSkill(skill) {
  return {
    format: "browser-memex.skill.v1",
    skill: { ...skill, hmac: signSkill(skill) },
  };
}

/**
 * Read a portable envelope. Verifies signature and format. Throws on
 * tampered or unsupported content.
 */
export function importSkillEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object") {
    throw new Error("import: envelope must be an object");
  }
  if (envelope.format !== "browser-memex.skill.v1") {
    throw new Error(`import: unsupported format '${envelope.format}'`);
  }
  if (!envelope.skill || typeof envelope.skill !== "object") {
    throw new Error("import: missing skill payload");
  }
  if (!verifySkill(envelope.skill)) {
    throw new Error("import: HMAC verification failed — skill content has been tampered with");
  }
  return envelope.skill;
}
