import type {
  CompanionBones, Rarity, Species, Eye, Hat,
  StatName, Companion
} from './types.js'
import {
  RARITIES, RARITY_WEIGHTS, SPECIES, EYES, HATS,
  STAT_NAMES
} from './types.js'

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function() {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pick<T>(rng:()=>number, arr:readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!
}

function rollRarity(rng:()=>number): Rarity {
  const total = Object.values(RARITY_WEIGHTS)
    .reduce((a,b) => a+b, 0)
  let roll = rng() * total
  for (const r of RARITIES) {
    roll -= RARITY_WEIGHTS[r]
    if (roll < 0) return r
  }
  return 'common'
}

const RARITY_FLOOR: Record<Rarity,number> = {
  common:5, uncommon:15, rare:25, epic:35, legendary:50
}

function rollStats(
  rng:()=>number, rarity:Rarity
): Record<StatName,number> {
  const floor = RARITY_FLOOR[rarity]
  const peak = pick(rng, STAT_NAMES)
  let dump = pick(rng, STAT_NAMES)
  while (dump === peak) dump = pick(rng, STAT_NAMES)
  const stats = {} as Record<StatName,number>
  for (const name of STAT_NAMES) {
    if (name === peak)
      stats[name] = Math.min(100, floor+50+Math.floor(rng()*30))
    else if (name === dump)
      stats[name] = Math.max(1, floor-10+Math.floor(rng()*15))
    else
      stats[name] = floor+Math.floor(rng()*40)
  }
  return stats
}

const SALT = 'camelot-2026'

export function roll(userId: string) {
  const rng = mulberry32(hashString(userId + SALT))
  const rarity = rollRarity(rng)
  const bones: CompanionBones = {
    rarity,
    species: pick(rng, SPECIES),
    eye: pick(rng, EYES),
    hat: rarity === 'common' ? 'none' : pick(rng, HATS),
    shiny: rng() < 0.01,
    stats: rollStats(rng, rarity),
  }
  return { bones, inspirationSeed: Math.floor(rng()*1e9) }
}

export function rollWithSeed(seed: string) {
  return roll(seed)
}

export function companionUserId(): string {
  return process.env.CAMELOT_USER_ID ?? 'camelot-local'
}
