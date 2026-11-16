import { describe, expect, it } from 'vitest';

import { FLOOR_Y, TestEntityWorld, entityFixture } from './testing';

/** A camel as Mojang's pack writes its fall: a sensor that takes four off the blow. */
const camel = {
    components: {
        'minecraft:health': { value: 32, max: 32 },
        'minecraft:collision_box': { width: 1.7, height: 2.375 },
        'minecraft:physics': {},
        'minecraft:damage_sensor': { triggers: [{ cause: 'fall', deals_damage: 'yes', damage_modifier: -4 }] }
    }
};

/** A pig, which Java gives the default three-block safe fall. */
const pig = {
    components: {
        'minecraft:health': { value: 10, max: 10 },
        'minecraft:collision_box': { width: 0.9, height: 0.9 },
        'minecraft:physics': {}
    }
};

/** Drops one entity from `blocks` above the floor and runs the world until it has long landed. */
const drop = (identifier: string, blocks: number, rules: Record<string, boolean> = {}) => {
    const world = new TestEntityWorld({ gameRules: rules });
    const fixture = entityFixture(world, {}, { 'minecraft:camel': camel, 'minecraft:pig': pig });
    const entity = fixture.runtime.spawn(identifier, { x: 0.5, y: FLOOR_Y + 1 + blocks, z: 0.5 });
    if (entity === undefined) throw new Error(`the fixture declares ${identifier}`);
    for (let tick = 1; tick <= 60; tick += 1) {
        world.advance();
        fixture.runtime.tick(tick);
    }
    const falls = world.commits.filter((commit) => commit.target.id === entity.id && commit.intent.cause === 'fall');
    return { entity, falls };
};

describe("a living body's fall", () => {
    it("costs Java's damage past the default three-block safe fall on landing", () => {
        const { entity, falls } = drop('minecraft:pig', 5);

        expect(falls.map((commit) => commit.taken)).toEqual([2]);
        expect(entity.instance.attributes.get('health')?.current).toBe(8);
    });

    it('costs nothing within the safe fall', () => {
        expect(drop('minecraft:pig', 3).falls).toEqual([]);
    });

    it("measures a camel's fall by Java's six-block safe fall and half multiplier, not the pack's -4", () => {
        const { falls } = drop('minecraft:camel', 20);

        // Java's `calculateFallDamage`: floor((20 - 6) * 0.5).
        expect(falls.map((commit) => commit.taken)).toEqual([7]);
    });

    it('costs nothing when the fallDamage game rule is off', () => {
        expect(drop('minecraft:pig', 10, { fallDamage: false }).falls).toEqual([]);
    });
});
