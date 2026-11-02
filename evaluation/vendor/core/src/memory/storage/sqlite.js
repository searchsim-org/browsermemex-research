/**
 * SQLite storage backend for the WebNugget memory layer.
 *
 * Provides the schema and low-level CRUD that the four index components
 * (document store, metadata index, sparse FTS5 index, optional dense index)
 * share. Per ADR 0006 the backend is SQLite + FTS5 via @sqlite.org/sqlite-wasm.
 *
 * The init-module function is injected so this code runs unchanged in:
 *   - the browser extension service worker (load @sqlite.org/sqlite-wasm)
 *   - Node tests (load @sqlite.org/sqlite-wasm/dist/node.mjs)
 *
 * Schema is versioned via PRAGMA user_version; future migrations append.
 *
 * See ADR 0005, ADR 0006 and:
 *   "NuggetIndex: Governed Atomic Retrieval for Maintainable RAG"
 *   https://arxiv.org/html/2604.27306v1
 */

export const SCHEMA_VERSION = 3;

/** Default profile_id used for back-fill during v2 migration and as the
 *  legacy/default scope for callers that don't pass a profile id. */
export const LEGACY_PROFILE_ID = "default";

/**
 * Memory tiers. A nugget belongs to exactly one tier and can be promoted
 * (session → agent → profile → shared → public). Reads honour a tier
 * predicate; the default visible set is "everything in this profile up to
 * tier=shared". Public-tier reads optionally fan out to external memory
 * backends (YOARS-style) in future phases.
 */
export const MEMORY_TIER = Object.freeze({
  SESSION: "session",   // ephemeral; cleared at end of agent session
  AGENT: "agent",       // visible only to the writing agent across sessions
  PROFILE: "profile",   // shared across agents within the active profile (default)
  SHARED: "shared",     // shared across all profiles on this device
  PUBLIC: "public",     // mirrored to external memory backends (opt-in)
});

export const DEFAULT_TIER = MEMORY_TIER.PROFILE;

/**
 * @typedef {Object} SqliteStoreOptions
 * @property {Function} initModule           - the @sqlite.org/sqlite-wasm default export
 * @property {string} [path]                 - DB path; defaults to ':memory:'.
 *                                              For OPFS-SAHPool use a plain filename
 *                                              like 'browser-memex.sqlite3'.
 * @property {('memory'|'opfs-sahpool'|'opfs')} [vfs]
 *                                            'memory' (default) — in-memory DB
 *                                            'opfs-sahpool' — synchronous OPFS via SAHPool
 *                                                             (no COOP/COEP required)
 *                                            'opfs' — async OPFS VFS (requires
 *                                                     SharedArrayBuffer + COOP/COEP)
 * @property {object} [sahPoolOpts]           - extra options forwarded to
 *                                              installOpfsSAHPoolVfs when vfs is
 *                                              'opfs-sahpool' (e.g., `directory`,
 *                                              `initialCapacity`).
 */

export class SqliteStore {
  /**
   * @param {SqliteStoreOptions} opts
   */
  constructor(opts) {
    if (!opts || typeof opts.initModule !== "function") {
      throw new Error("SqliteStore: initModule is required");
    }
    this.initModule = opts.initModule;
    this.vfs = opts.vfs ?? "memory";
    this.path = opts.path ?? (this.vfs === "memory" ? ":memory:" : "browser-memex.sqlite3");
    this.sahPoolOpts = opts.sahPoolOpts ?? {};
    this.sqlite = null;
    this.db = null;
    this.sahUtil = null;
  }

  async open() {
    this.sqlite = await this.initModule();
    const dbPath = this.#resolveDbUri();
    if (this.vfs === "opfs-sahpool") {
      this.sahUtil = await this.sqlite.installOpfsSAHPoolVfs({
        name: "opfs-sahpool",
        ...this.sahPoolOpts,
      });
    }
    this.db = new this.sqlite.oo1.DB(dbPath, "c");
    await this.migrate();
  }

  #resolveDbUri() {
    switch (this.vfs) {
      case "memory":
        return ":memory:";
      case "opfs":
        return `file:${this.path}?vfs=opfs`;
      case "opfs-sahpool":
        return `file:${this.path}?vfs=opfs-sahpool`;
      default:
        throw new Error(`SqliteStore: unknown vfs '${this.vfs}'`);
    }
  }

  async migrate() {
    const rows = this.db.exec({
      sql: "PRAGMA user_version;",
      returnValue: "resultRows",
      rowMode: "array",
    });
    const current = Number(rows[0]?.[0] ?? 0);
    if (current >= SCHEMA_VERSION) return;

    this.db.exec("BEGIN");
    try {
      if (current < 1) this.applyV1();
      if (current < 2) this.applyV2();
      if (current < 3) this.applyV3();
      this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  /**
   * v2 — add profile_id scoping to nuggets so each Profile gets an isolated
   * memex. Existing rows are back-filled with LEGACY_PROFILE_ID.
   */
  applyV2() {
    this.db.exec(`
      ALTER TABLE nuggets ADD COLUMN profile_id TEXT NOT NULL DEFAULT '${LEGACY_PROFILE_ID}';
      CREATE INDEX idx_nuggets_profile ON nuggets(profile_id, scope, status);
    `);
  }

  /**
   * v3 — add memory tier scoping to nuggets (session / agent / profile /
   * shared / public). Existing rows default to 'profile', the safe shared
   * tier within a profile.
   */
  applyV3() {
    this.db.exec(`
      ALTER TABLE nuggets ADD COLUMN tier TEXT NOT NULL DEFAULT '${DEFAULT_TIER}';
      ALTER TABLE nuggets ADD COLUMN owner_session_id TEXT;
      ALTER TABLE nuggets ADD COLUMN owner_agent_id TEXT;
      CREATE INDEX idx_nuggets_tier ON nuggets(tier);
    `);
  }

  applyV1() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nuggets (
        id              TEXT PRIMARY KEY,
        kind            TEXT NOT NULL,
        subject         TEXT NOT NULL,
        predicate       TEXT NOT NULL,
        object          TEXT NOT NULL,
        canonical_text  TEXT NOT NULL,
        validity_start  INTEGER NOT NULL,
        validity_end    INTEGER,
        scope           TEXT NOT NULL,
        source_type     TEXT,
        location        TEXT,
        status          TEXT NOT NULL,
        rank            TEXT NOT NULL,
        confidence      REAL NOT NULL,
        nugget_key      TEXT NOT NULL,
        parent_id       TEXT,
        created_at      INTEGER NOT NULL
      );

      CREATE INDEX idx_nuggets_key       ON nuggets(nugget_key);
      CREATE INDEX idx_nuggets_validity  ON nuggets(validity_start, validity_end, status);
      CREATE INDEX idx_nuggets_scope     ON nuggets(scope);

      CREATE TABLE IF NOT EXISTS provenance (
        id                    INTEGER PRIMARY KEY AUTOINCREMENT,
        nugget_id             TEXT NOT NULL REFERENCES nuggets(id) ON DELETE CASCADE,
        source_url            TEXT,
        dom_element_ref       INTEGER,
        page_title            TEXT,
        screenshot_hash       TEXT,
        extracted_at          INTEGER NOT NULL,
        extraction_session_id TEXT,
        agent_id              TEXT
      );

      CREATE INDEX idx_provenance_nugget ON provenance(nugget_id);

      CREATE VIRTUAL TABLE nugget_fts USING fts5(
        canonical_text,
        content='nuggets',
        content_rowid='rowid',
        tokenize='unicode61'
      );

      CREATE TRIGGER nugget_fts_insert AFTER INSERT ON nuggets BEGIN
        INSERT INTO nugget_fts(rowid, canonical_text) VALUES (new.rowid, new.canonical_text);
      END;
      CREATE TRIGGER nugget_fts_delete AFTER DELETE ON nuggets BEGIN
        DELETE FROM nugget_fts WHERE rowid = old.rowid;
      END;
      CREATE TRIGGER nugget_fts_update AFTER UPDATE OF canonical_text ON nuggets BEGIN
        DELETE FROM nugget_fts WHERE rowid = old.rowid;
        INSERT INTO nugget_fts(rowid, canonical_text) VALUES (new.rowid, new.canonical_text);
      END;
    `);
  }

  /** Run a function inside a transaction. Caller's function may throw to roll back. */
  transact(fn) {
    this.db.exec("BEGIN");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  /** Low-level execute. Prefer the higher-level methods on NuggetStore. */
  exec(spec) {
    return this.db.exec(spec);
  }

  close() {
    if (this.db) this.db.close();
    this.db = null;
  }
}
