import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { java_entity_goals } from '../../src/index.ts';
import { captureFromJar, capturePath, formatCapture, pinnedServerJar } from './run.ts';

const jar = await pinnedServerJar();

describe('entity_goals.json', () => {
    it('records a zombie looking at players 8 blocks out, as Zombie.addBehaviourGoals does', () => {
        const look = java_entity_goals['minecraft:zombie']?.find(
            (row) =>
                row.goal === 'LookAtPlayerGoal' && JSON.stringify(row.params.lookAtType).includes('minecraft:player')
        );
        expect(look?.params.lookDistance).toBe(8);
    });

    it("credits a mob with no goal of an ancestor's registerGoals that its own override never calls", () => {
        // `Camel.registerGoals` is empty, so `AbstractHorse.addBehaviourGoals` never runs for a camel,
        // and `Llama.registerGoals` registers its own panic goal without calling up to the horse's.
        expect(java_entity_goals['minecraft:camel'] ?? []).toEqual([]);
        expect(java_entity_goals['minecraft:camel_husk'] ?? []).toEqual([]);
        expect(java_entity_goals['minecraft:llama']?.filter((row) => row.goal === 'PanicGoal')).toHaveLength(1);
    });

    it.skipIf(!jar.exists)('matches what the pinned jar holds', () => {
        expect(formatCapture(captureFromJar(readFileSync(jar.path)))).toBe(
            readFileSync(capturePath(jar.version), 'utf8')
        );
    });
});
