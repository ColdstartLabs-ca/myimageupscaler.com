import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const skill = fs.readFileSync(path.resolve('.claude/skills/gsc-analysis/SKILL.md'), 'utf8');

describe('GSC analysis skill contract', () => {
  it('should require brandSplit before summary in the documented analysis workflow', () => {
    const stepTwo = skill.slice(skill.indexOf('### Step 2'), skill.indexOf('### Single-URL'));
    expect(stepTwo.indexOf('comparison.brandSplit')).toBeGreaterThanOrEqual(0);
    expect(stepTwo.indexOf('comparison.brandSplit')).toBeLessThan(stepTwo.indexOf('`summary`'));
  });

  it('should document the phantom quarantine threshold', () => {
    expect(skill).toContain('more than 5,000 impressions');
    expect(skill).toContain('CTR below 0.05%');
  });
});
