/**
 * SQLite storage for the task scheduler.
 *
 * Separate database from the WebNugget memory layer — different lifecycle,
 * different schema, no shared transactional invariants. Uses the same
 * SqliteStore base from @browser-memex/core/memory/storage/sqlite.js for
 * the init-module / vfs / migration machinery.
 *
 * Schema versioned via PRAGMA user_version. v1 ships three tables:
 *   tasks           — the durable task definition + status
 *   task_runs       — every execution attempt (success or failure)
 *   tracker_samples — time-series for TRACKER tasks
 */

export const TASKS_SCHEMA_VERSION = 3;

/** Back-fill profile id for v3 migration and back-compat with callers that
 *  don't pass a profile scope. */
export const LEGACY_PROFILE_ID = "default";

export class TaskSqliteStore {
  /**
   * @param {object} opts
   * @param {Function} opts.initModule       — @sqlite.org/sqlite-wasm default export
   * @param {string} [opts.path]
   * @param {'memory'|'opfs'|'opfs-sahpool'} [opts.vfs='memory']
   */
  constructor(opts) {
    if (!opts || typeof opts.initModule !== "function") {
      throw new Error("TaskSqliteStore: initModule is required");
    }
    this.initModule = opts.initModule;
    this.vfs = opts.vfs ?? "memory";
    this.path =
      opts.path ?? (this.vfs === "memory" ? ":memory:" : "browser-memex-tasks.sqlite3");
    this.sqlite = null;
    this.db = null;
    this.sahUtil = null;
  }

  async open() {
    this.sqlite = await this.initModule();
    const uri = this.#resolveDbUri();
    if (this.vfs === "opfs-sahpool") {
      this.sahUtil = await this.sqlite.installOpfsSAHPoolVfs({ name: "opfs-sahpool" });
    }
    this.db = new this.sqlite.oo1.DB(uri, "c");
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
        throw new Error(`TaskSqliteStore: unknown vfs '${this.vfs}'`);
    }
  }

  async migrate() {
    const rows = this.db.exec({
      sql: "PRAGMA user_version;",
      returnValue: "resultRows",
      rowMode: "array",
    });
    const current = Number(rows[0]?.[0] ?? 0);
    if (current >= TASKS_SCHEMA_VERSION) return;

    this.db.exec("BEGIN");
    try {
      if (current < 1) this.applyV1();
      if (current < 2) this.applyV2();
      if (current < 3) this.applyV3();
      this.db.exec(`PRAGMA user_version = ${TASKS_SCHEMA_VERSION};`);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  /**
   * v3 — add profile_id scoping to tasks. Existing rows are back-filled with
   * LEGACY_PROFILE_ID so they stay visible to the default profile.
   */
  applyV3() {
    this.db.exec(`
      ALTER TABLE tasks ADD COLUMN profile_id TEXT NOT NULL DEFAULT '${LEGACY_PROFILE_ID}';
      CREATE INDEX idx_tasks_profile ON tasks(profile_id, status, next_run_at);
    `);
  }

  /**
   * v2 — cost accounting columns on task_runs + routing decision column on tasks.
   * Used by the Router (Phase 5) to record per-run cost and the chosen agent's
   * explanation. Additive; existing rows unaffected (NULL on new columns).
   */
  applyV2() {
    this.db.exec(`
      ALTER TABLE task_runs ADD COLUMN cost_usd REAL;
      ALTER TABLE task_runs ADD COLUMN tokens_input INTEGER;
      ALTER TABLE task_runs ADD COLUMN tokens_output INTEGER;
      ALTER TABLE task_runs ADD COLUMN provider TEXT;
      ALTER TABLE task_runs ADD COLUMN model TEXT;
      ALTER TABLE task_runs ADD COLUMN routed_agent TEXT;
      ALTER TABLE task_runs ADD COLUMN routing_source TEXT;
      ALTER TABLE task_runs ADD COLUMN routing_rule_id TEXT;
      ALTER TABLE task_runs ADD COLUMN routing_explanation TEXT;
    `);
  }

  applyV1() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id              TEXT PRIMARY KEY,
        kind            TEXT NOT NULL,
        status          TEXT NOT NULL,
        title           TEXT NOT NULL,
        description     TEXT,
        schedule        TEXT,
        payload         TEXT NOT NULL,
        routing         TEXT,
        capability      TEXT NOT NULL,
        creator         TEXT NOT NULL,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
        next_run_at     INTEGER,
        last_run_at     INTEGER,
        run_count       INTEGER NOT NULL DEFAULT 0,
        failure_count   INTEGER NOT NULL DEFAULT 0,
        hmac            TEXT NOT NULL,
        watcher         TEXT
      );

      CREATE INDEX idx_tasks_ready ON tasks(status, next_run_at);
      CREATE INDEX idx_tasks_creator ON tasks(creator);

      CREATE TABLE IF NOT EXISTS task_runs (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id           TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        started_at        INTEGER NOT NULL,
        ended_at          INTEGER,
        status            TEXT NOT NULL,
        result            TEXT,
        error             TEXT,
        extracted_value   REAL,
        extracted_text    TEXT,
        notification_sent INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX idx_task_runs_task ON task_runs(task_id, started_at);

      CREATE TABLE IF NOT EXISTS tracker_samples (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        recorded_at   INTEGER NOT NULL,
        value         REAL,
        text          TEXT
      );

      CREATE INDEX idx_tracker_samples_task ON tracker_samples(task_id, recorded_at);
    `);
  }

  transact(fn) {
    this.db.exec("BEGIN");
    try {
      const r = fn();
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  exec(spec) {
    return this.db.exec(spec);
  }

  close() {
    if (this.db) this.db.close();
    this.db = null;
  }
}
