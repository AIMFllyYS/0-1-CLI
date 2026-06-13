import * as path from 'path';
import { SkillPackage } from './types';

const home = process.env.USERPROFILE || process.env.HOME || '.';

export const SKILL_MARKETPLACE: SkillPackage[] = [
  {
    key: 'superpowers',
    displayName: 'Official Superpowers',
    description: 'Superpowers workflow skills for planning, TDD, reviews, and execution',
    sourceUrl: 'https://github.com/openai/superpowers',
    sourceType: 'local',
    sourcePath: path.join(home, '.codex', 'plugins', 'cache', 'openai-curated', 'superpowers', 'c6ea566d', 'skills'),
  },
  {
    key: 'agent-onboarding',
    displayName: 'Agent Onboarding Skill',
    description: 'Interactive onboarding skill by kaijie0074-art',
    sourceUrl: 'https://github.com/kaijie0074-art/agent-onboarding-skill',
    sourceType: 'git',
    repoUrl: 'https://github.com/kaijie0074-art/agent-onboarding-skill.git',
  },
];
