import { ollamaChatRequest } from '../remote/localBridge.js'
import type { CompanionBones, CompanionSoul, Companion,
              StoredCompanion } from '../../buddy/types.js'

// Re-esporta le funzioni pure da companion.ts upstream
// (quelle che non dipendono da Claude)
export { roll, rollWithSeed, companionUserId }
  from '../../buddy/companion.js'

/**
 * Genera la "soul" del companion via gemma4:latest.
 * Nome + personalità unici basati sulle bones.
 * NON lancia mai eccezioni.
 */
export async function generateSoulLocal(
  bones: CompanionBones
): Promise<CompanionSoul> {
  const prompt = `You are naming a virtual companion for a developer.
Species: ${bones.species}
Rarity: ${bones.rarity}
Stats: DEBUGGING=${bones.stats.DEBUGGING}, 
       PATIENCE=${bones.stats.PATIENCE},
       CHAOS=${bones.stats.CHAOS},
       WISDOM=${bones.stats.WISDOM},
       SNARK=${bones.stats.SNARK}
Hat: ${bones.hat}, Eyes: ${bones.eye}
${bones.shiny ? 'This companion is SHINY (extremely rare)!' : ''}

Respond with ONLY valid JSON, no markdown, no extra text:
{"name": "...", "personality": "..."}`

  const resp = await ollamaChatRequest([
    { role: 'user', content: prompt }
  ])

  try {
    const content = resp.message.content.trim()
    // Simple naive JSON extractor if needed, but try direct parse first
    const parsed = JSON.parse(content)
    if (parsed.name && parsed.personality) {
      return { name: parsed.name, personality: parsed.personality }
    }
  } catch {}

  // Fallback deterministico se gemma4 non risponde bene
  return {
    name: `${bones.rarity === 'legendary' ? 'Lord ' : ''}${
      bones.species.charAt(0).toUpperCase() + bones.species.slice(1)
    }`,
    personality: `A ${bones.rarity} ${bones.species} with ${
      bones.shiny ? 'a mysterious shiny aura and ' : ''
    }exceptional ${
      Object.entries(bones.stats).sort((a,b) => b[1]-a[1])[0][0]
    } skills.`,
  }
}

/**
 * Costruisce il Companion completo locale.
 * Se CAMELOT_LOCAL=1 → companion sempre shiny. 🌟
 */
export async function buildLocalCompanion(
  userId: string
): Promise<Companion> {
  const { roll } = await import('../../buddy/companion.js')
  const { bones } = roll(userId)

  // Easter egg: CAMELOT_LOCAL=1 → sempre shiny
  if (process.env.CAMELOT_LOCAL === '1') {
    bones.shiny = true
  }

  const soul = await generateSoulLocal(bones)
  return {
    ...bones,
    ...soul,
    hatchedAt: Date.now(),
  }
}
