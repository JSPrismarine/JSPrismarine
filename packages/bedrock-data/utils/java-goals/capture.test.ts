import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { java_entity_goals } from '../../src/index.ts';
import { CAPTURE_PATH, captureFromJar, formatCapture, pinnedServerJar } from './run.ts';

const jar = await pinnedServerJar();

describe('entity_goals.json', () => {
    it('records a zombie looking at players 8 blocks out, as Zombie.addBehaviourGoals does', () => {
        const look = java_entity_goals['minecraft:zombie']?.find(
            (row) =>
                row.goal === 'LookAtPlayerGoal' && JSON.stringify(row.params.lookAtType).includes('minecraft:player')
        );
        expect(look?.params.lookDistance).toBe(8);
    });

    it.skipIf(!jar.exists)('matches what the pinned jar holds', () => {
        expect(formatCapture(captureFromJar(readFileSync(jar.path)))).toBe(readFileSync(CAPTURE_PATH, 'utf8'));
    });
});
