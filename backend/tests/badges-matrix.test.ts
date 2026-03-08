import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BADGE_DEFINITIONS,
  STREAK_MILESTONES,
  LIFETIME_MILESTONES,
  DAILY_MILESTONES,
  TXCOUNT_MILESTONES,
  PERFECT_MILESTONES,
  checkMilestones,
} from '../src/lib/badges.ts';

test('badge definition matrix has expected size and unique ids', () => {
  assert.equal(BADGE_DEFINITIONS.length, 42);

  const ids = BADGE_DEFINITIONS.map(b => b.id);
  const unique = new Set(ids);
  assert.equal(unique.size, 42);
});

test('milestone arrays map to exactly all badge ids', () => {
  const expectedIds = new Set<string>([
    ...STREAK_MILESTONES.map(v => `STREAK_${v}`),
    ...LIFETIME_MILESTONES.map(v => `BURN_${v}`),
    ...DAILY_MILESTONES.map(v => `DAILY_${v}`),
    ...TXCOUNT_MILESTONES.map(v => `TXCOUNT_${v}`),
    ...PERFECT_MILESTONES.map(v => `PERFECT_${v}`),
  ]);

  assert.equal(expectedIds.size, 42);

  const definedIds = new Set(BADGE_DEFINITIONS.map(b => b.id));
  assert.deepEqual([...definedIds].sort(), [...expectedIds].sort());
});

test('checkMilestones can reach all 42 badges when values are maxed', () => {
  const all = checkMilestones(
    2000,
    2_000_000,
    new Set(),
    20_000,
    2_000,
    24,
  );

  assert.equal(all.length, 42);
  assert.equal(new Set(all.map(b => b.id)).size, 42);
});

test('checkMilestones grants none when everything is already earned', () => {
  const earned = new Set(BADGE_DEFINITIONS.map(b => b.id));

  const none = checkMilestones(
    2000,
    2_000_000,
    earned,
    20_000,
    2_000,
    24,
  );

  assert.equal(none.length, 0);
});
