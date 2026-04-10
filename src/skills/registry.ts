import type { Skill } from './types.js'

const registry = new Map<string, Skill>()

export function registerSkill(skill: Skill): void {
  registry.set(skill.trigger, skill)
}

export function getSkill(trigger: string): Skill | undefined {
  return registry.get(trigger)
}

export function listSkills(): Skill[] {
  return Array.from(registry.values())
}

export function loadAllSkills(): void {
  // Import lazy di ogni skill builtin
  // Aggiungere qui nuove skill senza modificare altro
  import('./builtin/commitSmart.js').then(m =>
    registerSkill(m.commitSmartSkill))
  import('./builtin/explainCode.js').then(m =>
    registerSkill(m.explainCodeSkill))
  import('./builtin/askBuddy.js').then(m =>
    registerSkill(m.askBuddySkill))
  import('./builtin/searchWeb.js').then(m =>
    registerSkill(m.searchWebSkill))
  import('./builtin/searchWeb.js').then(m =>
    registerSkill(m.readPageSkill))
}
