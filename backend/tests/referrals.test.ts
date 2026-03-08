import test from 'node:test';
import assert from 'node:assert/strict';

import { isReferralCodeFormatValid, isReferralQualified } from '../src/services/referrals.service.ts';
import { env } from '../src/config/env.ts';

test('referral code format validator accepts canonical codes', () => {
  assert.equal(isReferralCodeFormatValid('SBC-ABCDEFG2'), true);
  assert.equal(isReferralCodeFormatValid('sbc-abcde234'), true);
});

test('referral code format validator rejects invalid codes', () => {
  assert.equal(isReferralCodeFormatValid('SBC-ABCDEF'), false);
  assert.equal(isReferralCodeFormatValid('SBC-ABCDE_23'), false);
  assert.equal(isReferralCodeFormatValid('LOL-ABCDEFG2'), false);
});

test('referral qualification requires burn days and lifetime thresholds', () => {
  const d = env.REFERRAL_QUALIFY_BURN_DAYS;
  const l = env.REFERRAL_QUALIFY_LIFETIME_SKR;

  assert.equal(isReferralQualified(d - 1, l), false);
  assert.equal(isReferralQualified(d, l - 1), false);
  assert.equal(isReferralQualified(d, l), true);
  assert.equal(isReferralQualified(d + 5, l + 500), true);
});
