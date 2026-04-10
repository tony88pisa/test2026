import { loadAllSkills, listSkills } from '../src/skills/registry.js';

await loadAllSkills();
// Wait a bit for dynamic imports to settle
await new Promise(r => setTimeout(r, 1000));
const skills = listSkills();
console.log('Total Skills:', skills.length);
skills.forEach(s => console.log(' -', s.trigger));
process.exit(0);
