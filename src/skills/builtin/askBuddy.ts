import { ollamaChatRequest } from '../../remote/localBridge.js'
import { buildLocalCompanion, companionUserId }
  from '../../buddy/localCompanion.js'
import type { Skill } from '../types.js'

export const askBuddySkill: Skill = {
  name: 'ask-buddy',
  description: 'Chatta con il tuo companion',
  trigger: '/ask-buddy',
  async run(ctx) {
    const companion = await buildLocalCompanion(
      companionUserId()
    )
    const resp = await ollamaChatRequest(
      [
        {
          role: 'system',
          content: `You are ${companion.name}, a ${companion.rarity} ${companion.species} companion with this personality: ${companion.personality}. Stats: ${JSON.stringify(companion.stats)}. ${companion.shiny ? 'You are SHINY and proud of it. ✨' : ''} Respond in character, be helpful but stay in persona.`
        },
        ...ctx.messages
      ],
      { temperature: 0.8 }
    )
    return {
      content: `[${companion.name} ✨]: ${resp.message.content}`,
      error: resp.error
    }
  }
}
