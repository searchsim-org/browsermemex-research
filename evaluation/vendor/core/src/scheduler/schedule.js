/**
 * Schedule arithmetic — compute when a task next runs.
 *
 * Pure functions. `now` is always passed in (no implicit Date.now), so tests
 * are deterministic.
 *
 * See: SCHEDULE_KIND in types.js
 */

import { SCHEDULE_KIND } from "./types.js";

/**
 * Compute the next run time for any schedule.
 *
 * @param {object|null} schedule
 * @param {number} now             — current time (Unix ms)
 * @param {number} createdAt       — task creation time (Unix ms); used as anchor when unset
 * @returns {number|null}          — next run Unix ms, or null if the schedule will never fire again
 */
export function nextRun(schedule, now, createdAt) {
  if (!schedule) return null;
  switch (schedule.kind) {
    case SCHEDULE_KIND.ONCE:
      return nextRunOnce(schedule, now, createdAt);
    case SCHEDULE_KIND.INTERVAL:
      return nextRunInterval(schedule, now, createdAt);
    case SCHEDULE_KIND.DAILY_AT:
      return nextRunDailyAt(schedule, now);
    default:
      throw new Error(`nextRun: unknown schedule kind '${schedule.kind}'`);
  }
}

/**
 * ONCE schedule — fires at anchor, once. Returns null after it has fired.
 */
export function nextRunOnce(schedule, now, createdAt) {
  const anchor = schedule.anchor ?? createdAt;
  if (now < anchor) return anchor;
  return null;
}

/**
 * INTERVAL schedule — fires every `everyMs` starting at anchor.
 * Anchor defaults to createdAt.
 *
 * If now is before anchor, returns anchor. Otherwise returns the next
 * anchor + n*everyMs that's strictly greater than now.
 */
export function nextRunInterval(schedule, now, createdAt) {
  if (!Number.isFinite(schedule.everyMs) || schedule.everyMs <= 0) {
    throw new Error("nextRunInterval: everyMs must be a positive number");
  }
  const anchor = schedule.anchor ?? createdAt;
  if (now < anchor) return anchor;
  const elapsed = now - anchor;
  const remaining = schedule.everyMs - (elapsed % schedule.everyMs);
  // If remaining is exactly everyMs (i.e., now is exactly on a boundary),
  // return now (fire now); otherwise return now + remaining.
  return remaining === schedule.everyMs ? now : now + remaining;
}

/**
 * DAILY_AT — fires every day at HH:MM UTC. Strictly future-only: if today's
 * slot has already passed, returns tomorrow's slot.
 */
export function nextRunDailyAt(schedule, now) {
  const { hour, minute } = schedule;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(`nextRunDailyAt: hour must be 0..23, got ${hour}`);
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error(`nextRunDailyAt: minute must be 0..59, got ${minute}`);
  }
  const today = new Date(now);
  const candidate = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
    hour,
    minute,
    0,
    0
  );
  if (candidate > now) return candidate;
  // Roll forward one day
  return candidate + 24 * 60 * 60 * 1000;
}
