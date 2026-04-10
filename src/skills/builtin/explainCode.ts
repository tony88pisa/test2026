import { ollamaChatRequest } from '../../remote/localBridge.js'
import type { Skill } from '../types.js'

export const explainCodeSkill: Skill = {
  name: 'explain-code',
  description: 'Spiega codice con context 128K',
  trigger: '/explain-code',
  async run(ctx) {
    // Context 128K: passa file interi senza chunking
    const resp = await ollamaChatRequest(
      [
        {
          role: 'system',
          content: 'You are an expert code reviewer. Explain clearly what this code does, identify potential issues, and suggest improvements. Be specific and technical.'
        },
        ...ctx.messages
      ],
      { temperature: 0.1, num_predict: 2048 }
    )
    return {
      content: resp.message.content,
      error: resp.error
    }
  }
}
