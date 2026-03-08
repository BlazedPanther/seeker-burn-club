/**
 * Badge NFT artwork - Seeker Burn Club
 *
 * Clean pixel-art emblems. No text, no frames, no labels.
 * Rarity is communicated purely through color intensity and glow.
 * Each badge is a unique 400×400 SVG icon on an 8px pixel grid.
 *
 * Rarity tiers (thematic):
 *   GLUT · FUNKE · FLAMME · INFERNO · HOELLISCH · SUPERNOVA · ASCHE-GOTT · ENTROPIE
 */

import { env } from '../config/env.js';
import { BADGE_DEFINITIONS, getBadgeById } from './badges.js';

// Palette

interface Palette {
  bg1: string;
  bg2: string;
  accent: string;
  glow: string;
  primary: string;
  secondary: string;
  highlight: string;
  dark: string;
  rarity: string;
  glowRadius: number;
  glowOpacity: number;
  stars: number;
}

const PALETTES: Record<string, Palette> = {
  // STREAK BADGES
  STREAK_1: {
    bg1: '#1a0c04', bg2: '#0d0602',
    accent: '#ff6600', glow: '#ff440066',
    primary: '#ff7722', secondary: '#ffaa33', highlight: '#ffdd66', dark: '#992200',
    rarity: 'GLUT', glowRadius: 0, glowOpacity: 0, stars: 0,
  },
  STREAK_3: {
    bg1: '#1c0e04', bg2: '#0e0702',
    accent: '#ff8833', glow: '#ff660066',
    primary: '#ff8833', secondary: '#ffbb44', highlight: '#ffee77', dark: '#aa3300',
    rarity: 'GLUT', glowRadius: 2, glowOpacity: 0.08, stars: 2,
  },
  STREAK_7: {
    bg1: '#0c1020', bg2: '#060810',
    accent: '#5599ff', glow: '#4488ff44',
    primary: '#5599ff', secondary: '#88bbff', highlight: '#bbddff', dark: '#223388',
    rarity: 'FUNKE', glowRadius: 4, glowOpacity: 0.12, stars: 3,
  },
  STREAK_14: {
    bg1: '#0c1222', bg2: '#060810',
    accent: '#77aaff', glow: '#6699ff44',
    primary: '#77aaff', secondary: '#99ccff', highlight: '#ccddff', dark: '#224499',
    rarity: 'FUNKE', glowRadius: 5, glowOpacity: 0.15, stars: 4,
  },
  STREAK_21: {
    bg1: '#1a0e06', bg2: '#0e0800',
    accent: '#ff9933', glow: '#ff880044',
    primary: '#ff9933', secondary: '#ffbb55', highlight: '#ffdd88', dark: '#884400',
    rarity: 'FLAMME', glowRadius: 6, glowOpacity: 0.18, stars: 5,
  },
  STREAK_30: {
    bg1: '#1a1400', bg2: '#0d0a00',
    accent: '#ffcc00', glow: '#ffaa0044',
    primary: '#ffcc00', secondary: '#ffdd44', highlight: '#ffee88', dark: '#886600',
    rarity: 'FLAMME', glowRadius: 8, glowOpacity: 0.2, stars: 6,
  },
  STREAK_60: {
    bg1: '#14082a', bg2: '#0a0418',
    accent: '#aa55ff', glow: '#9944ee44',
    primary: '#aa55ff', secondary: '#cc88ff', highlight: '#eeccff', dark: '#441188',
    rarity: 'INFERNO', glowRadius: 10, glowOpacity: 0.22, stars: 8,
  },
  STREAK_90: {
    bg1: '#180a2e', bg2: '#0c0518',
    accent: '#cc44ff', glow: '#bb33ee55',
    primary: '#cc44ff', secondary: '#dd77ff', highlight: '#eebbff', dark: '#551199',
    rarity: 'INFERNO', glowRadius: 12, glowOpacity: 0.25, stars: 10,
  },
  STREAK_180: {
    bg1: '#1a0a00', bg2: '#0d0500',
    accent: '#ffaa00', glow: '#ff880055',
    primary: '#ffaa00', secondary: '#ffcc33', highlight: '#ffee66', dark: '#774400',
    rarity: 'HOELLISCH', glowRadius: 14, glowOpacity: 0.3, stars: 12,
  },
  STREAK_365: {
    bg1: '#001818', bg2: '#000c0c',
    accent: '#00ffcc', glow: '#00ffaa55',
    primary: '#00ffcc', secondary: '#55ffdd', highlight: '#aaffee', dark: '#005544',
    rarity: 'HOELLISCH', glowRadius: 16, glowOpacity: 0.35, stars: 14,
  },
  STREAK_500: {
    bg1: '#0a0520', bg2: '#050010',
    accent: '#ff00ff', glow: '#ee00ee55',
    primary: '#ff22ff', secondary: '#ff77ff', highlight: '#ffbbff', dark: '#660066',
    rarity: 'SUPERNOVA', glowRadius: 18, glowOpacity: 0.38, stars: 16,
  },
  STREAK_730: {
    bg1: '#000e1a', bg2: '#00060e',
    accent: '#00ddff', glow: '#00ccee55',
    primary: '#00ddff', secondary: '#55eeff', highlight: '#aaf4ff', dark: '#004466',
    rarity: 'SUPERNOVA', glowRadius: 20, glowOpacity: 0.4, stars: 18,
  },
  STREAK_1000: {
    bg1: '#0f000f', bg2: '#080008',
    accent: '#ff44ff', glow: '#ff00ff66',
    primary: '#ff44ff', secondary: '#ff88ff', highlight: '#ffccff', dark: '#550055',
    rarity: 'ASCHE-GOTT', glowRadius: 24, glowOpacity: 0.45, stars: 22,
  },
  STREAK_1500: {
    bg1: '#0a0a0a', bg2: '#000000',
    accent: '#ffffff', glow: '#ffffff55',
    primary: '#ffffff', secondary: '#dddddd', highlight: '#ffffff', dark: '#555555',
    rarity: 'ENTROPIE', glowRadius: 28, glowOpacity: 0.5, stars: 30,
  },

  // LIFETIME BURN BADGES
  BURN_10: {
    bg1: '#0e1018', bg2: '#060810',
    accent: '#4488cc', glow: '#33669944',
    primary: '#4488cc', secondary: '#66aaee', highlight: '#99ccff', dark: '#223366',
    rarity: 'GLUT', glowRadius: 0, glowOpacity: 0, stars: 0,
  },
  BURN_50: {
    bg1: '#081a14', bg2: '#040e0a',
    accent: '#22cc88', glow: '#11aa6644',
    primary: '#22cc88', secondary: '#55ddaa', highlight: '#88eedd', dark: '#0a6644',
    rarity: 'FUNKE', glowRadius: 4, glowOpacity: 0.12, stars: 3,
  },
  BURN_100: {
    bg1: '#120820', bg2: '#080410',
    accent: '#9944dd', glow: '#7733bb44',
    primary: '#9944dd', secondary: '#bb77ff', highlight: '#ddaaff', dark: '#442266',
    rarity: 'FLAMME', glowRadius: 7, glowOpacity: 0.18, stars: 5,
  },
  BURN_500: {
    bg1: '#1a0814', bg2: '#0e040a',
    accent: '#ff3399', glow: '#dd117744',
    primary: '#ff3399', secondary: '#ff77bb', highlight: '#ffaadd', dark: '#771144',
    rarity: 'INFERNO', glowRadius: 10, glowOpacity: 0.22, stars: 8,
  },
  BURN_1000: {
    bg1: '#1a1200', bg2: '#0d0a00',
    accent: '#ffaa00', glow: '#ff880044',
    primary: '#ffaa00', secondary: '#ffcc44', highlight: '#ffee88', dark: '#775500',
    rarity: 'HOELLISCH', glowRadius: 13, glowOpacity: 0.28, stars: 10,
  },
  BURN_2500: {
    bg1: '#1a0610', bg2: '#0e0308',
    accent: '#ff2288', glow: '#dd006655',
    primary: '#ff2288', secondary: '#ff66aa', highlight: '#ff99cc', dark: '#880044',
    rarity: 'HOELLISCH', glowRadius: 14, glowOpacity: 0.3, stars: 11,
  },
  BURN_5000: {
    bg1: '#1a0e00', bg2: '#0d0800',
    accent: '#ff9900', glow: '#ff770055',
    primary: '#ff9900', secondary: '#ffbb33', highlight: '#ffdd66', dark: '#884400',
    rarity: 'HOELLISCH', glowRadius: 15, glowOpacity: 0.32, stars: 12,
  },
  BURN_10000: {
    bg1: '#100a00', bg2: '#080500',
    accent: '#ffcc00', glow: '#ffaa0055',
    primary: '#ffcc00', secondary: '#ffdd44', highlight: '#ffee88', dark: '#886600',
    rarity: 'SUPERNOVA', glowRadius: 18, glowOpacity: 0.35, stars: 15,
  },
  BURN_25000: {
    bg1: '#08000f', bg2: '#040008',
    accent: '#aa00ff', glow: '#8800dd55',
    primary: '#aa00ff', secondary: '#cc55ff', highlight: '#dd99ff', dark: '#440088',
    rarity: 'SUPERNOVA', glowRadius: 20, glowOpacity: 0.38, stars: 16,
  },
  BURN_50000: {
    bg1: '#0f0005', bg2: '#080002',
    accent: '#ff0044', glow: '#ff002255',
    primary: '#ff0044', secondary: '#ff4477', highlight: '#ff88aa', dark: '#770022',
    rarity: 'ASCHE-GOTT', glowRadius: 22, glowOpacity: 0.4, stars: 20,
  },
  BURN_100000: {
    bg1: '#0f0f00', bg2: '#080800',
    accent: '#ffee00', glow: '#ffdd0066',
    primary: '#ffee00', secondary: '#ffff55', highlight: '#ffff99', dark: '#887700',
    rarity: 'ASCHE-GOTT', glowRadius: 25, glowOpacity: 0.45, stars: 25,
  },
  BURN_250000: {
    bg1: '#050010', bg2: '#020008',
    accent: '#bb55ff', glow: '#9933dd66',
    primary: '#bb55ff', secondary: '#dd88ff', highlight: '#eeccff', dark: '#441188',
    rarity: 'ENTROPIE', glowRadius: 26, glowOpacity: 0.48, stars: 30,
  },
  BURN_500000: {
    bg1: '#000808', bg2: '#000404',
    accent: '#00ffcc', glow: '#00ddaa66',
    primary: '#00ffcc', secondary: '#55ffdd', highlight: '#aaffee', dark: '#005544',
    rarity: 'ENTROPIE', glowRadius: 28, glowOpacity: 0.5, stars: 35,
  },
  BURN_1000000: {
    bg1: '#0a0a0a', bg2: '#000000',
    accent: '#ffffff', glow: '#ffffff66',
    primary: '#ffffff', secondary: '#dddddd', highlight: '#ffffff', dark: '#666666',
    rarity: 'ENTROPIE', glowRadius: 30, glowOpacity: 0.55, stars: 50,
  },

  // DAILY VOLUME BADGES
  DAILY_25: {
    bg1: '#0a1608', bg2: '#050e04',
    accent: '#66dd33', glow: '#44bb1144',
    primary: '#66dd33', secondary: '#88ff55', highlight: '#bbff88', dark: '#225500',
    rarity: 'FUNKE', glowRadius: 3, glowOpacity: 0.1, stars: 2,
  },
  DAILY_100: {
    bg1: '#081408', bg2: '#040a04',
    accent: '#44ee44', glow: '#22cc2244',
    primary: '#44ee44', secondary: '#77ff77', highlight: '#aaffaa', dark: '#116611',
    rarity: 'FLAMME', glowRadius: 6, glowOpacity: 0.18, stars: 5,
  },
  DAILY_500: {
    bg1: '#061006', bg2: '#030803',
    accent: '#33ff88', glow: '#22dd6655',
    primary: '#33ff88', secondary: '#66ffaa', highlight: '#99ffcc', dark: '#086644',
    rarity: 'INFERNO', glowRadius: 10, glowOpacity: 0.22, stars: 8,
  },
  DAILY_2500: {
    bg1: '#041008', bg2: '#020804',
    accent: '#00ffaa', glow: '#00dd8855',
    primary: '#00ffaa', secondary: '#55ffcc', highlight: '#88ffdd', dark: '#005544',
    rarity: 'HOELLISCH', glowRadius: 14, glowOpacity: 0.3, stars: 12,
  },
  DAILY_10000: {
    bg1: '#040e04', bg2: '#020602',
    accent: '#00ff66', glow: '#00dd4466',
    primary: '#00ff66', secondary: '#44ff88', highlight: '#88ffbb', dark: '#005522',
    rarity: 'SUPERNOVA', glowRadius: 18, glowOpacity: 0.38, stars: 16,
  },

  // BURN COUNT BADGES
  TXCOUNT_10: {
    bg1: '#101016', bg2: '#08080e',
    accent: '#7777cc', glow: '#5555aa44',
    primary: '#7777cc', secondary: '#9999ee', highlight: '#bbbbff', dark: '#333366',
    rarity: 'GLUT', glowRadius: 1, glowOpacity: 0.05, stars: 1,
  },
  TXCOUNT_50: {
    bg1: '#0e0e18', bg2: '#07070e',
    accent: '#9977ee', glow: '#7755cc44',
    primary: '#9977ee', secondary: '#bb99ff', highlight: '#ddbbff', dark: '#442288',
    rarity: 'FUNKE', glowRadius: 5, glowOpacity: 0.14, stars: 4,
  },
  TXCOUNT_100: {
    bg1: '#0c0c1a', bg2: '#060610',
    accent: '#aa66ff', glow: '#8844dd44',
    primary: '#aa66ff', secondary: '#cc88ff', highlight: '#eeccff', dark: '#442277',
    rarity: 'FLAMME', glowRadius: 8, glowOpacity: 0.2, stars: 7,
  },
  TXCOUNT_500: {
    bg1: '#0a0a1c', bg2: '#050510',
    accent: '#bb55ff', glow: '#9933dd55',
    primary: '#bb55ff', secondary: '#dd88ff', highlight: '#eeccff', dark: '#551188',
    rarity: 'INFERNO', glowRadius: 12, glowOpacity: 0.25, stars: 11,
  },
  TXCOUNT_1000: {
    bg1: '#08081e', bg2: '#040410',
    accent: '#cc44ff', glow: '#aa22dd55',
    primary: '#cc44ff', secondary: '#ee77ff', highlight: '#ffaaff', dark: '#660088',
    rarity: 'HOELLISCH', glowRadius: 16, glowOpacity: 0.32, stars: 15,
  },

  // PERFECT MONTH BADGES
  PERFECT_1: {
    bg1: '#141008', bg2: '#0a0804',
    accent: '#ffdd00', glow: '#ffcc0044',
    primary: '#ffdd00', secondary: '#ffee55', highlight: '#ffff99', dark: '#887700',
    rarity: 'FLAMME', glowRadius: 7, glowOpacity: 0.18, stars: 5,
  },
  PERFECT_3: {
    bg1: '#100e06', bg2: '#080702',
    accent: '#ffc800', glow: '#ffa80055',
    primary: '#ffc800', secondary: '#ffdd44', highlight: '#ffee88', dark: '#886600',
    rarity: 'INFERNO', glowRadius: 11, glowOpacity: 0.24, stars: 9,
  },
  PERFECT_6: {
    bg1: '#0e0c04', bg2: '#060602',
    accent: '#ffb800', glow: '#ff990055',
    primary: '#ffb800', secondary: '#ffd044', highlight: '#ffe088', dark: '#774400',
    rarity: 'HOELLISCH', glowRadius: 15, glowOpacity: 0.32, stars: 13,
  },
  PERFECT_12: {
    bg1: '#0a0804', bg2: '#050402',
    accent: '#ffa500', glow: '#ff880066',
    primary: '#ffa500', secondary: '#ffc044', highlight: '#ffdd88', dark: '#663300',
    rarity: 'ASCHE-GOTT', glowRadius: 22, glowOpacity: 0.42, stars: 18,
  },
};

function getPalette(badgeId: string): Palette {
  return PALETTES[badgeId] ?? PALETTES['STREAK_1']!;
}

// Pixel grid renderer

function px(
  art: string[],
  colorMap: Record<string, string>,
  size: number,
  ox: number,
  oy: number,
  opacity = 1,
): string {
  let out = '';
  for (let r = 0; r < art.length; r++) {
    for (let c = 0; c < art[r]!.length; c++) {
      const ch = art[r]![c]!;
      if (ch === '.' || ch === ' ') continue;
      const fill = colorMap[ch] ?? '#8B0000';
      out += `<rect x="${ox + c * size}" y="${oy + r * size}" width="${size}" height="${size}" fill="${fill}"${opacity < 1 ? ` opacity="${opacity.toFixed(2)}"` : ''}/>`;
    }
  }
  return out;
}



// ── Pixel art helpers ─────────────────────────────────────────────────

function midColor(a: string, b: string): string {
  const p = (s: string) => [parseInt(s.slice(1,3),16), parseInt(s.slice(3,5),16), parseInt(s.slice(5,7),16)];
  const ca = p(a), cb = p(b);
  return '#' + ca.map((v,i) => Math.round((v + cb[i]!) / 2).toString(16).padStart(2,'0')).join('');
}

function lerp3(a: string, b: string, t: number): string {
  const p = (s: string) => [parseInt(s.slice(1,3),16), parseInt(s.slice(3,5),16), parseInt(s.slice(5,7),16)];
  const ca = p(a), cb = p(b);
  return '#' + ca.map((v,i) => Math.round(v + (cb[i]! - v) * t).toString(16).padStart(2,'0')).join('');
}

function buildColorMap(p: Palette): Record<string, string> {
  // SBC-strict palette: no white in flames, consistent across all badges.
  const SBC_BG = '#0A0A1E';
  const SBC_Y1 = '#FFE135';
  const SBC_Y2 = '#FFD700';
  const SBC_O1 = '#FFA500';
  const SBC_O2 = '#FF6600';
  const SBC_R1 = '#FF4500';
  const SBC_R2 = '#DC143C';
  const SBC_D1 = '#8B0000';
  const SBC_D2 = '#4D0000';

  void p;

  return {
    W: SBC_Y1,
    w: SBC_Y2,
    H: SBC_Y1,
    h: SBC_Y2,
    L: SBC_Y2,
    P: SBC_O1,
    p: SBC_O2,
    M: SBC_O2,
    S: SBC_R1,
    s: SBC_R2,
    T: SBC_R2,
    D: SBC_D1,
    d: SBC_D2,
    A: SBC_O2,
    a: SBC_R1,
    I: SBC_D1,
    G: SBC_BG,
    X: '#000000',
    E: SBC_D2,
    '.': '',
  };
}

/** Centre pixel art on the 400×400 canvas. sz=10 gives 40×40 grid. */
function centered(art: string[], cm: Record<string, string>, sz = 10): string {
  const w = Math.max(...art.map(r => r.length));
  const h = art.length;
  const ox = Math.round((400 - w * sz) / 2);
  const oy = Math.round((400 - h * sz) / 2);
  return px(art, cm, sz, ox, oy);
}


// ── Badge artwork ── hand-crafted pixel art emblems ─────────────────

function badgeArt(badgeId: string, p: Palette): string {
  const cm = buildColorMap(p);

  switch (badgeId) {

    // ═══ STREAK BADGES ── fire evolution (14) ═══════════════════════

    case 'STREAK_1': // First Flame
      return centered([
        '.......H.......',
        '......HHH......',
        '.....HHLHH.....',
        '....HHLPPH.....',
        '....HLPSSTH....',
        '...HLPSSSSTH...',
        '...HLPSTTDTH...',
        '..HLPSTDDDTH...',
        '..HPSSTDDDDH...',
        '..HPSTDDDDD....',
        '...PSTDDDD.....',
        '...PSTDDD......',
        '...ASTTDA......',
        '..AATTTDAA.....',
        '..AADDDDDA.....',
        '...DDDDD.......',
        '...EEEEE.......',
      ], cm);

    case 'STREAK_3': // Kindling
      return centered([
        '...H...........H....',
        '..HHH.........HHH...',
        '..HLPH.......HPLH...',
        '.HLPSTH.....HTSPLH..',
        '.HLPSSTH...HTSSPLH..',
        '..HPSSTTH.HTTSSPH...',
        '...HPSTDDHDDTSPH....',
        '....HPSTDDDDTSPH....',
        '.....HPSTDDTSPH.....',
        '......HPSTTSPH......',
        '.......HPSSPH.......',
        '......AAHSSHAA......',
        '.....AAATTTAAA......',
        '....AAADDDDAAA......',
        '...DDDDDDDDDDDD.....',
        '...EEEEEEEEEEEE.....',
      ], cm);

    case 'STREAK_7': // Torch Bearer
      return centered([
        '........H........',
        '.......HHH.......',
        '......HLPH.......',
        '......HLPSH......',
        '.....HLPSTH......',
        '.....HLPSSTH.....',
        '.....HPSSTDH.....',
        '.....HPSTDDH.....',
        '......PSTDD......',
        '......PSTTD......',
        '......APTTDA.....',
        '....AAAAAAA......',
        '...AAAAAAA.......',
        '......SSSS.......',
        '......STTS.......',
        '......TTTT.......',
        '......TDDT.......',
        '......DDDD.......',
        '......DDDD.......',
        '.....DDDDDD......',
        '.....EEEEEE......',
      ], cm);

    case 'STREAK_14': // Furnace
      return centered([
        '..AAAAAAAAAAAAAAAA..',
        '.ADDDDDDDDDDDDDDDA.',
        '.ADDDDDDDDDDDDDDA.',
        '.AD..............DA.',
        '.AD....EEEEE.....DA.',
        '.AD..EEEEEEEEE..DA.',
        '.AD.EE.WHHHHW.EEDA.',
        '.AD.E.WHHHLPPW.EDA.',
        '.AD.E.HHLPPSSWEDA.',
        '.AD.E.HLPPSSTWEDA.',
        '.AD.EWLPPSTTDWEDA.',
        '.AD.EWPPSSTDEWEDA.',
        '.AD.E.PSSTDDW.EDA.',
        '.AD.E.PSSTDDW.EDA.',
        '.AD.EE.SSTDEW.EDA.',
        '.AD..EEESTDEEEDA.',
        '.AD...EEEDEEEE.DA.',
        '.AD............DA.',
        '.ADDDDDDDDDDDDDDA.',
        '.ADDDDDDDDDDDDDDDA.',
        '..AAAAAAAAAAAAAAAA..',
      ], cm);

    case 'STREAK_21': // Forge (anvil + sparks)
      return centered([
        '..H...........H..L...',
        '....H.....H........H.',
        '.......H.......H.....',
        'H.......L...H........',
        '...PPPPPPPPPPPPPP....',
        '..PPPSSSSSSSSSSPPP...',
        '..PPSSSTTTTTTSSPPA...',
        'AAPPSSSTTTTTTSPPAA...',
        'AAPPSSSTTTTTTSSPAA...',
        '.AAPSSTTTTDDTTSPAA...',
        '..PPSSTTTDDDTSSPP....',
        '...PSSTTDDDDDSSPP....',
        '....SSTTDDDDTSSPPP...',
        '.....SSTTDDDTSSPP....',
        '......TTTDDTTTPP.....',
        '.....TTTDDDDTTT......',
        '....DDDDDDDDDDDD.....',
        '...DDDDDDDDDDDDDD....',
        '..EEEEEEEEEEEEEEEE...',
      ], cm);

    case 'STREAK_30': // Inferno (fire wall)
      return centered([
        '...........H.H...........',
        '..........HH.HH..........',
        '.........HHL.LHH.........',
        '........HHLP.PLHH........',
        '.......HHLPP.PPLHH.......',
        '.....HHHLPSSTTTSLHHH.....',
        '....HHLPSSTDDDDTSSLHH....',
        '...HHLPSSTDDXXDDTSSLHH...',
        '..HHLPSSTDDXXXXDDTSSLHH..',
        '.HHLPSSTDDXXXXXXDDTSSLHH.',
        '.HLPSSSTDDXXXXXXDDTSSSLH.',
        '.HLPSSSTDDXXXXXXDDTSSSLH.',
        '.HLPSSSTDDXXXXXXDDTSSSLH.',
        '.HHLPSSTDDXXXXXXDDTSSLHH.',
        '..HHLPSSTDDXXXXDDTSSLHH..',
        '...HHLPSSTDDXXDDTSSLHH...',
        '....HHLPSSTDDDDTSSLHH....',
        '..AAAAHHLPSSTTTSSLHHAAAA.',
        '.AAAAAAHHLPSSTSSLHHAAAAAA',
        '..DDDDDDDDDDDDDDDDDDDDD..',
        '.DDDDDDDDDDDDDDDDDDDDDDD.',
        '.EEEEEEEEEEEEEEEEEEEEEEE.',
      ], cm);

    case 'STREAK_60': // Blaze Master (fire mandala)
      return centered([
        '..........H..........',
        '.......HHHHHHH.......',
        '......HHLPPPLHH......',
        '.....HLPSSSSSPLH.....',
        '....HLPSSTTTSSPLH....',
        '...HLPSTDDDDDTSPH....',
        '...HPSSTDXXXDTSSPH...',
        '..HLPSTDDXXXDDTSPH...',
        '..HPSSTDXXPXXDTSSPH..',
        '..HPSSTDXXXDXDTSSPH..',
        '..HLPSTDDXXXDDTSPH...',
        '...HPSSTDXXXDTSSPH...',
        '...HLPSTDDDDDTSPH....',
        '....HLPSSTTTSSPLH....',
        '.....HLPSSSSSPLH.....',
        '......HHLPPPLHH......',
        '.......AAATTTAA......',
        '......AAADDDDAAA.....',
        '.....DDDDDDDDDDD.....',
        '.....EEEEEEEEEEE.....',
      ], cm);

    case 'STREAK_90': // Eternal Flame (flame on pedestal)
      return centered([
        '........H.........',
        '.......HHH........',
        '......HHLHH.......',
        '.....HHLPPH.......',
        '.....HLPSSTH......',
        '....HLPSSSTH......',
        '....HLPSTTDH......',
        '...HLPSTDDDH......',
        '...HPSTDDDDH......',
        '....PSTDDDD.......',
        '....PSTTDDD.......',
        '.....PSTTDD.......',
        '....AASTTDAA......',
        '...AAATTTTAAA.....',
        '..AAAADDDDDAAA.....',
        '..DDDDDDDDDDDD.....',
        '.DDDDDDDDDDDDDD....',
        '.EEEEEEEEEEEEEE....',
      ], cm);

    case 'STREAK_180': // Hellfire (horned flame demon)
      return centered([
        '.DD...........DD.',
        'DDD............DDD',
        '.DDD..........DDD.',
        '..DDD........DDD..',
        '..DDD........DDD..',
        '...DDD..WW..DDD...',
        '...DDDWHHWDDDD....',
        '....DDWHHLWDDD....',
        '....DWHHLPPWDD....',
        '....WHHLPPSWD.....',
        '...WHHLPPSSTW.....',
        '...WHLPPSSTDW.....',
        '..WHHLPPSSTDW.....',
        '..WHLPPSTTDEW.....',
        '..WHLPPSSTDEW.....',
        '.WHHLPPSTTDEW.....',
        '.WHLPPSSTDDEW.....',
        '.WHLPPSSTDDEW.....',
        '..WLPPSSTDDEW.....',
        '..WLPSSTDDEW......',
        '...WPPSTDDEW......',
        '...WPSSTDEW.......',
        '....WSTDDEW.......',
        '.....WTDEW........',
        '......WDEW........',
        '.......EE.........',
      ], cm);

    case 'STREAK_365': // Phoenix (bird rising)
      return centered([
        '............H...............',
        '...........HHH..............',
        '..........HHPHH.............',
        '.........HHPSPHH............',
        '........HHPSSSPHH...........',
        '.......HHPSSTTSPHH..........',
        '......HHPSTDDDTSPHH.........',
        '.....HHPSSTDDDTSSPHH........',
        '....HHPSSTDDDDTSSSPHH.......',
        '...HHPSSTDDXXDDTSSSPHH......',
        '..HHPSSTDDXXXXDDTSSSPHH.....',
        '.HHPSSTDDXXXXXXDDTSSSPHH....',
        'HHPSSTDDXXPPPPXXDDTSSSPHH...',
        '.HHPSSTDDXXXXXXDDTSSSPHH....',
        '..HHPSSTDDXXXXDDTSSSPHH.....',
        '...HHPSSTDDXXDDTSSSPHH......',
        '....HHPSSTDDDDTSSSPHH.......',
        '.....HHPSSTDDDTSSPHH........',
        '......HHPSTDDDTSPHH.........',
        '.......HHPSSTTSPHH..........',
        '........HHPSSSPHH...........',
        '.....H...HHPSPHH...H........',
        '....HHH...HPPH...HHH........',
        '...HPPPH...HH...HPPPH.......',
        '..HPSSSPH......HPSSSPH......',
        '.HPSSSSSPH....HPSSSSSPH.....',
        '..HPSSSPH......HPSSSPH......',
        '...HPPPH........HPPPH.......',
        '....HHH..........HHH........',
        '.....H............H.........',
      ], cm);

    case 'STREAK_500': // Demon Lord (horned skull)
      return centered([
        'DD..............DD',
        '.DD............DD.',
        '..DD..........DD..',
        '..DD..........DD..',
        '...DD.PPPPPP.DD...',
        '...DDPPPPPPPDD....',
        '....PPPPPPPPPP....',
        '....PPSSSSSSPP....',
        '...PPSSSSSSSPPP...',
        '...PPSSSSSSSSPP...',
        '...PPXX.SS.XXPP...',
        '...PPXX.SS.XXPP...',
        '...PPSS.SS.SSPP...',
        '...PPSSS..SSSPP...',
        '....PPSS..SSPP....',
        '....PPSSSSSSPP....',
        '....PPTTTTTTPP....',
        '.....PT.TT.TP.....',
        '.....PT.TT.TP.....',
        '......TTTTTT......',
        '.......DDDD.......',
        '........DD........',
      ], cm);

    case 'STREAK_730': // Archfiend (winged figure)
      return centered([
        '..DDD.............DDD..',
        '...DD.....PP.....DD....',
        '...DD....PPPP....DD....',
        '....DD..PPSSPP..DD.....',
        '....DD..PXPPXP..DD.....',
        '....DD...PPPP...DD.....',
        '..DDDD...PPPP..DDDD....',
        '.DDDTD...SSSS..DTDDD..',
        'DDDTTDD..SSSS.DDTTDDD.',
        'DDTTTDD..SSSS.DDTTTDD.',
        'DTTTTDD.SSSSSS.DDTTTTD',
        'DTTTDD..SSSSSS..DDTTTD',
        '.DTTD...SSSSSS...DTTD.',
        '..DDD...TTTTTT...DDD..',
        '..DD....TTTTTT....DD..',
        '..D.....TT..TT.....D..',
        '........TT..TT........',
        '........DD..DD........',
        '........DD..DD........',
        '.......DDD..DDD.......',
      ], cm);

    case 'STREAK_1000': // Immortal (radiant figure with halo)
      return centered([
        '......HHHHHHHH......',
        '....HH..WWHH..HH...',
        '...H...WHHHLW..H...',
        '...H...WHHLPW..H...',
        '....HH..HPPW.HH....',
        '......HHHHHHHH......',
        '.H......PPPP......H.',
        '..H.....SSSS.....H..',
        '...H....SSSS....H...',
        '....H..SSSSSS..H....',
        '.....H.SSSSSS.H.....',
        '..H..H.SSSSSS.H..H..',
        '...H..HSSSSSSSH..H..',
        '....HH.TTTTTT..HH...',
        '....H..TTTTTT..H....',
        '...H...TT..TT...H...',
        '..H....TT..TT....H..',
        '.H.....DD..DD.....H.',
        '..H....DD..DD....H..',
        '...H...DD..DD...H...',
        '....HH.DD..DD.HH....',
        '......HEEHHEEEH.....',
      ], cm);

    case 'STREAK_1500': // Eternal (all-seeing cosmic eye)
      return centered([
        '.......H...........H.......',
        '......HHH.........HHH......',
        '.....HHLPH.......HPLHH.....',
        '....HLPSSPH.....HPSSPLH....',
        '...HLPSTTSPH...HPSTTSPLH...',
        '...HPSSTDDSPH.HPSDDTSSPH...',
        '..HPSSTDDDDSPHHPDDDDTSSPH..',
        '..HPSSTDDDDDTSPTDDDDTSSPH..',
        '..HPSSTDDDDDTSPTDDDDTSSPH..',
        '..HPSSTDDDDSPHHPDDDDTSSPH..',
        '...HPSSTDDSPH.HPSDDTSSPH...',
        '...HLPSTTSPH...HPSTTSPLH...',
        '....HLPSSPH.....HPSSPLH....',
        '.....HHLPH.......HPLHH.....',
        '......AAATTTTTTTAAA........',
        '.....AAADDDDDDDDAAA........',
        '.....DDDDDDDDDDDDD.........',
        '.....EEEEEEEEEEEEE.........',
      ], cm);

    // ═══ LIFETIME BURN ── destruction scale (14) ═══════════════════

    case 'BURN_10': // Ember (glowing coal)
      return centered([
        '.......HHH.......',
        '.....HHLPLHH.....',
        '....HLPSSSPLH....',
        '...HLPSTTTSPLH...',
        '...HPSSTDDTSPH...',
        '...HPSSTXXTSPH...',
        '..HLPSTDXXDTSPH..',
        '..HLPSTDXXDTSPH..',
        '...HPSSTXXTSPH...',
        '...HPSSTDDTSPH...',
        '...HLPSTTTSPLH...',
        '....HLPSSSPLH....',
        '.....HHLPLHH.....',
        '.......DDD.......',
        '.......EEE.......',
      ], cm);

    case 'BURN_50': // Blaze (bonfire)
      return centered([
        '.........H.H.........',
        '........HH.HH........',
        '.......HHL.LHH.......',
        '......HHLP.PLHH......',
        '.....HHLPSSTSLHH.....',
        '....HHLPSSTTSSLHH....',
        '...HHLPSSTDDTSSLHH...',
        '...HLPSSSTDDDTSSSLH..',
        '..HLPSSSTDDDDTSSSLH..',
        '..HLPSSSTDDDDTSSSLH..',
        '...HLPSSSTDDTSSSLH...',
        '....HLPSSSTTTSSSLH...',
        '.....HLPSSSSSSSLH....',
        '....AAAATTTTTTAAAA...',
        '...AAAADDDDDDDDAAAA..',
        '..AAAAADDDDDDDDAAAAA.',
        '....DDDAADDAADDD.....',
        '...DDDDAADDAADDDD....',
        '..DDDDDAADDAADDDDD...',
        '.DDDDDDDDDDDDDDDDDD..',
        '.EEEEEEEEEEEEEEEEEE..',
      ], cm);

    case 'BURN_100': // Wildfire (fire consuming trees)
      return centered([
        '.....X......H......X.....',
        '....XXX....HHH....XXX....',
        '...XXXXX..HLPH..XXXXX...',
        '..XX.XX.XHLPSTHX.XX.XX..',
        '..XX..XXHLPSSSTHXX..XX..',
        '..X...XHLPSTDDTHX...X...',
        '..X..XHLPSTDDDTHX..X....',
        '..X..HLPSTDXXDDTH..X....',
        '..X.HLPSTDXXXXDTH.X.....',
        '..X.HPSSTDXXXXDTSH.X....',
        '..XXHPSSTDXXXXDTSHXX....',
        '...XHLPSTDDXXDDTHX......',
        '...HLPSSSTDDDDTSPH......',
        '..HLPSSSTTTTTTSSPH......',
        '.HHLPSSSSSSSSSSSPHH.....',
        '.AAATTTTTTTTTTTTTAAA....',
        '..DDDDDDDDDDDDDDDDD.....',
        '..EEEEEEEEEEEEEEEEE.....',
      ], cm);

    case 'BURN_500': // Supernova (exploding star)
      return centered([
        '..........H.H..........',
        '.........H.H.H.........',
        '........H..H..H........',
        '.......H..HHH..H.......',
        '......H.HHHWHHH.H......',
        '.....H.HHWWWWHH..H.....',
        '....H.HHWWWWWWHH..H....',
        '...H.HHLWWWWWWLHH.H....',
        '..H.HHLPPWWWWPPLHH.H...',
        '.H.HHLPPSSWWSSPPLHH.H..',
        'H.HHLPPSSTDDTSSPP.HH.H.',
        '.HHLPPSSTDDDDTSSPP.HH..',
        'HHPPSSTDDDDDDDTSSPP.HH.',
        '.HHLPPSSTDDDDTSSPP.HH..',
        'H.HHLPPSSTDDTSSPP.HH.H.',
        '.H.HHLPPSSWWSSPPLHH.H..',
        '..H.HHLPPWWWWPPLHH.H...',
        '...H.HHLWWWWWWLHH.H....',
        '....H.HHWWWWWWHH..H....',
        '.....H.HHWWWWHH..H.....',
        '......H.HHHWHHH.H......',
        '.......H..HHH..H.......',
        '........H..H..H........',
        '.........H.H.H.........',
        '..........H.H..........',
      ], cm);

    case 'BURN_1000': // Singularity (black hole)
      return centered([
        '..........PPPPP..........',
        '........PPSSSSPPPP.......',
        '......PPSSSSSSSSSPP.....',
        '.....PPSSTTTTTTSSSPP....',
        '....PSSTTTTTTTTTSSP....',
        '...PSSTTDDDDDDTTSSP...',
        '..PSSTTDDDDDDDDDTSSP..',
        '.PSSTDDDDDXXXXXDDTSSP.',
        '.PSTDDDDXXXXXXXXDDTSP.',
        'PSSTDDDXXXXXXXXXDDTSSP',
        'PSTTDDXXXXXXXXXXXDDTSP',
        'PSTDDDXXXXEEEXXXXDDTSP',
        'PSTDDDXXXXEEEXXXXDDTSP',
        'PSTDDDXXXXEEEXXXXDDTSP',
        'PSTTDDXXXXXXXXXXXDDTSP',
        'PSSTDDDXXXXXXXXXDDTSSP',
        '.PSTDDDDXXXXXXXXDDTSP.',
        '.PSSTDDDDDXXXXXDDTSSP.',
        '..PSSTTDDDDDDDDDTSSP..',
        '...PSSTTDDDDDDTTSSP...',
        '....PSSTTTTTTTTTSSP....',
        '.....PPSSTTTTTTSSSPP...',
        '......PPSSSSSSSSSPP....',
        '........PPSSSSPPPP.....',
        '..........PPPPP........',
      ], cm);

    case 'BURN_2500': // Devourer (maw with teeth)
      return centered([
        '.DDDDDDDDDDDDDDDDDDDD..',
        'DDDPPPPPPPPPPPPPPPPDDDD.',
        'DDPPSSSSSSSSSSSSSSSPPDD.',
        'DPPSSSTTTTTTTTTTTSSSPPD.',
        'DPSSTTTTTTTTTTTTTTSPPD..',
        'DPSTTT............TSPD..',
        'DPST..............TSPD..',
        'DPST.HH.HH.HH.HH.TSPD.',
        'DPST.HH.HH.HH.HH.TSPD.',
        'DPST..............TSPD..',
        'DPST..............TSPD..',
        'DPST..............TSPD..',
        'DPST.HH.HH.HH.HH.TSPD.',
        'DPST.HH.HH.HH.HH.TSPD.',
        'DPST..............TSPD..',
        'DPSTTT............TSPD..',
        'DPSSTTTTTTTTTTTTTTSPPD..',
        'DPPSSSTTTTTTTTTTTSSSPPD.',
        'DDPPSSSSSSSSSSSSSSSPPDD.',
        'DDDPPPPPPPPPPPPPPPPDDDD.',
        '.DDDDDDDDDDDDDDDDDDDD..',
        '..HHHHH.........HHHHH...',
      ], cm);

    case 'BURN_5000': // Destroyer (broken sword)
      return centered([
        '......HHLL......',
        '.....HHLPP......',
        '....HHLLPP......',
        '...HHLPPSS......',
        '...HLPPSST......',
        '..HLLPPSSTD.....',
        '..HLPPSSTTD.....',
        '..HLLPPSSTD.....',
        '..HLPPSSSTD.....',
        '..HLLPPSSTD.....',
        '..HLPPSSTDD.....',
        '..HLPPSSTDD.....',
        '..HLLPSSTDD.....',
        '..HLPPSSTDD.....',
        '..HLLPSSTDD.....',
        '..HLPPSSTDD.....',
        '..HLLPSSTDD.....',
        '..HLPPSSTDD.....',
        'AAAALPPSSTAAAA..',
        'AAAALPPSSTAAAA..',
        '....TTTTTTTT....',
        '....TTTTTTTT....',
        '....TTTTTTTT....',
        '....DDDDDDDD....',
        '....DDDDDDDD....',
        '....DDDDDDDD....',
        '...DDDDDDDDDD...',
        '...EEEEEEEEEE...',
      ], cm);

    case 'BURN_10000': // Annihilator (mushroom cloud)
      return centered([
        '......WHHHHHW........',
        '....WHHHHHHHHHW......',
        '...WHHLLLLLLHHW......',
        '..WHHLPPPPPPPLHW.....',
        '.WHHLPPPPPPPPPPHW....',
        '.WHLPPPPPPPPPPPLHW...',
        'WHHLPPSSSSSSSSPPLHW..',
        'WHLPPSSSTTTSSSSPPHW..',
        '.WHPPSSTTTTTSSPPW....',
        '..WWPSSTTTTTSSPWW....',
        '....WSSTTTTTSSW......',
        '....WSSTTTTTSSW......',
        '.....WSTTTTSW........',
        '.....WSTTTTSW........',
        '....WSSTDDSSW........',
        '...WSSTTDDTSSW.......',
        '..WSSTTTDDTTSSW......',
        '.WSSSTTDDDDTTSSSW....',
        'WSSSSTTDDDDDTSSSSW...',
        '.WWSSTTDDDDDTTSSWW...',
        '...WWTTDDDDDDTTWW....',
        '....WDDDDDDDDDW......',
        'EEEEEEEEEEEEEEEEEEEEE',
      ], cm);

    case 'BURN_25000': // Titan (colossus figure)
      return centered([
        '.......PPPP........',
        '......PPPPPP.......',
        '......PXPPXP.......',
        '......PPPPPP.......',
        '.......SSSS........',
        '.....PPSSSSPP......',
        '....PPSSSSSSPP.....',
        '...PPSSSSSSSSP.....',
        'PPPPPSSSSSSSSSPPPP.',
        'PPPPPSSSSSSSSSPPPP.',
        '...PPSSSSSSSSPP....',
        '....PSSSSSSSP......',
        '....PPSSSSSSPP.....',
        '.....PTTTTTTP......',
        '.....PTTTTTTP......',
        '.....PTTTTTPP......',
        '.....PPTTTTPP......',
        '.....PDDDDDP......',
        '....PPDD.DDPP......',
        '....PDD...DDP......',
        '....PDD...DDP......',
        '...PDDD...DDDP.....',
        '..PDDDD...DDDDP....',
        '.PDDDDD...DDDDDP...',
        'EEEEEE.....EEEEEE..',
      ], cm);

    case 'BURN_50000': // Leviathan (sea serpent)
      return centered([
        '..............PPPPPP..............',
        '............PPPHHHPPP............',
        '...........PPHXXHPPPP............',
        '..........PPHHHHHPPPPP...........',
        '.........PPPHPPPHPPSSPP..........',
        '........PPPPPHPPPPSSSSPP.........',
        '.......PPPPPHPPPPSSSSSSSP........',
        '......PPPPPHPPPPSSSTTTSSSP.......',
        '.....PPPPPHPPPPSSTTDDDTTSSP......',
        '....PPPPPHPPPPSSTDDDDDDTTSSP.....',
        '...PPPPPHPPPPSSTDDDDDDDDTTSSP....',
        '....PPPPPHPPPPSSTDDDDDDDTTSSP....',
        '.....PPPPPHPPPPSSTDDDDTTTSSP.....',
        '......PPPPPHPPPPSSSTTTTTSSP......',
        '.......PPPPPHPPPPSSSSSSSSP.......',
        '........PPPPPHPPPPSSSSSSP........',
        '.........PPPPPHPPPPSSSSP.........',
        '..........PPPPPHPPPPSSP..........',
        '...........PPPPPHPPPPP...........',
        '............PPPPPHPPP............',
        '.............PPPPPPP.............',
        '..............PPPPP..............',
        '...............PPP...............',
      ], cm);

    case 'BURN_100000': // God of Ashes (skull + flame crown)
      return centered([
        '....W......WW......W....',
        '...WHW....WHHW....WHW...',
        '...WHLW...WHLW...WHLW..',
        '...WHPW..WHHLPW..WHPW..',
        '..WHPSW..WHLPPW..WHSW..',
        '..WPSTW..WHPSSW..WSTW..',
        '..WSTDW.WHPSSTW..WTDW..',
        '...WDEW..WSSTDW...DEW..',
        '....WW....WTDW....WW...',
        '......PPPPPPPPPPPP......',
        '.....PPPPSSSSSSPPPP.....',
        '....PPPSSSSSSSSSSPPP....',
        '....PPPSSSSSSSSSSPPP....',
        '....PPPXX.SS.XXSPPP....',
        '....PPPXX.SS.XXSPPP....',
        '....PPPSSSSSSSSSPPP....',
        '.....PPSS.SS.SSPPP.....',
        '......PPSSSSSSPPP......',
        '......PPTTTTTTPP.......',
        '.......PT.TT.TP........',
        '........TTTTTT.........',
        '.........DDDD..........',
      ], cm);

    case 'BURN_250000': // World Breaker (cracked planet)
      return centered([
        '........DDDDDDDDD.........',
        '......DDDSSSSSSSDDDD......',
        '....DDSSSSSSHSSSSSSDD.....',
        '...DSSSSSSSHHHSSSSSSSD....',
        '..DSSSSSSSHHHSSSSSSSD....',
        '.DSSSSTTSHHHHTTSSSSSSD...',
        '.DSSTTTSHHHHHHTTSSSSD....',
        'DSSTTTSHHHHHHHHTTSSD.....',
        'DSTTTSHHHHTTTHHHTTSD.....',
        'DSTTSHHHHTTTTTHHHTSD.....',
        'DSTSHHHTTTTHTTTHHSD.....',
        'DSTSHHTTTTHHHTTTSHSD....',
        'DSTSHHTTTHHHHTTTSHSD....',
        'DSTSHHTTTHHHHTTTSSD.....',
        'DSSTSHTTTHHHHTTSSD......',
        'DSSSTSHHHHHHTTSSSD......',
        '.DSSTTSHHHHTTSSSSD......',
        '.DSSTTTSHHHTTSSSSD......',
        '..DSSTTTSHHTSSSSD.......',
        '...DSSSTTTTTSSSD........',
        '....DDSSSSSSSDD.........',
        '......DDDSSSDDDD........',
        '........DDDDDDD.........',
      ], cm);

    case 'BURN_500000': // Oblivion (void vortex)
      return centered([
        '........SSSSSS........',
        '......SSTTTTTTSS......',
        '....SSTTDDDDDDTTSS...',
        '...STTDDDDDDDDDTTS..',
        '..STTDDDEEEEEEDDTTS..',
        '.STTDDDEE.XXXXEDDTTS.',
        '.STDDDEEXXXXXXEEDDTS.',
        'STTDDEEXXXXXXXEEDDTS.',
        'STDDDEXXXXXXXXXEDDTS.',
        'STDDEEXXXXXXXXEEDDTS.',
        'STTDEEXXXXXXXXEEDDTS.',
        'STDDEEXXXXXXXXEEDDTS.',
        'STDDDEXXXXXXXXXEDDTS.',
        'STTDDEEXXXXXXXEEDDTS.',
        '.STDDDEEXXXXXXEEDDTS.',
        '.STTDDDEE.XXXXEDDTTS.',
        '..STTDDDEEEEEEDDTTS..',
        '...STTDDDDDDDDDTTS..',
        '....SSTTDDDDDDTTSS...',
        '......SSTTTTTTSS......',
        '........SSSSSS........',
      ], cm);

    case 'BURN_1000000': // The Absolute (eye in triangle / providence)
      return centered([
        '.............H.............',
        '............HHH............',
        '...........HPPPH...........',
        '..........HPPPPPH..........',
        '.........HPPSSSPPH.........',
        '........HPPSSSSSPPH........',
        '.......HPPSSHHHSSPPH.......',
        '......HPPSSHPPPHSSPPH......',
        '.....HPPSSHPPPPPHSSPPH.....',
        '....HPPSSHPPXXPPHSSPPH.....',
        '...HPPSSHPPXXXXPPHSSPPH....',
        '..HPPSSHPXXXXXXPPHSSPPH....',
        '..HPPSSHPXXDDXXPPHSSPPH....',
        '.HPPSSSHPXDDDDXPPHSSSPPH...',
        '.HPPSSSHPXXDDXXPPHSSSPPH...',
        '..HPPSSHPXXXXXXPPHSSPPH....',
        '..HPPSSHPPXXXXPPHSSPPH.....',
        '...HPPSSHPPXXPPHSSPPH......',
        '....HPPSSHPPPPHSSPPH.......',
        '.....HPPSSHHHSSPPH.........',
        '......HPPSSSSSPPH..........',
        '.......HPPSSSPPH...........',
        '........HPPPPPH............',
        '.........HPPPH.............',
        '..........HHH..............',
        '...........A...............',
        '..........AAA..............',
        '.........AAAAA.............',
        '........AAAAAAA............',
        '.......AAAAAAAAA...........',
        '......AAAAAAAAAAA..........',
        '.....AAAAAAAAAAAAA.........',
        '....AAAAAAAAAAAAAAA........',
        '...AAAAAAAAAAAAAAAAA.......',
        '..AAAAAAAAAAAAAAAAAAA......',
        '.AAAAAAAAAAAAAAAAAAAAA.....',
      ], cm);

    // ═══ DAILY VOLUME ── energy / lightning (5) ═══════════════════

    case 'DAILY_25': // Hot Hands (two fiery hands)
      return centered([
        '...HHH.......HHH...',
        '..HPPPH.....HPPPH..',
        '.HPSSSPH...HPSSSPH.',
        '.HPSSSSPH.HPSSSSPH.',
        '.HPSSSSSPHSPSSSSSP.',
        '.HPSSTSSS.TSSSTSPH.',
        '.HPSSTTSS.TSSTTSPH.',
        '.HPSTTDSS.TSSDTSPH.',
        '.HPSTTDSS.TSSDTSPH.',
        '.HPSTTDSS.TSSDTSPH.',
        '.HPSSTTSS.TSSTTSPH.',
        '.HPSSTSSS.TSSSTSPH.',
        '.HPSSSSSPHSPSSSSSP.',
        '.HPSSSSPH.HPSSSSPH.',
        '.HPSSSPH...HPSSSPH.',
        '..HPPPH.....HPPPH..',
        '...AAA.......AAA...',
        '..AAADD.....DDDAA..',
        '..DDDDD.....DDDDD..',
        '..EEEEE.....EEEEE..',
      ], cm);

    case 'DAILY_100': // Firestarter (striking match)
      return centered([
        '..........H.HH............',
        '.........HH.HHH...........',
        '........HHL.LPHH..........',
        '.......HHLP.PPSHH.........',
        '......HHLPSSTTSSLH........',
        '.....HHLPSSTDDTSSLH.......',
        '....HHLPSSTDDDDTSSLH......',
        '.........AAAPPP............',
        '........AAAAPPP............',
        '.......AAAAAPPP............',
        '......AAAAAAPPP............',
        '.....AAAAAAAPPP............',
        '....AAAAAAAAPPP............',
        '...AAAAAAAAAPPP............',
        '..AAAAAAAAAATTT............',
        '.AAAAAAAAAAATTT............',
        '..DDDDDDDDDDDDD............',
        '.DDDDDDDDDDDDDDD...........',
        '.EEEEEEEEEEEEEEE...........',
      ], cm);

    case 'DAILY_500': // Pyromaniac (grinning flame)
      return centered([
        '........HHH........',
        '.......HLPHH.......',
        '......HLPSSPH......',
        '.....HLPSTTSPH.....',
        '....HLPSTDDTSPH....',
        '...HLPSTDXXDTSPH...',
        '...HPSSTDXXDTSSPH..',
        '..HPSSTDXXXXDTSSPH.',
        '..HPSSTDXXDXXDTSPH.',
        '..HPSSTDXXXXDTSSPH.',
        '..HLPSTDXX..DTSPH..',
        '...HLPSTD....TSPH..',
        '...HLPSTDD..DDSPH..',
        '....HPSSTDDDDSSPH..',
        '....HLPSSSTTTSSPH..',
        '.....HLPSSSSSSPH...',
        '......HPSSTTSPH....',
        '.......HPSTSPH.....',
        '.......AAATTTAA....',
        '......AAADDDDAA....',
        '......DDDDDDDDD....',
        '......EEEEEEEEE....',
      ], cm);

    case 'DAILY_2500': // Eruption (volcano)
      return centered([
        '.............WW............',
        '............WHHW...........',
        '...........WHHLW...........',
        '..........WHPPW............',
        '........H.WPSSW.H.........',
        '.......H..WSTDW..H........',
        '........DDDDDDDDD.........',
        '.......DDDDDEEDDDD........',
        '......DDDDDDEEDDDDD.......',
        '.....DDDDDDDEEDDDDD......',
        '....DDDDDDDDDEEDDDDD.....',
        '...DDDDDDDDDDDDEDDDDD....',
        '..DDDDDDDDDDDDDDDDDDD...',
        '.DDDDDDDDDDDDDDDDDDDDD..',
        'DDDDDDDDDDDDDDDDDDDDDDD.',
        'EEEEEEEEEEEEEEEEEEEEEEEEE',
      ], cm);

    case 'DAILY_10000': // Cataclysm (meteor strike)
      return centered([
        '.....................HH..',
        '....................HPLH.',
        '...................HPLH..',
        '..................HPLH...',
        '...............H.HPLH....',
        '..............HHPLH......',
        '.............HHPLH.......',
        '............HHPSH........',
        '...........HHPSH.........',
        '..........HHHSH..........',
        '.........WWWW............',
        '........WHHHHW...........',
        '.......WHLPPPLHW.........',
        '......WHHLPPSSPHW........',
        '....WHHLPPSSTTDPHW.......',
        '...WHLPPSSTDDDDEPHW......',
        '..WHPPSSTDDEEEEDEPPHW....',
        'WWPPSDDDDDEEEEEEDDDPPWWW',
        'EEEEEEEEEEEEEEEEEEEEEEEEE',
      ], cm);

    // ═══ BURN COUNT ── mechanical marks (5) ═══════════════════════

    case 'TXCOUNT_10': // Spark Plug
      return centered([
        '.........HHH.........',
        '........HPPPH........',
        '........HPPPH........',
        '.......HPPPPPH.......',
        '.......HPPPPPH.......',
        '.......DDDDDDD.......',
        '......DDDDDDDDD......',
        '......DTTTTTTTD......',
        '......DTTTTTTTD......',
        '......DTTTTTTTD......',
        '......DTTTTTTTD......',
        '......DTTTTTTTD......',
        '......DTTTTTTTD......',
        '.......DDDDDDD.......',
        '.......HPPPPPH.......',
        '.......HPPPPPH.......',
        '.......HPPPPPH.......',
        '........HPPPH........',
        '........HPPPH........',
        '.........HSH.........',
        '.........HSH.........',
        '.........DTD.........',
        '.........DED.........',
      ], cm);

    case 'TXCOUNT_50': // Fire Hydrant
      return centered([
        '........PPPP........',
        '.......PPHHPP.......',
        '.......PPHHPP.......',
        '...PPPPPPHHPPPPPP...',
        '..PPHHHPPHHPPHHHPP..',
        '..PPHSSSPHHPPSSSHP..',
        'PPPPSSSSSHPHSSSSSPPP',
        'PPSSSSSSSSPSSSSSSSPP',
        '..PPSSSSSSPSSSSSSPP.',
        '..PPHSSSSSPSSSSSHP..',
        '..PPHSSSSSPSSSSSHP..',
        '..PPHSSSSSPSSSSSHP..',
        '..PPHSSSSSPSSSSSHP..',
        '..PPHSSSSSPSSSSSHP..',
        '..PPHSSSTTTTTSSSHP..',
        '..PPHSSSTTTTTSSSHP..',
        '..PPHDDDDDDDDDDHPP..',
        '.PPHHDDDDDDDDDDHHPP.',
        '.PPHDDDDDDDDDDDDHPP.',
        '.EEEEEEEEEEEEEEEEEE.',
      ], cm);

    case 'TXCOUNT_100': // Burn Machine (gear/cog)
      return centered([
        '.......PPPP......PPPP.......',
        '......PPPPPP....PPPPPP......',
        '.....PPPPPP......PPPPPP.....',
        '....PPPPSSSSSSSSSSPPPPPP....',
        '...PPPSSSSSSSSSSSSSSPPP.....',
        '..PPPSSSSSTTTTTSSSSPPPP.....',
        '.PPPSSSTTTTTTTTTTSSSSPPP....',
        '.PPSSTTTTTTTTTTTTTSSPPP.....',
        'PPSSSTTTDDDDDDDTTTSSSPP....',
        'PPSSTTTDDDDDDDDDTTTSSPP...',
        'PPSTTDDDDDDDDDDDDTTSPP...',
        'PPSTTTDDDDDEEDDDDTTTSPPP..',
        '.PPSTTTDDDDEEDDDTTTSSPP...',
        '.PPSTTTTDDDDDDDTTTSSPPP...',
        '..PPSSTTTDDDDDDTTSSPPPP...',
        '..PPPSSSTTTTTTTTSSSSPPP....',
        '...PPPSSSSSTTTSSSSPPPP.....',
        '....PPPSSSSSSSSSPPPPPP.....',
        '.....PPPPPP......PPPPPP....',
        '......PPPPPP....PPPPPP.....',
        '.......PPPP......PPPP......',
      ], cm);

    case 'TXCOUNT_500': // Incinerator (furnace + flames)
      return centered([
        '.....W.....WW.....W.....',
        '....WHW...WHHW...WHW....',
        '....WPW...WHPW...WPW....',
        '....WSW...WSSW...WSW....',
        '....WDW...WDDW...WDW....',
        '..DDDDDDDDDDDDDDDDDD...',
        '..DDDDDDDDDDDDDDDDDD...',
        '..DD....DDDDDD....DD...',
        '..DD.AA.DDDDDD.AA.DD...',
        '..DD.AA.DDDDDD.AA.DD...',
        '..DD....DDDDDD....DD...',
        '..DD.AA.DDDDDD.AA.DD...',
        '..DD.AA.DDDDDD.AA.DD...',
        '..DD....DDDDDD....DD...',
        '..DD.AA.DDDDDD.AA.DD...',
        '..DD.AA.DDDDDD.AA.DD...',
        '..DD....DDDDDD....DD...',
        '..DDDDDDDDDDDDDDDDDD...',
        '..DDDDDDDDDDDDDDDDDD...',
        '..EEEEEEEEEEEEEEEEEE...',
        '.EEEEEEEEEEEEEEEEEEEE..',
      ], cm);

    case 'TXCOUNT_1000': // Crematorium (chimney building + smoke)
      return centered([
        '............STST..........',
        '.............STS..........',
        '...........STST...........',
        '............STS...........',
        '...........SSTS...........',
        '...........DDDD...........',
        '...........DDDD...........',
        '...........DDDD...........',
        '....DDDDDDDDDDD..........',
        '...DDDDDDDDDDDDDD........',
        '..DDDDDDDDDDDDDDDDD.....',
        '.DDDSSSSSSSSSSSSSDDD......',
        '.DDSSSSSSSSSSSSSSDDD......',
        '.DDSSSSSSSSSSSSSSDDD......',
        '.DDSSSSSSSSSSSSSSDDD......',
        '.DDSSSSEEEESSSSSDDD.......',
        '.DDSSSSEEEEESSSDDD........',
        '.DDSSSSEEEESSSDDD.........',
        '.DDSSSSSSSSSSSDDD..........',
        '.DDDDDDDDDDDDDDDD........',
        '.EEEEEEEEEEEEEEEE.........',
        'AAAAAAAAAAAAAAAAAAA........',
      ], cm);

    // ═══ PERFECT MONTH ── crystals / discipline (4) ═══════════════

    case 'PERFECT_1': // Flawless (diamond gem)
      return centered([
        '..........H..........',
        '.........HHH.........',
        '........HLPH.........',
        '.......HLPSSH........',
        '......HLPSSSPH.......',
        '.....HLPSSTTSPH......',
        '....HLPSTDDDTSPH.....',
        '...HLPSTDXXDTSPH.....',
        '..HLPSTDXXXXDTSPH....',
        '.HLPSTDXXPPXXDTSPH...',
        '..HLPSTDXXXXDTSPH....',
        '...HLPSTDXXDTSPH.....',
        '....HLPSTDDDTSPH.....',
        '.....HLPSSTTSPH......',
        '......HLPSSSPH.......',
        '.......HLPSSH........',
        '........HLPH.........',
        '.........HHH.........',
        '..........D..........',
        '.........DDD.........',
        '........EEEEE........',
      ], cm);

    case 'PERFECT_3': // Disciplined (meditating figure with aura)
      return centered([
        '........HHHHH........',
        '......HH.....HH......',
        '....HH.........HH....',
        '...H....HHHHH....H...',
        '..H...HHPPPPPHH...H..',
        '..H..HPPPPPPPPPH..H..',
        '.H..HPPPXXPXXPPPH..H.',
        '.H..HPPPPPPPPPPPH..H.',
        '.H...HPPPPPPPPPH...H.',
        '..H...HHPPPPPHH...H..',
        '...H....HPPPH....H...',
        '..PPH..SSSSSSS..HPP..',
        '.PPPH.SSSSSSSSS.HPPP.',
        '.PPPPSSSSSSSSSSSPPPP.',
        '.PPPPSSSSSSSSSSSPPPP.',
        '..PPPPSSSSSSSSSPPPP..',
        '...PPPTTTTTTTTTPP....',
        '....PPTTTTTTTTPP.....',
        '.....PDDDDD DDP......',
        '....AADDDDDDDDAA.....',
        '...AAAADDDDDDAAAA....',
        '..AAAAAAAAAAAAAAAA....',
      ], cm);

    case 'PERFECT_6': // Relentless (running wolf)
      return centered([
        '...........PPPPPP............',
        '.........PPPHHHPPP...........',
        '........PPHXXXXHPPP..........',
        '.......PPHHHHHHHPPPP.........',
        '......PPPHHHHHHHPPPPP........',
        '......PPPHHHHHHPPSSSSP.......',
        '.....PPPPPHHHPPSSSSSSSS......',
        '......PPPPPPPPSSSSSSSSSS.....',
        '.......PPPPPPSSSSSTTTTTSS....',
        '........PPPPSSSSSTTTTTTTS....',
        '.........PPPSSSSTTTTDDTTS....',
        '........SSSSSSSTTTDDDDTT.....',
        '.......SSSSSSSTTTDDDDTT......',
        '......SSSSSSSTTTDDDDTT.......',
        '.....SSSSSSSSTTDDDDTT........',
        '....SSSSSSSSSTTDDTTT.........',
        '.....SSSSSSSSSTDDTT..........',
        '.......SSSSSSSSDDT...........',
        '.........SSSSSSDD............',
        '..........DDDDDDD............',
        '.........DDDDDDDDD...........',
        '.........EEEEEEEEE...........',
      ], cm);

    case 'PERFECT_12': // Unbreakable (ornate shield)
      return centered([
        '...AAAAAAAAAAAAAAAA....',
        '..AADDDDDDDDDDDDDDAA..',
        '.AADDSSSSSSSSSSSSDDAA.',
        '.ADDSSSSSSSSSSSSSSDDA.',
        '.ADDSSSSSSHHHSSSSSDA..',
        '.ADDSSSSSHHHHHSSSSDA..',
        '.ADDSSSSHHHHHHHSSSDA..',
        '.ADDSSSSSHHHHHSSSSDA..',
        '.ADDSSSSSSHHHSSSSSDA..',
        '.ADDSSSSSSSSSSSSSSDA..',
        '.ADDSSSSSSSSSSSSSSDDA.',
        '.AADDSSSSSSSSSSSSDDAA.',
        '..AADDSSSSSSSSSSDDAA..',
        '...AADDSSSSSSSDDAA....',
        '....AADDSSSSSDDA......',
        '.....AADDSSSDA........',
        '......AADDDA...........',
        '.......AADA............',
        '........AA.............',
      ], cm);

    default:
      return '';
  }
}


// SVG generator - flat pixel art like the SBC logo

/**
 * Generate a 400×400 SVG badge emblem.
 * Flat pixel art on a solid dark background.
 * No gradients, no glow, no filters, no stars.
 */
export function generateBadgeSvg(badgeId: string): string {
  const def = getBadgeById(badgeId);
  if (!def) throw new Error(`Unknown badge: ${badgeId}`);

  const p = getPalette(badgeId);
  const SBC_BG = '#0A0A1E';

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">',
    `<rect width="400" height="400" fill="${SBC_BG}"/>`,
    badgeArt(badgeId, p),
    '</svg>',
  ].join('\n');
}


// Metadata

/**
 * Generate Metaplex-compatible NFT metadata JSON for a badge.
 */
export function generateBadgeMetadata(badgeId: string): object {
  const def = getBadgeById(badgeId);
  if (!def) throw new Error(`Unknown badge: ${badgeId}`);

  const p = getPalette(badgeId);
  const backendUrl = env.BACKEND_URL ?? '';
  const imageUrl = `${backendUrl}/api/v1/badges/image/${badgeId}`;

  return {
    name: `${def.name} - Seeker Burn Club`,
    symbol: 'SKRBADGE',
    description: def.description,
    image: imageUrl,
    animation_url: null,
    external_url: backendUrl,
    attributes: [
      { trait_type: 'Badge',       value: def.name },
      { trait_type: 'Type',        value: (() => {
        switch (def.type) {
          case 'streak':   return 'Streak';
          case 'lifetime': return 'Lifetime Burn';
          case 'daily':    return 'Daily Volume';
          case 'txcount':  return 'Burn Count';
          case 'perfect':  return 'Perfect Month';
        }
      })() },
      { trait_type: 'Requirement', value: (() => {
        switch (def.type) {
          case 'streak':   return `${def.threshold} day streak`;
          case 'lifetime': return `${def.threshold} SKR burned`;
          case 'daily':    return `${def.threshold} SKR in one day`;
          case 'txcount':  return `${def.threshold} burns completed`;
          case 'perfect':  return `${def.threshold} perfect month${def.threshold > 1 ? 's' : ''}`;
        }
      })() },
      { trait_type: 'Rarity',      value: p.rarity },
      { trait_type: 'Collection',  value: 'Seeker Burn Club' },
    ],
    properties: {
      files: [{ uri: imageUrl, type: 'image/svg+xml' }],
      category: 'image',
      collection: {
        name: 'Seeker Burn Club Badges',
        family: 'Seeker Burn Club',
      },
    },
    seller_fee_basis_points: 0,
  };
}