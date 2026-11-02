/**
 * Distillation engine.
 *
 * Scans a corpus of completed task runs and proposes skills for templates
 * that have succeeded ≥ N times. The "template" is a fingerprint of the
 * task's payload — caller may attach a stable `payload.template` field to
 * make templates explicit, or we synthesize one by hashing the payload's
 * normalized shape.
 *
 * Output: SkillCandidate[] sorted by recency (most recent template first).
 */

import { DEFAULT_DISTILLATION_THRESHOLD } from "./types.js";

/**
 * Build a fingerprint from a task. If the task carries an explicit
 * `payload.template` field we trust it; otherwise we synthesize one from
 * the payload's structural shape (keys, types) so different inputs to the
 * same template collide on the same fingerprint.
 */
export function templateFingerprint(task) {
  if (task?.payload?.template && typeof task.payload.template === "string") {
    return task.payload.template;
  }
  if (task?.routing?.template && typeof task.routing.template === "string") {
    return task.routing.template;
  }
  return shapeOf(task?.payload ?? {});
}

/**
 * Recursive shape fingerprint: replaces leaf values with their types, keeps
 * keys sorted, then JSON-stringifies. Two payloads with the same fields and
 * types but different values produce the same fingerprint.
 */
function shapeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return `[${value.length > 0 ? shapeOf(value[0]) : "_"}]`;
  }
  if (typeof value !== "object") return typeof value;
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => `${k}:${shapeOf(value[k])}`).join(",") + "}";
}

/**
 * Group successful tasks by template fingerprint and return candidates that
 * meet the threshold.
 *
 * @param {object[]} tasks                  — Task[] (from TaskStore.list)
 * @param {object[]} runsByTaskId           — map: taskId → TaskRun[]
 * @param {object} [opts]
 * @param {number} [opts.threshold=3]
 * @returns {object[]} SkillCandidate[]
 */
export function proposeSkills(tasks, runsByTaskId, opts = {}) {
  const threshold = opts.threshold ?? DEFAULT_DISTILLATION_THRESHOLD;
  const groups = new Map(); // fp -> { tasks, firstSeenAt, lastSeenAt, successCount }

  for (const task of tasks) {
    const fp = templateFingerprint(task);
    const runs = runsByTaskId[task.id] ?? [];
    const successes = runs.filter((r) => r.status === "success");
    if (successes.length === 0) continue;

    if (!groups.has(fp)) {
      groups.set(fp, {
        fingerprint: fp,
        sourceTaskIds: [],
        successCount: 0,
        firstSeenAt: Infinity,
        lastSeenAt: -Infinity,
        sampleTask: task,
      });
    }
    const g = groups.get(fp);
    g.sourceTaskIds.push(task.id);
    g.successCount += successes.length;
    for (const r of successes) {
      if (r.startedAt < g.firstSeenAt) g.firstSeenAt = r.startedAt;
      if (r.startedAt > g.lastSeenAt) g.lastSeenAt = r.startedAt;
    }
  }

  const candidates = [];
  for (const g of groups.values()) {
    if (g.successCount < threshold) continue;
    candidates.push({
      suggestedName: synthesizeName(g.sampleTask),
      explanation:
        `Observed ${g.successCount} successful runs of this template across ${g.sourceTaskIds.length} task(s).` +
        ` First seen ${new Date(g.firstSeenAt).toISOString()}, last ${new Date(g.lastSeenAt).toISOString()}.`,
      sourceTaskIds: g.sourceTaskIds,
      template: g.sampleTask?.payload ?? {},
      successCount: g.successCount,
      firstSeenAt: g.firstSeenAt,
      lastSeenAt: g.lastSeenAt,
    });
  }

  // newest-first by lastSeenAt
  candidates.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  return candidates;
}

function synthesizeName(sampleTask) {
  if (!sampleTask) return "Untitled skill";
  // Strip volatile bits from the title to produce a stable name
  const base = String(sampleTask.title ?? "Untitled")
    .replace(/#\d+/g, "")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "")
    .trim();
  return base.length > 0 ? base : "Untitled skill";
}

/**
 * Single-demonstration skill induction.
 *
 * Takes a trajectory — a successful agent run as a sequence of tool calls —
 * and proposes a Skill that replays the same procedure. This is the "agent
 * taught itself how to use the skill" path: one good run becomes a saved,
 * named, reusable workflow that any other agent can invoke via the
 * memex_skills_run MCP tool.
 *
 * The induced steps are RUN_TASK stages whose params interpolate from
 * `${inputs.*}` so the skill can be replayed with different inputs. We
 * lightly generalize URLs (extract host as an input) and free-text query
 * strings (extract whole arg) so the most volatile fields become inputs.
 *
 * @param {object} trajectory
 * @param {string} trajectory.taskId
 * @param {string} trajectory.title
 * @param {object[]} trajectory.steps     — [{ toolName, args, result?, timestamp }]
 * @param {string} [trajectory.sourceUrl]
 * @returns {object} SkillCandidate ready for SkillStore.confirmFromProposal
 */
export function proposeSkillFromTrajectory(trajectory) {
  if (!trajectory || !Array.isArray(trajectory.steps) || trajectory.steps.length === 0) {
    throw new Error("proposeSkillFromTrajectory: trajectory.steps must be a non-empty array");
  }

  // Build the induced inputs by inspecting every step's args for the most
  // common shape-generalizable fields.
  const inputs = [];
  const seen = new Set();

  function addInput(name, type, description) {
    if (seen.has(name)) return;
    seen.add(name);
    inputs.push({ name, type, description });
  }

  // Always parameterize the starting URL if any step references one.
  for (const s of trajectory.steps) {
    if (s?.args?.url || s?.args?.startingUrl) {
      addInput("startingUrl", "string", "URL to navigate to before the skill runs");
      break;
    }
  }

  // Pull free-text query fields as inputs (q, query, search, prompt, instruction).
  const QUERY_FIELDS = new Set(["q", "query", "search", "prompt", "instruction", "text"]);
  for (const s of trajectory.steps) {
    if (!s?.args || typeof s.args !== "object") continue;
    for (const key of Object.keys(s.args)) {
      if (QUERY_FIELDS.has(key) && typeof s.args[key] === "string") {
        addInput(key, "string", `Free-text "${key}" supplied to step ${s.toolName ?? "?"}`);
      }
    }
  }

  // Build the workflow stages from the trajectory.
  const stages = trajectory.steps.map((s, i) => ({
    id: `step-${i + 1}`,
    kind: "run_task",
    params: {
      title: s?.toolName ? `${s.toolName} (step ${i + 1})` : `Step ${i + 1}`,
      payload: {
        toolName: s?.toolName,
        // Keep the concrete args; the dispatcher decides which to override
        // from inputs at run time. The most common substitutions get
        // ${inputs.*} markers so the workflow engine interpolates.
        args: generalizeArgs(s?.args ?? {}, seen),
      },
      capability: "read_with_network",
      creator: "skill",
    },
  }));

  // Suggested name: use the trajectory title, or the first step's tool name.
  const suggestedName = trajectory.title
    ? String(trajectory.title).slice(0, 80)
    : `Skill from ${new Date().toISOString().slice(0, 10)}`;

  return {
    suggestedName,
    explanation:
      `Distilled from one demonstration on ${new Date().toISOString()} — ` +
      `${trajectory.steps.length} step(s). Inputs: ${inputs.map((i) => i.name).join(", ") || "(none)"}.`,
    sourceTaskIds: trajectory.taskId ? [trajectory.taskId] : [],
    template: trajectory,
    successCount: 1,
    firstSeenAt: trajectory.steps[0]?.timestamp ?? Date.now(),
    lastSeenAt: trajectory.steps[trajectory.steps.length - 1]?.timestamp ?? Date.now(),
    inputs,
    steps: stages,
  };
}

/** Replace the most-commonly-generalized arg values with ${inputs.<name>}
 *  markers so the workflow engine interpolates them at run time. */
function generalizeArgs(args, knownInputs) {
  const out = {};
  for (const [k, v] of Object.entries(args)) {
    if ((k === "url" || k === "startingUrl") && typeof v === "string" && knownInputs.has("startingUrl")) {
      out[k] = "${inputs.startingUrl}";
    } else if (
      typeof v === "string" &&
      knownInputs.has(k) &&
      ["q", "query", "search", "prompt", "instruction", "text"].includes(k)
    ) {
      out[k] = `\${inputs.${k}}`;
    } else {
      out[k] = v;
    }
  }
  return out;
}
