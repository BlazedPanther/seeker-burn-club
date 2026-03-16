#!/usr/bin/env npx tsx
/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creatureSeed, resolveTraits, type CreatureRarity } from '../src/lib/creature.js';

type RarityRange = { min: number; max: number };
type BadgePolicy = Record<CreatureRarity, RarityRange>;
type PolicyFile = {
  sampleSize: number;
  badgePolicies: Record<string, BadgePolicy>;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const policyPath = path.join(__dirname, 'rarity-policy.json');

const policyRaw = fs.readFileSync(policyPath, 'utf8');
const policy: PolicyFile = JSON.parse(policyRaw);

const sampleSizeArg = Number(process.argv[2]);
const sampleSize = Number.isFinite(sampleSizeArg) && sampleSizeArg > 0
  ? Math.floor(sampleSizeArg)
  : policy.sampleSize;

const rarityOrder: CreatureRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

function evaluateBadge(badgeId: string, badgePolicy: BadgePolicy): { passed: boolean; lines: string[] } {
  const counts: Record<CreatureRarity, number> = {
    common: 0,
    uncommon: 0,
    rare: 0,
    epic: 0,
    legendary: 0,
    mythic: 0,
  };

  for (let i = 0; i < sampleSize; i++) {
    const seed = creatureSeed(`audit_${i}`, badgeId);
    const rarity = resolveTraits(seed, badgeId).rarity;
    counts[rarity] += 1;
  }

  const lines: string[] = [];
  let passed = true;

  for (const rarity of rarityOrder) {
    const pct = (counts[rarity] / sampleSize) * 100;
    const range = badgePolicy[rarity];
    const ok = pct >= range.min && pct <= range.max;
    if (!ok) passed = false;

    lines.push(
      `${rarity.padEnd(10)} ${pct.toFixed(2).padStart(6)}%  target ${range.min.toFixed(1)}-${range.max.toFixed(1)}%  ${ok ? 'OK' : 'OUT'}`,
    );
  }

  return { passed, lines };
}

let allPassed = true;
console.log(`Rarity audit with sample size ${sampleSize}`);

for (const [badgeId, badgePolicy] of Object.entries(policy.badgePolicies)) {
  const result = evaluateBadge(badgeId, badgePolicy);
  if (!result.passed) allPassed = false;

  console.log(`\n[${result.passed ? 'PASS' : 'FAIL'}] ${badgeId}`);
  for (const line of result.lines) console.log(`  ${line}`);
}

if (!allPassed) {
  console.error('\nRarity audit failed. Adjust BADGE_RARITY_PROFILE or policy ranges.');
  process.exit(1);
}

console.log('\nRarity audit passed.');
