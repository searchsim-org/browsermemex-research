/**
 * SkillStore — public API for the skill library.
 *
 * Operations:
 *   create(spec)                    → Skill
 *   confirmFromProposal(proposal)   → Skill        (turn a distillation
 *                                                    candidate into a Skill)
 *   get(id) / getByName(name)
 *   list(filter)
 *   update(id, patch)               → Skill        (bumps version + hmac)
 *   archive(id) / unarchive(id)
 *   delete(id)
 *   recordRun(id, run)
 *   runs(id, limit)
 *   exportSkill(id)                 → portable envelope
 *   importEnvelope(envelope)        → Skill        (verifies HMAC)
 */

import { SKILL_STATUS } from "./types.js";
import { signSkill, exportSkill, importSkillEnvelope } from "./signing.js";
import { LEGACY_PROFILE_ID } from "./storage/sqlite-skills.js";

function newSkillId(now) {
  const r = Math.floor(Math.random() * 0xfffff).toString(16).padStart(5, "0");
  return `skill-${now.toString(36)}-${r}`;
}

export class SkillStore {
  /**
   * @param {object} options
   * @param {import("./storage/sqlite-skills.js").SkillSqliteStore} options.storage
   */
  constructor({ storage }) {
    this.storage = storage;
  }

  async open() {
    if (!this.storage.db) await this.storage.open();
  }

  close() {
    this.storage.close();
  }

  /**
   * Create a fresh skill from a manual spec.
   */
  create(spec, now, profileId = LEGACY_PROFILE_ID) {
    this.#requireFields(spec);
    const targetProfile = spec.profileId ?? profileId;
    if (this.getByName(spec.name, targetProfile)) {
      throw new Error(`SkillStore.create: name '${spec.name}' is already taken in this profile`);
    }
    const skill = {
      id: newSkillId(now),
      name: spec.name,
      description: spec.description ?? null,
      status: SKILL_STATUS.ACTIVE,
      trigger: spec.trigger ?? null,
      domains: Array.isArray(spec.domains) ? spec.domains : [],
      steps: Array.isArray(spec.steps) ? spec.steps : [],
      inputs: Array.isArray(spec.inputs) ? spec.inputs : [],
      outputs: Array.isArray(spec.outputs) ? spec.outputs : [],
      capability: spec.capability,
      provenance: {
        distilledFromTaskIds: [],
        confirmedRuns: 0,
        lastSuccessAt: null,
        successRate: 0,
      },
      shareable: Boolean(spec.shareable),
      version: 1,
      createdAt: now,
      updatedAt: now,
      hmac: "",
      profileId: targetProfile,
    };
    skill.hmac = signSkill(skill);
    this.storage.transact(() => this.#insertRow(skill));
    return skill;
  }

  /**
   * Promote a distillation candidate to a stored Skill. The user has
   * effectively confirmed they want this skill.
   */
  confirmFromProposal(proposal, now, opts = {}) {
    if (!proposal || typeof proposal !== "object") {
      throw new Error("confirmFromProposal: proposal required");
    }
    const skill = this.create(
      {
        name: opts.name ?? proposal.suggestedName,
        description: opts.description ?? proposal.explanation,
        steps: [
          {
            id: "step-1",
            kind: "run_task",
            params: { template: proposal.template },
          },
        ],
        capability: opts.capability ?? "read_with_network",
        trigger: opts.trigger ?? null,
        domains: opts.domains ?? [],
        inputs: opts.inputs ?? [],
        outputs: opts.outputs ?? [],
      },
      now
    );
    // Replace provenance to point back at the source tasks
    const updated = this.update(
      skill.id,
      {
        provenance: {
          distilledFromTaskIds: proposal.sourceTaskIds,
          confirmedRuns: 0,
          lastSuccessAt: null,
          successRate: 0,
        },
      },
      now
    );
    return updated;
  }

  get(id) {
    const rows = this.storage.exec({
      sql: "SELECT * FROM skills WHERE id = $id",
      bind: { $id: id },
      returnValue: "resultRows",
      rowMode: "object",
    });
    return rows[0] ? this.#rowToSkill(rows[0]) : null;
  }

  getByName(name, profileId = null) {
    const profileClause = profileId ? " AND profile_id = $profile_id" : "";
    const bind = { $name: name };
    if (profileId) bind.$profile_id = profileId;
    const rows = this.storage.exec({
      sql: `SELECT * FROM skills WHERE name = $name${profileClause}`,
      bind,
      returnValue: "resultRows",
      rowMode: "object",
    });
    return rows[0] ? this.#rowToSkill(rows[0]) : null;
  }

  list({ status, profileId = null, limit = 100 } = {}) {
    const clauses = [];
    const bind = { $limit: limit };
    if (status) {
      clauses.push("status = $status");
      bind.$status = status;
    }
    if (profileId) {
      clauses.push("profile_id = $profile_id");
      bind.$profile_id = profileId;
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.storage.exec({
      sql: `SELECT * FROM skills ${where} ORDER BY updated_at DESC LIMIT $limit`,
      bind,
      returnValue: "resultRows",
      rowMode: "object",
    });
    return rows.map((r) => this.#rowToSkill(r));
  }

  update(id, patch, now) {
    return this.storage.transact(() => {
      const current = this.get(id);
      if (!current) throw new Error(`SkillStore.update: '${id}' not found`);
      const next = {
        ...current,
        ...patch,
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: now,
        version: current.version + 1,
      };
      next.hmac = signSkill(next);
      this.#updateRow(next);
      return next;
    });
  }

  archive(id, now) {
    return this.update(id, { status: SKILL_STATUS.ARCHIVED }, now);
  }
  unarchive(id, now) {
    return this.update(id, { status: SKILL_STATUS.ACTIVE }, now);
  }

  delete(id) {
    this.storage.exec({
      sql: "DELETE FROM skills WHERE id = $id",
      bind: { $id: id },
    });
  }

  recordRun(skillId, run, now) {
    return this.storage.transact(() => {
      const skill = this.get(skillId);
      if (!skill) throw new Error(`recordRun: skill '${skillId}' not found`);
      this.storage.exec({
        sql: `
          INSERT INTO skill_runs (skill_id, started_at, ended_at, status, inputs, outputs, error, task_ids)
          VALUES ($id, $started, $ended, $status, $inputs, $outputs, $error, $taskIds)
        `,
        bind: {
          $id: skillId,
          $started: run.startedAt ?? now,
          $ended: run.endedAt ?? now,
          $status: run.status ?? "success",
          $inputs: run.inputs ? JSON.stringify(run.inputs) : null,
          $outputs: run.outputs ? JSON.stringify(run.outputs) : null,
          $error: run.error ?? null,
          $taskIds: Array.isArray(run.taskIds) ? JSON.stringify(run.taskIds) : null,
        },
      });

      const currentRuns = skill.provenance.confirmedRuns + 1;
      const successCount =
        Math.round(skill.provenance.successRate * skill.provenance.confirmedRuns) +
        (run.status === "success" ? 1 : 0);
      const successRate = currentRuns > 0 ? successCount / currentRuns : 0;
      const newProvenance = {
        ...skill.provenance,
        confirmedRuns: currentRuns,
        lastSuccessAt: run.status === "success" ? now : skill.provenance.lastSuccessAt,
        successRate,
      };
      const next = {
        ...skill,
        provenance: newProvenance,
        updatedAt: now,
      };
      next.hmac = signSkill(next);
      this.#updateRow(next);
      return next;
    });
  }

  runs(skillId, limit = 50) {
    const rows = this.storage.exec({
      sql: `
        SELECT * FROM skill_runs WHERE skill_id = $id
        ORDER BY started_at DESC LIMIT $limit
      `,
      bind: { $id: skillId, $limit: limit },
      returnValue: "resultRows",
      rowMode: "object",
    });
    return rows.map((r) => ({
      id: r.id,
      skillId: r.skill_id,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      status: r.status,
      inputs: r.inputs ? safeParse(r.inputs) : null,
      outputs: r.outputs ? safeParse(r.outputs) : null,
      error: r.error,
      taskIds: r.task_ids ? safeParse(r.task_ids) : null,
    }));
  }

  /** Export a skill as a signed envelope for cross-machine sharing. */
  exportSkill(id) {
    const skill = this.get(id);
    if (!skill) throw new Error(`exportSkill: '${id}' not found`);
    return exportSkill(skill);
  }

  /** Import a skill envelope; verifies HMAC. Returns the stored skill. */
  importEnvelope(envelope, now, profileId = LEGACY_PROFILE_ID) {
    const skill = importSkillEnvelope(envelope);
    if (this.getByName(skill.name, profileId)) {
      throw new Error(`importEnvelope: name '${skill.name}' already exists in this profile`);
    }
    const stored = {
      ...skill,
      id: newSkillId(now),
      createdAt: now,
      updatedAt: now,
      profileId,
    };
    stored.hmac = signSkill(stored);
    this.storage.transact(() => this.#insertRow(stored));
    return stored;
  }

  // ===== private =====

  #requireFields(spec) {
    if (!spec.name || typeof spec.name !== "string") {
      throw new Error("create: name required");
    }
    if (!spec.capability) throw new Error("create: capability required");
    if (!Array.isArray(spec.steps) || spec.steps.length === 0) {
      throw new Error("create: at least one step required");
    }
  }

  #insertRow(s) {
    this.storage.exec({
      sql: `
        INSERT INTO skills (
          id, name, description, status, trigger, domains, steps, inputs, outputs,
          capability, provenance, shareable, version, created_at, updated_at, hmac, profile_id
        ) VALUES (
          $id, $name, $description, $status, $trigger, $domains, $steps, $inputs, $outputs,
          $capability, $provenance, $shareable, $version, $createdAt, $updatedAt, $hmac, $profileId
        )
      `,
      bind: {
        $id: s.id,
        $name: s.name,
        $description: s.description,
        $status: s.status,
        $trigger: s.trigger ? JSON.stringify(s.trigger) : null,
        $domains: JSON.stringify(s.domains),
        $steps: JSON.stringify(s.steps),
        $inputs: JSON.stringify(s.inputs),
        $outputs: JSON.stringify(s.outputs),
        $capability: s.capability,
        $provenance: JSON.stringify(s.provenance),
        $shareable: s.shareable ? 1 : 0,
        $version: s.version,
        $createdAt: s.createdAt,
        $updatedAt: s.updatedAt,
        $hmac: s.hmac,
        $profileId: s.profileId ?? LEGACY_PROFILE_ID,
      },
    });
  }

  #updateRow(s) {
    this.storage.exec({
      sql: `
        UPDATE skills SET
          name = $name, description = $description, status = $status,
          trigger = $trigger, domains = $domains, steps = $steps,
          inputs = $inputs, outputs = $outputs, capability = $capability,
          provenance = $provenance, shareable = $shareable, version = $version,
          updated_at = $updatedAt, hmac = $hmac
        WHERE id = $id
      `,
      bind: {
        $id: s.id,
        $name: s.name,
        $description: s.description,
        $status: s.status,
        $trigger: s.trigger ? JSON.stringify(s.trigger) : null,
        $domains: JSON.stringify(s.domains),
        $steps: JSON.stringify(s.steps),
        $inputs: JSON.stringify(s.inputs),
        $outputs: JSON.stringify(s.outputs),
        $capability: s.capability,
        $provenance: JSON.stringify(s.provenance),
        $shareable: s.shareable ? 1 : 0,
        $version: s.version,
        $updatedAt: s.updatedAt,
        $hmac: s.hmac,
      },
    });
  }

  #rowToSkill(row) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      trigger: row.trigger ? safeParse(row.trigger) : null,
      domains: safeParse(row.domains) ?? [],
      steps: safeParse(row.steps) ?? [],
      inputs: safeParse(row.inputs) ?? [],
      outputs: safeParse(row.outputs) ?? [],
      capability: row.capability,
      provenance: safeParse(row.provenance) ?? {
        distilledFromTaskIds: [],
        confirmedRuns: 0,
        lastSuccessAt: null,
        successRate: 0,
      },
      shareable: Boolean(row.shareable),
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      hmac: row.hmac,
      profileId: row.profile_id ?? LEGACY_PROFILE_ID,
    };
  }
}

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
