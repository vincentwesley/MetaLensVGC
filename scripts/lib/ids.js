// Pseudonymous player ids for research use (Vin's Atelier).
// A source key names a player at its source; `pidOf` turns it into a salted HMAC so the published data never carries the
// raw username, while the same player keeps the same id across events and refreshes (same salt -> same id).
import { createHmac } from 'node:crypto';

// Id namespaces (stored as a small code next to each pid). Ids from different namespaces can't be linked: Limitless
// usernames and the official standings site's player ids are separate systems.
export const ID_NS = {
  lt: 1, // play.limitlesstcg.com username: stable across every online event
  lv: 2, // standings.limitlessvgc.com player_id: stable across official events
  lvx: 3, // official event without standings data: event-scoped (event id + placing), never links across events
};

export const PID_LENGTH = 16;
export const MIN_SALT_LENGTH = 16;

/** The salt from METALENS_ID_SALT, or null (with no salt, rows are written without a pid). */
export function idSalt(env = process.env) {
  const s = env.METALENS_ID_SALT;
  if (!s) return null;
  if (s.length < MIN_SALT_LENGTH) throw new Error(`METALENS_ID_SALT must be at least ${MIN_SALT_LENGTH} characters`);
  return s;
}

/** "lt:someuser" -> 16 hex chars. */
export function pidOf(sourceKey, salt) {
  return createHmac('sha256', salt).update(sourceKey).digest('hex').slice(0, PID_LENGTH);
}

/** Namespace code of a source key ("lv:123" -> 2), or 0 if unknown. */
export function nsOf(sourceKey) {
  return ID_NS[String(sourceKey).split(':')[0]] || 0;
}

/** Source keys. */
export const ltKey = (username) => `lt:${String(username).toLowerCase()}`;
export const lvKey = (playerId) => `lv:${playerId}`;
export const lvxKey = (eventId, placing) => `lvx:${eventId}:${placing}`;

/** A source's drop round as a positive integer, or null (not dropped / not a round number). */
export const dropRoundOf = (v) => (v != null && Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
