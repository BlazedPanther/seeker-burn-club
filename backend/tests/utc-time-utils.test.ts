import test from 'node:test';
import assert from 'node:assert/strict';

import { getUTCDateString, yesterdayUTC } from '../src/lib/solana.ts';

test('getUTCDateString uses UTC day boundaries', () => {
  // 2024-01-01T00:00:00Z
  assert.equal(getUTCDateString(1704067200), '2024-01-01');
  // One second before UTC midnight
  assert.equal(getUTCDateString(1704067199), '2023-12-31');
});

test('yesterdayUTC handles month and leap-year transitions', () => {
  assert.equal(yesterdayUTC('2024-03-01'), '2024-02-29'); // leap year
  assert.equal(yesterdayUTC('2025-03-01'), '2025-02-28'); // non-leap year
  assert.equal(yesterdayUTC('2024-01-01'), '2023-12-31'); // year boundary
});
