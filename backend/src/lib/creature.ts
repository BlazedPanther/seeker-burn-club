/**
 * Burn Spirit Creature Generator - Server-side TypeScript version.
 *
 * Generates unique animated pixel-art NFT creatures (GIF buffer)
 * from a deterministic seed. Same seed = always same creature.
 *
 * Seed is derived from hash(walletAddress + badgeId) so each user
 * gets a unique creature per milestone, but it's reproducible.
 *
 * Native 48Ã-48 â†' upscaled 480Ã-480 (nearest-neighbor, crisp pixels).
 * Output: GIF buffer + trait metadata.
 */

import { GifWriter } from 'omggif';

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PRNG + Hash
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function mulberry32(seed: number): () => number {
  let t = (seed >>> 0) || 1;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic seed from wallet + badge and optional per-mint salt.
 * If seedSalt is omitted, we use legacy behavior for backward compatibility.
 */
export function creatureSeed(walletAddress: string, badgeId: string, seedSalt?: string): number {
  const salt = seedSalt?.trim() || 'BurnSpiritV1';
  return fnv1a(`${walletAddress}:${badgeId}:${salt}`);
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Creature Name Generator  (procedural syllable-based)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//
// Format: "[Adjective] [ProceduralName]"
// ProceduralName = 3 rhythmic units: CVC Â. bV Â. CVC
//   Syl-1: full onset (C) + vowel (V) + coda (F)      â†' e.g. "thaurn"
//   Bridge: single consonant (B) + vowel (V)            â†' e.g. "li"
//   Syl-2: full onset (C) + vowel (V) + coda (F)      â†' e.g. "grost"
// The single-consonant bridge prevents harsh codaâ†'onset consonant clusters.
//
// Pools:  Adjectives (A) = 90
//         Onsets     (C) = 50     Bridges (B) = 18
//         Vowels     (V) = 15     Codas   (F) = 32
//
// Draws per name:  A Ã- C Ã- V Ã- F Ã- B Ã- V Ã- C Ã- V Ã- F
//   = A Ã- CÂ^2 Ã- VÂ^3 Ã- FÂ^2 Ã- B
//   = 90 Ã- 2 500 Ã- 3 375 Ã- 1 024 Ã- 18
//   â‰ˆ 14 Billionen (~14 trillion) unique creature names

const NAME_ADJECTIVES = [
  // Fire / burn / heat (15)
  'Ember', 'Ashen', 'Blazing', 'Charred', 'Smoldering', 'Molten', 'Scorched', 'Kindled',
  'Torched', 'Volcanic', 'Cinder', 'Searing', 'Ignited', 'Glowing', 'Radiant',
  // Stoner / chill / smoke (15)
  'Hazy', 'Dazed', 'Mellow', 'Toasted', 'Baked', 'Clouded', 'Stoned', 'Lifted',
  'Foggy', 'Zonked', 'Blissed', 'Faded', 'Glazed', 'Cozy', 'Chill',
  // Cosmic / spiritual (15)
  'Cosmic', 'Astral', 'Ethereal', 'Mystic', 'Spectral', 'Cursed', 'Blessed', 'Ancient',
  'Void', 'Celestial', 'Divine', 'Phantom', 'Shadow', 'Lunar', 'Solar',
  // Nature / elemental (15)
  'Mossy', 'Crystal', 'Frozen', 'Thorned', 'Rusty', 'Golden', 'Silver', 'Verdant',
  'Storm', 'Tidal', 'Frost', 'Coral', 'Sandy', 'Dusty', 'Murky',
  // Emotions / vibes (15)
  'Jolly', 'Grim', 'Wicked', 'Noble', 'Feral', 'Gentle', 'Savage', 'Serene',
  'Wild', 'Sleepy', 'Grumpy', 'Lucky', 'Brave', 'Shy', 'Bold',
  // Weird / fun (15)
  'Funky', 'Crispy', 'Crunchy', 'Wobbly', 'Chunky', 'Squishy', 'Spicy', 'Tangy',
  'Neon', 'Pixel', 'Glitch', 'Turbo', 'Mega', 'Ultra', 'Tiny',
] as const; // 90

/** Full consonant clusters for syllable onsets */
const NAME_ONSETS = [
  'b', 'bl', 'br', 'c', 'ch', 'cl', 'cr', 'd', 'dr', 'f',
  'fl', 'fr', 'g', 'gl', 'gr', 'h', 'j', 'k', 'kh', 'kr',
  'l', 'm', 'n', 'p', 'ph', 'pl', 'pr', 'qu', 'r', 's',
  'sc', 'sh', 'sk', 'sl', 'sm', 'sn', 'sp', 'st', 'str', 'sw',
  't', 'th', 'tr', 'v', 'vr', 'w', 'wr', 'x', 'z', 'zh',
] as const; // 50

/** Single consonants for the bridge syllable - keeps transitions smooth */
const NAME_BRIDGES = [
  'b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm',
  'n', 'p', 'r', 's', 't', 'v', 'w', 'z',
] as const; // 18

const NAME_VOWELS = [
  'a', 'e', 'i', 'o', 'u', 'y',
  'ae', 'ai', 'au', 'ei', 'ou', 'oo', 'ee', 'ey', 'ay',
] as const; // 15

const NAME_CODAS = [
  'b', 'd', 'f', 'g', 'k', 'l', 'll', 'm', 'n', 'p',
  'r', 'rn', 'rk', 'rm', 'rs', 'rt', 's', 'sh', 'sk', 'st',
  't', 'th', 'x', 'z', 'nd', 'ng', 'nk', 'nt', 'lk', 'lt',
  'lf', 'rd',
] as const; // 32

/**
 * Generate a unique procedural creature name from a seed.
 *
 * Structure: CVC Â. bV Â. CVC  (3 rhythmic units, always pronounceable).
 * The single-consonant bridge (b) ensures smooth syllable transitions.
 *
 * ~14 Billionen (~14 trillion) unique combinations.
 * Uses a separate hash path (XOR 0xBEEFCAFE) so names don't
 * correlate with trait picks.
 *
 * Examples: "Hazy Thaurligrost", "Chill Brondekalt"
 */
export function generateCreatureName(seed: number): string {
  const r = mulberry32(seed ^ 0xBEEFCAFE);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];

  // CVC Â. bV Â. CVC   (b = single-consonant bridge)
  const syl1 = pick(NAME_ONSETS) + pick(NAME_VOWELS) + pick(NAME_CODAS);
  const bridge = pick(NAME_BRIDGES) + pick(NAME_VOWELS);
  const syl2 = pick(NAME_ONSETS) + pick(NAME_VOWELS) + pick(NAME_CODAS);

  const raw = syl1 + bridge + syl2;
  const name = raw.charAt(0).toUpperCase() + raw.slice(1);

  return `${pick(NAME_ADJECTIVES)} ${name}`;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Color helpers
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function rgb(r: number, g: number, b: number): number { return (r << 16) | (g << 8) | b; }
function fromHex(hex: string): number { return parseInt(hex.replace('#', ''), 16); }
function lerpC(c1: number, c2: number, t: number): number {
  const r = Math.round(((c1 >> 16) & 255) + (((c2 >> 16) & 255) - ((c1 >> 16) & 255)) * t);
  const g = Math.round(((c1 >> 8) & 255) + (((c2 >> 8) & 255) - ((c1 >> 8) & 255)) * t);
  const b = Math.round((c1 & 255) + ((c2 & 255) - (c1 & 255)) * t);
  return rgb(r, g, b);
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Palette builder (ensures power-of-2)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

class PalBuilder {
  colors: number[] = [];
  map = new Map<number, number>();

  add(c: string | number): number {
    const key = typeof c === 'string' ? fromHex(c) : c;
    if (!this.map.has(key)) { this.map.set(key, this.colors.length); this.colors.push(key); }
    return this.map.get(key)!;
  }
  finalize(): number[] {
    let s = 2;
    while (s < this.colors.length && s < 256) s *= 2;
    while (this.colors.length < s) this.colors.push(0);
    return this.colors;
  }
  count(): number { return this.map.size; }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Pixel canvas
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

class Canvas {
  w: number; h: number; data: Uint8Array;
  constructor(w: number, h: number) { this.w = w; this.h = h; this.data = new Uint8Array(w * h); }
  clear(idx: number) { this.data.fill(idx); }
  set(x: number, y: number, idx: number) {
    const ix = Math.round(x), iy = Math.round(y);
    if (ix >= 0 && ix < this.w && iy >= 0 && iy < this.h) this.data[iy * this.w + ix] = idx;
  }
  rect(x: number, y: number, w: number, h: number, idx: number) {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) this.set(x + dx, y + dy, idx);
  }
  circle(cx: number, cy: number, r: number, idx: number) {
    const r2 = r * r;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
      if (dx * dx + dy * dy <= r2) this.set(cx + dx, cy + dy, idx);
  }
  line(x0: number, y0: number, x1: number, y1: number, idx: number) {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      this.set(x0, y0, idx);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TRAIT DEFINITIONS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export type CreatureRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

interface TraitDef { id: string; name: string; rarity: CreatureRarity; }
interface ColorPalDef extends TraitDef {
  body: string; dark: string; light: string; highlight: string; bg: string;
}

const BODY_SHAPES: TraitDef[] = [
  { id: 'round',   name: 'Round Spirit',   rarity: 'common' },
  { id: 'tall',    name: 'Tall Spirit',    rarity: 'common' },
  { id: 'blob',    name: 'Blob Spirit',    rarity: 'common' },
  { id: 'chonk',   name: 'Chonk Spirit',   rarity: 'uncommon' },
  { id: 'slim',    name: 'Slim Spirit',    rarity: 'uncommon' },
  { id: 'cube',    name: 'Cube Spirit',    rarity: 'uncommon' },
  { id: 'horned',  name: 'Horned Spirit',  rarity: 'rare' },
  { id: 'ghost',   name: 'Ghost Spirit',   rarity: 'rare' },
  { id: 'spike',   name: 'Spike Spirit',   rarity: 'rare' },
  { id: 'winged',  name: 'Winged Spirit',  rarity: 'epic' },
  { id: 'tiny',    name: 'Tiny Spirit',    rarity: 'epic' },
  { id: 'titan',   name: 'Titan Spirit',   rarity: 'epic' },
  { id: 'crowned', name: 'Crowned Spirit', rarity: 'legendary' },
  { id: 'multi',   name: 'Multi Spirit',   rarity: 'mythic' },
  // â”€â”€ Expansion â”€â”€
  { id: 'diamond_body', name: 'Diamond Spirit', rarity: 'rare' },
  { id: 'serpent',  name: 'Serpent Spirit',  rarity: 'epic' },
  { id: 'jelly',    name: 'Jelly Spirit',    rarity: 'uncommon' },
  { id: 'skull_body', name: 'Skull Spirit',  rarity: 'legendary' },
  // — Pro Expansion —
  { id: 'pear',     name: 'Pear Spirit',    rarity: 'common' },
  { id: 'star_body', name: 'Star Spirit',   rarity: 'uncommon' },
  { id: 'mushroom_body', name: 'Mushroom Spirit', rarity: 'rare' },
];

const COLOR_PALETTES: ColorPalDef[] = [
  { id: 'ember',   body: '#e85d3a', dark: '#a63d22', light: '#ffb380', highlight: '#fff4de', bg: '#2a1a14', name: 'Ember',   rarity: 'common' },
  { id: 'azure',   body: '#3a8ee8', dark: '#224da6', light: '#80c8ff', highlight: '#def0ff', bg: '#141e2a', name: 'Azure',   rarity: 'common' },
  { id: 'forest',  body: '#3ab84d', dark: '#227a2e', light: '#80f090', highlight: '#deffde', bg: '#142a1a', name: 'Forest',  rarity: 'common' },
  { id: 'slate',   body: '#607080', dark: '#384050', light: '#90a0b0', highlight: '#d0d8e0', bg: '#181c22', name: 'Slate',   rarity: 'common' },
  { id: 'lilac',   body: '#a855f7', dark: '#7230b8', light: '#d4a0ff', highlight: '#f0deff', bg: '#221430', name: 'Lilac',   rarity: 'uncommon' },
  { id: 'coral',   body: '#f06070', dark: '#b83040', light: '#ffa0a8', highlight: '#ffdede', bg: '#2a1418', name: 'Coral',   rarity: 'uncommon' },
  { id: 'mint',    body: '#40d8a0', dark: '#20a070', light: '#80f0c8', highlight: '#c0ffe8', bg: '#102820', name: 'Mint',    rarity: 'uncommon' },
  { id: 'sunset',  body: '#f08040', dark: '#c05020', light: '#ffb080', highlight: '#ffe8d0', bg: '#2a1810', name: 'Sunset',  rarity: 'uncommon' },
  { id: 'gold',    body: '#f0c040', dark: '#b88a20', light: '#ffe080', highlight: '#fff8de', bg: '#2a2414', name: 'Gold',    rarity: 'rare' },
  { id: 'ice',     body: '#60e8f0', dark: '#30a0b8', light: '#a0f8ff', highlight: '#deffff', bg: '#142628', name: 'Ice',     rarity: 'rare' },
  { id: 'ruby',    body: '#e83050', dark: '#a01030', light: '#ff7088', highlight: '#ffd0d8', bg: '#2a100e', name: 'Ruby',    rarity: 'rare' },
  { id: 'ocean',   body: '#2070c0', dark: '#104080', light: '#60a0e0', highlight: '#c0d8f0', bg: '#0a1428', name: 'Ocean',   rarity: 'rare' },
  { id: 'shadow',  body: '#707888', dark: '#404860', light: '#a0a8b8', highlight: '#d8dce8', bg: '#181a20', name: 'Shadow',  rarity: 'epic' },
  { id: 'neon',    body: '#40ff80', dark: '#20c050', light: '#80ffb0', highlight: '#c0ffe0', bg: '#0a1a10', name: 'Neon',    rarity: 'epic' },
  { id: 'toxic',   body: '#a0ff20', dark: '#70c010', light: '#c8ff60', highlight: '#e8ffb0', bg: '#1a2008', name: 'Toxic',   rarity: 'epic' },
  { id: 'candy',   body: '#ff80c0', dark: '#c05088', light: '#ffb0d8', highlight: '#ffe0f0', bg: '#28101c', name: 'Candy',   rarity: 'epic' },
  { id: 'plasma',  body: '#ff40d0', dark: '#c020a0', light: '#ff80e0', highlight: '#ffc0f0', bg: '#200a1a', name: 'Plasma',  rarity: 'legendary' },
  { id: 'void',    body: '#8040ff', dark: '#5020c0', light: '#b080ff', highlight: '#e0c0ff', bg: '#10081e', name: 'Void',    rarity: 'legendary' },
  { id: 'chrome',  body: '#c0c8d0', dark: '#808890', light: '#e0e4e8', highlight: '#ffffff', bg: '#14161a', name: 'Chrome',  rarity: 'legendary' },
  { id: 'divine',  body: '#fff0a0', dark: '#e0c050', light: '#fff8d0', highlight: '#ffffff', bg: '#282010', name: 'Divine',  rarity: 'mythic' },
  // â”€â”€ Expansion â”€â”€
  { id: 'blood',      body: '#8b1a1a', dark: '#4a0a0a', light: '#cc3030', highlight: '#ff6060', bg: '#1a0808', name: 'Blood Moon',  rarity: 'epic' },
  { id: 'kush',       body: '#2d8a4e', dark: '#1a5430', light: '#66cc88', highlight: '#d4a017', bg: '#0e1a10', name: 'Kush',        rarity: 'rare' },
  { id: 'vaporwave',  body: '#ff71ce', dark: '#b967ff', light: '#01cdfe', highlight: '#fffb96', bg: '#1a0a28', name: 'Vaporwave',   rarity: 'epic' },
  { id: 'rust',       body: '#b7410e', dark: '#7a2e0a', light: '#e0884d', highlight: '#ffc896', bg: '#221408', name: 'Rust',        rarity: 'uncommon' },
  { id: 'arctic',     body: '#d0e8f0', dark: '#90b8d0', light: '#e8f4ff', highlight: '#ffffff', bg: '#0e1820', name: 'Arctic',      rarity: 'rare' },
  { id: 'hell',       body: '#cc2200', dark: '#881100', light: '#ff6040', highlight: '#ffaa40', bg: '#180800', name: 'Hellfire',    rarity: 'legendary' },
  { id: 'bubblegum',  body: '#ff69b4', dark: '#cc3388', light: '#ff99cc', highlight: '#ffccee', bg: '#2a0e1e', name: 'Bubblegum',   rarity: 'uncommon' },
  { id: 'midnight',   body: '#1a1a6e', dark: '#0a0a3e', light: '#3a3aae', highlight: '#7070ee', bg: '#06061a', name: 'Midnight',    rarity: 'rare' },
];

const EYES: TraitDef[] = [
  { id: 'dots',    name: 'Dot Eyes',      rarity: 'common' },
  { id: 'wide',    name: 'Wide Eyes',     rarity: 'common' },
  { id: 'happy',   name: 'Happy Eyes',    rarity: 'common' },
  { id: 'pixel',   name: 'Pixel Eyes',    rarity: 'common' },
  { id: 'angry',   name: 'Angry Eyes',    rarity: 'uncommon' },
  { id: 'sleepy',  name: 'Sleepy Eyes',   rarity: 'uncommon' },
  { id: 'cross',   name: 'X Eyes',        rarity: 'uncommon' },
  { id: 'star',    name: 'Star Eyes',     rarity: 'rare' },
  { id: 'heart',   name: 'Heart Eyes',    rarity: 'rare' },
  { id: 'diamond', name: 'Diamond Eyes',  rarity: 'rare' },
  { id: 'spiral',  name: 'Spiral Eyes',   rarity: 'rare' },
  { id: 'laser',   name: 'Laser Eyes',    rarity: 'epic' },
  { id: 'flame',   name: 'Flame Eyes',    rarity: 'epic' },
  { id: 'moon',    name: 'Moon Eyes',     rarity: 'epic' },
  { id: 'void',    name: 'Void Eyes',     rarity: 'legendary' },
  { id: 'rainbow', name: 'Rainbow Eyes',  rarity: 'mythic' },
  // â”€â”€ Expansion â”€â”€
  { id: 'stoned',      name: 'Stoned Eyes',     rarity: 'rare' },
  { id: 'crying',      name: 'Crying Eyes',     rarity: 'uncommon' },
  { id: 'wink',        name: 'Wink',            rarity: 'uncommon' },
  { id: 'suspicious',  name: 'Suspicious Eyes', rarity: 'rare' },
  { id: 'hypno',       name: 'Hypno Eyes',      rarity: 'epic' },
  { id: 'dollar',      name: 'Money Eyes',      rarity: 'rare' },
  { id: 'skull_eyes',  name: 'Skull Eyes',      rarity: 'epic' },
  { id: 'glitch_eyes', name: 'Glitch Eyes',     rarity: 'legendary' },
  { id: 'cat_eyes',    name: 'Cat Eyes',        rarity: 'uncommon' },
  { id: 'cyclops',     name: 'Cyclops Eye',     rarity: 'epic' },
];

const MOUTHS: TraitDef[] = [
  { id: 'smile',   name: 'Smile',         rarity: 'common' },
  { id: 'grin',    name: 'Grin',          rarity: 'common' },
  { id: 'open',    name: 'Open Mouth',    rarity: 'common' },
  { id: 'flat',    name: 'Flat Line',     rarity: 'common' },
  { id: 'fangs',   name: 'Fangs',         rarity: 'uncommon' },
  { id: 'tongue',  name: 'Tongue Out',    rarity: 'uncommon' },
  { id: 'whistle', name: 'Whistle',       rarity: 'uncommon' },
  { id: 'blep',    name: 'Blep',          rarity: 'rare' },
  { id: 'vampire', name: 'Vampire',       rarity: 'rare' },
  { id: 'zigzag',  name: 'Zigzag',        rarity: 'rare' },
  { id: 'fire',    name: 'Fire Breath',   rarity: 'epic' },
  { id: 'none',    name: 'No Mouth',      rarity: 'rare' },
  // â”€â”€ Expansion â”€â”€
  { id: 'joint',      name: 'Joint',         rarity: 'rare' },
  { id: 'cigarette',  name: 'Cigarette',     rarity: 'rare' },
  { id: 'drool',      name: 'Drool',         rarity: 'uncommon' },
  { id: 'scream',     name: 'Scream',        rarity: 'uncommon' },
  { id: 'smirk',      name: 'Smirk',         rarity: 'uncommon' },
  { id: 'kiss',       name: 'Kiss Lips',     rarity: 'rare' },
  { id: 'gas_mask',   name: 'Gas Mask',      rarity: 'epic' },
  { id: 'gold_grill', name: 'Gold Grill',    rarity: 'legendary' },
  { id: 'void_maw',   name: 'Void Maw',      rarity: 'mythic' },
  // — Pro Expansion —
  { id: 'smoke_breath', name: 'Smoke Breath', rarity: 'epic' },
  { id: 'plasma_mouth', name: 'Plasma Mouth', rarity: 'epic' },
  { id: 'diamond_grill', name: 'Diamond Grill', rarity: 'legendary' },
  { id: 'snarl',     name: 'Snarl',          rarity: 'uncommon' },
  { id: 'buck_teeth', name: 'Buck Teeth',    rarity: 'common' },
];

const HEADGEAR: TraitDef[] = [
  { id: 'none',      name: 'None',          rarity: 'common' },
  { id: 'bow',       name: 'Bow',           rarity: 'common' },
  { id: 'cap',       name: 'Baseball Cap',  rarity: 'uncommon' },
  { id: 'tophat',    name: 'Top Hat',       rarity: 'uncommon' },
  { id: 'mohawk',    name: 'Mohawk',        rarity: 'uncommon' },
  { id: 'antenna',   name: 'Antenna',       rarity: 'uncommon' },
  { id: 'horns',     name: 'Devil Horns',   rarity: 'rare' },
  { id: 'halo',      name: 'Halo',          rarity: 'rare' },
  { id: 'ears',      name: 'Cat Ears',      rarity: 'rare' },
  { id: 'mushroom',  name: 'Mushroom Cap',  rarity: 'rare' },
  { id: 'crown',     name: 'Crown',         rarity: 'epic' },
  { id: 'wizard',    name: 'Wizard Hat',    rarity: 'epic' },
  { id: 'mask',      name: 'Ninja Mask',    rarity: 'epic' },
  { id: 'tiara',     name: 'Tiara',         rarity: 'epic' },
  { id: 'flame',     name: 'Flame Crown',   rarity: 'legendary' },
  { id: 'glitch',    name: 'Glitch Hood',   rarity: 'mythic' },
  // â”€â”€ Expansion â”€â”€
  { id: 'beanie',     name: 'Beanie',        rarity: 'common' },
  { id: 'bucket_hat', name: 'Bucket Hat',    rarity: 'uncommon' },
  { id: 'bandana',    name: 'Bandana',       rarity: 'uncommon' },
  { id: 'headphones', name: 'Headphones',    rarity: 'rare' },
  { id: 'flower',     name: 'Flower Crown',  rarity: 'rare' },
  { id: 'snapback',   name: 'Snapback',      rarity: 'uncommon' },
  { id: 'leaf',       name: 'Weed Leaf',     rarity: 'rare' },
  { id: 'afro',       name: 'Afro',          rarity: 'rare' },
  { id: 'viking',     name: 'Viking Helm',   rarity: 'epic' },
  { id: 'astronaut',  name: 'Space Helmet',  rarity: 'legendary' },
];

const HELD_ITEMS: TraitDef[] = [
  { id: 'none',    name: 'None',          rarity: 'common' },
  { id: 'sword',   name: 'Pixel Sword',   rarity: 'uncommon' },
  { id: 'staff',   name: 'Magic Staff',   rarity: 'uncommon' },
  { id: 'wand',    name: 'Wand',          rarity: 'uncommon' },
  { id: 'shield',  name: 'Shield',        rarity: 'rare' },
  { id: 'orb',     name: 'Burning Orb',   rarity: 'rare' },
  { id: 'axe',     name: 'Battle Axe',    rarity: 'rare' },
  { id: 'lantern', name: 'Lantern',       rarity: 'rare' },
  { id: 'book',    name: 'Spell Book',    rarity: 'epic' },
  { id: 'scythe',  name: 'Scythe',        rarity: 'epic' },
  { id: 'flag',    name: 'Battle Flag',   rarity: 'epic' },
  { id: 'trident', name: 'Trident',       rarity: 'legendary' },
  // â”€â”€ Expansion â”€â”€
  { id: 'bong',       name: 'Bong',          rarity: 'rare' },
  { id: 'pizza',      name: 'Pizza Slice',   rarity: 'uncommon' },
  { id: 'skateboard', name: 'Skateboard',    rarity: 'uncommon' },
  { id: 'guitar',     name: 'Guitar',        rarity: 'rare' },
  { id: 'trophy',     name: 'Trophy',        rarity: 'epic' },
  { id: 'phone',      name: 'Phone',         rarity: 'uncommon' },
  { id: 'diamond_item', name: 'Diamond',     rarity: 'legendary' },
  { id: 'bomb',       name: 'Bomb',          rarity: 'rare' },
  { id: 'infinity_orb', name: 'Infinity Orb', rarity: 'mythic' },
  // — Pro Expansion —
  { id: 'torch',      name: 'Torch',          rarity: 'common' },
  { id: 'stick',      name: 'Stick',          rarity: 'common' },
  { id: 'balloon',    name: 'Balloon',        rarity: 'common' },
  { id: 'hammer',     name: 'Hammer',         rarity: 'uncommon' },
  { id: 'dagger',     name: 'Dagger',         rarity: 'rare' },
  { id: 'chalice',    name: 'Golden Chalice', rarity: 'legendary' },
];

const BACKGROUNDS: TraitDef[] = [
  { id: 'solid',      name: 'Solid',              rarity: 'common' },
  { id: 'gradient',   name: 'Gradient',            rarity: 'common' },
  { id: 'stars',      name: 'Starfield',           rarity: 'common' },
  { id: 'grid',       name: 'Pixel Grid',          rarity: 'uncommon' },
  { id: 'rain',       name: 'Rainstorm',           rarity: 'uncommon' },
  { id: 'diamonds',   name: 'Diamonds',            rarity: 'uncommon' },
  { id: 'waves',      name: 'Ocean Waves',         rarity: 'rare' },
  { id: 'circuit',    name: 'Circuit Board',       rarity: 'rare' },
  { id: 'swirl',      name: 'Energy Swirl',        rarity: 'rare' },
  // â”€â”€ Scene backgrounds (detailed pixel-art worlds) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { id: 'volcano',    name: 'Volcanic Lair',       rarity: 'rare' },
  { id: 'underwater', name: 'Deep Ocean',          rarity: 'rare' },
  { id: 'forest',     name: 'Enchanted Forest',    rarity: 'epic' },
  { id: 'castle',     name: 'Dark Castle',         rarity: 'epic' },
  { id: 'neon',       name: 'Neon City',           rarity: 'epic' },
  { id: 'space',      name: 'Deep Space',          rarity: 'epic' },
  { id: 'crystal',    name: 'Crystal Cavern',      rarity: 'legendary' },
  { id: 'firebg',     name: 'Fire Backdrop',       rarity: 'legendary' },
  { id: 'aurora',     name: 'Northern Lights',     rarity: 'legendary' },
  { id: 'voidbg',     name: 'The Void',            rarity: 'mythic' },
  { id: 'heaven',     name: 'Golden Heaven',       rarity: 'mythic' },
  // â”€â”€ Expansion: Scene backgrounds â”€â”€
  { id: 'sunset_beach', name: 'Sunset Beach',      rarity: 'rare' },
  { id: 'mountain',     name: 'Mountain Peak',     rarity: 'uncommon' },
  { id: 'desert',       name: 'Desert Dunes',      rarity: 'uncommon' },
  { id: 'cyberpunk',    name: 'Cyberpunk Alley',   rarity: 'epic' },
  { id: 'graveyard',    name: 'Graveyard',         rarity: 'rare' },
  { id: 'jungle',       name: 'Jungle',            rarity: 'rare' },
  { id: 'clouds',       name: 'Cloud Kingdom',     rarity: 'uncommon' },
  { id: 'matrix',       name: 'Matrix Rain',       rarity: 'epic' },
  { id: 'lava_fields',  name: 'Lava Fields',       rarity: 'rare' },
  { id: 'ice_cave',     name: 'Ice Cave',          rarity: 'rare' },
  { id: 'rooftop',      name: 'City Rooftop',      rarity: 'epic' },
  { id: 'dojo',         name: 'Dojo',              rarity: 'legendary' },
];

// â”€â”€ NEW TRAIT: Body Pattern (overlay on body) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PATTERNS: TraitDef[] = [
  { id: 'none',     name: 'None',           rarity: 'common' },
  { id: 'stripes',  name: 'Stripes',        rarity: 'common' },
  { id: 'spots',    name: 'Spots',          rarity: 'uncommon' },
  { id: 'zigzag',   name: 'Zigzag',         rarity: 'uncommon' },
  { id: 'checker',  name: 'Checker',        rarity: 'uncommon' },
  { id: 'scales',   name: 'Scales',         rarity: 'rare' },
  { id: 'cracks',   name: 'Cracks',         rarity: 'rare' },
  { id: 'hearts',   name: 'Hearts',         rarity: 'rare' },
  { id: 'stars',    name: 'Stars',          rarity: 'epic' },
  { id: 'circuit',  name: 'Circuit Lines',  rarity: 'legendary' },
  // â”€â”€ Expansion â”€â”€
  { id: 'flames_pat',  name: 'Flame Pattern',  rarity: 'rare' },
  { id: 'tribal',      name: 'Tribal Marks',   rarity: 'epic' },
  { id: 'galaxy',      name: 'Galaxy',         rarity: 'legendary' },
  { id: 'bones',       name: 'Skeletal',       rarity: 'epic' },
  { id: 'camo',        name: 'Camo',           rarity: 'uncommon' },
  { id: 'cosmic_runes', name: 'Cosmic Runes',  rarity: 'mythic' },
  // — Pro Expansion —
  { id: 'dots_pat',   name: 'Polka Dots',     rarity: 'common' },
  { id: 'waves_pat',  name: 'Wave Lines',     rarity: 'common' },
  { id: 'swirl_pat',  name: 'Swirl',          rarity: 'uncommon' },
  { id: 'runes_pat',  name: 'Ancient Runes',  rarity: 'rare' },
  { id: 'glitch_pat', name: 'Glitch Pattern', rarity: 'epic' },
  { id: 'lava_pat',   name: 'Lava Veins',     rarity: 'rare' },
];

// â”€â”€ NEW TRAIT: Aura Effect (particles around body) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const AURAS: TraitDef[] = [
  { id: 'none',     name: 'None',           rarity: 'common' },
  { id: 'sparkle',  name: 'Sparkle',        rarity: 'uncommon' },
  { id: 'embers',   name: 'Embers',         rarity: 'uncommon' },
  { id: 'frost',    name: 'Frost',          rarity: 'rare' },
  { id: 'electric', name: 'Electric',       rarity: 'rare' },
  { id: 'shadow',   name: 'Shadow',         rarity: 'epic' },
  { id: 'rainbow',  name: 'Rainbow',        rarity: 'epic' },
  { id: 'holy',     name: 'Holy Light',     rarity: 'legendary' },
  { id: 'singularity', name: 'Singularity',  rarity: 'mythic' },
  // — Pro Expansion —
  { id: 'calm',        name: 'Calm Glow',       rarity: 'common' },
  { id: 'dust',        name: 'Dust Cloud',      rarity: 'common' },
  { id: 'fireflies',   name: 'Fireflies',       rarity: 'uncommon' },
  { id: 'hearts_aura', name: 'Floating Hearts',  rarity: 'uncommon' },
  { id: 'smoke_aura',  name: 'Smoke Ring',      rarity: 'uncommon' },
  { id: 'crystal_aura', name: 'Crystal Shards', rarity: 'rare' },
  { id: 'poison',      name: 'Poison Cloud',    rarity: 'rare' },
  { id: 'lightning',   name: 'Lightning',       rarity: 'rare' },
  { id: 'plasma_aura', name: 'Plasma Field',    rarity: 'epic' },
  { id: 'dark_fire',   name: 'Dark Fire',       rarity: 'epic' },
  { id: 'solar',       name: 'Solar Flare',     rarity: 'legendary' },
  { id: 'void_aura',   name: 'Void Rift',       rarity: 'legendary' },
];

// â”€â”€ NEW TRAIT: Animation Style (how the creature moves) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ANIMATIONS: TraitDef[] = [
  { id: 'bounce',   name: 'Bounce',        rarity: 'common' },
  { id: 'hover',    name: 'Hover',         rarity: 'common' },
  { id: 'pulse',    name: 'Pulse',         rarity: 'uncommon' },
  { id: 'wobble',   name: 'Wobble',        rarity: 'uncommon' },
  { id: 'spin',     name: 'Gentle Spin',   rarity: 'rare' },
  { id: 'glitch',   name: 'Glitch',        rarity: 'epic' },
  { id: 'teleport', name: 'Teleport',      rarity: 'legendary' },
  // â”€â”€ Expansion â”€â”€
  { id: 'shake',      name: 'Rage Shake',    rarity: 'uncommon' },
  { id: 'breathe',    name: 'Breathing',     rarity: 'common' },
  { id: 'moonwalk',   name: 'Moonwalk',      rarity: 'rare' },
  { id: 'headbang',   name: 'Headbang',      rarity: 'rare' },
  { id: 'smoke_puff', name: 'Smoke Puff',    rarity: 'epic' },
  { id: 'transcend',  name: 'Transcendence', rarity: 'mythic' },
  // — Pro Expansion —
  { id: 'sway',       name: 'Sway',          rarity: 'common' },
  { id: 'jitter',     name: 'Jitter',        rarity: 'uncommon' },
  { id: 'float',      name: 'Float Up',      rarity: 'uncommon' },
  { id: 'vibrate',    name: 'Vibrate',       rarity: 'rare' },
  { id: 'dash',       name: 'Dash',          rarity: 'rare' },
  { id: 'phase',      name: 'Phase Shift',   rarity: 'epic' },
  { id: 'warp',       name: 'Warp',          rarity: 'epic' },
  { id: 'ascend',     name: 'Ascend',        rarity: 'legendary' },
];

// â”€â”€ NEW TRAIT: Companion Pet (small sidekick creature) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const COMPANIONS: TraitDef[] = [
  { id: 'none',      name: 'None',          rarity: 'common' },
  { id: 'firefly',   name: 'Firefly',       rarity: 'uncommon' },
  { id: 'bat',       name: 'Pixel Bat',     rarity: 'uncommon' },
  { id: 'skull',     name: 'Floating Skull', rarity: 'rare' },
  { id: 'fairy',     name: 'Fire Fairy',    rarity: 'rare' },
  { id: 'dragon',    name: 'Mini Dragon',   rarity: 'epic' },
  { id: 'ghost',     name: 'Ghost Cat',     rarity: 'epic' },
  { id: 'phoenix',   name: 'Baby Phoenix',  rarity: 'legendary' },
  { id: 'demon',     name: 'Imp',           rarity: 'mythic' },
  // â”€â”€ Expansion â”€â”€
  { id: 'black_cat',  name: 'Black Cat',     rarity: 'uncommon' },
  { id: 'raven',      name: 'Raven',         rarity: 'rare' },
  { id: 'snake',      name: 'Snake',         rarity: 'rare' },
  { id: 'frog',       name: 'Frog',          rarity: 'uncommon' },
  { id: 'robot',      name: 'Mini Robot',    rarity: 'epic' },
  { id: 'shroom',     name: 'Mushroom Buddy', rarity: 'rare' },
  // — Pro Expansion —
  { id: 'butterfly',  name: 'Butterfly',     rarity: 'common' },
  { id: 'puppy',      name: 'Pixel Puppy',   rarity: 'common' },
  { id: 'owl',        name: 'Owl',           rarity: 'uncommon' },
  { id: 'crab',       name: 'Hermit Crab',   rarity: 'uncommon' },
  { id: 'spirit_fox', name: 'Spirit Fox',    rarity: 'rare' },
  { id: 'golem',      name: 'Crystal Golem', rarity: 'epic' },
  { id: 'wisp',       name: 'Will-o-Wisp',  rarity: 'rare' },
  { id: 'unicorn',    name: 'Mini Unicorn',  rarity: 'legendary' },
];

// â”€â”€ NEW TRAIT: Outline / Border Effect â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const OUTLINES: TraitDef[] = [
  { id: 'none',      name: 'None',          rarity: 'common' },
  { id: 'dark',      name: 'Dark Outline',  rarity: 'common' },
  { id: 'glow',      name: 'Glow',          rarity: 'uncommon' },
  { id: 'double',    name: 'Double Line',   rarity: 'rare' },
  { id: 'pixel',     name: 'Pixel Border',  rarity: 'rare' },
  { id: 'rainbow',   name: 'Rainbow Glow',  rarity: 'epic' },
  { id: 'fire',      name: 'Fire Outline',  rarity: 'legendary' },
  // â”€â”€ Expansion â”€â”€
  { id: 'neon_out',    name: 'Neon Outline',   rarity: 'epic' },
  { id: 'frost_out',   name: 'Frost Outline',  rarity: 'rare' },
  { id: 'shadow_out',  name: 'Shadow Glow',    rarity: 'rare' },
  { id: 'glitch_out',  name: 'Glitch Outline', rarity: 'legendary' },
  { id: 'astral_out',  name: 'Astral Outline', rarity: 'mythic' },
  // — Pro Expansion —
  { id: 'thin',        name: 'Thin Line',      rarity: 'common' },
  { id: 'dotted_out',  name: 'Dotted',         rarity: 'uncommon' },
  { id: 'wavy_out',    name: 'Wavy Outline',   rarity: 'uncommon' },
  { id: 'electric_out', name: 'Electric Outline', rarity: 'rare' },
  { id: 'chain_out',   name: 'Chain Border',   rarity: 'rare' },
  { id: 'drip_out',    name: 'Dripping',       rarity: 'epic' },
  { id: 'toxic_out',   name: 'Toxic Glow',     rarity: 'epic' },
  { id: 'holo_out',    name: 'Holographic',    rarity: 'legendary' },
];

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// RARITY SELECTION
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const RARITY_WEIGHTS: Record<CreatureRarity, number> = {
  common: 40, uncommon: 25, rare: 18, epic: 10, legendary: 5, mythic: 2,
};
const RARITY_ORDER: CreatureRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

interface BadgeRarityProfile {
  minRarity: CreatureRarity;
  // Additive score bonus before tier thresholds; keeps distribution smooth.
  scoreBoost: number;
  // Chance to elevate to at least minRarity when computed rarity is lower.
  floorChance: number;
}

/**
 * Badge-tier rarity profiles (soft floor + score boost).
 * This keeps milestone progression meaningful without forcing 100% guaranteed top tiers.
 */
const BADGE_RARITY_PROFILE: Record<string, BadgeRarityProfile> = {
  // Streak low-tier (gentle nudge toward uncommon/rare)
  STREAK_7:    { minRarity: 'uncommon', scoreBoost: 0.05, floorChance: 0.30 },
  STREAK_14:   { minRarity: 'uncommon', scoreBoost: 0.08, floorChance: 0.35 },
  STREAK_21:   { minRarity: 'uncommon', scoreBoost: 0.10, floorChance: 0.40 },
  STREAK_30:   { minRarity: 'rare',     scoreBoost: 0.12, floorChance: 0.20 },
  STREAK_60:   { minRarity: 'rare',     scoreBoost: 0.15, floorChance: 0.25 },
  STREAK_90:   { minRarity: 'rare',     scoreBoost: 0.18, floorChance: 0.30 },
  STREAK_180:  { minRarity: 'rare',     scoreBoost: 0.20, floorChance: 0.35 },
  STREAK_365:  { minRarity: 'epic',     scoreBoost: 0.30, floorChance: 0.25 },
  // Streak mega-tiers
  STREAK_500:  { minRarity: 'rare',      scoreBoost: 0.20, floorChance: 0.45 },
  STREAK_730:  { minRarity: 'epic',      scoreBoost: 0.45, floorChance: 0.40 },
  STREAK_1000: { minRarity: 'legendary', scoreBoost: 0.58, floorChance: 0.24 },
  STREAK_1500: { minRarity: 'mythic',    scoreBoost: 0.82, floorChance: 0.16 },
  // Lifetime low-tier
  BURN_100:    { minRarity: 'uncommon', scoreBoost: 0.04, floorChance: 0.25 },
  BURN_500:    { minRarity: 'uncommon', scoreBoost: 0.08, floorChance: 0.30 },
  BURN_1000:   { minRarity: 'rare',     scoreBoost: 0.12, floorChance: 0.20 },
  // Lifetime mega-tiers
  BURN_2500:    { minRarity: 'rare',      scoreBoost: 0.22, floorChance: 0.48 },
  BURN_5000:    { minRarity: 'epic',      scoreBoost: 0.46, floorChance: 0.42 },
  BURN_10000:   { minRarity: 'epic',      scoreBoost: 0.52, floorChance: 0.46 },
  BURN_25000:   { minRarity: 'legendary', scoreBoost: 0.60, floorChance: 0.26 },
  BURN_50000:   { minRarity: 'legendary', scoreBoost: 0.68, floorChance: 0.30 },
  BURN_100000:  { minRarity: 'mythic',    scoreBoost: 0.86, floorChance: 0.14 },
  BURN_250000:  { minRarity: 'mythic',    scoreBoost: 0.92, floorChance: 0.16 },
  BURN_500000:  { minRarity: 'mythic',    scoreBoost: 0.98, floorChance: 0.18 },
  BURN_1000000: { minRarity: 'mythic',    scoreBoost: 1.05, floorChance: 0.22 },
};

function weightedPick<T extends TraitDef>(items: T[], rand: () => number): T {
  // Tier-first selection: pick a rarity tier using RARITY_WEIGHTS, then uniformly
  // pick a trait within that tier. This guarantees the rarity distribution matches
  // the configured weights regardless of how many traits exist per tier.
  const tierBuckets = new Map<CreatureRarity, T[]>();
  for (const item of items) {
    const bucket = tierBuckets.get(item.rarity);
    if (bucket) bucket.push(item);
    else tierBuckets.set(item.rarity, [item]);
  }

  // Build weighted list of available tiers only
  const availableTiers: { rarity: CreatureRarity; weight: number; items: T[] }[] = [];
  let totalWeight = 0;
  for (const [rarity, bucket] of tierBuckets) {
    const w = RARITY_WEIGHTS[rarity] ?? 10;
    availableTiers.push({ rarity, weight: w, items: bucket });
    totalWeight += w;
  }

  // Pick tier
  let r = rand() * totalWeight;
  let chosenBucket = availableTiers[0].items;
  for (const tier of availableTiers) {
    r -= tier.weight;
    if (r <= 0) { chosenBucket = tier.items; break; }
  }

  // Uniform pick within chosen tier
  return chosenBucket[Math.floor(rand() * chosenBucket.length)];
}

function computeRarity(
  traits: TraitDef[],
  profile?: BadgeRarityProfile,
  floorRoll?: number,
): CreatureRarity {
  const scoreByRarity: Record<CreatureRarity, number> = {
    common: 0,
    uncommon: 1,
    rare: 2,
    epic: 3,
    legendary: 4,
    mythic: 5,
  };

  const scores = traits.map(t => scoreByRarity[t.rarity]);
  const total = scores.reduce((a, b) => a + b, 0);
  const avg = total / Math.max(1, scores.length);

  const rarePlus = scores.filter(s => s >= 2).length;
  const epicPlus = scores.filter(s => s >= 3).length;
  const legendaryPlus = scores.filter(s => s >= 4).length;
  const mythicCount = scores.filter(s => s >= 5).length;

  // Weighted blend: many mid/high traits should matter, but a single outlier should not dominate.
  let blendedScore =
    avg +
    rarePlus * 0.05 +
    epicPlus * 0.08 +
    legendaryPlus * 0.14 +
    mythicCount * 0.24;

  if (profile) blendedScore += profile.scoreBoost;

  blendedScore = Math.max(0, Math.min(5, blendedScore));

  let computed: CreatureRarity;
  if (blendedScore < 1.50) computed = 'common';
  else if (blendedScore < 2.05) computed = 'uncommon';
  else if (blendedScore < 2.70) computed = 'rare';
  else if (blendedScore < 3.50) computed = 'epic';
  else if (blendedScore < 4.35) computed = 'legendary';
  else computed = 'mythic';

  if (!profile) return computed;

  const computedIdx = RARITY_ORDER.indexOf(computed);
  const floorIdx = RARITY_ORDER.indexOf(profile.minRarity);
  if (computedIdx >= floorIdx) return computed;

  const roll = floorRoll ?? 0;
  if (roll < profile.floorChance) return profile.minRarity;

  return computed;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// DRAWING FUNCTIONS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function drawBackground(canvas: Canvas, bgDef: TraitDef, pal: ColorPalDef, palObj: PalBuilder, frame: number, total: number) {
  const bgIdx = palObj.add(pal.bg);
  const bgLighter = palObj.add(lerpC(fromHex(pal.bg), fromHex(pal.dark), 0.25));
  const bgAccent = palObj.add(lerpC(fromHex(pal.bg), fromHex(pal.body), 0.12));
  canvas.clear(bgIdx);
  const t = frame / total;

  switch (bgDef.id) {
    case 'gradient':
      for (let y = Math.floor(canvas.h / 2); y < canvas.h; y++)
        for (let x = 0; x < canvas.w; x++) canvas.set(x, y, bgLighter);
      break;
    case 'stars':
      for (let i = 0; i < 20; i++) {
        const sx = ((i * 7 + 3) + Math.floor(Math.sin(t * Math.PI * 2 + i) * 1.2)) % canvas.w;
        const sy = ((i * 11 + 5) + Math.floor(Math.cos(t * Math.PI * 2 + i * 0.7) * 0.8)) % canvas.h;
        if (Math.sin(t * Math.PI * 4 + i * 1.3) > 0) canvas.set(sx, sy, palObj.add(pal.highlight));
      }
      break;
    case 'grid':
      for (let y = 0; y < canvas.h; y += 6) for (let x = 0; x < canvas.w; x++) canvas.set(x, y, bgLighter);
      for (let x = 0; x < canvas.w; x += 6) for (let y = 0; y < canvas.h; y++) canvas.set(x, y, bgLighter);
      break;
    case 'diamonds':
      for (let dy = 0; dy < canvas.h; dy += 8) for (let dx = 0; dx < canvas.w; dx += 8) {
        const cx = dx + 4, cy = dy + 4;
        for (let r = 0; r < 3; r++) {
          canvas.set(cx, cy - r, bgAccent); canvas.set(cx, cy + r, bgAccent);
          canvas.set(cx - r, cy, bgAccent); canvas.set(cx + r, cy, bgAccent);
        }
      }
      break;
    case 'swirl':
      for (let y = 0; y < canvas.h; y++) for (let x = 0; x < canvas.w; x++) {
        const angle = Math.atan2(y - 24, x - 24) + t * Math.PI * 2;
        const dist = Math.sqrt((x - 24) ** 2 + (y - 24) ** 2);
        if (Math.sin(angle * 3 + dist * 0.3) > 0.6) canvas.set(x, y, bgAccent);
      }
      break;
    case 'aurora':
      for (let x = 0; x < canvas.w; x++) {
        const wave = Math.sin(x * 0.2 + t * Math.PI * 2) * 4 + 8;
        for (let dy = 0; dy < 3; dy++) canvas.set(x, Math.round(wave + dy), bgAccent);
        const w2 = Math.sin(x * 0.15 + t * Math.PI * 2 + 2) * 3 + 14;
        for (let dy = 0; dy < 2; dy++) canvas.set(x, Math.round(w2 + dy), bgLighter);
      }
      break;
    case 'rain':
      for (let i = 0; i < 30; i++) {
        const rx = (i * 7 + 2) % canvas.w;
        const ry = ((i * 11 + Math.floor(t * canvas.h * 2)) % (canvas.h + 6)) - 3;
        canvas.line(rx, ry, rx, ry + 3, bgLighter);
      }
      break;
    case 'waves':
      for (let row = 0; row < 3; row++) {
        const baseWY = 36 + row * 5;
        for (let x = 0; x < canvas.w; x++) {
          const wy = Math.round(Math.sin(x * 0.25 + t * Math.PI * 2 + row * 1.5) * 2 + baseWY);
          canvas.set(x, wy, bgAccent);
          if (row === 0) canvas.set(x, wy + 1, bgLighter);
        }
      }
      break;
    case 'circuit':
      for (let cy = 2; cy < canvas.h; cy += 8) for (let cx = 2; cx < canvas.w; cx += 8) {
        canvas.set(cx, cy, bgAccent);
        if ((cx + cy) % 16 < 8) canvas.line(cx, cy, cx + 4, cy, bgLighter);
        else canvas.line(cx, cy, cx, cy + 4, bgLighter);
      }
      break;
    case 'firebg':
      for (let x = 0; x < canvas.w; x++) {
        const fh = Math.round(Math.sin(x * 0.4 + t * Math.PI * 4) * 3 + Math.cos(x * 0.7 + t * Math.PI * 3) * 2 + 6);
        for (let fy = 0; fy < fh; fy++) {
          const py = canvas.h - 1 - fy;
          if (py >= 0) canvas.set(x, py, fy < 3 ? palObj.add('#ff4020') : bgAccent);
        }
      }
      break;
    case 'voidbg':
      for (let i = 0; i < 40; i++) {
        const vx = (i * 13 + 5) % canvas.w, vy = (i * 17 + 3) % canvas.h;
        const pulse = Math.sin(t * Math.PI * 2 + i * 0.8) * 0.5 + 0.5;
        if (pulse > 0.3) canvas.set(vx, vy, bgLighter);
        if (pulse > 0.7 && i % 3 === 0) { canvas.set(vx + 1, vy, bgAccent); canvas.set(vx, vy + 1, bgAccent); }
      }
      break;

    // â”€â”€ Scene backgrounds (detailed pixel-art worlds) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    case 'volcano': {
      // Ground / lava layer
      const lavaC = palObj.add('#ff3010'), magmaC = palObj.add('#ff8020'), rockC = palObj.add('#3a2520');
      // Mountain silhouette
      for (let x = 0; x < canvas.w; x++) {
        const peak = Math.round(16 - Math.abs(x - 24) * 0.6 + Math.sin(x * 0.5) * 1.5);
        for (let y = peak; y < canvas.h; y++) canvas.set(x, y, y > 38 ? lavaC : rockC);
      }
      // Lava glow ripples at bottom
      for (let x = 0; x < canvas.w; x++) {
        const ripple = Math.sin(x * 0.6 + t * Math.PI * 4) * 1.5;
        canvas.set(x, Math.round(40 + ripple), magmaC);
      }
      // Eruption particles
      for (let i = 0; i < 5; i++) {
        const px = 24 + ((i * 3) % 7) - 3;
        const py = Math.round(12 - ((frame * 2 + i * 4) % 14));
        if (py >= 0 && py < canvas.h) canvas.set(px, py, magmaC);
      }
      // Ash particles in sky
      for (let i = 0; i < 8; i++) {
        const ax = (i * 11 + frame * 2) % canvas.w;
        const ay = (i * 5 + 2) % 16;
        canvas.set(ax, ay, bgLighter);
      }
      break;
    }
    case 'underwater': {
      const waterC = palObj.add('#1a4080'), deepC = palObj.add('#0a2050'), bubbleC = palObj.add('#80c0ff');
      const sandC = palObj.add('#c0a060'), seaweedC = palObj.add('#208040');
      // Water gradient
      for (let y = 0; y < canvas.h; y++) for (let x = 0; x < canvas.w; x++) {
        if (y > canvas.h - 6) canvas.set(x, y, sandC);
        else if (y > canvas.h / 2) canvas.set(x, y, deepC);
      }
      // Seaweed strands
      for (let s = 0; s < 4; s++) {
        const sx = 6 + s * 12;
        for (let h = 0; h < 8; h++) {
          const sway = Math.round(Math.sin(h * 0.4 + t * Math.PI * 2 + s) * 1.5);
          canvas.set(sx + sway, canvas.h - 6 - h, seaweedC);
        }
      }
      // Bubbles rising
      for (let i = 0; i < 6; i++) {
        const bx = (i * 9 + 4) % canvas.w;
        const by = canvas.h - 8 - ((frame * 2 + i * 7) % (canvas.h - 4));
        if (by >= 0) { canvas.set(bx, by, bubbleC); if (i % 2 === 0) canvas.set(bx + 1, by, bubbleC); }
      }
      // Light rays from top
      for (let r = 0; r < 3; r++) {
        const rx = 10 + r * 14;
        for (let ry = 0; ry < 15; ry++) canvas.set(rx + Math.round(ry * 0.3), ry, waterC);
      }
      break;
    }
    case 'forest': {
      const trunkC = palObj.add('#4a2810'), leafC = palObj.add('#1a6030'), leafL = palObj.add('#30a050');
      const grassC = palObj.add('#2a8040'), groundC = palObj.add('#3a2818');
      // Ground
      for (let x = 0; x < canvas.w; x++) {
        canvas.set(x, canvas.h - 2, groundC); canvas.set(x, canvas.h - 1, groundC);
        canvas.set(x, canvas.h - 3, grassC);
        if (x % 3 === 0) canvas.set(x, canvas.h - 4, grassC);
      }
      // Trees (3 background trees)
      for (let tr = 0; tr < 3; tr++) {
        const tx = 6 + tr * 16;
        for (let ty = canvas.h - 3; ty > canvas.h - 14; ty--) canvas.set(tx, ty, trunkC);
        canvas.circle(tx, canvas.h - 16, 5, leafC);
        canvas.circle(tx - 1, canvas.h - 17, 3, leafL);
      }
      // Fireflies
      for (let i = 0; i < 4; i++) {
        const fx = (i * 11 + 3 + Math.round(Math.sin(t * Math.PI * 2 + i * 2) * 2)) % canvas.w;
        const fy = 10 + (i * 7) % 20;
        if (Math.sin(t * Math.PI * 4 + i * 1.7) > 0.2)
          canvas.set(fx, fy, palObj.add('#ffff60'));
      }
      break;
    }
    case 'castle': {
      const stoneC = palObj.add('#404050'), stoneL = palObj.add('#505060'), windowC = palObj.add('#ffcc40');
      // Castle wall base
      for (let y = canvas.h - 12; y < canvas.h; y++)
        for (let x = 0; x < canvas.w; x++) canvas.set(x, y, stoneC);
      // Towers
      for (const tx of [6, 24, 42]) {
        canvas.rect(tx - 3, canvas.h - 22, 6, 22, stoneC);
        // Battlements
        for (let b = 0; b < 3; b++) canvas.rect(tx - 3 + b * 2, canvas.h - 24, 2, 2, stoneL);
        // Window (glowing)
        const wFlicker = Math.sin(t * Math.PI * 6 + tx) > 0 ? windowC : palObj.add('#cc9930');
        canvas.rect(tx - 1, canvas.h - 18, 2, 3, wFlicker);
      }
      // Moon
      canvas.circle(38, 6, 3, palObj.add('#e0d8c0'));
      canvas.circle(39, 5, 2, bgIdx); // crescent cutout
      break;
    }
    case 'neon': {
      const neonP = palObj.add('#ff00ff'), neonB = palObj.add('#00ffff'), neonY = palObj.add('#ffff00');
      // Buildings (cityscape)
      const heights = [28, 20, 32, 24, 36, 18, 30, 22, 34, 26, 16, 28];
      for (let b = 0; b < heights.length; b++) {
        const bx = b * 4, bh = heights[b];
        canvas.rect(bx, canvas.h - bh, 4, bh, palObj.add('#181828'));
        // Neon strips
        const neonColors = [neonP, neonB, neonY];
        const nc = neonColors[b % 3];
        canvas.set(bx + 1, canvas.h - bh + 1, nc);
        canvas.set(bx + 2, canvas.h - bh + 1, nc);
        // Windows
        for (let wy = canvas.h - bh + 3; wy < canvas.h - 2; wy += 3)
          canvas.set(bx + 1 + ((wy + b) % 2), wy, palObj.add('#ffcc60'));
      }
      // Animated neon sign
      if (Math.sin(t * Math.PI * 6) > 0) {
        canvas.rect(10, 4, 8, 3, neonP);
      }
      // Rain streaks
      for (let i = 0; i < 8; i++) {
        const rx = (i * 6 + frame) % canvas.w;
        const ry = (i * 9 + frame * 3) % canvas.h;
        canvas.set(rx, ry, bgLighter); canvas.set(rx, ry + 1, bgLighter);
      }
      break;
    }
    case 'space': {
      const starColors = [palObj.add('#ffffff'), palObj.add('#a0c0ff'), palObj.add('#ffd080')];
      // Nebula
      for (let y = 0; y < canvas.h; y++) for (let x = 0; x < canvas.w; x++) {
        const nv = Math.sin(x * 0.15 + y * 0.1) * Math.cos(y * 0.2 - x * 0.05);
        if (nv > 0.5) canvas.set(x, y, bgAccent);
        else if (nv > 0.3) canvas.set(x, y, bgLighter);
      }
      // Dense stars
      for (let i = 0; i < 30; i++) {
        const sx = (i * 13 + 7) % canvas.w, sy = (i * 17 + 3) % canvas.h;
        if (Math.sin(t * Math.PI * 4 + i * 0.9) > -0.3)
          canvas.set(sx, sy, starColors[i % 3]);
      }
      // Planet
      canvas.circle(38, 10, 4, palObj.add('#804020'));
      canvas.circle(37, 9, 2, palObj.add('#a06030'));
      // Planet ring
      canvas.line(34, 11, 42, 9, palObj.add('#a08060'));
      break;
    }
    case 'crystal': {
      const crystalC1 = palObj.add('#60a0ff'), crystalC2 = palObj.add('#a060ff'), crystalHL = palObj.add('#e0f0ff');
      const caveC = palObj.add('#1a1028');
      // Cave walls
      for (let x = 0; x < canvas.w; x++) {
        for (let y = 0; y < 5 + Math.round(Math.sin(x * 0.5) * 2); y++) canvas.set(x, y, caveC);
        for (let y = canvas.h - 4 - Math.round(Math.sin(x * 0.7 + 1) * 2); y < canvas.h; y++) canvas.set(x, y, caveC);
      }
      // Crystal clusters growing from floor and ceiling
      for (const cx of [8, 20, 36]) {
        // floor crystals
        const ch = 6 + (cx % 3) * 2;
        for (let dy = 0; dy < ch; dy++) {
          canvas.set(cx, canvas.h - 4 - dy, dy % 2 === 0 ? crystalC1 : crystalC2);
          if (dy < ch - 2) canvas.set(cx - 1, canvas.h - 4 - dy, crystalC2);
        }
        canvas.set(cx, canvas.h - 4 - ch, crystalHL);
        // ceiling stalactites
        const sh = 4 + (cx % 2) * 2;
        for (let dy = 0; dy < sh; dy++) canvas.set(cx + 6, 4 + dy, crystalC1);
      }
      // Sparkle animation
      for (let i = 0; i < 5; i++) {
        const sx = (i * 11 + 5) % canvas.w, sy = 10 + (i * 7) % 20;
        if (Math.sin(t * Math.PI * 6 + i * 2) > 0.5) canvas.set(sx, sy, crystalHL);
      }
      break;
    }
    case 'heaven': {
      const cloudC = palObj.add('#fffde0'), goldC = palObj.add('#ffd700'), rayC = palObj.add('#fff8b0');
      const skyC = palObj.add('#ffe8a0');
      // Golden sky gradient
      for (let y = 0; y < canvas.h / 2; y++)
        for (let x = 0; x < canvas.w; x++) canvas.set(x, y, skyC);
      // Light rays radiating from top center
      for (let r = 0; r < 8; r++) {
        const angle = (r / 8) * Math.PI;
        for (let d = 0; d < 30; d++) {
          const rx = Math.round(24 + Math.cos(angle) * d);
          const ry = Math.round(Math.sin(angle) * d);
          if (rx >= 0 && rx < canvas.w && ry >= 0 && ry < canvas.h)
            canvas.set(rx, ry, rayC);
        }
      }
      // Cloud platforms
      for (const cy of [32, 38]) {
        for (let dx = -6; dx <= 6; dx++) {
          canvas.set(24 + dx, cy, cloudC);
          if (Math.abs(dx) < 4) canvas.set(24 + dx, cy - 1, cloudC);
        }
      }
      // Floating halos
      for (let i = 0; i < 3; i++) {
        const hx = 8 + i * 16, hy = 8 + Math.round(Math.sin(t * Math.PI * 2 + i) * 2);
        canvas.set(hx - 1, hy, goldC); canvas.set(hx, hy, goldC); canvas.set(hx + 1, hy, goldC);
      }
      break;
    }

    // â”€â”€ Expansion backgrounds â”€â”€
    case 'sunset_beach': {
      const sandC = palObj.add('#d4a050'), waterC = palObj.add('#2060b0'), skyHi = palObj.add('#ff8040');
      const palmC = palObj.add('#2a5020'), trunkC = palObj.add('#6a4020'), sunC = palObj.add('#ffcc30');
      // Sky gradient
      for (let y = 0; y < 20; y++) for (let x = 0; x < canvas.w; x++)
        canvas.set(x, y, y < 10 ? skyHi : bgLighter);
      // Sun
      canvas.circle(36, 8, 4, sunC);
      // Water
      for (let y = 20; y < 34; y++) for (let x = 0; x < canvas.w; x++) canvas.set(x, y, waterC);
      // Wave crests
      for (let x = 0; x < canvas.w; x++) {
        const wy = Math.round(Math.sin(x * 0.3 + t * Math.PI * 4) * 1 + 20);
        canvas.set(x, wy, bgLighter);
      }
      // Sand
      for (let y = 34; y < canvas.h; y++) for (let x = 0; x < canvas.w; x++) canvas.set(x, y, sandC);
      // Palm tree
      canvas.line(10, 35, 10, 18, trunkC); canvas.line(11, 35, 11, 18, trunkC);
      for (let i = 0; i < 7; i++) { canvas.set(10 - i, 17 - Math.abs(i - 3), palmC); canvas.set(10 + i, 17 - Math.abs(i - 3), palmC); }
      canvas.set(10, 15, palmC); canvas.set(10, 16, palmC);
      break;
    }
    case 'mountain': {
      const snowC = palObj.add('#e0e8f0'), rockC = palObj.add('#506070'), grassC = palObj.add('#3a7040');
      // Mountains
      for (let x = 0; x < canvas.w; x++) {
        const h1 = Math.round(12 - Math.abs(x - 16) * 0.5);
        const h2 = Math.round(10 - Math.abs(x - 36) * 0.4);
        const h = Math.max(h1, h2);
        for (let y = h; y < canvas.h; y++) canvas.set(x, y, y > 38 ? grassC : rockC);
        if (h < 16) canvas.set(x, h, snowC);
        if (h < 15) canvas.set(x, h + 1, snowC);
      }
      // Snow on peaks
      canvas.circle(16, 12, 3, snowC); canvas.circle(36, 10, 2, snowC);
      break;
    }
    case 'desert': {
      const sandC = palObj.add('#d4a858'), duneShadow = palObj.add('#b88838'), skyC2 = palObj.add('#87ceeb');
      const cactusC = palObj.add('#2a8020'), sunC = palObj.add('#fff040');
      for (let y = 0; y < 20; y++) for (let x = 0; x < canvas.w; x++) canvas.set(x, y, skyC2);
      canvas.circle(38, 8, 3, sunC);
      // Dunes
      for (let x = 0; x < canvas.w; x++) {
        const dh = Math.round(Math.sin(x * 0.12) * 4 + Math.sin(x * 0.3) * 2 + 24);
        for (let y = dh; y < canvas.h; y++) canvas.set(x, y, y > dh + 2 ? sandC : duneShadow);
      }
      // Cactus
      canvas.rect(12, 22, 2, 10, cactusC); canvas.rect(10, 24, 2, 2, cactusC); canvas.rect(14, 26, 2, 2, cactusC);
      canvas.set(10, 23, cactusC); canvas.set(15, 25, cactusC);
      // Heat shimmer particles
      for (let i = 0; i < 5; i++) {
        const sx = (i * 10 + frame * 2) % canvas.w;
        const sy = 18 + Math.round(Math.sin(t * Math.PI * 4 + i) * 1);
        canvas.set(sx, sy, bgLighter);
      }
      break;
    }
    case 'cyberpunk': {
      const neonP = palObj.add('#ff00ff'), neonC2 = palObj.add('#00ffff'), buildC = palObj.add('#0a0a1e');
      const windowC = palObj.add('#ffaa30'), puddleC = palObj.add('#1020a0');
      // Buildings
      const bHeights = [30, 22, 38, 18, 34, 26, 40, 20, 36, 24, 32, 28];
      for (let b = 0; b < bHeights.length; b++) {
        const bx = b * 4; canvas.rect(bx, canvas.h - bHeights[b], 4, bHeights[b], buildC);
        canvas.set(bx + 1, canvas.h - bHeights[b] + 1, b % 2 === 0 ? neonP : neonC2);
        canvas.set(bx + 2, canvas.h - bHeights[b] + 1, b % 2 === 0 ? neonP : neonC2);
        for (let wy = canvas.h - bHeights[b] + 3; wy < canvas.h - 2; wy += 3)
          if ((wy + b) % 2 === 0) canvas.set(bx + 1, wy, windowC);
      }
      // Neon sign flicker
      if (Math.sin(t * Math.PI * 8) > 0) canvas.rect(8, 3, 12, 2, neonP);
      // Puddles
      for (let x = 0; x < canvas.w; x += 6) canvas.rect(x, canvas.h - 1, 3, 1, puddleC);
      // Rain
      for (let i = 0; i < 15; i++) {
        const rx = (i * 5 + frame * 2) % canvas.w;
        const ry = (i * 7 + frame * 3) % canvas.h;
        canvas.set(rx, ry, bgLighter); canvas.set(rx, ry + 1, bgLighter);
      }
      break;
    }
    case 'graveyard': {
      const stoneC = palObj.add('#607060'), groundC = palObj.add('#2a3020'), fogC = palObj.add('#405040');
      const moonC = palObj.add('#e0dcc0');
      // Ground
      for (let y = canvas.h - 8; y < canvas.h; y++) for (let x = 0; x < canvas.w; x++) canvas.set(x, y, groundC);
      // Moon
      canvas.circle(38, 6, 4, moonC); canvas.circle(39, 5, 3, bgIdx);
      // Tombstones
      for (const tx of [8, 20, 34]) {
        canvas.rect(tx - 2, canvas.h - 14, 4, 8, stoneC);
        canvas.rect(tx - 1, canvas.h - 15, 2, 1, stoneC);
        canvas.set(tx - 1, canvas.h - 12, bgLighter); canvas.set(tx, canvas.h - 12, bgLighter);
      }
      // Fog layer
      for (let x = 0; x < canvas.w; x++) {
        const fy = Math.round(Math.sin(x * 0.15 + t * Math.PI * 2) * 2 + canvas.h - 9);
        canvas.set(x, fy, fogC);
        if (x % 2 === 0) canvas.set(x, fy - 1, fogC);
      }
      break;
    }
    case 'jungle': {
      const vineC = palObj.add('#1a7030'), leafC2 = palObj.add('#30a848'), trunkC = palObj.add('#5a3818');
      const birdC = palObj.add('#ff4040'), groundC = palObj.add('#3a2818');
      // Ground
      for (let x = 0; x < canvas.w; x++) { canvas.set(x, canvas.h - 1, groundC); canvas.set(x, canvas.h - 2, groundC); }
      // Dense trees
      for (const tx of [4, 18, 32, 44]) {
        for (let y = canvas.h - 2; y > canvas.h - 18; y--) canvas.set(tx, y, trunkC);
        canvas.circle(tx, canvas.h - 20, 6, vineC);
        canvas.circle(tx + 2, canvas.h - 22, 4, leafC2);
      }
      // Hanging vines
      for (let v = 0; v < 5; v++) {
        const vx = 2 + v * 10;
        for (let vy = 0; vy < 8 + v % 3 * 3; vy++) {
          const sway = Math.round(Math.sin(vy * 0.5 + t * Math.PI * 2 + v) * 1);
          canvas.set(vx + sway, vy, vineC);
        }
      }
      // Parrot
      const px = 30 + Math.round(Math.sin(t * Math.PI * 2) * 3);
      canvas.set(px, 5, birdC); canvas.set(px + 1, 5, birdC); canvas.set(px, 6, palObj.add('#ffcc00'));
      break;
    }
    case 'clouds': {
      const skyC2 = palObj.add('#60a8ff'), cloudC = palObj.add('#e8f0ff'), cloudShadow = palObj.add('#c0d0e8');
      // Sky
      for (let y = 0; y < canvas.h; y++) for (let x = 0; x < canvas.w; x++) canvas.set(x, y, skyC2);
      // Cloud platforms
      for (const [cx2, cy2, w] of [[12, 10, 8], [32, 8, 10], [24, 36, 12], [8, 28, 6], [38, 22, 7]] as [number, number, number][]) {
        for (let dx = -w / 2; dx <= w / 2; dx++) {
          canvas.set(Math.round(cx2 + dx), cy2, cloudC);
          canvas.set(Math.round(cx2 + dx), cy2 + 1, cloudShadow);
          if (Math.abs(dx) < w / 3) canvas.set(Math.round(cx2 + dx), cy2 - 1, cloudC);
        }
      }
      break;
    }
    case 'matrix': {
      const matC = palObj.add('#00ff40'), matD = palObj.add('#008820');
      // Falling characters
      for (let col = 0; col < canvas.w; col += 3) {
        const speed = 2 + (col % 5);
        const offset = (col * 7 + frame * speed) % (canvas.h + 10);
        for (let row = 0; row < 6; row++) {
          const y = offset - row * 2;
          if (y >= 0 && y < canvas.h) canvas.set(col, y, row === 0 ? matC : matD);
        }
      }
      break;
    }
    case 'lava_fields': {
      const lavaC = palObj.add('#ff3010'), magmaC = palObj.add('#ff8020'), crustC = palObj.add('#4a2020');
      // Cracked ground
      for (let y = 0; y < canvas.h; y++) for (let x = 0; x < canvas.w; x++) {
        if ((x + y * 3) % 7 === 0) canvas.set(x, y, lavaC);
        else if ((x * 2 + y) % 9 === 0) canvas.set(x, y, magmaC);
        else canvas.set(x, y, crustC);
      }
      // Flowing lava rivers
      for (let x = 0; x < canvas.w; x++) {
        const ly = Math.round(Math.sin(x * 0.2 + t * Math.PI * 3) * 3 + 24);
        canvas.set(x, ly, lavaC); canvas.set(x, ly + 1, magmaC);
      }
      break;
    }
    case 'ice_cave': {
      const iceC = palObj.add('#a0d8ff'), deepIce = palObj.add('#4080c0'), icicle = palObj.add('#c0e8ff');
      // Cave walls
      for (let x = 0; x < canvas.w; x++) {
        for (let y = 0; y < 6 + Math.round(Math.sin(x * 0.4) * 2); y++) canvas.set(x, y, deepIce);
        for (let y = canvas.h - 5 - Math.round(Math.cos(x * 0.5) * 2); y < canvas.h; y++) canvas.set(x, y, deepIce);
      }
      // Icicles hanging
      for (let i = 0; i < 8; i++) {
        const ix = 3 + i * 6, ih = 3 + i % 3 * 2;
        for (let dy = 0; dy < ih; dy++) canvas.set(ix, 5 + dy, icicle);
      }
      // Sparkles
      for (let i = 0; i < 6; i++) {
        const sx = (i * 8 + 3) % canvas.w, sy = 10 + (i * 6) % 20;
        if (Math.sin(t * Math.PI * 6 + i * 2.3) > 0.5) canvas.set(sx, sy, palObj.add('#ffffff'));
      }
      break;
    }
    case 'rooftop': {
      const brickC = palObj.add('#605050'), skyC2 = palObj.add('#0a0a28'), starC = palObj.add('#ffffff');
      const railC = palObj.add('#808080'), antC = palObj.add('#404040');
      // Night sky
      for (let y = 0; y < 28; y++) for (let x = 0; x < canvas.w; x++) canvas.set(x, y, skyC2);
      // Stars
      for (let i = 0; i < 12; i++) {
        const sx = (i * 7 + 4) % canvas.w, sy = (i * 5 + 2) % 24;
        if (Math.sin(t * Math.PI * 4 + i) > 0) canvas.set(sx, sy, starC);
      }
      // Rooftop floor
      for (let y = 28; y < canvas.h; y++) for (let x = 0; x < canvas.w; x++) canvas.set(x, y, brickC);
      // Railing
      canvas.line(0, 28, canvas.w - 1, 28, railC);
      for (let x = 0; x < canvas.w; x += 6) canvas.line(x, 28, x, 26, railC);
      // Antenna
      canvas.line(40, 28, 40, 18, antC); canvas.set(40, 17, palObj.add('#ff0000'));
      // Distant buildings
      canvas.rect(4, 22, 6, 6, palObj.add('#181828')); canvas.rect(14, 20, 4, 8, palObj.add('#181828'));
      break;
    }
    case 'dojo': {
      const woodC = palObj.add('#8b5e3c'), roofC = palObj.add('#a02020'), wallC = palObj.add('#e8d8c0');
      const cherryC = palObj.add('#ff80a0'), trunkC = palObj.add('#5a3018');
      // Temple structure
      canvas.rect(10, 18, 28, 22, wallC);
      // Roof
      for (let x = 8; x < 40; x++) {
        const ry = Math.round(16 - Math.abs(x - 24) * 0.15);
        canvas.set(x, ry, roofC); canvas.set(x, ry + 1, roofC);
      }
      // Door
      canvas.rect(22, 30, 4, 10, woodC);
      // Floor
      for (let x = 0; x < canvas.w; x++) { canvas.set(x, canvas.h - 1, woodC); canvas.set(x, canvas.h - 2, woodC); }
      // Cherry blossom tree
      canvas.line(42, canvas.h - 2, 42, 10, trunkC);
      for (let i = 0; i < 8; i++) {
        const bx = 42 + ((i * 3) % 7) - 3, by = 8 + (i * 2) % 6;
        canvas.set(bx, by, cherryC);
      }
      // Falling petals
      for (let i = 0; i < 4; i++) {
        const px = (i * 12 + frame) % canvas.w;
        const py = (i * 8 + frame * 2) % canvas.h;
        canvas.set(px, py, cherryC);
      }
      break;
    }
  }
}

function drawBody(canvas: Canvas, bodyDef: TraitDef, pal: ColorPalDef, palObj: PalBuilder, bounceY: number) {
  const bodyC = palObj.add(pal.body), darkC = palObj.add(pal.dark), lightC = palObj.add(pal.light);
  const cx = 24, baseY = 30 + bounceY;
  switch (bodyDef.id) {
    case 'round':
      canvas.circle(cx, baseY, 10, bodyC); canvas.circle(cx - 2, baseY - 2, 5, lightC);
      canvas.rect(cx - 6, baseY + 9, 4, 3, darkC); canvas.rect(cx + 2, baseY + 9, 4, 3, darkC);
      break;
    case 'tall':
      canvas.rect(cx - 7, baseY - 12, 14, 22, bodyC); canvas.rect(cx - 5, baseY - 14, 10, 3, bodyC);
      canvas.rect(cx - 5, baseY - 13, 5, 8, lightC);
      canvas.rect(cx - 5, baseY + 10, 4, 4, darkC); canvas.rect(cx + 2, baseY + 10, 4, 4, darkC);
      break;
    case 'blob':
      canvas.circle(cx, baseY + 2, 11, bodyC); canvas.circle(cx - 4, baseY - 2, 6, bodyC); canvas.circle(cx + 4, baseY - 2, 6, bodyC);
      canvas.circle(cx - 2, baseY, 4, lightC);
      canvas.rect(cx - 6, baseY + 11, 4, 2, darkC); canvas.rect(cx + 2, baseY + 11, 4, 2, darkC);
      break;
    case 'chonk':
      canvas.circle(cx, baseY, 13, bodyC); canvas.circle(cx - 3, baseY - 3, 6, lightC);
      canvas.rect(cx - 8, baseY + 11, 5, 3, darkC); canvas.rect(cx + 3, baseY + 11, 5, 3, darkC);
      break;
    case 'slim':
      canvas.rect(cx - 5, baseY - 14, 10, 26, bodyC); canvas.rect(cx - 3, baseY - 12, 4, 10, lightC);
      canvas.rect(cx - 4, baseY + 12, 3, 3, darkC); canvas.rect(cx + 1, baseY + 12, 3, 3, darkC);
      break;
    case 'cube':
      canvas.rect(cx - 9, baseY - 9, 18, 18, bodyC); canvas.rect(cx - 7, baseY - 7, 6, 6, lightC);
      canvas.rect(cx - 7, baseY + 9, 5, 3, darkC); canvas.rect(cx + 3, baseY + 9, 5, 3, darkC);
      break;
    case 'horned':
      canvas.circle(cx, baseY, 10, bodyC); canvas.circle(cx - 2, baseY - 2, 5, lightC);
      canvas.line(cx - 7, baseY - 8, cx - 10, baseY - 16, darkC); canvas.line(cx - 6, baseY - 8, cx - 9, baseY - 16, darkC);
      canvas.line(cx + 7, baseY - 8, cx + 10, baseY - 16, darkC); canvas.line(cx + 6, baseY - 8, cx + 9, baseY - 16, darkC);
      canvas.rect(cx - 6, baseY + 9, 4, 3, darkC); canvas.rect(cx + 2, baseY + 9, 4, 3, darkC);
      break;
    case 'ghost':
      canvas.circle(cx, baseY - 4, 10, bodyC); canvas.rect(cx - 10, baseY - 4, 20, 14, bodyC);
      canvas.circle(cx - 2, baseY - 6, 5, lightC);
      for (let i = 0; i < 5; i++) canvas.set(cx - 8 + i * 4, baseY + 10, palObj.add(pal.bg));
      break;
    case 'spike':
      canvas.circle(cx, baseY, 10, bodyC); canvas.circle(cx - 2, baseY - 2, 5, lightC);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, r = 13;
        canvas.set(cx + Math.round(Math.cos(a) * r), baseY + Math.round(Math.sin(a) * r), darkC);
        canvas.set(cx + Math.round(Math.cos(a) * (r - 1)), baseY + Math.round(Math.sin(a) * (r - 1)), darkC);
      }
      canvas.rect(cx - 6, baseY + 9, 4, 3, darkC); canvas.rect(cx + 2, baseY + 9, 4, 3, darkC);
      break;
    case 'winged':
      canvas.circle(cx, baseY, 9, bodyC); canvas.circle(cx - 2, baseY - 2, 4, lightC);
      for (let i = 0; i < 6; i++) {
        canvas.set(cx - 10 - i, baseY - 4 + Math.abs(i - 3), lightC); canvas.set(cx - 11 - i, baseY - 4 + Math.abs(i - 3), lightC);
        canvas.set(cx + 10 + i, baseY - 4 + Math.abs(i - 3), lightC); canvas.set(cx + 11 + i, baseY - 4 + Math.abs(i - 3), lightC);
      }
      canvas.rect(cx - 5, baseY + 8, 3, 3, darkC); canvas.rect(cx + 2, baseY + 8, 3, 3, darkC);
      break;
    case 'tiny':
      canvas.circle(cx, baseY + 4, 6, bodyC); canvas.circle(cx - 1, baseY + 3, 3, lightC);
      canvas.rect(cx - 4, baseY + 9, 3, 2, darkC); canvas.rect(cx + 1, baseY + 9, 3, 2, darkC);
      break;
    case 'titan':
      canvas.circle(cx, baseY - 2, 14, bodyC); canvas.rect(cx - 14, baseY - 2, 28, 16, bodyC);
      canvas.circle(cx - 4, baseY - 5, 6, lightC);
      canvas.rect(cx - 10, baseY + 13, 6, 4, darkC); canvas.rect(cx + 4, baseY + 13, 6, 4, darkC);
      break;
    case 'crowned':
      canvas.circle(cx, baseY, 11, bodyC); canvas.circle(cx - 2, baseY - 2, 5, lightC);
      { const crIdx = palObj.add(pal.highlight);
        for (let i = -4; i <= 4; i += 2) canvas.set(cx + i, baseY - 12, crIdx);
        canvas.set(cx - 4, baseY - 13, crIdx); canvas.set(cx, baseY - 14, crIdx); canvas.set(cx + 4, baseY - 13, crIdx); }
      canvas.rect(cx - 6, baseY + 10, 4, 3, darkC); canvas.rect(cx + 2, baseY + 10, 4, 3, darkC);
      break;
    case 'multi':
      canvas.circle(cx - 5, baseY + 2, 8, bodyC); canvas.circle(cx + 5, baseY + 2, 8, bodyC);
      canvas.circle(cx - 6, baseY, 4, lightC); canvas.circle(cx + 4, baseY, 4, lightC);
      canvas.rect(cx - 9, baseY + 9, 3, 3, darkC); canvas.rect(cx + 6, baseY + 9, 3, 3, darkC);
      break;
    // â”€â”€ Expansion bodies â”€â”€
    case 'diamond_body': {
      // Diamond/rhombus shaped body
      for (let dy = -10; dy <= 10; dy++) {
        const halfW = 10 - Math.abs(dy);
        for (let dx = -halfW; dx <= halfW; dx++) canvas.set(cx + dx, baseY + dy, bodyC);
      }
      for (let dy = -5; dy <= 3; dy++) {
        const halfW2 = 5 - Math.abs(dy);
        for (let dx = -halfW2; dx <= halfW2; dx++) canvas.set(cx + dx - 1, baseY + dy - 2, lightC);
      }
      canvas.rect(cx - 4, baseY + 10, 3, 3, darkC); canvas.rect(cx + 1, baseY + 10, 3, 3, darkC);
      break;
    }
    case 'serpent': {
      // Long snake-like body with coils
      canvas.circle(cx, baseY - 6, 7, bodyC); canvas.circle(cx - 1, baseY - 8, 3, lightC);
      canvas.rect(cx - 4, baseY + 1, 8, 4, bodyC);
      // Tail coils
      for (let i = 0; i < 3; i++) {
        const sx = cx + Math.round(Math.sin(i * 1.5) * 5);
        canvas.circle(sx, baseY + 5 + i * 3, 3, i % 2 === 0 ? bodyC : darkC);
      }
      break;
    }
    case 'jelly': {
      // Jellyfish dome + tentacles
      canvas.circle(cx, baseY - 4, 9, bodyC);
      canvas.circle(cx - 2, baseY - 6, 4, lightC);
      // Tentacles
      for (let i = -3; i <= 3; i++) {
        const tx = cx + i * 3;
        for (let dy = 0; dy < 8; dy++) {
          const sway = Math.round(Math.sin(dy * 0.6 + i) * 1.5);
          canvas.set(tx + sway, baseY + 5 + dy, dy % 2 === 0 ? bodyC : lightC);
        }
      }
      break;
    }
    case 'skull_body': {
      // Skull-shaped body
      canvas.circle(cx, baseY - 2, 11, bodyC);
      canvas.rect(cx - 6, baseY + 6, 12, 6, bodyC);
      canvas.circle(cx - 1, baseY - 4, 4, lightC);
      // Jaw
      canvas.rect(cx - 5, baseY + 8, 10, 4, darkC);
      // Teeth
      for (let i = 0; i < 4; i++) canvas.set(cx - 3 + i * 2, baseY + 8, lightC);
      break;
    }
    // — Pro Expansion bodies —
    case 'pear': {
      // Pear-shaped: narrow top, wide bottom
      canvas.circle(cx, baseY - 4, 6, bodyC);
      canvas.circle(cx, baseY + 4, 9, bodyC);
      canvas.circle(cx - 1, baseY - 5, 3, lightC);
      canvas.rect(cx - 5, baseY + 11, 4, 3, darkC); canvas.rect(cx + 1, baseY + 11, 4, 3, darkC);
      break;
    }
    case 'star_body': {
      // 5-pointed star body
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const tipX = cx + Math.round(Math.cos(a) * 12);
        const tipY = baseY + Math.round(Math.sin(a) * 12);
        canvas.line(cx, baseY, tipX, tipY, bodyC);
        canvas.line(cx + (tipX > cx ? -1 : 1), baseY, tipX + (tipX > cx ? -1 : 1), tipY, bodyC);
      }
      canvas.circle(cx, baseY, 5, bodyC);
      canvas.circle(cx - 1, baseY - 1, 2, lightC);
      canvas.rect(cx - 4, baseY + 10, 3, 3, darkC); canvas.rect(cx + 1, baseY + 10, 3, 3, darkC);
      break;
    }
    case 'mushroom_body': {
      // Mushroom: dome cap + stem
      canvas.circle(cx, baseY - 4, 11, bodyC);           // cap dome
      canvas.circle(cx - 3, baseY - 7, 4, lightC);       // cap highlight
      canvas.rect(cx - 4, baseY + 2, 8, 10, darkC);      // stem
      canvas.rect(cx - 3, baseY + 3, 4, 4, lightC);      // stem highlight
      canvas.rect(cx - 5, baseY + 11, 4, 3, darkC); canvas.rect(cx + 1, baseY + 11, 4, 3, darkC);
      break;
    }

  }
}

function drawEyes(canvas: Canvas, eyeDef: TraitDef, pal: ColorPalDef, palObj: PalBuilder, bounceY: number, frame: number, total: number) {
  const cx = 24, baseY = 28 + bounceY;
  const black = palObj.add(0), white = palObj.add('#ffffff'), hlIdx = palObj.add(pal.highlight);
  const blink = (frame % total) >= total - 3;
  if (blink && eyeDef.id !== 'void' && eyeDef.id !== 'rainbow') {
    canvas.line(cx - 5, baseY, cx - 2, baseY, black); canvas.line(cx + 2, baseY, cx + 5, baseY, black);
    return;
  }
  switch (eyeDef.id) {
    case 'dots':
      canvas.set(cx - 4, baseY, black); canvas.set(cx + 4, baseY, black); break;
    case 'wide':
      canvas.rect(cx - 5, baseY - 1, 3, 3, white); canvas.rect(cx + 3, baseY - 1, 3, 3, white);
      canvas.set(cx - 4, baseY, black); canvas.set(cx + 4, baseY, black); break;
    case 'happy':
      canvas.set(cx - 4, baseY - 1, black); canvas.set(cx - 5, baseY, black); canvas.set(cx - 3, baseY, black);
      canvas.set(cx + 4, baseY - 1, black); canvas.set(cx + 3, baseY, black); canvas.set(cx + 5, baseY, black); break;
    case 'pixel':
      canvas.rect(cx - 5, baseY - 1, 2, 2, black); canvas.rect(cx + 3, baseY - 1, 2, 2, black); break;
    case 'angry':
      canvas.rect(cx - 5, baseY - 1, 3, 3, white); canvas.rect(cx + 3, baseY - 1, 3, 3, white);
      canvas.set(cx - 4, baseY, black); canvas.set(cx + 4, baseY, black);
      canvas.line(cx - 6, baseY - 3, cx - 3, baseY - 2, black); canvas.line(cx + 3, baseY - 2, cx + 6, baseY - 3, black); break;
    case 'sleepy':
      canvas.line(cx - 5, baseY, cx - 3, baseY, black); canvas.line(cx + 3, baseY, cx + 5, baseY, black);
      canvas.set(cx + 8, baseY - 4, white); canvas.set(cx + 9, baseY - 5, white); break;
    case 'cross':
      for (const ox of [-4, 4]) {
        canvas.set(cx + ox - 1, baseY - 1, black); canvas.set(cx + ox + 1, baseY - 1, black);
        canvas.set(cx + ox, baseY, black);
        canvas.set(cx + ox - 1, baseY + 1, black); canvas.set(cx + ox + 1, baseY + 1, black);
      } break;
    case 'star':
      for (const ox of [-4, 4]) {
        const ex = cx + ox;
        canvas.set(ex, baseY - 2, hlIdx); canvas.set(ex, baseY + 2, hlIdx);
        canvas.set(ex - 2, baseY, hlIdx); canvas.set(ex + 2, baseY, hlIdx);
        canvas.set(ex - 1, baseY - 1, hlIdx); canvas.set(ex + 1, baseY - 1, hlIdx);
        canvas.set(ex - 1, baseY + 1, hlIdx); canvas.set(ex + 1, baseY + 1, hlIdx);
        canvas.set(ex, baseY, black);
      } break;
    case 'heart':
      for (const ox of [-4, 4]) {
        const ex = cx + ox; const hc = palObj.add('#ff4060');
        canvas.set(ex - 1, baseY - 1, hc); canvas.set(ex + 1, baseY - 1, hc);
        canvas.set(ex - 2, baseY, hc); canvas.set(ex, baseY, hc); canvas.set(ex + 2, baseY, hc);
        canvas.set(ex - 1, baseY + 1, hc); canvas.set(ex + 1, baseY + 1, hc); canvas.set(ex, baseY + 2, hc);
      } break;
    case 'diamond':
      for (const ox of [-4, 4]) {
        const ex = cx + ox;
        canvas.set(ex, baseY - 2, hlIdx); canvas.set(ex - 1, baseY - 1, hlIdx); canvas.set(ex + 1, baseY - 1, hlIdx);
        canvas.set(ex - 2, baseY, hlIdx); canvas.set(ex + 2, baseY, hlIdx); canvas.set(ex, baseY, black);
        canvas.set(ex - 1, baseY + 1, hlIdx); canvas.set(ex + 1, baseY + 1, hlIdx); canvas.set(ex, baseY + 2, hlIdx);
      } break;
    case 'spiral': {
      const sc = palObj.add(pal.highlight);
      for (const ox of [-4, 4]) {
        canvas.set(cx + ox, baseY - 1, sc); canvas.set(cx + ox + 1, baseY, sc);
        canvas.set(cx + ox, baseY + 1, sc); canvas.set(cx + ox - 1, baseY, sc); canvas.set(cx + ox, baseY, black);
      } break;
    }
    case 'laser': {
      const lc = palObj.add('#ff2020');
      canvas.rect(cx - 5, baseY - 1, 3, 3, lc); canvas.rect(cx + 3, baseY - 1, 3, 3, lc);
      canvas.set(cx - 4, baseY, white); canvas.set(cx + 4, baseY, white);
      if (frame % 4 < 2) for (let i = 1; i < 8; i++) { canvas.set(cx - 4, baseY + 3 + i, lc); canvas.set(cx + 4, baseY + 3 + i, lc); }
      break;
    }
    case 'flame': {
      const fc = palObj.add('#ff6020');
      canvas.rect(cx - 5, baseY - 1, 3, 3, fc); canvas.rect(cx + 3, baseY - 1, 3, 3, fc);
      canvas.set(cx - 4, baseY, white); canvas.set(cx + 4, baseY, white);
      if (frame % 3 === 0) { canvas.set(cx - 4, baseY - 3, fc); canvas.set(cx + 4, baseY - 3, fc); }
      break;
    }
    case 'moon': {
      const mc = palObj.add('#ffe080');
      for (const ox of [-4, 4]) {
        canvas.circle(cx + ox, baseY, 2, mc);
        canvas.circle(cx + ox + 1, baseY, 1, palObj.add(pal.bg));
      } break;
    }
    case 'void': {
      const vc = palObj.add('#4020a0');
      canvas.rect(cx - 6, baseY - 2, 4, 4, vc); canvas.rect(cx + 2, baseY - 2, 4, 4, vc);
      canvas.set(cx - 4, baseY, white); canvas.set(cx + 4, baseY, white); break;
    }
    case 'rainbow': {
      const rc = [palObj.add('#ff0000'), palObj.add('#ff8000'), palObj.add('#ffff00'),
                  palObj.add('#00ff00'), palObj.add('#0080ff'), palObj.add('#8000ff')];
      const offset = frame % rc.length;
      canvas.rect(cx - 5, baseY - 1, 3, 3, rc[offset % rc.length]);
      canvas.rect(cx + 3, baseY - 1, 3, 3, rc[(offset + 3) % rc.length]);
      canvas.set(cx - 4, baseY, black); canvas.set(cx + 4, baseY, black); break;
    }
    // â”€â”€ Expansion eyes â”€â”€
    case 'stoned': {
      // Half-lidded red bloodshot eyes
      const redC = palObj.add('#cc2020'), pinkC = palObj.add('#ff6060');
      canvas.rect(cx - 5, baseY - 1, 3, 2, white); canvas.rect(cx + 3, baseY - 1, 3, 2, white);
      canvas.set(cx - 4, baseY, black); canvas.set(cx + 4, baseY, black);
      // Heavy lids covering top half
      canvas.line(cx - 5, baseY - 1, cx - 3, baseY - 1, palObj.add(pal.body));
      canvas.line(cx + 3, baseY - 1, cx + 5, baseY - 1, palObj.add(pal.body));
      // Bloodshot veins
      canvas.set(cx - 5, baseY, redC); canvas.set(cx + 5, baseY, redC);
      canvas.set(cx - 3, baseY - 1, pinkC); canvas.set(cx + 3, baseY - 1, pinkC);
      break;
    }
    case 'crying': {
      // Sad eyes with tears
      canvas.rect(cx - 5, baseY - 1, 3, 3, white); canvas.rect(cx + 3, baseY - 1, 3, 3, white);
      canvas.set(cx - 4, baseY, black); canvas.set(cx + 4, baseY, black);
      // Sad eyebrows
      canvas.line(cx - 5, baseY - 2, cx - 3, baseY - 3, black); canvas.line(cx + 3, baseY - 3, cx + 5, baseY - 2, black);
      // Tear drops
      const tearC = palObj.add('#60a0ff');
      canvas.set(cx - 4, baseY + 2, tearC); canvas.set(cx - 4, baseY + 3, tearC);
      canvas.set(cx + 4, baseY + 2, tearC);
      if (frame % 4 < 2) canvas.set(cx + 4, baseY + 4, tearC);
      break;
    }
    case 'wink': {
      // One open eye, one closed
      canvas.rect(cx - 5, baseY - 1, 3, 3, white); canvas.set(cx - 4, baseY, black);
      // Closed wink eye
      canvas.line(cx + 3, baseY, cx + 5, baseY, black);
      canvas.set(cx + 5, baseY - 1, black); // wink uptick
      break;
    }
    case 'suspicious': {
      // One eyebrow raised, squinting
      canvas.rect(cx - 5, baseY, 3, 2, white); canvas.rect(cx + 3, baseY - 1, 3, 3, white);
      canvas.set(cx - 4, baseY, black); canvas.set(cx + 4, baseY, black);
      // Raised eyebrow right, flat eyebrow left
      canvas.line(cx - 5, baseY - 2, cx - 3, baseY - 2, black);
      canvas.line(cx + 3, baseY - 3, cx + 5, baseY - 4, black);
      break;
    }
    case 'hypno': {
      // Concentric animated rings
      const hColors = [palObj.add('#ff00ff'), palObj.add('#00ffff'), white, black];
      for (const ox of [-4, 4]) {
        const phase = (frame + (ox > 0 ? 2 : 0)) % 4;
        canvas.set(cx + ox, baseY, hColors[phase]);
        canvas.set(cx + ox - 1, baseY, hColors[(phase + 1) % 4]);
        canvas.set(cx + ox + 1, baseY, hColors[(phase + 1) % 4]);
        canvas.set(cx + ox, baseY - 1, hColors[(phase + 2) % 4]);
        canvas.set(cx + ox, baseY + 1, hColors[(phase + 2) % 4]);
      }
      break;
    }
    case 'dollar': {
      // $ signs in eyes
      const gc = palObj.add('#00cc00');
      for (const ox of [-4, 4]) {
        canvas.set(cx + ox, baseY - 2, gc); canvas.set(cx + ox, baseY + 2, gc);
        canvas.set(cx + ox - 1, baseY - 1, gc); canvas.set(cx + ox + 1, baseY - 1, gc);
        canvas.set(cx + ox, baseY, gc);
        canvas.set(cx + ox - 1, baseY + 1, gc); canvas.set(cx + ox + 1, baseY + 1, gc);
      }
      break;
    }
    case 'skull_eyes': {
      // Tiny skull shapes in eye sockets
      const sBlack = palObj.add('#101010');
      for (const ox of [-4, 4]) {
        canvas.rect(cx + ox - 1, baseY - 1, 3, 3, white);
        canvas.set(cx + ox - 1, baseY - 1, sBlack); canvas.set(cx + ox + 1, baseY - 1, sBlack);
        canvas.set(cx + ox, baseY + 1, sBlack);
      }
      break;
    }
    case 'glitch_eyes': {
      // RGB split offset
      const rC = palObj.add('#ff0000'), gC = palObj.add('#00ff00'), bC = palObj.add('#0000ff');
      const shift = frame % 3;
      canvas.rect(cx - 5 - shift, baseY - 1, 3, 3, rC);
      canvas.rect(cx - 5, baseY - 1, 3, 3, gC);
      canvas.rect(cx - 5 + shift, baseY - 1, 3, 3, bC);
      canvas.rect(cx + 3 - shift, baseY - 1, 3, 3, rC);
      canvas.rect(cx + 3, baseY - 1, 3, 3, gC);
      canvas.rect(cx + 3 + shift, baseY - 1, 3, 3, bC);
      canvas.set(cx - 4, baseY, black); canvas.set(cx + 4, baseY, black);
      break;
    }
    case 'cat_eyes': {
      // Vertical slit pupils
      const catYellow = palObj.add('#cccc00');
      canvas.rect(cx - 5, baseY - 1, 3, 3, catYellow); canvas.rect(cx + 3, baseY - 1, 3, 3, catYellow);
      canvas.set(cx - 4, baseY - 1, black); canvas.set(cx - 4, baseY, black); canvas.set(cx - 4, baseY + 1, black);
      canvas.set(cx + 4, baseY - 1, black); canvas.set(cx + 4, baseY, black); canvas.set(cx + 4, baseY + 1, black);
      break;
    }
    case 'cyclops': {
      // Single big centered eye
      canvas.rect(cx - 2, baseY - 2, 5, 5, white);
      canvas.rect(cx - 1, baseY - 1, 3, 3, palObj.add('#4040c0'));
      canvas.set(cx, baseY, black);
      canvas.set(cx + 1, baseY - 1, palObj.add('#ffffff'));
      break;
    }
  }
}

function drawMouth(canvas: Canvas, mouthDef: TraitDef, pal: ColorPalDef, palObj: PalBuilder, bounceY: number, frame: number, total: number) {
  const cx = 24, baseY = 33 + bounceY, black = palObj.add(0);
  switch (mouthDef.id) {
    case 'smile':
      canvas.set(cx - 2, baseY, black); canvas.set(cx - 1, baseY + 1, black);
      canvas.set(cx, baseY + 1, black); canvas.set(cx + 1, baseY + 1, black); canvas.set(cx + 2, baseY, black); break;
    case 'grin':
      canvas.line(cx - 3, baseY, cx + 3, baseY, black);
      canvas.set(cx - 3, baseY - 1, black); canvas.set(cx + 3, baseY - 1, black); break;
    case 'open':
      canvas.rect(cx - 2, baseY, 4, 3, black);
      canvas.set(cx - 1, baseY, palObj.add('#ff4040')); canvas.set(cx, baseY, palObj.add('#ff4040')); break;
    case 'flat':
      canvas.line(cx - 2, baseY, cx + 2, baseY, black); break;
    case 'fangs':
      canvas.line(cx - 2, baseY, cx + 2, baseY, black);
      canvas.set(cx - 2, baseY + 1, palObj.add('#ffffff')); canvas.set(cx + 2, baseY + 1, palObj.add('#ffffff')); break;
    case 'tongue':
      canvas.line(cx - 2, baseY, cx + 2, baseY, black);
      canvas.set(cx, baseY + 1, palObj.add('#ff6080')); canvas.set(cx, baseY + 2, palObj.add('#ff6080')); break;
    case 'whistle': {
      const wc = palObj.add('#ff4040');
      canvas.circle(cx, baseY + 1, 1, black); canvas.set(cx, baseY + 1, wc); break;
    }
    case 'blep':
      canvas.set(cx - 1, baseY, black); canvas.set(cx + 1, baseY, black);
      canvas.set(cx, baseY + 1, palObj.add('#ff6080')); break;
    case 'vampire':
      canvas.line(cx - 2, baseY, cx + 2, baseY, black);
      canvas.set(cx - 1, baseY + 1, palObj.add('#ffffff')); canvas.set(cx + 1, baseY + 1, palObj.add('#ffffff'));
      canvas.set(cx - 1, baseY + 2, palObj.add('#ffffff')); canvas.set(cx + 1, baseY + 2, palObj.add('#ffffff')); break;
    case 'zigzag':
      canvas.set(cx - 2, baseY, black); canvas.set(cx - 1, baseY + 1, black);
      canvas.set(cx, baseY, black); canvas.set(cx + 1, baseY + 1, black); canvas.set(cx + 2, baseY, black); break;
    case 'fire': {
      canvas.rect(cx - 2, baseY, 4, 2, black);
      const fc = palObj.add('#ff8030');
      for (let i = 0; i < 4; i++) canvas.set(cx - 1 + (i % 2), baseY + 2 + Math.floor(i / 2), fc);
      break;
    }
    case 'none': break;
    // â”€â”€ Expansion mouths â”€â”€
    case 'joint': {
      // Smoking joint
      canvas.line(cx - 2, baseY, cx + 2, baseY, black);
      const jointC = palObj.add('#c0b080'), emberC = palObj.add('#ff4020'), smokeC = palObj.add('#a0a0a0');
      canvas.line(cx + 2, baseY, cx + 6, baseY - 1, jointC);
      canvas.set(cx + 6, baseY - 1, emberC);
      if (frame % 3 === 0) canvas.set(cx + 7, baseY - 2, emberC);
      // Rising smoke
      for (let i = 0; i < 3; i++) {
        const sx = cx + 7 + Math.round(Math.sin((frame + i * 3) * 0.5) * 1.5);
        const sy = baseY - 3 - i * 2;
        if (sy >= 0) canvas.set(sx, sy, smokeC);
      }
      break;
    }
    case 'cigarette': {
      const cigC = palObj.add('#e0d8c0'), filterC = palObj.add('#d4a050'), emberC = palObj.add('#ff4020');
      const smokeC = palObj.add('#909090');
      canvas.line(cx - 2, baseY, cx + 1, baseY, black); // lips
      canvas.line(cx + 2, baseY, cx + 6, baseY, cigC);
      canvas.set(cx + 2, baseY, filterC); canvas.set(cx + 3, baseY, filterC);
      canvas.set(cx + 6, baseY, emberC);
      // Smoke
      if (frame % 2 === 0) for (let i = 0; i < 2; i++) {
        const sx = cx + 6 + Math.round(Math.sin((frame + i * 4) * 0.4) * 1);
        canvas.set(sx, baseY - 2 - i * 2, smokeC);
      }
      break;
    }
    case 'drool': {
      canvas.line(cx - 2, baseY, cx + 2, baseY, black);
      canvas.set(cx - 1, baseY + 1, black); canvas.set(cx + 1, baseY + 1, black);
      const droolC = palObj.add('#80c0ff');
      canvas.set(cx + 1, baseY + 2, droolC);
      if (frame % 4 < 2) canvas.set(cx + 1, baseY + 3, droolC);
      break;
    }
    case 'scream': {
      // Wide open horror mouth
      canvas.rect(cx - 2, baseY - 1, 5, 4, black);
      canvas.set(cx - 1, baseY, palObj.add('#ff2020')); canvas.set(cx + 1, baseY, palObj.add('#ff2020'));
      canvas.set(cx, baseY + 1, palObj.add('#ff2020'));
      break;
    }
    case 'smirk': {
      // Asymmetric evil grin
      canvas.set(cx - 2, baseY + 1, black); canvas.set(cx - 1, baseY, black);
      canvas.set(cx, baseY, black); canvas.set(cx + 1, baseY, black);
      canvas.set(cx + 2, baseY - 1, black);
      break;
    }
    case 'kiss': {
      const kissC = palObj.add('#ff4080');
      canvas.set(cx - 1, baseY, kissC); canvas.set(cx + 1, baseY, kissC);
      canvas.set(cx, baseY + 1, kissC); canvas.set(cx, baseY - 1, kissC);
      break;
    }
    case 'gas_mask': {
      const maskC = palObj.add('#404040'), filterMC = palObj.add('#606060');
      canvas.rect(cx - 3, baseY - 1, 6, 4, maskC);
      canvas.rect(cx - 4, baseY, 2, 3, filterMC); canvas.rect(cx + 3, baseY, 2, 3, filterMC);
      canvas.set(cx - 1, baseY, palObj.add('#303030')); canvas.set(cx + 1, baseY, palObj.add('#303030'));
      break;
    }
    case 'gold_grill': {
      const grillC = palObj.add('#ffd700'), teethC = palObj.add('#ffffff');
      canvas.line(cx - 3, baseY, cx + 3, baseY, black);
      canvas.set(cx - 3, baseY + 1, grillC); canvas.set(cx - 2, baseY + 1, teethC);
      canvas.set(cx - 1, baseY + 1, grillC); canvas.set(cx, baseY + 1, teethC);
      canvas.set(cx + 1, baseY + 1, grillC); canvas.set(cx + 2, baseY + 1, teethC);
      canvas.set(cx + 3, baseY + 1, grillC);
      break;
    }
    // — Pro Expansion mouths —
    case 'void_maw': {
      // Mythic: swirling void portal mouth
      const voidC = palObj.add('#4020a0'), voidHL = palObj.add('#8040ff'), voidD = palObj.add('#200840');
      canvas.rect(cx - 3, baseY - 1, 6, 4, voidD);
      canvas.set(cx - 2, baseY, voidC); canvas.set(cx + 2, baseY, voidC);
      canvas.set(cx - 1, baseY + 1, voidHL); canvas.set(cx + 1, baseY + 1, voidHL);
      canvas.set(cx, baseY, palObj.add('#c080ff'));
      if (frame % 4 < 2) { canvas.set(cx - 2, baseY + 2, voidHL); canvas.set(cx + 2, baseY - 1, voidHL); }
      break;
    }
    case 'smoke_breath': {
      const smokeC = palObj.add('#909090'), darkSmoke = palObj.add('#606060');
      canvas.line(cx - 2, baseY, cx + 2, baseY, black);
      for (let i = 0; i < 3; i++) {
        const sx = cx + 3 + Math.round(Math.sin((frame + i * 4) * 0.5) * 1.5);
        const sy = baseY - 1 - i * 2;
        if (sy >= 0) canvas.set(sx, sy, i === 0 ? darkSmoke : smokeC);
      }
      break;
    }
    case 'plasma_mouth': {
      const plC = palObj.add('#ff40d0'), plHL = palObj.add('#ff80e0');
      canvas.rect(cx - 2, baseY, 4, 2, black);
      canvas.set(cx - 1, baseY, plC); canvas.set(cx, baseY, plHL); canvas.set(cx + 1, baseY, plC);
      if (frame % 3 === 0) canvas.set(cx, baseY + 1, plHL);
      break;
    }
    case 'diamond_grill': {
      const diaC = palObj.add('#80e0ff'), teethC = palObj.add('#ffffff');
      canvas.line(cx - 3, baseY, cx + 3, baseY, black);
      canvas.set(cx - 3, baseY + 1, diaC); canvas.set(cx - 2, baseY + 1, teethC);
      canvas.set(cx - 1, baseY + 1, diaC); canvas.set(cx, baseY + 1, teethC);
      canvas.set(cx + 1, baseY + 1, diaC); canvas.set(cx + 2, baseY + 1, teethC);
      canvas.set(cx + 3, baseY + 1, diaC);
      break;
    }
    case 'snarl': {
      canvas.set(cx - 3, baseY - 1, black); canvas.set(cx + 3, baseY - 1, black);
      canvas.line(cx - 2, baseY, cx + 2, baseY, black);
      canvas.set(cx - 2, baseY + 1, palObj.add('#ffffff')); canvas.set(cx + 2, baseY + 1, palObj.add('#ffffff'));
      break;
    }
    case 'buck_teeth': {
      canvas.line(cx - 2, baseY, cx + 2, baseY, black);
      canvas.set(cx - 1, baseY + 1, palObj.add('#ffffff')); canvas.set(cx, baseY + 1, palObj.add('#ffffff'));
      canvas.set(cx - 1, baseY + 2, palObj.add('#ffffff')); canvas.set(cx, baseY + 2, palObj.add('#ffffff'));
      break;
    }

  }
}

function drawHeadgear(canvas: Canvas, headDef: TraitDef, pal: ColorPalDef, palObj: PalBuilder, bounceY: number) {
  const cx = 24, topY = 17 + bounceY;
  const darkC = palObj.add(pal.dark), lightC = palObj.add(pal.light), hlC = palObj.add(pal.highlight), black = palObj.add(0);
  switch (headDef.id) {
    case 'none': break;
    case 'bow': {
      const bc = palObj.add('#ff4080');
      canvas.set(cx, topY, bc); canvas.set(cx - 1, topY - 1, bc); canvas.set(cx + 1, topY - 1, bc);
      canvas.set(cx - 2, topY, bc); canvas.set(cx + 2, topY, bc); break;
    }
    case 'cap':
      canvas.rect(cx - 7, topY, 14, 4, darkC); canvas.rect(cx - 5, topY - 2, 10, 3, darkC);
      canvas.rect(cx + 5, topY + 2, 5, 2, darkC); break;
    case 'tophat':
      canvas.rect(cx - 5, topY - 6, 10, 7, black); canvas.rect(cx - 7, topY, 14, 2, black);
      canvas.rect(cx - 4, topY - 4, 8, 1, darkC); break;
    case 'mohawk': {
      const mc = palObj.add(pal.highlight);
      for (let i = 0; i < 7; i++) canvas.set(cx, topY - i - 1, mc);
      for (let i = 0; i < 5; i++) canvas.set(cx - 1, topY - i - 2, mc);
      for (let i = 0; i < 3; i++) canvas.set(cx + 1, topY - i - 2, mc);
      break;
    }
    case 'antenna': {
      const ac = palObj.add(pal.highlight);
      canvas.line(cx, topY, cx, topY - 8, darkC);
      canvas.circle(cx, topY - 9, 1, ac); break;
    }
    case 'horns': {
      const hc = palObj.add('#cc2020');
      canvas.line(cx - 6, topY, cx - 9, topY - 6, hc); canvas.line(cx - 5, topY, cx - 8, topY - 6, hc);
      canvas.line(cx + 6, topY, cx + 9, topY - 6, hc); canvas.line(cx + 5, topY, cx + 8, topY - 6, hc); break;
    }
    case 'halo': {
      const gc = palObj.add('#fff080');
      for (let a = 0; a < 12; a++) {
        const angle = (a / 12) * Math.PI * 2;
        canvas.set(cx + Math.round(Math.cos(angle) * 7), topY - 4 + Math.round(Math.sin(angle) * 2), gc);
      } break;
    }
    case 'ears': {
      const ec = palObj.add(pal.light);
      canvas.line(cx - 6, topY, cx - 8, topY - 5, ec); canvas.line(cx - 5, topY, cx - 7, topY - 5, ec);
      canvas.line(cx + 6, topY, cx + 8, topY - 5, ec); canvas.line(cx + 5, topY, cx + 7, topY - 5, ec);
      canvas.set(cx - 7, topY - 3, palObj.add('#ff8090')); canvas.set(cx + 7, topY - 3, palObj.add('#ff8090')); break;
    }
    case 'mushroom': {
      const mc = palObj.add('#dd4040'), ms = palObj.add('#ffffff');
      canvas.rect(cx - 8, topY - 2, 16, 4, mc); canvas.rect(cx - 6, topY - 4, 12, 3, mc);
      canvas.set(cx - 4, topY - 3, ms); canvas.set(cx + 3, topY - 1, ms); canvas.set(cx, topY - 2, ms); break;
    }
    case 'crown': {
      const crC = palObj.add('#ffd700'), gemC = palObj.add('#ff2040');
      canvas.rect(cx - 6, topY - 1, 12, 3, crC);
      canvas.set(cx - 5, topY - 3, crC); canvas.set(cx, topY - 4, crC); canvas.set(cx + 5, topY - 3, crC);
      canvas.set(cx, topY - 3, gemC); break;
    }
    case 'wizard': {
      const wc = palObj.add('#4030a0');
      for (let row = 0; row < 10; row++) {
        const halfW = Math.max(1, Math.round((10 - row) * 0.8));
        canvas.rect(cx - halfW, topY - row, halfW * 2, 1, wc);
      }
      canvas.set(cx, topY - 10, palObj.add('#ffff40')); break;
    }
    case 'mask': {
      const mc = palObj.add('#303030');
      canvas.rect(cx - 8, topY + 2, 16, 4, mc);
      canvas.set(cx - 4, topY + 3, palObj.add('#ffffff')); canvas.set(cx + 4, topY + 3, palObj.add('#ffffff')); break;
    }
    case 'tiara': {
      const tc = palObj.add('#c0a0ff'), gc = palObj.add('#ffd0ff');
      canvas.rect(cx - 5, topY, 10, 2, tc);
      canvas.set(cx - 3, topY - 1, tc); canvas.set(cx, topY - 2, tc); canvas.set(cx + 3, topY - 1, tc);
      canvas.set(cx, topY - 1, gc); break;
    }
    case 'flame': {
      const flC = [palObj.add('#ff4020'), palObj.add('#ff8040'), palObj.add('#ffcc40')];
      for (let i = 0; i < 7; i++) {
        const h = 3 + (i % 3) * 2;
        for (let dy = 0; dy < h; dy++) canvas.set(cx - 3 + i, topY - dy - 1, flC[dy % flC.length]);
      } break;
    }
    case 'glitch': {
      const glC = [palObj.add('#00ff80'), palObj.add('#ff00ff'), palObj.add('#00ffff')];
      for (let row = 0; row < 5; row++)
        for (let col = -5; col <= 5; col++)
          canvas.set(cx + col, topY - row, glC[Math.abs((col + row) % 3)]);
      break;
    }
    // â”€â”€ Expansion headgear â”€â”€
    case 'beanie': {
      const beanC = palObj.add(pal.dark), cuffC = palObj.add(pal.light);
      canvas.rect(cx - 6, topY - 2, 12, 5, beanC);
      canvas.rect(cx - 7, topY + 2, 14, 2, cuffC);
      canvas.set(cx, topY - 3, beanC); // pom pom
      break;
    }
    case 'bucket_hat': {
      const hatC = palObj.add(pal.dark);
      canvas.rect(cx - 5, topY - 2, 10, 4, hatC);
      canvas.rect(cx - 9, topY + 1, 18, 2, hatC);
      break;
    }
    case 'bandana': {
      const banC = palObj.add('#cc2020');
      canvas.rect(cx - 7, topY + 1, 14, 3, banC);
      // Knot tails
      canvas.set(cx + 7, topY + 2, banC); canvas.set(cx + 8, topY + 3, banC);
      canvas.set(cx + 7, topY + 4, banC);
      break;
    }
    case 'headphones': {
      const hpC = palObj.add('#303030'), padC = palObj.add('#404040');
      canvas.rect(cx - 6, topY - 3, 12, 2, hpC); // band
      canvas.rect(cx - 9, topY - 1, 3, 5, padC); // left ear
      canvas.rect(cx + 7, topY - 1, 3, 5, padC); // right ear
      break;
    }
    case 'flower': {
      const petalC = palObj.add('#ff6090'), centerC = palObj.add('#ffcc40'), leafFC = palObj.add('#40a040');
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        canvas.set(cx + Math.round(Math.cos(a) * 3), topY - 3 + Math.round(Math.sin(a) * 2), petalC);
      }
      canvas.set(cx, topY - 3, centerC);
      // Additional flowers
      canvas.set(cx - 5, topY - 1, petalC); canvas.set(cx + 5, topY - 1, petalC);
      canvas.set(cx - 5, topY, leafFC);
      break;
    }
    case 'snapback': {
      const capC = palObj.add(pal.dark);
      canvas.rect(cx - 6, topY, 12, 4, capC);
      canvas.rect(cx - 8, topY + 3, 5, 2, capC); // brim facing left (backwards)
      break;
    }
    case 'leaf': {
      const leafC2 = palObj.add('#30a030'), stemC = palObj.add('#208020');
      // Big weed-style leaf
      canvas.set(cx, topY - 6, leafC2);
      canvas.set(cx - 1, topY - 5, leafC2); canvas.set(cx + 1, topY - 5, leafC2);
      canvas.set(cx - 3, topY - 4, leafC2); canvas.set(cx + 3, topY - 4, leafC2);
      canvas.set(cx - 2, topY - 3, leafC2); canvas.set(cx + 2, topY - 3, leafC2);
      canvas.set(cx - 4, topY - 2, leafC2); canvas.set(cx + 4, topY - 2, leafC2);
      canvas.set(cx, topY - 4, stemC); canvas.set(cx, topY - 3, stemC);
      canvas.set(cx, topY - 2, stemC); canvas.set(cx, topY - 1, stemC);
      break;
    }
    case 'afro': {
      const afroC = palObj.add(pal.dark);
      canvas.circle(cx, topY - 4, 8, afroC);
      canvas.circle(cx - 2, topY - 6, 4, palObj.add(pal.body));
      break;
    }
    case 'viking': {
      const helmC = palObj.add('#808080'), hornVC = palObj.add('#e0d0a0');
      canvas.rect(cx - 6, topY - 1, 12, 4, helmC);
      canvas.rect(cx - 4, topY - 3, 8, 3, helmC);
      // Horns curving up
      canvas.line(cx - 7, topY, cx - 10, topY - 5, hornVC);
      canvas.line(cx - 10, topY - 5, cx - 9, topY - 7, hornVC);
      canvas.line(cx + 7, topY, cx + 10, topY - 5, hornVC);
      canvas.line(cx + 10, topY - 5, cx + 9, topY - 7, hornVC);
      break;
    }
    case 'astronaut': {
      const glassC = palObj.add('#80c0e0'), frameC = palObj.add('#c0c0c0');
      canvas.circle(cx, topY + 1, 9, frameC);
      canvas.circle(cx, topY + 1, 7, glassC);
      canvas.set(cx - 3, topY - 2, palObj.add('#ffffff')); // visor reflection
      canvas.set(cx - 2, topY - 3, palObj.add('#ffffff'));
      break;
    }
  }
}

function drawHeldItem(canvas: Canvas, itemDef: TraitDef, pal: ColorPalDef, palObj: PalBuilder, bounceY: number, frame: number) {
  const right = 36, baseY = 32 + bounceY;
  const hlC = palObj.add(pal.highlight);
  switch (itemDef.id) {
    case 'none': break;
    case 'sword': {
      const sc = palObj.add('#c0c0c0'), sd = palObj.add('#a0a0a0');
      canvas.line(right, baseY, right, baseY - 10, sc); canvas.line(right - 1, baseY, right - 1, baseY - 10, sd);
      canvas.rect(right - 2, baseY - 2, 5, 2, palObj.add('#8b6914'));
      canvas.set(right, baseY - 10, palObj.add('#ffffff')); break;
    }
    case 'staff':
      canvas.line(right, baseY + 3, right, baseY - 10, palObj.add('#8b5e3c'));
      canvas.circle(right, baseY - 12, 2, palObj.add('#a040ff'));
      canvas.set(right, baseY - 12, hlC); break;
    case 'wand':
      canvas.line(right, baseY + 2, right, baseY - 6, palObj.add('#d0a060'));
      canvas.set(right, baseY - 7, palObj.add('#ffff40'));
      canvas.set(right - 1, baseY - 7, palObj.add('#ffff40')); canvas.set(right + 1, baseY - 7, palObj.add('#ffff40')); break;
    case 'shield': {
      const shc = palObj.add('#4080c0');
      canvas.rect(right - 1, baseY - 4, 5, 8, shc); canvas.rect(right, baseY - 5, 3, 1, shc);
      canvas.rect(right, baseY + 4, 3, 1, shc); canvas.set(right + 1, baseY, palObj.add('#ffd700')); break;
    }
    case 'orb':
      canvas.circle(right + 1, baseY - 4, 3, palObj.add('#ff6020'));
      canvas.set(right, baseY - 5, hlC);
      canvas.line(right, baseY - 1, right, baseY + 2, palObj.add(pal.dark)); break;
    case 'axe': {
      const ah = palObj.add('#8b5e3c'), ab = palObj.add('#a0a0a0');
      canvas.line(right, baseY + 3, right, baseY - 8, ah);
      canvas.rect(right - 3, baseY - 8, 3, 5, ab); canvas.set(right - 3, baseY - 9, ab); break;
    }
    case 'lantern': {
      const lf = palObj.add('#ffcc40'), lg = palObj.add('#a0a0a0');
      canvas.line(right, baseY + 2, right, baseY - 3, lg);
      canvas.rect(right - 1, baseY - 6, 3, 4, lf); canvas.rect(right - 2, baseY - 7, 5, 1, lg); canvas.rect(right - 2, baseY - 2, 5, 1, lg); break;
    }
    case 'book': {
      const bc = palObj.add('#8040a0'), bp = palObj.add('#f0e0d0');
      canvas.rect(right - 1, baseY - 3, 5, 6, bc); canvas.rect(right, baseY - 2, 3, 4, bp); break;
    }
    case 'scythe': {
      const sh = palObj.add('#606060'), sb = palObj.add('#c0c0c0'), sbd = palObj.add('#a0a0a0');
      canvas.line(right, baseY + 3, right, baseY - 10, sh);
      canvas.line(right, baseY - 10, right - 5, baseY - 7, sb);
      canvas.line(right, baseY - 9, right - 4, baseY - 7, sbd); break;
    }
    case 'flag': {
      const fp = palObj.add('#8b5e3c'), ff = palObj.add(pal.highlight);
      canvas.line(right, baseY + 3, right, baseY - 10, fp);
      canvas.rect(right + 1, baseY - 10, 5, 4, ff); canvas.rect(right + 1, baseY - 9, 4, 2, palObj.add(pal.body)); break;
    }
    case 'trident': {
      const tc = palObj.add('#ffd700');
      canvas.line(right, baseY + 3, right, baseY - 13, tc);
      canvas.line(right - 2, baseY - 9, right - 2, baseY - 12, tc);
      canvas.line(right + 2, baseY - 9, right + 2, baseY - 12, tc);
      canvas.line(right - 2, baseY - 9, right + 2, baseY - 9, tc); break;
    }
    // â”€â”€ Expansion held items â”€â”€
    case 'bong': {
      const glassC = palObj.add('#80c0e0'), waterC = palObj.add('#4080c0'), bubbleC = palObj.add('#a0e0ff');
      const smokeC = palObj.add('#a0a0a0');
      canvas.rect(right - 1, baseY - 2, 3, 8, glassC); // base
      canvas.rect(right - 2, baseY + 5, 5, 2, glassC); // bottom
      canvas.rect(right - 1, baseY + 1, 3, 3, waterC); // water
      canvas.line(right + 2, baseY - 2, right + 5, baseY - 5, glassC); // stem
      canvas.set(right + 5, baseY - 5, palObj.add('#40a040')); // bowl
      // Bubbles
      if (frame % 3 === 0) canvas.set(right, baseY, bubbleC);
      if (frame % 5 === 0) canvas.set(right + 1, baseY - 1, bubbleC);
      // Smoke
      for (let i = 0; i < 2; i++) {
        const sx = right + Math.round(Math.sin((frame + i * 3) * 0.5) * 1);
        if (baseY - 4 - i * 2 >= 0) canvas.set(sx, baseY - 4 - i * 2, smokeC);
      }
      break;
    }
    case 'pizza': {
      const crustC = palObj.add('#d4a040'), cheeseC = palObj.add('#ffcc40'), pepC = palObj.add('#cc2020');
      // Triangle slice
      canvas.rect(right - 1, baseY - 4, 4, 4, cheeseC);
      canvas.rect(right - 2, baseY - 5, 6, 1, crustC);
      canvas.set(right, baseY - 3, pepC); canvas.set(right + 1, baseY - 2, pepC);
      break;
    }
    case 'skateboard': {
      const boardC = palObj.add(pal.body), wheelC = palObj.add('#404040');
      canvas.rect(right - 3, baseY + 4, 8, 2, boardC);
      canvas.set(right - 2, baseY + 6, wheelC); canvas.set(right + 3, baseY + 6, wheelC);
      break;
    }
    case 'guitar': {
      const neckC = palObj.add('#8b5e3c'), bodyGC = palObj.add(pal.body), stringC = palObj.add('#c0c0c0');
      canvas.line(right, baseY - 8, right, baseY + 2, neckC);
      canvas.circle(right, baseY + 4, 3, bodyGC);
      canvas.set(right, baseY - 7, stringC); canvas.set(right, baseY - 5, stringC);
      break;
    }
    case 'trophy': {
      const cupC = palObj.add('#ffd700'), baseTC = palObj.add('#c0a030');
      canvas.rect(right - 1, baseY - 6, 4, 5, cupC);
      canvas.set(right - 2, baseY - 6, cupC); canvas.set(right + 3, baseY - 6, cupC); // handles
      canvas.set(right - 2, baseY - 5, cupC); canvas.set(right + 3, baseY - 5, cupC);
      canvas.rect(right, baseY - 1, 2, 3, baseTC); // stem
      canvas.rect(right - 1, baseY + 2, 4, 1, baseTC); // base
      break;
    }
    case 'phone': {
      const phoneC = palObj.add('#202020'), screenC = palObj.add('#4080ff');
      canvas.rect(right - 1, baseY - 4, 3, 6, phoneC);
      canvas.rect(right, baseY - 3, 1, 4, screenC);
      if (frame % 6 < 3) canvas.set(right, baseY - 2, palObj.add('#40ff40')); // notification
      break;
    }
    case 'diamond_item': {
      const diaC = palObj.add('#80e0ff'), diaHL = palObj.add('#ffffff'), diaD = palObj.add('#4090c0');
      canvas.set(right + 1, baseY - 6, diaC);
      canvas.set(right, baseY - 5, diaC); canvas.set(right + 2, baseY - 5, diaC);
      canvas.set(right - 1, baseY - 4, diaD); canvas.set(right + 1, baseY - 4, diaHL); canvas.set(right + 3, baseY - 4, diaD);
      canvas.set(right, baseY - 3, diaC); canvas.set(right + 2, baseY - 3, diaC);
      canvas.set(right + 1, baseY - 2, diaC);
      break;
    }
    case 'bomb': {
      const bombC = palObj.add('#303030'), fuseC = palObj.add('#8b5e3c'), sparkC = palObj.add('#ffcc40');
      canvas.circle(right + 1, baseY - 2, 3, bombC);
      canvas.line(right + 1, baseY - 5, right + 3, baseY - 8, fuseC);
      if (frame % 4 < 2) { canvas.set(right + 3, baseY - 8, sparkC); canvas.set(right + 4, baseY - 9, palObj.add('#ff4020')); }
      break;
    }
    // — Pro Expansion held items —
    case 'infinity_orb': {
      // Mythic: glowing infinity orb
      const ioC = palObj.add('#a040ff'), ioHL = palObj.add('#d080ff'), ioGlow = palObj.add('#e0b0ff');
      canvas.circle(right + 1, baseY - 4, 4, ioC);
      canvas.circle(right + 1, baseY - 4, 2, ioHL);
      canvas.set(right + 1, baseY - 4, ioGlow);
      // Pulsing glow ring
      if (frame % 6 < 3) {
        for (let a = 0; a < 8; a++) {
          const gx = right + 1 + Math.round(Math.cos(a / 8 * Math.PI * 2) * 5);
          const gy = baseY - 4 + Math.round(Math.sin(a / 8 * Math.PI * 2) * 5);
          if (gx >= 0 && gx < 48 && gy >= 0 && gy < 48) canvas.set(gx, gy, ioGlow);
        }
      }
      canvas.line(right, baseY - 0, right, baseY + 2, palObj.add(pal.dark));
      break;
    }
    case 'torch': {
      const stickC = palObj.add('#8b5e3c'), flameC = palObj.add('#ff6020'), glowC = palObj.add('#ffcc40');
      canvas.line(right, baseY + 3, right, baseY - 5, stickC);
      canvas.set(right, baseY - 6, flameC); canvas.set(right, baseY - 7, glowC);
      canvas.set(right - 1, baseY - 6, flameC); canvas.set(right + 1, baseY - 6, flameC);
      if (frame % 4 < 2) canvas.set(right, baseY - 8, glowC);
      break;
    }
    case 'stick': {
      const stC = palObj.add('#8b6e4e');
      canvas.line(right, baseY + 3, right, baseY - 7, stC);
      canvas.set(right, baseY - 7, palObj.add('#6e5a42'));
      break;
    }
    case 'balloon': {
      const ballC = palObj.add('#ff4080'), stringC = palObj.add('#a0a0a0');
      canvas.circle(right + 1, baseY - 8, 3, ballC);
      canvas.set(right + 1, baseY - 9, palObj.add('#ff80a0'));
      canvas.line(right + 1, baseY - 5, right, baseY + 2, stringC);
      break;
    }
    case 'hammer': {
      const handleC = palObj.add('#8b5e3c'), headC = palObj.add('#808080'), headHL = palObj.add('#c0c0c0');
      canvas.line(right, baseY + 3, right, baseY - 6, handleC);
      canvas.rect(right - 3, baseY - 8, 7, 3, headC);
      canvas.rect(right - 2, baseY - 8, 5, 1, headHL);
      break;
    }
    case 'dagger': {
      const bladeC = palObj.add('#c0c0c0'), hiltC = palObj.add('#8b6914');
      canvas.line(right, baseY + 1, right, baseY - 6, bladeC);
      canvas.set(right, baseY - 6, palObj.add('#ffffff'));
      canvas.rect(right - 1, baseY + 1, 3, 1, hiltC);
      break;
    }
    case 'chalice': {
      const cupC = palObj.add('#ffd700'), jewC = palObj.add('#ff2020'), stemC = palObj.add('#c0a030');
      canvas.rect(right - 1, baseY - 5, 4, 4, cupC);
      canvas.set(right - 2, baseY - 5, cupC); canvas.set(right + 3, baseY - 5, cupC);
      canvas.set(right + 1, baseY - 4, jewC);
      canvas.rect(right, baseY - 1, 2, 2, stemC);
      canvas.rect(right - 1, baseY + 1, 4, 1, stemC);
      break;
    }

  }
}

function drawPattern(canvas: Canvas, patternDef: TraitDef, pal: ColorPalDef, palObj: PalBuilder, bounceY: number) {
  if (patternDef.id === 'none') return;
  const cx = 24, baseY = 30 + bounceY;
  // Semi-transparent overlay color derived from dark palette
  const pc = palObj.add(lerpC(fromHex(pal.dark), fromHex(pal.body), 0.5));

  switch (patternDef.id) {
    case 'stripes':
      for (let y = baseY - 8; y <= baseY + 8; y += 3)
        for (let x = cx - 8; x <= cx + 8; x++) {
          const dx = x - cx, dy = y - baseY;
          if (dx * dx + dy * dy < 80) canvas.set(x, y, pc);
        }
      break;
    case 'spots':
      for (let i = 0; i < 6; i++) {
        const sx = cx + ((i * 7 + 3) % 13) - 6;
        const sy = baseY + ((i * 5 + 2) % 11) - 5;
        canvas.set(sx, sy, pc); canvas.set(sx + 1, sy, pc);
        canvas.set(sx, sy + 1, pc); canvas.set(sx + 1, sy + 1, pc);
      }
      break;
    case 'zigzag':
      for (let x = cx - 8; x <= cx + 8; x++) {
        const zy = baseY + ((x % 4 < 2) ? -2 : 2);
        const dx = x - cx, dy = zy - baseY;
        if (dx * dx + dy * dy < 80) canvas.set(x, zy, pc);
      }
      break;
    case 'checker':
      for (let y = baseY - 7; y <= baseY + 7; y += 2)
        for (let x = cx - 7; x <= cx + 7; x += 2) {
          if ((x + y) % 4 === 0) {
            const dx = x - cx, dy = y - baseY;
            if (dx * dx + dy * dy < 64) canvas.set(x, y, pc);
          }
        }
      break;
    case 'scales':
      for (let row = 0; row < 4; row++)
        for (let col = 0; col < 5; col++) {
          const sx = cx - 8 + col * 4 + (row % 2) * 2;
          const sy = baseY - 6 + row * 4;
          canvas.set(sx, sy, pc); canvas.set(sx + 1, sy, pc);
          canvas.set(sx - 1, sy + 1, pc); canvas.set(sx + 2, sy + 1, pc);
        }
      break;
    case 'cracks':
      canvas.line(cx - 3, baseY - 5, cx + 2, baseY, pc);
      canvas.line(cx + 2, baseY, cx - 1, baseY + 5, pc);
      canvas.line(cx + 1, baseY - 3, cx + 5, baseY + 2, pc);
      break;
    case 'hearts':
      for (let i = 0; i < 3; i++) {
        const hx = cx + (i - 1) * 5, hy = baseY + (i - 1) * 4;
        canvas.set(hx - 1, hy, pc); canvas.set(hx + 1, hy, pc);
        canvas.set(hx - 2, hy + 1, pc); canvas.set(hx, hy + 1, pc); canvas.set(hx + 2, hy + 1, pc);
        canvas.set(hx - 1, hy + 2, pc); canvas.set(hx + 1, hy + 2, pc);
        canvas.set(hx, hy + 3, pc);
      }
      break;
    case 'stars':
      for (let i = 0; i < 4; i++) {
        const sx = cx + ((i * 6 + 1) % 11) - 5;
        const sy = baseY + ((i * 4 + 2) % 9) - 4;
        canvas.set(sx, sy, pc);
        canvas.set(sx - 1, sy, pc); canvas.set(sx + 1, sy, pc);
        canvas.set(sx, sy - 1, pc); canvas.set(sx, sy + 1, pc);
      }
      break;
    case 'circuit':
      canvas.line(cx - 6, baseY, cx + 6, baseY, pc);
      canvas.line(cx, baseY - 6, cx, baseY + 6, pc);
      canvas.set(cx - 4, baseY - 3, pc); canvas.set(cx + 4, baseY + 3, pc);
      canvas.line(cx - 4, baseY - 3, cx - 4, baseY, pc);
      canvas.line(cx + 4, baseY, cx + 4, baseY + 3, pc);
      break;
    // â”€â”€ Expansion patterns â”€â”€
    case 'flames_pat':
      for (let x = cx - 8; x <= cx + 8; x++) {
        const fh = Math.round(Math.sin(x * 0.8) * 2 + 3);
        for (let dy = 0; dy < fh; dy++) {
          const y = baseY + 6 - dy;
          const dx = x - cx;
          if (dx * dx + (y - baseY) * (y - baseY) < 80) canvas.set(x, y, pc);
        }
      }
      break;
    case 'tribal':
      // War paint lines
      canvas.line(cx - 6, baseY - 4, cx - 2, baseY, pc);
      canvas.line(cx - 2, baseY, cx - 6, baseY + 4, pc);
      canvas.line(cx + 6, baseY - 4, cx + 2, baseY, pc);
      canvas.line(cx + 2, baseY, cx + 6, baseY + 4, pc);
      canvas.set(cx - 4, baseY - 2, pc); canvas.set(cx + 4, baseY + 2, pc);
      break;
    case 'galaxy': {
      // Swirling star pattern on body
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = 3 + i % 3 * 2;
        const gx = cx + Math.round(Math.cos(a) * r);
        const gy = baseY + Math.round(Math.sin(a) * r);
        if ((gx - cx) ** 2 + (gy - baseY) ** 2 < 80) canvas.set(gx, gy, pc);
      }
      break;
    }
    case 'bones': {
      // X-ray skeletal overlay
      canvas.line(cx, baseY - 6, cx, baseY + 6, pc); // spine
      canvas.line(cx - 5, baseY - 2, cx + 5, baseY - 2, pc); // ribs
      canvas.line(cx - 4, baseY, cx + 4, baseY, pc);
      canvas.line(cx - 3, baseY + 2, cx + 3, baseY + 2, pc);
      break;
    }
    case 'camo':
      for (let i = 0; i < 12; i++) {
        const mx = cx + ((i * 5 + 1) % 15) - 7;
        const my = baseY + ((i * 3 + 2) % 11) - 5;
        if ((mx - cx) ** 2 + (my - baseY) ** 2 < 64) {
          canvas.set(mx, my, pc); canvas.set(mx + 1, my, pc);
          if (i % 2 === 0) canvas.set(mx, my + 1, pc);
        }
      }
      break;
    // — Pro Expansion patterns —
    case 'cosmic_runes': {
      // Mythic: glowing rune symbols
      const rc = palObj.add(lerpC(fromHex(pal.highlight), fromHex(pal.body), 0.3));
      // Draw small rune circles
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const rx = cx + Math.round(Math.cos(a) * 6);
        const ry = baseY + Math.round(Math.sin(a) * 6);
        canvas.set(rx, ry, rc);
        canvas.set(rx + 1, ry, rc); canvas.set(rx, ry + 1, rc);
      }
      // Center rune cross
      canvas.set(cx, baseY, rc); canvas.set(cx - 1, baseY, rc); canvas.set(cx + 1, baseY, rc);
      canvas.set(cx, baseY - 1, rc); canvas.set(cx, baseY + 1, rc);
      break;
    }
    case 'dots_pat':
      for (let i = 0; i < 8; i++) {
        const dx2 = cx + ((i * 5 + 2) % 13) - 6;
        const dy2 = baseY + ((i * 3 + 1) % 11) - 5;
        if ((dx2 - cx) ** 2 + (dy2 - baseY) ** 2 < 80) canvas.set(dx2, dy2, pc);
      }
      break;
    case 'waves_pat':
      for (let x = cx - 8; x <= cx + 8; x++) {
        for (let row = -1; row <= 1; row++) {
          const wy = baseY + row * 5 + Math.round(Math.sin(x * 0.6) * 1.5);
          const dx = x - cx, dy = wy - baseY;
          if (dx * dx + dy * dy < 80) canvas.set(x, wy, pc);
        }
      }
      break;
    case 'swirl_pat':
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 4;
        const r = 2 + i * 0.35;
        const sx = cx + Math.round(Math.cos(a) * r);
        const sy = baseY + Math.round(Math.sin(a) * r);
        if ((sx - cx) ** 2 + (sy - baseY) ** 2 < 80) canvas.set(sx, sy, pc);
      }
      break;
    case 'runes_pat': {
      // Ancient rune marks
      canvas.set(cx - 4, baseY - 4, pc); canvas.set(cx - 3, baseY - 4, pc);
      canvas.line(cx - 4, baseY - 4, cx - 4, baseY - 1, pc);
      canvas.set(cx + 3, baseY - 3, pc); canvas.set(cx + 4, baseY - 3, pc);
      canvas.line(cx + 4, baseY - 3, cx + 4, baseY, pc);
      canvas.set(cx - 2, baseY + 2, pc); canvas.set(cx + 2, baseY + 2, pc);
      canvas.line(cx - 2, baseY + 2, cx + 2, baseY + 2, pc);
      break;
    }
    case 'glitch_pat':
      for (let i = 0; i < 6; i++) {
        const gx = cx + ((i * 8 + 3) % 15) - 7;
        const gy = baseY + ((i * 5 + 1) % 13) - 6;
        if ((gx - cx) ** 2 + (gy - baseY) ** 2 < 64) {
          canvas.set(gx, gy, pc);
          canvas.set(gx + 1, gy, pc);
          if (i % 2 === 0) canvas.set(gx + 2, gy, pc);
        }
      }
      break;
    case 'lava_pat':
      for (let x = cx - 7; x <= cx + 7; x++) {
        const ly = baseY + 5 + Math.round(Math.sin(x * 0.9) * 2);
        const dx = x - cx, dy = ly - baseY;
        if (dx * dx + dy * dy < 80) {
          canvas.set(x, ly, pc); canvas.set(x, ly - 1, pc);
        }
      }
      break;

  }
}

function drawAura(canvas: Canvas, auraDef: TraitDef, pal: ColorPalDef, palObj: PalBuilder, bounceY: number, frame: number, total: number) {
  if (auraDef.id === 'none') return;
  const cx = 24, baseY = 30 + bounceY;
  const t = frame / total;

  switch (auraDef.id) {
    case 'sparkle':
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + t * Math.PI * 2;
        const dist = 13 + Math.sin(t * Math.PI * 4 + i) * 2;
        const sx = Math.round(cx + Math.cos(angle) * dist);
        const sy = Math.round(baseY + Math.sin(angle) * dist);
        if (sx >= 0 && sx < canvas.w && sy >= 0 && sy < canvas.h)
          if (Math.sin(t * Math.PI * 6 + i * 1.3) > 0) canvas.set(sx, sy, palObj.add('#ffffff'));
      }
      break;
    case 'embers':
      for (let i = 0; i < 10; i++) {
        const ex = cx + ((i * 7 + 3) % 25) - 12;
        const ey = baseY - ((frame * 2 + i * 5) % 20) + 8;
        if (ey >= 0 && ey < canvas.h && ex >= 0 && ex < canvas.w) {
          canvas.set(ex, ey, palObj.add(i % 3 === 0 ? '#ff4020' : '#ff8040'));
        }
      }
      break;
    case 'frost':
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2 + t * Math.PI;
        const dist = 14 + Math.sin(i * 2.1) * 3;
        const fx = Math.round(cx + Math.cos(angle) * dist);
        const fy = Math.round(baseY + Math.sin(angle) * dist);
        if (fx >= 0 && fx < canvas.w && fy >= 0 && fy < canvas.h) {
          canvas.set(fx, fy, palObj.add('#a0e0ff'));
          if (i % 3 === 0 && fx + 1 < canvas.w) canvas.set(fx + 1, fy, palObj.add('#c0f0ff'));
        }
      }
      break;
    case 'electric':
      for (let bolt = 0; bolt < 3; bolt++) {
        const startAngle = (bolt / 3) * Math.PI * 2 + t * Math.PI * 4;
        let bx = Math.round(cx + Math.cos(startAngle) * 12);
        let by = Math.round(baseY + Math.sin(startAngle) * 12);
        const ec = palObj.add('#ffff40');
        for (let seg = 0; seg < 4; seg++) {
          const nx = bx + ((seg * 3 + bolt) % 5) - 2;
          const ny = by + ((seg * 2 + bolt) % 3) - 1;
          if (bx >= 0 && bx < canvas.w && by >= 0 && by < canvas.h &&
              nx >= 0 && nx < canvas.w && ny >= 0 && ny < canvas.h)
            canvas.line(bx, by, nx, ny, ec);
          bx = nx; by = ny;
        }
      }
      break;
    case 'shadow':
      for (let i = 0; i < 15; i++) {
        const angle = (i / 15) * Math.PI * 2 + t * Math.PI;
        const dist = 12 + Math.sin(t * Math.PI * 3 + i * 0.9) * 3;
        const sx = Math.round(cx + Math.cos(angle) * dist);
        const sy = Math.round(baseY + Math.sin(angle) * dist);
        if (sx >= 0 && sx < canvas.w && sy >= 0 && sy < canvas.h)
          canvas.set(sx, sy, palObj.add('#302040'));
      }
      break;
    case 'rainbow': {
      const colors = ['#ff0000', '#ff8000', '#ffff00', '#00ff00', '#0080ff', '#8000ff'];
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2 + t * Math.PI * 2;
        const dist = 14;
        const rx = Math.round(cx + Math.cos(angle) * dist);
        const ry = Math.round(baseY + Math.sin(angle) * dist);
        if (rx >= 0 && rx < canvas.w && ry >= 0 && ry < canvas.h)
          canvas.set(rx, ry, palObj.add(colors[(i + frame) % colors.length]));
      }
      break;
    }
    case 'holy':
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + t * Math.PI;
        const dist = 14;
        const hx = Math.round(cx + Math.cos(angle) * dist);
        const hy = Math.round(baseY + Math.sin(angle) * dist);
        const gc = palObj.add('#ffd700');
        if (hx >= 0 && hx < canvas.w && hy >= 0 && hy < canvas.h) {
          canvas.set(hx, hy, gc);
          if (Math.sin(t * Math.PI * 4 + i) > 0) {
            if (hx + 1 < canvas.w) canvas.set(hx + 1, hy, gc);
            if (hy - 1 >= 0) canvas.set(hx, hy - 1, gc);
          }
        }
      }
      break;
    // â”€â”€ Expansion auras â”€â”€
    case 'smoke_aura': {
      const smokeColors = [palObj.add('#808080'), palObj.add('#a0a0a0'), palObj.add('#606060')];
      for (let i = 0; i < 10; i++) {
        const sx = cx + ((i * 7 + 3) % 25) - 12;
        const sy = baseY - ((frame + i * 4) % 18) + 6;
        if (sy >= 0 && sy < canvas.h && sx >= 0 && sx < canvas.w) {
          canvas.set(sx, sy, smokeColors[i % 3]);
          if (i % 2 === 0 && sx + 1 < canvas.w) canvas.set(sx + 1, sy, smokeColors[(i + 1) % 3]);
        }
      }
      break;
    }
    case 'dark_fire': {
      const fireC = [palObj.add('#ff2020'), palObj.add('#ff8020'), palObj.add('#ffcc40')];
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2 + t * Math.PI * 4;
        const dist = 14;
        const fx = Math.round(cx + Math.cos(angle) * dist);
        const fy = Math.round(baseY + Math.sin(angle) * dist);
        if (fx >= 0 && fx < canvas.w && fy >= 0 && fy < canvas.h)
          canvas.set(fx, fy, fireC[i % 3]);
      }
      break;
    }
    case 'plasma_aura': {
      const gColors = [palObj.add('#ff00ff'), palObj.add('#00ffff'), palObj.add('#ffff00')];
      for (let i = 0; i < 8; i++) {
        const gx = cx + ((i * 11 + frame * 3) % 28) - 14;
        const gy = baseY + ((i * 7 + frame * 2) % 20) - 10;
        if (gx >= 0 && gx < canvas.w && gy >= 0 && gy < canvas.h) {
          canvas.set(gx, gy, gColors[i % 3]);
          if (frame % 3 === 0 && gx + 1 < canvas.w) canvas.set(gx + 1, gy, gColors[(i + 1) % 3]);
        }
      }
      break;
    }
    case 'hearts_aura': {
      const heartC = palObj.add('#ff4080');
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + t * Math.PI * 2;
        const dist = 14 + Math.sin(t * Math.PI * 3 + i) * 2;
        const hx = Math.round(cx + Math.cos(angle) * dist);
        const hy = Math.round(baseY + Math.sin(angle) * dist);
        if (hx >= 0 && hx < canvas.w && hy >= 0 && hy < canvas.h)
          canvas.set(hx, hy, heartC);
      }
      break;
    }
    case 'poison': {
      const toxicC = [palObj.add('#80ff20'), palObj.add('#40c010'), palObj.add('#a0ff40')];
      for (let i = 0; i < 12; i++) {
        const tx = cx + ((i * 9 + 5) % 25) - 12;
        const ty = baseY + Math.round(Math.sin(t * Math.PI * 3 + i * 0.8) * 12);
        if (tx >= 0 && tx < canvas.w && ty >= 0 && ty < canvas.h)
          canvas.set(tx, ty, toxicC[i % 3]);
      }
      break;
    }
    case 'solar': {
      const gdColors = [palObj.add('#ffd700'), palObj.add('#ffea80'), palObj.add('#fff0b0')];
      for (let i = 0; i < 15; i++) {
        const angle = (i / 15) * Math.PI * 2 + t * Math.PI;
        const dist = 13 + Math.sin(t * Math.PI * 4 + i * 1.1) * 3;
        const gx = Math.round(cx + Math.cos(angle) * dist);
        const gy = Math.round(baseY + Math.sin(angle) * dist);
        if (gx >= 0 && gx < canvas.w && gy >= 0 && gy < canvas.h)
          if (Math.sin(t * Math.PI * 6 + i) > -0.2) canvas.set(gx, gy, gdColors[i % 3]);
      }
      break;
    }
    // — Pro Expansion auras —
    case 'singularity': {
      // Mythic: dark gravitational pull
      const sC = palObj.add('#4010a0'), sHL = palObj.add('#8040ff'), sD = palObj.add('#100020');
      // Dark event horizon ring
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2 + t * Math.PI * 6;
        const dist = 13 + Math.sin(t * Math.PI * 4 + i * 1.5) * 2;
        const sx = Math.round(cx + Math.cos(angle) * dist);
        const sy = Math.round(baseY + Math.sin(angle) * dist);
        if (sx >= 0 && sx < canvas.w && sy >= 0 && sy < canvas.h) canvas.set(sx, sy, sC);
      }
      // Inner glow
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 - t * Math.PI * 4;
        const dist = 8;
        const sx = Math.round(cx + Math.cos(angle) * dist);
        const sy = Math.round(baseY + Math.sin(angle) * dist);
        if (sx >= 0 && sx < canvas.w && sy >= 0 && sy < canvas.h) canvas.set(sx, sy, sHL);
      }
      // Center void
      canvas.set(cx, baseY - 14, sD); canvas.set(cx - 1, baseY - 14, sD); canvas.set(cx + 1, baseY - 14, sD);
      break;
    }
    case 'calm': {
      // Gentle ambient glow
      const calmC = palObj.add(pal.light);
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + t * Math.PI;
        const dist = 14;
        const sx = Math.round(cx + Math.cos(angle) * dist);
        const sy = Math.round(baseY + Math.sin(angle) * dist);
        if (sx >= 0 && sx < canvas.w && sy >= 0 && sy < canvas.h)
          if (Math.sin(t * Math.PI * 2 + i) > 0) canvas.set(sx, sy, calmC);
      }
      break;
    }
    case 'dust': {
      // Floating dust motes
      const dustC = palObj.add('#c0b898'), dustL = palObj.add('#e0d8c0');
      for (let i = 0; i < 8; i++) {
        const dx2 = cx + ((i * 7 + frame) % 25) - 12;
        const dy2 = baseY + ((i * 5 + frame * 2) % 20) - 10;
        if (dx2 >= 0 && dx2 < canvas.w && dy2 >= 0 && dy2 < canvas.h)
          canvas.set(dx2, dy2, i % 2 === 0 ? dustC : dustL);
      }
      break;
    }
    case 'fireflies': {
      const ffC = palObj.add('#ccff40'), ffHL = palObj.add('#ffff80');
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + t * Math.PI * 3;
        const dist = 12 + Math.sin(t * Math.PI * 5 + i * 2) * 3;
        const fx = Math.round(cx + Math.cos(angle) * dist);
        const fy = Math.round(baseY + Math.sin(angle) * dist);
        if (fx >= 0 && fx < canvas.w && fy >= 0 && fy < canvas.h) {
          canvas.set(fx, fy, Math.sin(t * Math.PI * 8 + i) > 0 ? ffHL : ffC);
        }
      }
      break;
    }
    case 'crystal_aura': {
      const crysC = palObj.add('#80e0ff'), crysD = palObj.add('#4090c0');
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + t * Math.PI;
        const dist = 14;
        const sx = Math.round(cx + Math.cos(angle) * dist);
        const sy = Math.round(baseY + Math.sin(angle) * dist);
        if (sx >= 0 && sx < canvas.w && sy >= 0 && sy < canvas.h) {
          canvas.set(sx, sy, crysC);
          if (i % 2 === 0 && sy - 1 >= 0) canvas.set(sx, sy - 1, crysD);
        }
      }
      break;
    }
    case 'lightning': {
      const lnC = palObj.add('#ffff40'), lnBright = palObj.add('#ffffff');
      for (let bolt = 0; bolt < 4; bolt++) {
        const startAngle = (bolt / 4) * Math.PI * 2 + t * Math.PI * 6;
        let bx = Math.round(cx + Math.cos(startAngle) * 13);
        let by = Math.round(baseY + Math.sin(startAngle) * 13);
        for (let seg = 0; seg < 3; seg++) {
          const nx = bx + ((seg * 5 + bolt * 3) % 5) - 2;
          const ny = by + ((seg * 3 + bolt) % 3) - 1;
          if (bx >= 0 && bx < canvas.w && by >= 0 && by < canvas.h &&
              nx >= 0 && nx < canvas.w && ny >= 0 && ny < canvas.h)
            canvas.line(bx, by, nx, ny, seg === 0 ? lnBright : lnC);
          bx = nx; by = ny;
        }
      }
      break;
    }
    case 'void_aura': {
      const vaC = palObj.add('#301060'), vaHL = palObj.add('#6030a0'), vaD = palObj.add('#100020');
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2 - t * Math.PI * 2;
        const dist = 13 + Math.sin(t * Math.PI * 3 + i) * 3;
        const vx = Math.round(cx + Math.cos(angle) * dist);
        const vy = Math.round(baseY + Math.sin(angle) * dist);
        if (vx >= 0 && vx < canvas.w && vy >= 0 && vy < canvas.h)
          canvas.set(vx, vy, i % 3 === 0 ? vaD : (i % 3 === 1 ? vaHL : vaC));
      }
      break;
    }

  }
}

/** Compute animation bounceY + offsetX based on animation style + frame */
function computeAnimation(animDef: TraitDef, frame: number, totalFrames: number): { bounceY: number; offsetX: number; } {
  const t = frame / totalFrames;
  switch (animDef.id) {
    case 'bounce':
      return { bounceY: Math.round(Math.sin(t * Math.PI * 2) * 2), offsetX: 0 };
    case 'hover': {
      // Quick up-down hover with subtle lateral micro-drift
      const hoverY = Math.sin(t * Math.PI * 4) * 1.5 - 2;
      const hoverX = Math.sin(t * Math.PI * 6) * 0.8;
      return { bounceY: Math.round(hoverY), offsetX: Math.round(hoverX) };
    }
    case 'pulse': {
      // Double-beat heartbeat: quick thump-thump then pause
      const beat = t * 4 % 1;
      const thump = beat < 0.15 ? Math.sin(beat / 0.15 * Math.PI) * 3
                   : beat < 0.35 ? Math.sin((beat - 0.2) / 0.15 * Math.PI) * 2
                   : 0;
      return { bounceY: Math.round(-thump), offsetX: 0 };
    }
    case 'wobble':
      return { bounceY: Math.round(Math.sin(t * Math.PI * 2) * 1), offsetX: Math.round(Math.sin(t * Math.PI * 4) * 2) };
    case 'spin':
      // Visual rotation handled by post-processing squash/flip
      return { bounceY: Math.round(Math.abs(Math.sin(t * Math.PI * 2)) * 1), offsetX: 0 };
    case 'glitch': {
      // Harsh digital glitch — jumps + scan distortion
      const g = (frame * 7 + 13) & 0xFF;
      const isJump = frame % 5 < 2;
      const isTwitch = frame % 3 === 0;
      return {
        bounceY: isJump ? Math.round(((g / 255) - 0.5) * 6) : (isTwitch ? -1 : 0),
        offsetX: isJump ? Math.round((((g * 3) & 0xFF) / 255 - 0.5) * 8) : (isTwitch ? ((g & 1) ? 2 : -2) : 0),
      };
    }
    case 'teleport':
      return {
        bounceY: (frame % 12 < 2) ? -20 : Math.round(Math.sin(t * Math.PI * 2) * 0.5),
        offsetX: (frame % 12 < 2) ? Math.round(Math.sin(frame) * 6) : 0,
      };
    // — Expansion —
    case 'shake':
      return {
        bounceY: Math.round(Math.sin(t * Math.PI * 16) * 1.5),
        offsetX: Math.round(Math.sin(t * Math.PI * 20) * 2),
      };
    case 'breathe': {
      // Slow inhale (rise) → hold → exhale (drop). More dramatic vertical range.
      const breathePhase = Math.sin(t * Math.PI * 2);
      const inhale = breathePhase > 0 ? breathePhase * 1.2 : breathePhase * 0.5;
      return { bounceY: Math.round(-inhale * 3), offsetX: 0 };
    }
    case 'moonwalk': {
      // Smooth sine loop: slides left then right, no snap
      const mwX = Math.sin(t * Math.PI * 2) * 6;
      // 6 step-bounces per full cycle for walking feel
      const mwY = Math.abs(Math.sin(t * Math.PI * 6)) * 1.5;
      return { bounceY: Math.round(mwY), offsetX: Math.round(mwX) };
    }
    case 'headbang':
      return { bounceY: Math.round(Math.abs(Math.sin(t * Math.PI * 8)) * 3), offsetX: 0 };
    case 'smoke_puff': {
      // Rises gently then sinks, with lazy side-to-side drift like smoke
      const smokeY = -Math.abs(Math.sin(t * Math.PI * 2)) * 3;
      const smokeX = Math.sin(t * Math.PI * 1.5) * 2.5;
      return { bounceY: Math.round(smokeY), offsetX: Math.round(smokeX) };
    }
    // — Pro Expansion —
    case 'sway':
      return { bounceY: 0, offsetX: Math.round(Math.sin(t * Math.PI * 2) * 3) };
    case 'jitter': {
      // Nervous twitching — sharp snaps in random-feeling directions
      const jSeed = (frame * 13 + 7) & 0xFF;
      const jY = ((jSeed & 3) - 1.5) * (frame % 2 === 0 ? 1.5 : 0);
      const jX = (((jSeed >> 2) & 3) - 1.5) * (frame % 3 === 0 ? 2 : 0);
      return { bounceY: Math.round(jY), offsetX: Math.round(jX) };
    }
    case 'float': {
      // Float well above ground with lazy lateral drift
      const floatY = -4 + Math.sin(t * Math.PI * 2) * 2;
      const floatX = Math.sin(t * Math.PI * 2 + 0.5) * 1.5;
      return { bounceY: Math.round(floatY), offsetX: Math.round(floatX) };
    }
    case 'vibrate': {
      const v = (frame * 11 + 7) & 0xFF;
      return {
        bounceY: Math.round(((v & 3) - 1.5) * 0.8),
        offsetX: Math.round((((v >> 2) & 3) - 1.5) * 0.8),
      };
    }
    case 'dash': {
      const dp = (t * 4) % 1;
      return { bounceY: 0, offsetX: Math.round(dp < 0.3 ? dp * 15 : (1 - dp) * -2) };
    }
    case 'phase': {
      const pt = Math.sin(t * Math.PI * 2);
      return { bounceY: Math.round(pt * 1), offsetX: pt > 0.8 ? 6 : pt < -0.8 ? -6 : 0 };
    }
    case 'warp':
      return {
        bounceY: Math.round(Math.sin(t * Math.PI * 6) * 2),
        offsetX: Math.round(Math.cos(t * Math.PI * 4) * 3),
      };
    case 'ascend': {
      // Smooth loop: rise → hover at top → descend. Sine keeps it seamless.
      const ascY = Math.sin(t * Math.PI * 2) * 5;
      const ascWobble = Math.sin(t * Math.PI * 6) * 0.6;
      return { bounceY: Math.round(-Math.abs(ascY) + ascWobble), offsetX: 0 };
    }
    case 'transcend':
      return {
        bounceY: Math.round(-1.5 + Math.sin(t * Math.PI * 2) * 2),
        offsetX: Math.round(Math.sin(t * Math.PI * 3) * 3),
      };
    default:
      return { bounceY: Math.round(Math.sin(t * Math.PI * 2) * 1.5), offsetX: 0 };
  }
}
function drawCompanion(canvas: Canvas, compDef: TraitDef, pal: ColorPalDef, palObj: PalBuilder, bounceY: number, frame: number, total: number) {
  if (compDef.id === 'none') return;
  const t = frame / total;
  // Companion orbits around the creature on the left side
  const cx = 10 + Math.round(Math.sin(t * Math.PI * 2) * 3);
  const cy = 18 + bounceY + Math.round(Math.cos(t * Math.PI * 2) * 3);

  switch (compDef.id) {
    case 'firefly': {
      const glow = Math.sin(t * Math.PI * 6) > 0 ? palObj.add('#ffff40') : palObj.add('#cccc20');
      canvas.set(cx, cy, glow);
      if (Math.sin(t * Math.PI * 4) > 0.5) canvas.set(cx + 1, cy, palObj.add('#ffff80'));
      break;
    }
    case 'bat': {
      const batC = palObj.add('#302030');
      canvas.set(cx, cy, batC); canvas.set(cx, cy - 1, batC);
      // Wings flap
      const wing = Math.sin(t * Math.PI * 8) > 0 ? -1 : 0;
      canvas.set(cx - 2, cy + wing, batC); canvas.set(cx + 2, cy + wing, batC);
      canvas.set(cx - 1, cy - 1, batC); canvas.set(cx + 1, cy - 1, batC);
      // Eyes
      canvas.set(cx - 1, cy, palObj.add('#ff2020')); canvas.set(cx + 1, cy, palObj.add('#ff2020'));
      break;
    }
    case 'skull': {
      const boneC = palObj.add('#e0d8c8');
      canvas.set(cx, cy, boneC); canvas.set(cx - 1, cy, boneC); canvas.set(cx + 1, cy, boneC);
      canvas.set(cx - 1, cy - 1, boneC); canvas.set(cx + 1, cy - 1, boneC); canvas.set(cx, cy - 1, boneC);
      canvas.set(cx, cy + 1, boneC);
      // Eyes
      canvas.set(cx - 1, cy - 1, palObj.add('#101010')); canvas.set(cx + 1, cy - 1, palObj.add('#101010'));
      break;
    }
    case 'fairy': {
      const fairyC = palObj.add('#ff6040'), wingC = palObj.add('#ff9060');
      canvas.set(cx, cy, fairyC);
      const wFlap = Math.sin(t * Math.PI * 6) > 0 ? -1 : 0;
      canvas.set(cx - 1, cy - 1 + wFlap, wingC); canvas.set(cx + 1, cy - 1 + wFlap, wingC);
      // Trail
      for (let i = 1; i < 3; i++) {
        const tx = cx + Math.round(Math.sin(t * Math.PI * 2 - i * 0.5) * -2);
        const ty = cy + i;
        if (ty < canvas.h) canvas.set(tx, ty, palObj.add('#ff8030'));
      }
      break;
    }
    case 'dragon': {
      const drC = palObj.add('#c02020'), drW = palObj.add('#e04040');
      // Body
      canvas.set(cx, cy, drC); canvas.set(cx + 1, cy, drC); canvas.set(cx - 1, cy, drC);
      canvas.set(cx, cy - 1, drC); canvas.set(cx + 1, cy - 1, drC);
      // Wings
      const wf = Math.sin(t * Math.PI * 6) > 0 ? -1 : 0;
      canvas.set(cx - 2, cy - 1 + wf, drW); canvas.set(cx + 2, cy - 1 + wf, drW);
      canvas.set(cx - 3, cy - 2 + wf, drW); canvas.set(cx + 3, cy - 2 + wf, drW);
      // Eyes
      canvas.set(cx, cy - 1, palObj.add('#ffff40'));
      // Fire breath
      if (frame % 8 < 4) canvas.set(cx + 2, cy, palObj.add('#ff6020'));
      break;
    }
    case 'ghost': {
      const ghostC = palObj.add('#c0c8e0');
      canvas.set(cx, cy, ghostC); canvas.set(cx - 1, cy, ghostC); canvas.set(cx + 1, cy, ghostC);
      canvas.set(cx, cy - 1, ghostC);
      canvas.set(cx - 1, cy + 1, ghostC); canvas.set(cx + 1, cy + 1, ghostC);
      // Eyes
      canvas.set(cx - 1, cy, palObj.add('#4040a0')); canvas.set(cx + 1, cy, palObj.add('#4040a0'));
      // Tail flicker
      if (frame % 4 < 2) canvas.set(cx, cy + 2, ghostC);
      break;
    }
    case 'phoenix': {
      const phC = palObj.add('#ff8020'), phHL = palObj.add('#ffcc40'), phFire = palObj.add('#ff4010');
      canvas.set(cx, cy, phC); canvas.set(cx - 1, cy, phC); canvas.set(cx + 1, cy, phC);
      canvas.set(cx, cy - 1, phHL);
      // Wings
      const wf = Math.sin(t * Math.PI * 6) > 0 ? -1 : 0;
      canvas.set(cx - 2, cy + wf, phHL); canvas.set(cx + 2, cy + wf, phHL);
      canvas.set(cx - 3, cy - 1 + wf, phC); canvas.set(cx + 3, cy - 1 + wf, phC);
      // Tail fire
      for (let i = 1; i <= 3; i++) {
        const tc = i === 1 ? phFire : phC;
        canvas.set(cx + Math.round(Math.sin(t * Math.PI * 4 + i) * 0.5), cy + i, tc);
      }
      break;
    }
    case 'demon': {
      const impC = palObj.add('#a01030'), impHL = palObj.add('#ff3050');
      canvas.set(cx, cy, impC); canvas.set(cx - 1, cy, impC); canvas.set(cx + 1, cy, impC);
      canvas.set(cx, cy - 1, impC);
      // Horns
      canvas.set(cx - 1, cy - 2, impHL); canvas.set(cx + 1, cy - 2, impHL);
      // Eyes glow
      canvas.set(cx - 1, cy, palObj.add('#ffff00')); canvas.set(cx + 1, cy, palObj.add('#ffff00'));
      // Tail
      canvas.set(cx + 2, cy + 1, impC); canvas.set(cx + 3, cy + 1, impHL);
      // Wings
      const wf = Math.sin(t * Math.PI * 4) > 0 ? -1 : 0;
      canvas.set(cx - 2, cy - 1 + wf, impC); canvas.set(cx + 2, cy - 1 + wf, impC);
      break;
    }
    // â”€â”€ Expansion companions â”€â”€
    case 'black_cat': {
      const catC = palObj.add('#1a1a1a'), eyeC = palObj.add('#40ff40');
      canvas.set(cx, cy, catC); canvas.set(cx - 1, cy, catC); canvas.set(cx + 1, cy, catC);
      canvas.set(cx, cy - 1, catC); canvas.set(cx - 1, cy - 1, catC); canvas.set(cx + 1, cy - 1, catC);
      // Ears
      canvas.set(cx - 2, cy - 2, catC); canvas.set(cx + 2, cy - 2, catC);
      // Eyes
      canvas.set(cx - 1, cy - 1, eyeC); canvas.set(cx + 1, cy - 1, eyeC);
      // Tail
      const tailSway = Math.round(Math.sin(t * Math.PI * 4) * 1.5);
      canvas.set(cx + 2, cy, catC); canvas.set(cx + 3, cy + tailSway, catC);
      break;
    }
    case 'raven': {
      const birdC = palObj.add('#202030'), beakC = palObj.add('#ffcc40');
      const wf = Math.sin(t * Math.PI * 6) > 0 ? -1 : 0;
      canvas.set(cx, cy, birdC); canvas.set(cx + 1, cy, birdC); canvas.set(cx - 1, cy, birdC);
      canvas.set(cx, cy - 1, birdC);
      canvas.set(cx + 2, cy, beakC);
      // Wings
      canvas.set(cx - 2, cy - 1 + wf, birdC); canvas.set(cx + 2, cy - 1 + wf, birdC);
      canvas.set(cx - 3, cy - 2 + wf, birdC); canvas.set(cx + 3, cy - 2 + wf, birdC);
      // Eye
      canvas.set(cx + 1, cy - 1, palObj.add('#ff2020'));
      break;
    }
    case 'snake': {
      const snakeC = palObj.add('#30a030'), snakeHL = palObj.add('#60d060');
      // Coiled body
      for (let i = 0; i < 5; i++) {
        const sx = cx + Math.round(Math.sin(i * 1.2 + t * Math.PI * 2) * 2);
        canvas.set(sx, cy + i - 2, i % 2 === 0 ? snakeC : snakeHL);
      }
      // Head
      canvas.set(cx, cy - 2, snakeC); canvas.set(cx + 1, cy - 2, snakeC);
      canvas.set(cx + 1, cy - 3, palObj.add('#ff2020')); // tongue
      break;
    }
    case 'frog': {
      const frogC = palObj.add('#40a040'), frogHL = palObj.add('#80d080');
      canvas.set(cx, cy, frogC); canvas.set(cx - 1, cy, frogC); canvas.set(cx + 1, cy, frogC);
      canvas.set(cx - 1, cy - 1, frogHL); canvas.set(cx + 1, cy - 1, frogHL); // big eyes
      canvas.set(cx, cy + 1, frogC); // belly
      // Tongue (animated)
      if (frame % 12 < 3) {
        canvas.set(cx + 2, cy, palObj.add('#ff4060')); canvas.set(cx + 3, cy, palObj.add('#ff4060'));
      }
      break;
    }
    case 'robot': {
      const metalC = palObj.add('#a0a0b0'), lightC2 = palObj.add('#00ff40');
      canvas.set(cx, cy, metalC); canvas.set(cx - 1, cy, metalC); canvas.set(cx + 1, cy, metalC);
      canvas.set(cx, cy - 1, metalC);
      // Antenna
      canvas.set(cx, cy - 2, palObj.add('#808080'));
      if (frame % 4 < 2) canvas.set(cx, cy - 3, lightC2);
      // Eye
      canvas.set(cx, cy, lightC2);
      // Hover particles
      if (frame % 6 < 3) canvas.set(cx, cy + 1, palObj.add('#606060'));
      break;
    }
    case 'shroom': {
      const capC = palObj.add('#dd4040'), stemC2 = palObj.add('#e0d8b0'), dotC = palObj.add('#ffffff');
      canvas.set(cx, cy + 1, stemC2); canvas.set(cx, cy + 2, stemC2);
      canvas.set(cx - 1, cy, capC); canvas.set(cx, cy, capC); canvas.set(cx + 1, cy, capC);
      canvas.set(cx - 1, cy - 1, capC); canvas.set(cx, cy - 1, capC); canvas.set(cx + 1, cy - 1, capC);
      canvas.set(cx, cy - 1, dotC); // spot
      // Bounce animation
      const bounce = Math.sin(t * Math.PI * 4) > 0.5 ? -1 : 0;
      if (bounce !== 0) canvas.set(cx, cy - 2, capC);
      break;
    }
    // — Pro Expansion companions —
    case 'butterfly': {
      const bfWing = palObj.add('#ff80c0'), bfBody = palObj.add('#402030');
      canvas.set(cx, cy, bfBody); canvas.set(cx, cy + 1, bfBody);
      const wf = Math.sin(t * Math.PI * 8) > 0 ? 0 : 1;
      canvas.set(cx - 1, cy - wf, bfWing); canvas.set(cx + 1, cy - wf, bfWing);
      canvas.set(cx - 2, cy - wf, bfWing); canvas.set(cx + 2, cy - wf, bfWing);
      canvas.set(cx - 1, cy + 1 + wf, bfWing); canvas.set(cx + 1, cy + 1 + wf, bfWing);
      break;
    }
    case 'puppy': {
      const pupC = palObj.add('#c08040'), pupD = palObj.add('#8b5e3c');
      canvas.set(cx, cy, pupC); canvas.set(cx - 1, cy, pupC); canvas.set(cx + 1, cy, pupC);
      canvas.set(cx, cy - 1, pupC); canvas.set(cx - 1, cy - 1, pupC); canvas.set(cx + 1, cy - 1, pupC);
      // Ears
      canvas.set(cx - 2, cy - 1, pupD); canvas.set(cx + 2, cy - 1, pupD);
      canvas.set(cx - 2, cy, pupD); canvas.set(cx + 2, cy, pupD);
      // Eyes + nose
      canvas.set(cx - 1, cy - 1, palObj.add('#101010')); canvas.set(cx + 1, cy - 1, palObj.add('#101010'));
      canvas.set(cx, cy, palObj.add('#101010'));
      // Tail wag
      const tw = Math.sin(t * Math.PI * 6) > 0 ? 1 : -1;
      canvas.set(cx - 2, cy + 1, pupC); canvas.set(cx - 3, cy + tw, pupD);
      break;
    }
    case 'owl': {
      const owlC = palObj.add('#806040'), owlEye = palObj.add('#ffcc40');
      canvas.set(cx, cy, owlC); canvas.set(cx - 1, cy, owlC); canvas.set(cx + 1, cy, owlC);
      canvas.set(cx, cy - 1, owlC); canvas.set(cx - 1, cy - 1, owlC); canvas.set(cx + 1, cy - 1, owlC);
      // Big eyes
      canvas.set(cx - 1, cy - 1, owlEye); canvas.set(cx + 1, cy - 1, owlEye);
      // Ear tufts
      canvas.set(cx - 2, cy - 2, owlC); canvas.set(cx + 2, cy - 2, owlC);
      // Beak
      canvas.set(cx, cy, palObj.add('#ffaa30'));
      // Wings
      const wf = Math.sin(t * Math.PI * 3) > 0 ? -1 : 0;
      canvas.set(cx - 2, cy + wf, owlC); canvas.set(cx + 2, cy + wf, owlC);
      break;
    }
    case 'crab': {
      const crabC = palObj.add('#e04020'), clawC = palObj.add('#ff6040');
      canvas.set(cx, cy, crabC); canvas.set(cx - 1, cy, crabC); canvas.set(cx + 1, cy, crabC);
      canvas.set(cx, cy + 1, crabC);
      // Eyes on stalks
      canvas.set(cx - 1, cy - 1, palObj.add('#101010')); canvas.set(cx + 1, cy - 1, palObj.add('#101010'));
      // Claws
      const clawOpen = Math.sin(t * Math.PI * 4) > 0 ? 1 : 0;
      canvas.set(cx - 2, cy, clawC); canvas.set(cx - 3, cy - clawOpen, clawC);
      canvas.set(cx + 2, cy, clawC); canvas.set(cx + 3, cy - clawOpen, clawC);
      // Legs
      canvas.set(cx - 1, cy + 1, crabC); canvas.set(cx + 1, cy + 1, crabC);
      break;
    }
    case 'spirit_fox': {
      const foxC = palObj.add('#60a0ff'), foxHL = palObj.add('#a0d0ff');
      canvas.set(cx, cy, foxC); canvas.set(cx - 1, cy, foxC); canvas.set(cx + 1, cy, foxC);
      canvas.set(cx, cy - 1, foxC);
      // Ears
      canvas.set(cx - 2, cy - 2, foxC); canvas.set(cx + 2, cy - 2, foxC);
      // Ghostly eyes
      canvas.set(cx - 1, cy, palObj.add('#ffffff')); canvas.set(cx + 1, cy, palObj.add('#ffffff'));
      // Fluffy tail
      canvas.set(cx + 2, cy + 1, foxHL); canvas.set(cx + 3, cy, foxHL); canvas.set(cx + 3, cy + 1, foxHL);
      // Spirit trail
      if (frame % 4 < 2) canvas.set(cx, cy + 1, foxHL);
      break;
    }
    case 'golem': {
      const golemC = palObj.add('#607080'), golemHL = palObj.add('#80e0ff');
      canvas.set(cx, cy, golemC); canvas.set(cx - 1, cy, golemC); canvas.set(cx + 1, cy, golemC);
      canvas.set(cx, cy - 1, golemC); canvas.set(cx - 1, cy + 1, golemC); canvas.set(cx + 1, cy + 1, golemC);
      canvas.set(cx, cy + 1, golemC);
      // Crystal eye
      canvas.set(cx, cy - 1, golemHL);
      // Crystal shards
      canvas.set(cx - 2, cy - 1, golemHL); canvas.set(cx + 2, cy - 1, golemHL);
      break;
    }
    case 'wisp': {
      const wispC = palObj.add('#80ff80'), wispGlow = palObj.add('#c0ffc0');
      const wobble = Math.round(Math.sin(t * Math.PI * 6) * 1);
      canvas.set(cx + wobble, cy, wispC);
      canvas.set(cx + wobble - 1, cy, wispGlow); canvas.set(cx + wobble + 1, cy, wispGlow);
      // Trail
      for (let i = 1; i <= 3; i++) {
        if (cy + i < canvas.h) canvas.set(cx + wobble + Math.round(Math.sin(t * Math.PI * 4 + i) * 0.5), cy + i, wispC);
      }
      break;
    }
    case 'unicorn': {
      const uniC = palObj.add('#f0e8ff'), maneC = palObj.add('#ff80c0'), hornC = palObj.add('#ffd700');
      canvas.set(cx, cy, uniC); canvas.set(cx - 1, cy, uniC); canvas.set(cx + 1, cy, uniC);
      canvas.set(cx, cy - 1, uniC); canvas.set(cx + 1, cy - 1, uniC);
      // Horn
      canvas.set(cx, cy - 2, hornC); canvas.set(cx, cy - 3, hornC);
      // Mane
      canvas.set(cx - 1, cy - 1, maneC); canvas.set(cx - 1, cy, maneC);
      // Eye
      canvas.set(cx + 1, cy - 1, palObj.add('#4040a0'));
      // Legs
      canvas.set(cx - 1, cy + 1, uniC); canvas.set(cx + 1, cy + 1, uniC);
      // Sparkle trail
      if (frame % 6 < 3) canvas.set(cx + 2, cy + 1, palObj.add('#ffff80'));
      break;
    }

  }
}

function drawOutline(canvas: Canvas, outlineDef: TraitDef, pal: ColorPalDef, palObj: PalBuilder, bounceY: number, frame: number, total: number) {
  if (outlineDef.id === 'none') return;
  const cx = 24, baseY = 30 + bounceY;
  const t = frame / total;

  // Detect body pixels and draw outline around them
  const bodyPixels = new Set<string>();
  const bodyC = palObj.add(pal.body);
  for (let y = 0; y < canvas.h; y++)
    for (let x = 0; x < canvas.w; x++)
      if (canvas.data[y * canvas.w + x] === bodyC) bodyPixels.add(`${x},${y}`);

  // Find edge pixels
  const edges: [number, number][] = [];
  for (const key of bodyPixels) {
    const [x, y] = key.split(',').map(Number);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (!bodyPixels.has(`${nx},${ny}`) && nx >= 0 && nx < canvas.w && ny >= 0 && ny < canvas.h)
        edges.push([nx, ny]);
    }
  }

  switch (outlineDef.id) {
    case 'dark':
      for (const [x, y] of edges) canvas.set(x, y, palObj.add('#101010'));
      break;
    case 'glow':
      for (const [x, y] of edges) canvas.set(x, y, palObj.add(pal.highlight));
      break;
    case 'double':
      for (const [x, y] of edges) {
        canvas.set(x, y, palObj.add(pal.dark));
        // Second ring
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nx = x + dx, ny = y + dy;
          if (!bodyPixels.has(`${nx},${ny}`) && nx >= 0 && nx < canvas.w && ny >= 0 && ny < canvas.h)
            canvas.set(nx, ny, palObj.add(lerpC(fromHex(pal.dark), fromHex(pal.bg), 0.5)));
        }
      }
      break;
    case 'pixel':
      for (const [x, y] of edges) {
        if ((x + y) % 2 === 0) canvas.set(x, y, palObj.add(pal.dark));
      }
      break;
    case 'rainbow': {
      const rainbowColors = ['#ff0000', '#ff8000', '#ffff00', '#00ff00', '#0080ff', '#ff00ff'];
      for (let i = 0; i < edges.length; i++) {
        const [x, y] = edges[i];
        const c = rainbowColors[(i + frame) % rainbowColors.length];
        canvas.set(x, y, palObj.add(c));
      }
      break;
    }
    case 'fire':
      for (const [x, y] of edges) {
        const flicker = Math.sin(t * Math.PI * 8 + x * 0.5 + y * 0.3) > 0;
        canvas.set(x, y, palObj.add(flicker ? '#ff4020' : '#ff8040'));
      }
      break;
    // â”€â”€ Expansion outlines â”€â”€
    case 'neon_out': {
      const neonOC = [palObj.add('#ff00ff'), palObj.add('#00ffff')];
      for (let i = 0; i < edges.length; i++) {
        const [x, y] = edges[i];
        canvas.set(x, y, neonOC[(i + frame) % 2]);
      }
      break;
    }
    case 'frost_out': {
      const frostOC = palObj.add('#a0e0ff'), iceOC = palObj.add('#60c0e0');
      for (let i = 0; i < edges.length; i++) {
        const [x, y] = edges[i];
        canvas.set(x, y, i % 3 === 0 ? iceOC : frostOC);
      }
      break;
    }
    case 'shadow_out': {
      const shadowOC = palObj.add('#201030');
      for (const [x, y] of edges) {
        canvas.set(x, y, shadowOC);
        if (x + 1 < canvas.w && y + 1 < canvas.h && !bodyPixels.has(`${x + 1},${y + 1}`))
          canvas.set(x + 1, y + 1, shadowOC);
      }
      break;
    }
    case 'glitch_out': {
      const glOC = [palObj.add('#ff0040'), palObj.add('#00ff80'), palObj.add('#4040ff')];
      const shift = (frame % 3) - 1;
      for (const [x, y] of edges) {
        canvas.set(x + shift, y, glOC[0]);
        canvas.set(x, y, glOC[1]);
        canvas.set(x - shift, y, glOC[2]);
      }
      break;
    }
    // — Pro Expansion outlines —
    case 'astral_out': {
      // Mythic: pulsing astral glow with color shift
      const astralColors = [palObj.add('#a060ff'), palObj.add('#60a0ff'), palObj.add('#ff60a0')];
      for (let i = 0; i < edges.length; i++) {
        const [x, y] = edges[i];
        const ci = (i + frame) % 3;
        canvas.set(x, y, astralColors[ci]);
        // Second glow layer
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nx = x + dx, ny = y + dy;
          if (!bodyPixels.has(`${nx},${ny}`) && nx >= 0 && nx < canvas.w && ny >= 0 && ny < canvas.h)
            if ((i + frame) % 5 < 2) canvas.set(nx, ny, astralColors[(ci + 1) % 3]);
        }
      }
      break;
    }
    case 'thin':
      for (let i = 0; i < edges.length; i++) {
        if (i % 2 === 0) { const [x, y] = edges[i]; canvas.set(x, y, palObj.add(pal.dark)); }
      }
      break;
    case 'dotted_out':
      for (let i = 0; i < edges.length; i++) {
        if (i % 3 === 0) { const [x, y] = edges[i]; canvas.set(x, y, palObj.add(pal.dark)); }
      }
      break;
    case 'wavy_out': {
      const wavyC = palObj.add(pal.dark);
      for (const [x, y] of edges) {
        const offset = Math.round(Math.sin(x * 0.8 + t * Math.PI * 4) * 1);
        const ny = y + offset;
        if (ny >= 0 && ny < canvas.h) canvas.set(x, ny, wavyC);
      }
      break;
    }
    case 'electric_out': {
      const eOutC = palObj.add('#ffff40'), eOutDim = palObj.add('#cccc20');
      for (let i = 0; i < edges.length; i++) {
        const [x, y] = edges[i];
        const c = Math.sin(t * Math.PI * 10 + i * 0.7) > 0 ? eOutC : eOutDim;
        canvas.set(x, y, c);
      }
      break;
    }
    case 'chain_out': {
      const chainC = palObj.add('#808080'), chainHL = palObj.add('#c0c0c0');
      for (let i = 0; i < edges.length; i++) {
        const [x, y] = edges[i];
        canvas.set(x, y, i % 4 < 2 ? chainC : chainHL);
      }
      break;
    }
    case 'drip_out': {
      const dripC = palObj.add(pal.dark);
      for (const [x, y] of edges) {
        canvas.set(x, y, dripC);
        // Drip down from bottom edges
        if (y > baseY) {
          const dripLen = 1 + (x + frame) % 3;
          for (let d = 1; d <= dripLen; d++) {
            if (y + d < canvas.h) canvas.set(x, y + d, dripC);
          }
        }
      }
      break;
    }
    case 'toxic_out': {
      const toxOC = palObj.add('#80ff20'), toxOD = palObj.add('#40c010');
      for (let i = 0; i < edges.length; i++) {
        const [x, y] = edges[i];
        canvas.set(x, y, Math.sin(t * Math.PI * 6 + i * 0.5) > 0 ? toxOC : toxOD);
      }
      break;
    }
    case 'holo_out': {
      const holoColors = ['#ff0080', '#00ff80', '#0080ff', '#ff8000', '#8000ff', '#00ffff'];
      for (let i = 0; i < edges.length; i++) {
        const [x, y] = edges[i];
        canvas.set(x, y, palObj.add(holoColors[(i + frame * 2) % holoColors.length]));
      }
      break;
    }

  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PUBLIC API
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export interface CreatureTraits {
  body: string;
  bodyName: string;
  color: string;
  colorName: string;
  eyes: string;
  eyesName: string;
  mouth: string;
  mouthName: string;
  headgear: string;
  headgearName: string;
  item: string;
  itemName: string;
  background: string;
  backgroundName: string;
  pattern: string;
  patternName: string;
  aura: string;
  auraName: string;
  animation: string;
  animationName: string;
  companion: string;
  companionName: string;
  outline: string;
  outlineName: string;
  rarity: CreatureRarity;
}

/** Resolve traits from a seed without rendering. Used for metadata. */
export function resolveTraits(seed: number, badgeId?: string): CreatureTraits {
  const profile = badgeId ? BADGE_RARITY_PROFILE[badgeId] : undefined;
  const rand = mulberry32(seed);
  const bodyDef = weightedPick(BODY_SHAPES, rand);
  const colorPal = weightedPick(COLOR_PALETTES, rand);
  const eyeDef = weightedPick(EYES, rand);
  const mouthDef = weightedPick(MOUTHS, rand);
  const headDef = weightedPick(HEADGEAR, rand);
  const itemDef = weightedPick(HELD_ITEMS, rand);
  const bgDef = weightedPick(BACKGROUNDS, rand);
  const patternDef = weightedPick(PATTERNS, rand);
  const auraDef = weightedPick(AURAS, rand);
  const animDef = weightedPick(ANIMATIONS, rand);
  const compDef = weightedPick(COMPANIONS, rand);
  const outlineDef = weightedPick(OUTLINES, rand);
  const rarity = computeRarity(
    [bodyDef, colorPal, eyeDef, mouthDef, headDef, itemDef, bgDef, patternDef, auraDef, animDef, compDef, outlineDef],
    profile,
    rand(),
  );

  return {
    body: bodyDef.id, bodyName: bodyDef.name,
    color: colorPal.id, colorName: colorPal.name,
    eyes: eyeDef.id, eyesName: eyeDef.name,
    mouth: mouthDef.id, mouthName: mouthDef.name,
    headgear: headDef.id, headgearName: headDef.name,
    item: itemDef.id, itemName: itemDef.name,
    background: bgDef.id, backgroundName: bgDef.name,
    pattern: patternDef.id, patternName: patternDef.name,
    aura: auraDef.id, auraName: auraDef.name,
    animation: animDef.id, animationName: animDef.name,
    companion: compDef.id, companionName: compDef.name,
    outline: outlineDef.id, outlineName: outlineDef.name,
    rarity,
  };
}

/** Generate a complete animated GIF buffer and traits for a creature. */
export function generateCreatureGif(seed: number, badgeId?: string, opts?: { transparent?: boolean }): { gif: Buffer; traits: CreatureTraits } {
  const SRC = 48, SCALE = 10, W = SRC * SCALE, H = SRC * SCALE;
  const totalFrames = 24, delayCs = 6;
  const wantTransparent = opts?.transparent === true;
  // Index 0 is always black (added first in PalBuilder); we'll use it as transparency key.

  const profile = badgeId ? BADGE_RARITY_PROFILE[badgeId] : undefined;
  const rand = mulberry32(seed);
  const bodyDef = weightedPick(BODY_SHAPES, rand);
  const colorPal = weightedPick(COLOR_PALETTES, rand);
  const eyeDef = weightedPick(EYES, rand);
  const mouthDef = weightedPick(MOUTHS, rand);
  const headDef = weightedPick(HEADGEAR, rand);
  const itemDef = weightedPick(HELD_ITEMS, rand);
  const bgDef = weightedPick(BACKGROUNDS, rand);
  const patternDef = weightedPick(PATTERNS, rand);
  const auraDef = weightedPick(AURAS, rand);
  const animDef = weightedPick(ANIMATIONS, rand);
  const compDef = weightedPick(COMPANIONS, rand);
  const outlineDef = weightedPick(OUTLINES, rand);
  const rarity = computeRarity(
    [bodyDef, colorPal, eyeDef, mouthDef, headDef, itemDef, bgDef, patternDef, auraDef, animDef, compDef, outlineDef],
    profile,
    rand(),
  );

  const palObj = new PalBuilder();
  palObj.add(0); palObj.add('#ffffff');

  // Render all frames at 48Ã-48
  const frames: Uint8Array[] = [];
  for (let f = 0; f < totalFrames; f++) {
    const src = new Canvas(SRC, SRC);
    const { bounceY, offsetX } = computeAnimation(animDef, f, totalFrames);
    if (wantTransparent) {
      src.clear(0); // index 0 = transparency key
    } else {
      drawBackground(src, bgDef, colorPal, palObj, f, totalFrames);
    }
    // Snapshot background so offsetX / glitch only shifts creature, not bg
    const bgSnap = new Uint8Array(src.data);
    drawBody(src, bodyDef, colorPal, palObj, bounceY);
    drawOutline(src, outlineDef, colorPal, palObj, bounceY, f, totalFrames);
    drawPattern(src, patternDef, colorPal, palObj, bounceY);
    drawEyes(src, eyeDef, colorPal, palObj, bounceY, f, totalFrames);
    drawMouth(src, mouthDef, colorPal, palObj, bounceY, f, totalFrames);
    drawHeadgear(src, headDef, colorPal, palObj, bounceY);
    drawHeldItem(src, itemDef, colorPal, palObj, bounceY, f);
    drawAura(src, auraDef, colorPal, palObj, bounceY, f, totalFrames);
    drawCompanion(src, compDef, colorPal, palObj, bounceY, f, totalFrames);

    // Apply offsetX: shift only creature pixels (background stays static)
    if (offsetX !== 0) {
      const result = new Uint8Array(bgSnap); // start from clean background
      for (let y = 0; y < SRC; y++)
        for (let x = 0; x < SRC; x++) {
          const px = src.data[y * SRC + x];
          const bg = bgSnap[y * SRC + x];
          if (px !== bg) { // this pixel is creature/effect, not background
            const nx = x + offsetX;
            if (nx >= 0 && nx < SRC) result[y * SRC + nx] = px;
          }
        }
      src.data.set(result);
    }

    // Apply glitch scanline tearing for glitch animation
    if (animDef.id === 'glitch') {
      const glitchSeed = (f * 17 + 31) & 0xFF;
      const isGlitchFrame = f % 3 === 0 || f % 7 < 2;
      if (isGlitchFrame) {
        const result = new Uint8Array(src.data);
        // Tear 3-6 scanlines by shifting them horizontally
        const tearCount = 3 + (glitchSeed % 4);
        for (let ti = 0; ti < tearCount; ti++) {
          const tearY = ((glitchSeed * (ti + 1) * 7 + ti * 13) % (SRC - 4)) + 2;
          const tearShift = ((glitchSeed * (ti + 3)) % 9) - 4; // -4 to +4
          const tearHeight = 1 + (glitchSeed + ti) % 3; // 1-3 rows tall
          for (let dy = 0; dy < tearHeight; dy++) {
            const y = tearY + dy;
            if (y >= SRC) break;
            for (let x = 0; x < SRC; x++) {
              const sx = x - tearShift;
              if (sx >= 0 && sx < SRC) {
                result[y * SRC + x] = src.data[y * SRC + sx];
              }
            }
          }
        }
        // Corrupt a few random pixels with palette neighbor colors
        const corruptCount = 4 + (glitchSeed % 8);
        for (let ci = 0; ci < corruptCount; ci++) {
          const cx = ((glitchSeed * (ci + 1) * 11) % SRC);
          const cy = ((glitchSeed * (ci + 1) * 7 + 5) % SRC);
          const orig = result[cy * SRC + cx];
          result[cy * SRC + cx] = (orig + 2 + ci) % Math.max(1, palObj.count());
        }
        src.data.set(result);
      }
    }

    // ── Post-processing pixel effects (at most one fires per animation) ──

    // Spin: squash-stretch-flip → paper-cutout rotation
    if (animDef.id === 'spin') {
      const cosP = Math.cos(f / totalFrames * Math.PI * 2);
      const scaleW = Math.max(0.15, Math.abs(cosP));
      const flipH = cosP < 0;
      const spBuf = new Uint8Array(bgSnap);
      const spCx = SRC >> 1;
      for (let y = 0; y < SRC; y++)
        for (let dx = 0; dx < SRC; dx++) {
          const rel = dx - spCx;
          const mapped = Math.round(rel / scaleW);
          const sx2 = flipH ? spCx - mapped : spCx + mapped;
          if (sx2 < 0 || sx2 >= SRC) continue;
          const px = src.data[y * SRC + sx2];
          const bg = bgSnap[y * SRC + sx2];
          if (px !== bg) spBuf[y * SRC + dx] = px;
        }
      src.data.set(spBuf);
    }

    // Smoke puff: rising smoke particle clusters above creature
    if (animDef.id === 'smoke_puff') {
      const smkL = palObj.add('#cccccc');
      const smkD = palObj.add('#888888');
      let crTop = SRC;
      for (let y = 0; y < SRC && crTop === SRC; y++)
        for (let x = 6; x < SRC - 6; x++)
          if (src.data[y * SRC + x] !== bgSnap[y * SRC + x]) { crTop = y; break; }
      for (let p = 0; p < 8; p++) {
        const age = ((f + p * 4) % 18) / 18;
        const spx = (SRC >> 1) + Math.round(Math.sin(p * 2.1 + age * 5) * (2 + age * 10));
        const spy = crTop - 1 - Math.round(age * 15);
        if (spy < 0 || spy >= SRC || spx < 2 || spx >= SRC - 2) continue;
        const col = age < 0.4 ? smkL : smkD;
        const sz = age < 0.25 ? 4 : age < 0.55 ? 3 : 2;
        for (let dy = 0; dy < Math.min(sz, 3); dy++)
          for (let dxx = 0; dxx < sz; dxx++) {
            const fx = spx + dxx - (sz >> 1), fy = spy + dy;
            if (fx >= 0 && fx < SRC && fy >= 0 && fy < SRC)
              src.data[fy * SRC + fx] = col;
          }
      }
    }

    // Phase: scanline ghosting — creature flickers translucent
    if (animDef.id === 'phase') {
      const phStr = Math.abs(Math.sin(f / totalFrames * Math.PI * 2));
      const skipN = phStr > 0.7 ? 2 : phStr > 0.3 ? 3 : 5;
      for (let y = 0; y < SRC; y++)
        if (y % skipN === (f % skipN))
          for (let x = 0; x < SRC; x++) src.data[y * SRC + x] = bgSnap[y * SRC + x];
    }

    // Warp: sinusoidal column distortion (wavy heat-haze)
    if (animDef.id === 'warp') {
      const wBuf = new Uint8Array(bgSnap);
      const wT = f / totalFrames;
      for (let x = 0; x < SRC; x++) {
        const shift = Math.round(Math.sin(wT * Math.PI * 4 + x * 0.45) * 2.5);
        for (let y = 0; y < SRC; y++) {
          const sy = y - shift;
          if (sy >= 0 && sy < SRC) {
            const px = src.data[sy * SRC + x];
            const bg = bgSnap[sy * SRC + x];
            if (px !== bg) wBuf[y * SRC + x] = px;
          }
        }
      }
      src.data.set(wBuf);
    }

    // Breathe: vertical stretch / compress (inhale → taller, exhale → shorter)
    if (animDef.id === 'breathe') {
      const bSc = 1.0 + Math.sin(f / totalFrames * Math.PI * 2) * 0.15;
      let bT2 = SRC, bB2 = 0;
      for (let y = 0; y < SRC; y++)
        for (let x = 0; x < SRC; x++)
          if (src.data[y * SRC + x] !== bgSnap[y * SRC + x]) {
            if (y < bT2) bT2 = y; if (y > bB2) bB2 = y;
          }
      if (bT2 < bB2) {
        const bMid = (bT2 + bB2) >> 1;
        const bBuf = new Uint8Array(bgSnap);
        for (let y = 0; y < SRC; y++) {
          const sY = Math.round(bMid + (y - bMid) / bSc);
          if (sY < 0 || sY >= SRC) continue;
          for (let x = 0; x < SRC; x++) {
            const px = src.data[sY * SRC + x];
            const bg = bgSnap[sY * SRC + x];
            if (px !== bg) bBuf[y * SRC + x] = px;
          }
        }
        src.data.set(bBuf);
      }
    }

    // Teleport: pixel dissolution when creature teleports
    if (animDef.id === 'teleport' && (f % 12 < 2)) {
      for (let y = 0; y < SRC; y++)
        for (let x = 0; x < SRC; x++)
          if (src.data[y * SRC + x] !== bgSnap[y * SRC + x])
            if (((x * 7 + y * 13 + f * 31) & 3) < 2)
              src.data[y * SRC + x] = bgSnap[y * SRC + x];
    }

    // Moonwalk: flip creature horizontally for return trip
    if (animDef.id === 'moonwalk') {
      const mwT = f / totalFrames;
      if (mwT >= 0.5) {
        // Find creature bounding box
        let mwL = SRC, mwR = 0;
        for (let y = 0; y < SRC; y++)
          for (let x = 0; x < SRC; x++)
            if (src.data[y * SRC + x] !== bgSnap[y * SRC + x]) {
              if (x < mwL) mwL = x; if (x > mwR) mwR = x;
            }
        if (mwL < mwR) {
          const mwBuf = new Uint8Array(bgSnap);
          const mwCx = (mwL + mwR) >> 1;
          for (let y = 0; y < SRC; y++)
            for (let x = mwL; x <= mwR; x++) {
              const px = src.data[y * SRC + x];
              if (px !== bgSnap[y * SRC + x]) {
                const fx = mwCx - (x - mwCx);
                if (fx >= 0 && fx < SRC) mwBuf[y * SRC + fx] = px;
              }
            }
          src.data.set(mwBuf);
        }
      }
    }

    // Dash: motion-blur trail behind creature during burst phase
    if (animDef.id === 'dash') {
      const dashPh = (f / totalFrames * 4) % 1;
      if (dashPh < 0.3) {
        const trailCol = palObj.add('#555555');
        const dashSnap = new Uint8Array(src.data);
        for (let off = 2; off <= 6; off += 2)
          for (let y = 0; y < SRC; y++)
            for (let x = 0; x < SRC; x++) {
              if (dashSnap[y * SRC + x] !== bgSnap[y * SRC + x]) {
                const tx = x - off;
                if (tx >= 0 && dashSnap[y * SRC + tx] === bgSnap[y * SRC + tx])
                  src.data[y * SRC + tx] = trailCol;
              }
            }
      }
    }

    // Nearest-neighbor upscale â†' 480Ã-480
    const upscaled = new Uint8Array(W * H);
    for (let y = 0; y < SRC; y++)
      for (let x = 0; x < SRC; x++) {
        const idx = src.data[y * SRC + x];
        for (let sy = 0; sy < SCALE; sy++)
          for (let sx = 0; sx < SCALE; sx++)
            upscaled[(y * SCALE + sy) * W + (x * SCALE + sx)] = idx;
      }
    frames.push(upscaled);
  }

  const finalPal = palObj.finalize();
  const buf = Buffer.alloc(W * H * totalFrames * 5);
  const gif = new GifWriter(buf, W, H, { loop: 0, palette: finalPal });
  for (let f = 0; f < totalFrames; f++) {
    gif.addFrame(0, 0, W, H, frames[f], { delay: delayCs, disposal: 2, ...(wantTransparent ? { transparent: 0 } : {}) });
  }
  const gifSize = gif.end();

  const traits: CreatureTraits = {
    body: bodyDef.id, bodyName: bodyDef.name,
    color: colorPal.id, colorName: colorPal.name,
    eyes: eyeDef.id, eyesName: eyeDef.name,
    mouth: mouthDef.id, mouthName: mouthDef.name,
    headgear: headDef.id, headgearName: headDef.name,
    item: itemDef.id, itemName: itemDef.name,
    background: bgDef.id, backgroundName: bgDef.name,
    pattern: patternDef.id, patternName: patternDef.name,
    aura: auraDef.id, auraName: auraDef.name,
    animation: animDef.id, animationName: animDef.name,
    companion: compDef.id, companionName: compDef.name,
    outline: outlineDef.id, outlineName: outlineDef.name,
    rarity,
  };

  return { gif: Buffer.from(buf.buffer, buf.byteOffset, gifSize), traits };
}

/**
 * Generate Metaplex-compatible metadata JSON for a creature.
 */
export function generateCreatureMetadata(
  wallet: string,
  badgeId: string,
  badgeName: string,
  baseUrl: string,
  seedSalt?: string,
): {
  name: string;
  symbol: string;
  description: string;
  image: string;
  animation_url: string;
  external_url: string;
  attributes: Array<{ trait_type: string; value: string }>;
  properties: {
    files: Array<{ uri: string; type: string }>;
    category: string;
    creators: Array<{ address: string; share: number }>;
  };
} {
  const seed = creatureSeed(wallet, badgeId, seedSalt);
  const traits = resolveTraits(seed, badgeId);
  const creatureName = generateCreatureName(seed);
  const imageUrl = `${baseUrl}/api/v1/creatures/image/${wallet}/${badgeId}.gif`;

  return {
    name: creatureName,
    symbol: 'BURNSPIRIT',
    description: `A ${traits.rarity} Burn Spirit creature earned by reaching the ${badgeName} milestone in Seeker Burn Club. ${traits.bodyName} with ${traits.eyesName}, ${traits.mouthName}, ${traits.headgearName}.`,
    image: imageUrl,
    animation_url: imageUrl,
    external_url: 'https://seekerburnclub.xyz',
    attributes: [
      { trait_type: 'Body', value: traits.bodyName },
      { trait_type: 'Color', value: traits.colorName },
      { trait_type: 'Eyes', value: traits.eyesName },
      { trait_type: 'Mouth', value: traits.mouthName },
      { trait_type: 'Headgear', value: traits.headgearName },
      { trait_type: 'Held Item', value: traits.itemName },
      { trait_type: 'Background', value: traits.backgroundName },
      { trait_type: 'Pattern', value: traits.patternName },
      { trait_type: 'Aura', value: traits.auraName },
      { trait_type: 'Animation', value: traits.animationName },
      { trait_type: 'Companion', value: traits.companionName },
      { trait_type: 'Outline', value: traits.outlineName },
      { trait_type: 'Rarity', value: traits.rarity },
      { trait_type: 'Milestone', value: badgeName },
      { trait_type: 'Badge', value: badgeId },
    ],
    properties: {
      files: [{ uri: imageUrl, type: 'image/gif' }],
      category: 'image',
      creators: [{ address: wallet, share: 100 }],
    },
  };
}

