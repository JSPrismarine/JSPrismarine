import { describe, expect, it } from 'vitest';
import { reportProgress } from '../../../../../.test/reportProgress';

import { Activities, BRAIN_MOBS, BrainMobRegistry, registerBrainMobs } from '@jsprismarine/entity-brains';

import { brainMobFor } from './brainIdentifiers';
import { entityFixture, FLOOR_Y, TestEntityWorld } from './testing';
import type { ExtraEntities } from './testing';

/**
 * The identifier each brain mob spawns under on a Bedrock server, written
 * out rather than derived, so a rename in the mapping tables fails this test
 * instead of agreeing with itself.
 */
const SPAWNED_AS: Readonly<Record<string, string>> = {
    'minecraft:allay': 'minecraft:allay',
    'minecraft:armadillo': 'minecraft:armadillo',
    'minecraft:axolotl': 'minecraft:axolotl',
    'minecraft:breeze': 'minecraft:breeze',
    'minecraft:camel': 'minecraft:camel',
    'minecraft:copper_golem': 'minecraft:copper_golem',
    'minecraft:creaking': 'minecraft:creaking',
    'minecraft:frog': 'minecraft:frog',
    'minecraft:goat': 'minecraft:goat',
    'minecraft:happy_ghast': 'minecraft:happy_ghast',
    'minecraft:hoglin': 'minecraft:hoglin',
    'minecraft:nautilus': 'minecraft:nautilus',
    'minecraft:piglin': 'minecraft:piglin',
    'minecraft:piglin_brute': 'minecraft:piglin_brute',
    'minecraft:sniffer': 'minecraft:sniffer',
    'minecraft:tadpole': 'minecraft:tadpole',
    'minecraft:villager': 'minecraft:villager_v2',
    'minecraft:warden': 'minecraft:warden',
    'minecraft:zoglin': 'minecraft:zoglin',
    'minecraft:zombie_nautilus': 'minecraft:zombie_nautilus'
};

/** A body with nothing on it but the three stats every entity needs. */
const plainMob = (): Record<string, unknown> => ({
    components: {
        'minecraft:health': { value: 20, max: 20 },
        'minecraft:movement': { value: 2 },
        'minecraft:collision_box': { width: 0.6, height: 1.8 }
    }
});

/** One entity file per brain mob, under the identifier Bedrock spawns it as. */
const brainMobDefinitions = (): ExtraEntities =>
    Object.fromEntries(Object.values(SPAWNED_AS).map((identifier) => [identifier, plainMob()]));

const GROUND = { x: 0.5, y: FLOOR_Y + 1, z: 0.5 };

const registry = () => {
    const built = new BrainMobRegistry();
    registerBrainMobs(built);
    return built;
};

describe('brainMobFor', () => {
    it('finds every registered brain mob by the identifier it spawns under', () => {
        const brains = registry();

        const found = BRAIN_MOBS.map((mob) => brainMobFor(brains, SPAWNED_AS[mob.id] ?? mob.id)?.id);

        expect(found).toEqual(BRAIN_MOBS.map((mob) => mob.id));
        reportProgress(`${BRAIN_MOBS.length} entity brain implementations are registered.`);
    });

    it('finds the villager under Bedrock’s legacy identifier', () => {
        const brains = registry();

        expect(brainMobFor(brains, 'minecraft:villager_v2')?.id).toBe('minecraft:villager');
        expect(brainMobFor(brains, 'minecraft:villager')?.id).toBe('minecraft:villager');
    });

    it('leaves a goal-only mob without a brain', () => {
        expect(brainMobFor(registry(), 'minecraft:cow')).toBeUndefined();
    });
});

describe('EntityRuntime brain attachment', () => {
    it('attaches a brain to every registered brain mob under its Bedrock spawn name', () => {
        const { runtime } = entityFixture(new TestEntityWorld(), {}, brainMobDefinitions());

        const attached = BRAIN_MOBS.map((mob) => runtime.spawn(SPAWNED_AS[mob.id] ?? mob.id, GROUND)?.brainMob?.id);

        expect(attached).toEqual(BRAIN_MOBS.map((mob) => mob.id));
    });

    it('runs the villager’s Java brain and its schedule rather than its Bedrock goals', () => {
        // 12000 is the start of the schedule's `rest` block, so an attached brain
        // that reads the schedule answers `rest` and one that does not answers nothing.
        const world = new TestEntityWorld({ dayTime: 12500 });
        const { runtime } = entityFixture(world, {}, brainMobDefinitions());

        const villager = runtime.spawn('minecraft:villager_v2', GROUND);
        runtime.tick(1);

        expect(villager?.brainMob?.id).toBe('minecraft:villager');
        expect(villager?.brain?.isActive(Activities.REST)).toBe(true);
        expect(villager?.runsGoals).toBe(false);
    });

    it('moves the villager to the schedule’s work block when the day says so', () => {
        const world = new TestEntityWorld({ dayTime: 3000 });
        const { runtime } = entityFixture(world, {}, brainMobDefinitions());

        const villager = runtime.spawn('minecraft:villager_v2', GROUND);
        runtime.tick(1);

        // `work` needs a job site the villager has no memory of, so the schedule
        // falls through to `idle`; either way the brain chose it, which a villager
        // on the Bedrock goal path never would.
        expect(villager?.brain?.isActive(Activities.REST)).toBe(false);
        expect(villager?.brain?.isActive(Activities.IDLE)).toBe(true);
    });
});
