/**
 * NuggetStore — the public API for the WebNugget memory layer.
 *
 * Wires the four index components together on top of a SqliteStore. Callers
 * insert / update / query nuggets without thinking about SQL or about which
 * table holds what. Algorithms 1 and 2 run inside `insert()` so every nugget
 * that lands in storage has validity inferred and conflict-checked.
 *
 * Public surface:
 *   - new NuggetStore({ storage })
 *   - await store.open()
 *   - await store.insert({ candidate })        // applies Algorithm 2 + side effects
 *   - await store.query(text, { time, view, scope, topK })
 *   - await store.size()
 *   - await store.close()
 *
 * See ADR 0005, ADR 0006 and:
 *   "NuggetIndex: Governed Atomic Retrieval for Maintainable RAG"
 *   https://arxiv.org/html/2604.27306v1
 */

import { STATUS, VIEW } from "./types.js";
import { computeKey, computeNuggetId } from "./keying.js";
import { detectConflict, CONFLICT_OUTCOME } from "./algorithms/conflicts.js";
import { LEGACY_PROFILE_ID, MEMORY_TIER, DEFAULT_TIER } from "./storage/sqlite.js";

/** Maximum number of results returned by query() unless overridden. */
const DEFAULT_TOP_K = 20;

export class NuggetStore {
  /**
   * @param {object} options
   * @param {import("./storage/sqlite.js").SqliteStore} options.storage
   */
  constructor({ storage }) {
    this.storage = storage;
  }

  async open() {
    if (!this.storage.db) await this.storage.open();
  }

  /**
   * Insert a candidate nugget. Runs Algorithm 2 (conflict detection) against
   * existing nuggets sharing the candidate's key, applies any updates to
   * existing records, then writes the candidate with the right status.
   *
   * Returns { outcome, nuggetId, candidateStatus, appliedUpdates }.
   */
  insert(candidate, profileId = LEGACY_PROFILE_ID) {
    this.#ensureFields(candidate);
    if (!candidate.profileId) candidate.profileId = profileId;
    if (!candidate.id) candidate.id = computeNuggetId(candidate);
    if (!candidate.nuggetKey) candidate.nuggetKey = computeKey(candidate);

    const sameKey = this.#findByKey(
      candidate.nuggetKey,
      candidate.validity.scope,
      candidate.profileId
    );
    const conflict = detectConflict(candidate, sameKey);

    return this.storage.transact(() => {
      let nuggetId = candidate.id;

      // Apply updates to existing records first
      for (const update of conflict.updates) {
        const sets = [];
        const bind = { $id: update.id };
        if (update.status) {
          sets.push("status = $status");
          bind.$status = update.status;
        }
        if (update.validityEnd !== undefined) {
          sets.push("validity_end = $validity_end");
          bind.$validity_end = update.validityEnd;
        }
        if (sets.length > 0) {
          this.storage.exec({
            sql: `UPDATE nuggets SET ${sets.join(", ")} WHERE id = $id`,
            bind,
          });
        }
      }

      // Merge or insert the candidate
      if (conflict.outcome === CONFLICT_OUTCOME.MERGED) {
        this.#mergeProvenance(conflict.mergeIntoId, candidate.provenance ?? []);
        nuggetId = conflict.mergeIntoId;
      } else {
        // Status was decided by Algorithm 2; default to candidate's status field
        if (conflict.newStatus) {
          if (!candidate.epistemic) candidate.epistemic = { rank: "Normal", confidence: 0.9 };
          candidate.epistemic.status = conflict.newStatus;
        }
        this.#insertRow(candidate);
        this.#insertProvenance(candidate.id, candidate.provenance ?? []);
      }

      return {
        outcome: conflict.outcome,
        nuggetId,
        candidateStatus: candidate.epistemic?.status ?? STATUS.ACTIVE,
        appliedUpdates: conflict.updates,
      };
    });
  }

  /**
   * Run a NuggetIndex-style four-step retrieval:
   *   1. View filter (validity at t + status in view)
   *   2. BM25 candidate retrieval via FTS5
   *   3. Score fusion (BM25 weight only in Lexical-Only mode)
   *   4. Top-K
   *
   * @param {string} queryText
   * @param {object} options
   * @param {number} [options.time]      — query time (Unix ms); default now
   * @param {keyof VIEW} [options.view]  — default VIEW.ACTIVE
   * @param {string} [options.scope]     — optional scope filter (exact match)
   * @param {number} [options.topK]      — default 20
   * @returns {Array<{nugget, score}>}
   */
  query(queryText, { time = Date.now(), view = VIEW.ACTIVE, scope = null, topK = DEFAULT_TOP_K, profileId = null, tiers = null, sessionId = null, agentId = null } = {}) {
    const tokens = String(queryText).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    if (tokens.length === 0) return [];
    const matchExpr = tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(" OR ");

    const statusClause =
      view === VIEW.ACTIVE_PLUS_CONTESTED
        ? "n.status IN ('Active', 'Contested')"
        : "n.status = 'Active'";
    const scopeClause = scope ? " AND n.scope = $scope" : "";
    const profileClause = profileId ? " AND n.profile_id = $profile_id" : "";

    // Memory tier visibility. The default visible set when callers don't
    // supply tiers is profile + shared (the "shared workspace"). Callers
    // can opt into wider/narrower visibility:
    //   - tiers=['session'] + sessionId → only your own session-private nuggets
    //   - tiers=['agent']   + agentId   → only your own agent-private nuggets
    //   - tiers=['public']              → cross-device / external memory tier
    let tierClause = "";
    const bind = { $match: matchExpr, $t: time, $topk: topK };
    if (scope) bind.$scope = scope;
    if (profileId) bind.$profile_id = profileId;

    const tierList = Array.isArray(tiers) && tiers.length > 0 ? tiers : ["profile", "shared"];
    tierClause = " AND (";
    const parts = [];
    let placeholderIdx = 0;
    for (const tier of tierList) {
      placeholderIdx += 1;
      const ph = `$tier_${placeholderIdx}`;
      if (tier === "session" && sessionId) {
        parts.push(`(n.tier = ${ph} AND n.owner_session_id = $owner_sid)`);
        bind[`tier_${placeholderIdx}`] = tier;
        bind.owner_sid = sessionId;
      } else if (tier === "agent" && agentId) {
        parts.push(`(n.tier = ${ph} AND n.owner_agent_id = $owner_aid)`);
        bind[`tier_${placeholderIdx}`] = tier;
        bind.owner_aid = agentId;
      } else {
        parts.push(`n.tier = ${ph}`);
        bind[`tier_${placeholderIdx}`] = tier;
      }
    }
    tierClause += parts.join(" OR ") + ")";

    const sql = `
      SELECT n.*, bm25(nugget_fts) AS bm25_score
      FROM nugget_fts
      JOIN nuggets n ON n.rowid = nugget_fts.rowid
      WHERE nugget_fts MATCH $match
        AND n.validity_start <= $t
        AND (n.validity_end IS NULL OR n.validity_end > $t)
        AND ${statusClause}${scopeClause}${profileClause}${tierClause}
      ORDER BY bm25_score
      LIMIT $topk
    `;
    // sqlite-wasm exec expects $-prefixed keys
    const finalBind = {};
    for (const [k, v] of Object.entries(bind)) {
      finalBind[k.startsWith("$") ? k : `$${k}`] = v;
    }

    const rows = this.storage.exec({
      sql,
      bind: finalBind,
      returnValue: "resultRows",
      rowMode: "object",
    });

    return rows.map((row) => ({
      nugget: this.#rowToNugget(row),
      score: -row.bm25_score, // SQLite FTS5 bm25 returns negative; flip for "higher = better"
    }));
  }

  /** Number of nuggets currently stored. Optionally scoped to a profile. */
  count(profileId = null) {
    const rows = this.storage.exec({
      sql: profileId
        ? "SELECT COUNT(*) AS n FROM nuggets WHERE profile_id = $profile_id"
        : "SELECT COUNT(*) AS n FROM nuggets",
      bind: profileId ? { $profile_id: profileId } : undefined,
      returnValue: "resultRows",
      rowMode: "object",
    });
    return Number(rows[0]?.n ?? 0);
  }

  /** Retrieve a single nugget by id. */
  get(id) {
    const rows = this.storage.exec({
      sql: "SELECT * FROM nuggets WHERE id = $id",
      bind: { $id: id },
      returnValue: "resultRows",
      rowMode: "object",
    });
    if (rows.length === 0) return null;
    return this.#rowToNugget(rows[0]);
  }

  /**
   * Provenance records for a single nugget. Returns all rows in `provenance`
   * tied to this nugget id (a single nugget may have several rows when the
   * same fact was observed from multiple pages/agents).
   */
  provenance(id) {
    const rows = this.storage.exec({
      sql: `SELECT source_url, dom_element_ref, page_title, screenshot_hash,
                   extracted_at, extraction_session_id, agent_id
            FROM provenance WHERE nugget_id = $id
            ORDER BY extracted_at DESC`,
      bind: { $id: id },
      returnValue: "resultRows",
      rowMode: "object",
    });
    return rows.map((r) => ({
      sourceUrl: r.source_url,
      domElementRef: r.dom_element_ref,
      pageTitle: r.page_title,
      screenshotHash: r.screenshot_hash,
      extractedAt: r.extracted_at,
      extractionSessionId: r.extraction_session_id,
      agentId: r.agent_id,
    }));
  }

  close() {
    this.storage.close();
  }

  // ===== private helpers =====

  #ensureFields(c) {
    if (!c || !c.fact || !c.validity) {
      throw new Error("NuggetStore.insert: candidate must have { fact, validity }");
    }
    if (!c.fact.subject || !c.fact.predicate || c.fact.object === undefined) {
      throw new Error("NuggetStore.insert: fact requires { subject, predicate, object }");
    }
    if (!Number.isFinite(c.validity.start) || !c.validity.scope) {
      throw new Error("NuggetStore.insert: validity requires { start: number, scope: string }");
    }
    if (!c.kind) c.kind = "SemanticFact";
    if (!c.canonicalText) {
      c.canonicalText = `${c.fact.subject} ${c.fact.predicate} ${c.fact.object}`;
    }
    if (!c.createdAt) c.createdAt = Date.now();
    if (!c.epistemic) {
      c.epistemic = { status: STATUS.ACTIVE, rank: "Normal", confidence: 0.9 };
    }
    if (!c.epistemic.status) c.epistemic.status = STATUS.ACTIVE;
    if (!c.epistemic.rank) c.epistemic.rank = "Normal";
    if (typeof c.epistemic.confidence !== "number") c.epistemic.confidence = 0.9;
  }

  #findByKey(key, scope, profileId = null) {
    const profileClause = profileId ? " AND n.profile_id = $profile_id" : "";
    const bind = { $key: key, $scope: scope };
    if (profileId) bind.$profile_id = profileId;
    const rows = this.storage.exec({
      sql: `
        SELECT n.*, p.source_url AS p_source_url, p.extracted_at AS p_extracted_at
        FROM nuggets n
        LEFT JOIN provenance p ON p.nugget_id = n.id
        WHERE n.nugget_key = $key AND n.scope = $scope${profileClause}
      `,
      bind,
      returnValue: "resultRows",
      rowMode: "object",
    });

    // Group rows into nuggets with provenance arrays
    const map = new Map();
    for (const row of rows) {
      let n = map.get(row.id);
      if (!n) {
        n = this.#rowToNugget(row);
        n.provenance = [];
        map.set(row.id, n);
      }
      if (row.p_source_url) {
        n.provenance.push({ sourceUrl: row.p_source_url, extractedAt: row.p_extracted_at });
      }
    }
    return [...map.values()];
  }

  #insertRow(n) {
    this.storage.exec({
      sql: `
        INSERT INTO nuggets (
          id, kind, subject, predicate, object, canonical_text,
          validity_start, validity_end, scope, source_type, location,
          status, rank, confidence, nugget_key, parent_id, created_at, profile_id,
          tier, owner_session_id, owner_agent_id
        ) VALUES (
          $id, $kind, $subject, $predicate, $object, $canonical_text,
          $validity_start, $validity_end, $scope, $source_type, $location,
          $status, $rank, $confidence, $nugget_key, $parent_id, $created_at, $profile_id,
          $tier, $owner_session_id, $owner_agent_id
        )
      `,
      bind: {
        $id: n.id,
        $kind: n.kind,
        $subject: n.fact.subject,
        $predicate: n.fact.predicate,
        $object: String(n.fact.object),
        $canonical_text: n.canonicalText,
        $validity_start: n.validity.start,
        $validity_end: n.validity.end,
        $scope: n.validity.scope,
        $source_type: n.validity.sourceType ?? null,
        $location: n.validity.location ?? null,
        $status: n.epistemic.status,
        $rank: n.epistemic.rank,
        $confidence: n.epistemic.confidence,
        $nugget_key: n.nuggetKey,
        $parent_id: n.parentId ?? null,
        $created_at: n.createdAt,
        $profile_id: n.profileId ?? LEGACY_PROFILE_ID,
        $tier: n.tier ?? DEFAULT_TIER,
        $owner_session_id: n.ownerSessionId ?? null,
        $owner_agent_id: n.ownerAgentId ?? null,
      },
    });
  }

  /**
   * Promote a nugget to a different memory tier. Allowed transitions:
   * session → agent → profile → shared → public.
   *
   * Returns the new tier on success, throws on invalid transition.
   */
  promote(id, toTier) {
    const ORDER = [
      MEMORY_TIER.SESSION,
      MEMORY_TIER.AGENT,
      MEMORY_TIER.PROFILE,
      MEMORY_TIER.SHARED,
      MEMORY_TIER.PUBLIC,
    ];
    if (!ORDER.includes(toTier)) {
      throw new Error(`promote: unknown tier '${toTier}'`);
    }
    const rows = this.storage.exec({
      sql: "SELECT tier FROM nuggets WHERE id = $id",
      bind: { $id: id },
      returnValue: "resultRows",
      rowMode: "object",
    });
    if (rows.length === 0) throw new Error(`promote: nugget '${id}' not found`);
    const fromIdx = ORDER.indexOf(rows[0].tier);
    const toIdx = ORDER.indexOf(toTier);
    if (toIdx < fromIdx) {
      throw new Error(`promote: cannot demote from '${rows[0].tier}' to '${toTier}'`);
    }
    this.storage.exec({
      sql: "UPDATE nuggets SET tier = $tier WHERE id = $id",
      bind: { $id: id, $tier: toTier },
    });
    return toTier;
  }

  /**
   * Erase all session-tier nuggets owned by a session. Called when the user
   * ends an agent session so session-private context doesn't leak.
   */
  clearSession(sessionId) {
    if (!sessionId) return 0;
    this.storage.exec({
      sql: "DELETE FROM nuggets WHERE tier = 'session' AND owner_session_id = $sid",
      bind: { $sid: sessionId },
    });
    return 1;
  }

  #insertProvenance(nuggetId, provenance) {
    for (const p of provenance) {
      this.storage.exec({
        sql: `
          INSERT INTO provenance (
            nugget_id, source_url, dom_element_ref, page_title, screenshot_hash,
            extracted_at, extraction_session_id, agent_id
          ) VALUES (
            $nugget_id, $source_url, $dom_element_ref, $page_title, $screenshot_hash,
            $extracted_at, $extraction_session_id, $agent_id
          )
        `,
        bind: {
          $nugget_id: nuggetId,
          $source_url: p.sourceUrl ?? null,
          $dom_element_ref: p.domElementRef ?? null,
          $page_title: p.pageTitle ?? null,
          $screenshot_hash: p.screenshotHash ?? null,
          $extracted_at: p.extractedAt ?? Date.now(),
          $extraction_session_id: p.extractionSessionId ?? null,
          $agent_id: p.agentId ?? null,
        },
      });
    }
  }

  #mergeProvenance(targetId, provenance) {
    this.#insertProvenance(targetId, provenance);
  }

  #rowToNugget(row) {
    return {
      id: row.id,
      kind: row.kind,
      fact: { subject: row.subject, predicate: row.predicate, object: row.object },
      canonicalText: row.canonical_text,
      validity: {
        start: row.validity_start,
        end: row.validity_end,
        scope: row.scope,
        sourceType: row.source_type,
        location: row.location,
      },
      epistemic: {
        status: row.status,
        rank: row.rank,
        confidence: row.confidence,
      },
      nuggetKey: row.nugget_key,
      parentId: row.parent_id,
      createdAt: row.created_at,
      profileId: row.profile_id ?? LEGACY_PROFILE_ID,
      tier: row.tier ?? DEFAULT_TIER,
      ownerSessionId: row.owner_session_id ?? null,
      ownerAgentId: row.owner_agent_id ?? null,
    };
  }
}
