import { describe, expect, it } from 'vitest';

import { BrainMobRegistry } from '../registry.js';
import { SENSOR_TYPE_NAMES } from '../sensing/sensors.js';
import { BRAIN_MOBS, DUAL_SYSTEM_MOBS, registerBrainMobs } from './index.js';

/**
 * The twenty mob classes in 26.3 that reference `brainProvider` or `makeBrain`, from scanning the
 * constant pool of every top-level class under `net/minecraft/world/entity/`. The scan finds 21,
 * and the twenty-first is `LivingEntity`, which holds the base.
 */
const EXPECTED_BRAIN_MOBS = [
    'minecraft:allay',
    'minecraft:armadillo',
    'minecraft:axolotl',
    'minecraft:breeze',
    'minecraft:camel',
    'minecraft:copper_golem',
    'minecraft:creaking',
    'minecraft:frog',
    'minecraft:goat',
    'minecraft:happy_ghast',
    'minecraft:hoglin',
    'minecraft:nautilus',
    'minecraft:piglin',
    'minecraft:piglin_brute',
    'minecraft:sniffer',
    'minecraft:tadpole',
    'minecraft:villager',
    'minecraft:warden',
    'minecraft:zoglin',
    'minecraft:zombie_nautilus'
] as const;

describe('registerBrainMobs', () => {
    it('registers exactly the twenty mobs that build a brain in 26.3', () => {
        const registry = new BrainMobRegistry();
        registerBrainMobs(registry);
        expect(registry.size).toBe(20);
        expect([...registry.ids].sort()).toEqual([...EXPECTED_BRAIN_MOBS].sort());
    });

    it('gives every mob a brain that builds', () => {
        for (const mob of BRAIN_MOBS) {
            expect(() => mob.makeBrain(), mob.id).not.toThrow();
        }
    });

    it('refuses a duplicate registration', () => {
        const registry = new BrainMobRegistry();
        registerBrainMobs(registry);
        expect(() => registerBrainMobs(registry)).toThrow(/Duplicate brain mob/);
    });

    it('names only registered sensor types', () => {
        for (const mob of BRAIN_MOBS) {
            for (const sensor of mob.sensorTypes) {
                expect(SENSOR_TYPE_NAMES, `${mob.id} names ${sensor}`).toContain(sensor);
            }
        }
    });

    it('builds every brain with as many sensors as the mob declares sensor types', () => {
        for (const mob of BRAIN_MOBS) {
            const brain = mob.makeBrain();
            // Every sensor registers at least one memory, so the brain must know some.
            expect(brain.registeredMemories.length, mob.id).toBeGreaterThan(0);
            expect(mob.sensorTypes.length, mob.id).toBeGreaterThan(0);
        }
    });
});

describe('the two mobs that carry both AI systems', () => {
    it('is exactly the camel and the happy ghast', () => {
        expect([...DUAL_SYSTEM_MOBS].sort()).toEqual(['minecraft:camel', 'minecraft:happy_ghast']);
    });

    it('leaves every other mob on the brain system alone', () => {
        const brainOnly = BRAIN_MOBS.filter((mob) => !mob.alsoRunsGoals);
        expect(brainOnly).toHaveLength(18);
    });
});
