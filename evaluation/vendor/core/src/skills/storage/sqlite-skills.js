/**
 * SQLite storage for the skill library.
 *
 * Separate database from the WebNugget memory and the task scheduler — skills
 * have their own lifecycle (manual edits, versioning, sharing) and shouldn't
 * conflate with task-history retention policies.
 *
 * Schema v1:
 *   skills          — durable record (full JSON for nested fields)
 *   skill_runs      — history of skill invocations (separate from task_runs)
 */

export const SKILLS_SCHEMA_VERSION = 2;

/** Back-fill profile id for v2 migration and back-compat with callers that
 *  don't pass a profile scope. */
export const LEGACY_PROFILE_ID = "default";

export class SkillSqliteStore {
  constructor(opts) {
    if (!opts || typeof opts.initModule !== "function") {
      throw new Error("SkillSqliteStore: initModule is required");
    }
    this.initModule = opts.initModule;
    this.vfs = opts.vfs ?? "memory";
    this.path =
      opts.path ?? (this.vfs === "memory" ? ":memory:" : "browser-memex-skills.sqlite3");
    this.sqlite = null;
    this.db = null;
    this.sahUtil = null;
  }

  async open() {
    this.sqlite = await this.initModule();
    if (this.vfs === "opfs-sahpool") {
      this.sahUtil = await this.sqlite.installOpfsSAHPoolVfs({ name: "opfs-sahpool" });
    }
    const uri = this.#uri();
    this.db = new this.sqlite.oo1.DB(uri, "c");
    await this.migrate();
  }

  #uri() {
    switch (this.vfs) {
      case "memory":
        return ":memory:";
      case "opfs":
        return `file:${this.path}?vfs=opfs`;
      case "opfs-sahpool":
        return `file:${this.path}?vfs=opfs-sahpool`;
      default:
        throw new Error(`SkillSqliteStore: unknown vfs '${this.vfs}'`);
    }
  }

  async migrate() {
    const rows = this.db.exec({
      sql: "PRAGMA user_version;",
      returnValue: "resultRows",
      rowMode: "array",
    });
    const current = Number(rows[0]?.[0] ?? 0);
    if (current >= SKILLS_SCHEMA_VERSION) return;

    this.db.exec("BEGIN");
    try {
      if (current < 1) this.applyV1();
      if (current < 2) this.applyV2();
      this.db.exec(`PRAGMA user_version = ${SKILLS_SCHEMA_VERSION};`);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  /**
   * v2 — add profile_id; drop the global UNIQUE(name) constraint in favour of
   * UNIQUE(name, profile_id) so each profile gets its own namespace. SQLite
   * has no DROP CONSTRAINT, so we recreate the table.
   */
  applyV2() {
    this.db.exec(`
      CREATE TABLE skills_new (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        description     TEXT,
        status          TEXT NOT NULL,
        trigger         TEXT,
        domains         TEXT NOT NULL,
        steps           TEXT NOT NULL,
        inputs          TEXT NOT NULL,
        outputs         TEXT NOT NULL,
        capability      TEXT NOT NULL,
        provenance      TEXT NOT NULL,
        shareable       INTEGER NOT NULL DEFAULT 0,
        version         INTEGER NOT NULL DEFAULT 1,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
        hmac            TEXT NOT NULL,
        profile_id      TEXT NOT NULL DEFAULT '${LEGACY_PROFILE_ID}',
        UNIQUE(name, profile_id)
      );

      INSERT INTO skills_new (
        id, name, description, status, trigger, domains, steps, inputs, outputs,
        capability, provenance, shareable, version, created_at, updated_at, hmac, profile_id
      )
      SELECT
        id, name, description, status, trigger, domains, steps, inputs, outputs,
        capability, provenance, shareable, version, created_at, updated_at, hmac, '${LEGACY_PROFILE_ID}'
      FROM skills;

      DROP TABLE skills;
      ALTER TABLE skills_new RENAME TO skills;

      CREATE INDEX idx_skills_status ON skills(status);
      CREATE INDEX idx_skills_profile ON skills(profile_id, status);
    `);
  }

  applyV1() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS skills (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL UNIQUE,
        description     TEXT,
        status          TEXT NOT NULL,
        trigger         TEXT,
        domains         TEXT NOT NULL,
        steps           TEXT NOT NULL,
        inputs          TEXT NOT NULL,
        outputs         TEXT NOT NULL,
        capability      TEXT NOT NULL,
        provenance      TEXT NOT NULL,
        shareable       INTEGER NOT NULL DEFAULT 0,
        version         INTEGER NOT NULL DEFAULT 1,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
        hmac            TEXT NOT NULL
      );

      CREATE INDEX idx_skills_status ON skills(status);
      -- v2 (applied via applyV2) will add profile_id and re-key UNIQUE to (name, profile_id).

      CREATE TABLE IF NOT EXISTS skill_runs (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_id        TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
        started_at      INTEGER NOT NULL,
        ended_at        INTEGER,
        status          TEXT NOT NULL,
        inputs          TEXT,
        outputs         TEXT,
        error           TEXT,
        task_ids        TEXT
      );

      CREATE INDEX idx_skill_runs_skill ON skill_runs(skill_id, started_at);
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
