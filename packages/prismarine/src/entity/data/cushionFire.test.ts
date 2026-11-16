import { describe, expect, it } from 'vitest';

import { definitionOf } from '../../content/ContentOptions';
import { CUSHION_CHECK_TICKS } from './cushionFire';
import { entityFixture, entityFixtureStack, FLOOR_Y, TestEntityWorld } from './testing';

const FEET = { x: 0, y: FLOOR_Y + 1, z: 0 };

const LAVA_HURT = {
    damage_conditions: [{ filters: { test: 'in_lava' }, cause: 'lava', damage_per_tick: 4 }]
};

/** A cushion and a boat as the pack declares them: lava damage, and no health. */
const DEFINITIONS = {
    'minecraft:cushion': {
        components: {
            'minecraft:collision_box': { width: 0.999, height: 0.249 },
            'minecraft:hurt_on_condition': LAVA_HURT
        }
    },
    'minecraft:boat': { components: { 'minecraft:hurt_on_condition': LAVA_HURT } }
};

/** Runs one entity standing in `block` and answers the tick it left the world on, and the drops. */
const standingIn = (identifier: string, block: string | undefined, ticks: number, variant?: string) => {
    const world = new TestEntityWorld();
    const { runtime } = entityFixture(
        world,
        {
            load: () => ({
                definitions: {
                    ...entityFixtureStack(DEFINITIONS),
                    // Java's `#minecraft:fire`, which `Cushion.destroyIfInFire` looks for.
                    tags: new Map([
                        [
                            'block/minecraft:fire',
                            definitionOf('tags', 'block/minecraft:fire', { values: ['minecraft:fire'] })
                        ]
                    ])
                },
                diagnostics: []
            })
        },
        DEFINITIONS
    );
    if (block !== undefined) world.setBlock(FEET, block);
    const entity = runtime.spawn(
        identifier,
        { x: FEET.x + 0.5, y: FEET.y, z: FEET.z + 0.5 },
        variant === undefined ? {} : { data: { variant } }
    );
    if (entity === undefined) throw new Error(`the fixture spawned no ${identifier}`);
    let gone: number | undefined;
    for (let tick = 1; tick <= ticks && gone === undefined; tick += 1) {
        runtime.tick(tick);
        if (runtime.byId(entity.id) === undefined) gone = tick;
    }
    return { gone, drops: world.drops.map((drop) => drop.item.identifier) };
};

describe('a cushion', () => {
    it("burns away in lava on Java's check, and drops a cushion of its color", () => {
        const { gone, drops } = standingIn('minecraft:cushion', 'minecraft:lava', 250, 'red');
        expect(gone).toBe(CUSHION_CHECK_TICKS);
        expect(drops).toEqual(['minecraft:red_cushion']);
    });

    it('burns away in fire, white when its spawn named no color', () => {
        const { gone, drops } = standingIn('minecraft:cushion', 'minecraft:fire', 250);
        expect(gone).toBe(CUSHION_CHECK_TICKS);
        expect(drops).toEqual(['minecraft:white_cushion']);
    });

    it('stays on dry ground', () => {
        expect(standingIn('minecraft:cushion', undefined, 250).gone).toBeUndefined();
    });
});

describe('a boat in lava', () => {
    it("breaks on its second tick, as Java's lava blow lands every tick", () => {
        expect(standingIn('minecraft:boat', 'minecraft:lava', 20).gone).toBe(2);
    });
});
