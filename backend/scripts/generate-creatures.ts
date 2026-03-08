#!/usr/bin/env npx tsx
/**
 * Burn Spirit Creature Batch Generator
 * Generates animated pixel-art NFT creatures (GIF) using the main creature engine.
 *
 * Usage: npx tsx scripts/generate-creatures.ts [count]
 *
 * Imports directly from src/lib/creature.ts so all traits stay in sync.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCreatureGif, creatureSeed, resolveTraits } from '../src/lib/creature.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../generated/creatures');
fs.mkdirSync(outDir, { recursive: true });

// FNV-1a hash for batch seeding
function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

const COUNT = parseInt(process.argv[2] || '200', 10);
const SEED = hashStr('SeekerBurnClub-Season1');

console.log(`\n  Generating ${COUNT} Burn Spirit creatures...\n`);

interface Result {
  name: string;
  traits: ReturnType<typeof resolveTraits>;
}

const results: Result[] = [];

for (let i = 0; i < COUNT; i++) {
  // Create a unique seed per creature
  const wallet = `BatchGen_${SEED}_${i}`;
  const badgeId = 'BURN_100'; // Use a mid-tier badge for variety
  const seed = creatureSeed(wallet, badgeId);

  const { gif, traits } = generateCreatureGif(seed);

  const name = `creature_${String(i).padStart(4, '0')}`;
  fs.writeFileSync(path.join(outDir, `${name}.gif`), gif);
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(traits, null, 2));

  results.push({ name, traits });

  const traitSummary = [
    traits.body, traits.color, traits.eyes, traits.mouth,
    traits.headgear, traits.item, traits.background,
    traits.pattern, traits.aura, traits.animation,
    traits.companion, traits.outline,
  ].filter(t => t !== 'none').join(' / ');

  console.log(`  ✓ ${name}  [${traitSummary}]  (${traits.rarity})`);
}

// Stats
const rarityCounts: Record<string, number> = {};
for (const r of results) {
  rarityCounts[r.traits.rarity] = (rarityCounts[r.traits.rarity] || 0) + 1;
}

console.log(`\n  Rarity distribution:`);
for (const [rarity, count] of Object.entries(rarityCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${rarity.padEnd(12)} ${count} (${(count / COUNT * 100).toFixed(0)}%)`);
}

// Trait frequency stats
const traitFreq: Record<string, Record<string, number>> = {};
const categories = ['body', 'color', 'eyes', 'mouth', 'headgear', 'item', 'background', 'pattern', 'aura', 'animation', 'companion', 'outline'] as const;

for (const r of results) {
  for (const cat of categories) {
    if (!traitFreq[cat]) traitFreq[cat] = {};
    const val = r.traits[cat as keyof typeof r.traits] as string;
    traitFreq[cat][val] = (traitFreq[cat][val] || 0) + 1;
  }
}

console.log(`\n  Trait variety per category:`);
for (const cat of categories) {
  const unique = Object.keys(traitFreq[cat] || {}).length;
  console.log(`    ${cat.padEnd(14)} ${unique} unique values used`);
}

console.log(`\n  Output: ${outDir}`);
console.log(`  Total: ${COUNT} creatures\n`);
