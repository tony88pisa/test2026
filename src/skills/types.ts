export type SkillContext = {
  messages: import('../remote/localBridge.js').OllamaMessage[]
  args: Record<string, string>
  workspacePath: string
}

export type SkillResult = {
  content: string
  tool_calls?: import('../remote/localBridge.js').OllamaToolCall[]
  thinking?: string
  error?: string
}

export type Skill = {
  name: string        // es: "commit-smart"
  description: string
  trigger: string     // es: "/commit-smart"
  run: (ctx: SkillContext) => Promise<SkillResult>
}
