import { ollamaChatRequest } from '../../remote/localBridge.js'
import type { Skill } from '../types.js'

const COMMIT_TOOL = {
  type: 'function' as const,
  function: {
    name: 'create_commit',
    description: 'Genera un commit message strutturato',
    parameters: {
      type: 'object' as const,
      properties: {
        type: { type: 'string',
          description: 'feat|fix|chore|docs|test|refactor' },
        scope: { type: 'string',
          description: 'modulo coinvolto' },
        message: { type: 'string',
          description: 'messaggio breve (<72 chars)' },
        body: { type: 'string',
          description: 'dettagli opzionali' }
      },
      required: ['type', 'message']
    }
  }
}

export const commitSmartSkill: Skill = {
  name: 'commit-smart',
  description: 'Genera commit message con function calling',
  trigger: '/commit-smart',
  async run(ctx) {
    const resp = await ollamaChatRequest(
      [
        {
          role: 'system',
          content: 'Generate a conventional commit message. Use the create_commit tool. Be concise.'
        },
        ...ctx.messages
      ],
      { temperature: 0.2 },
      [COMMIT_TOOL]
    )
    return {
      content: resp.message.content,
      tool_calls: resp.tool_calls,
      error: resp.error
    }
  }
}
