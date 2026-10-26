import { describe, expect, it } from 'vitest';

import { DEFAULT_BOX, boxOf } from './facts';
import { FLOOR_Y, TestEntityWorld, entityFixture } from './testing';

/**
 * The hitbox of a type, which the server and the client both have to agree on.
 *
 * It used to be a table of 110 rows written out by hand in `EntitySize.ts`, kept in step with
 * the entity classes by a test that enumerated them. The classes are gone and the numbers come
 * out of `minecraft:collision_box`, so the only thing left to check is that the read reaches
 * the pack and that the two entities no pack describes still get a box.
 */
const registry = () => entityFixture().runtime.content().entities.registry;

describe('the hitbox of an entity type', () => {
    it('is what the type declares', () => {
        expect(boxOf(registry(), 'minecraft:cow')).toStrictEqual({ width: 0.9, height: 1.3 });
    });

    it('is Java’s for the two entities no behavior pack declares', () => {
        // Mojang ships no `item.json` and no `falling_block.json`: both are bodies the server
        // makes rather than types a pack describes, so there is nothing in the registry to read.
        expect(boxOf(registry(), 'minecraft:item')).toStrictEqual({ width: 0.25, height: 0.25 });
        expect(boxOf(registry(), 'minecraft:falling_block')).toStrictEqual({ width: 0.98, height: 0.98 });
    });

    it('is a block for a type nothing describes', () => {
        // Mojang's own default. An unknown entity is more usefully a block-sized obstacle than
        // the point the server used to treat every mob as.
        expect(boxOf(registry(), 'minecraft:allay_from_some_future_version')).toStrictEqual(DEFAULT_BOX);
        expect(DEFAULT_BOX).toStrictEqual({ width: 1, height: 1 });
    });

    it('is a block for a declared type that carries no collision box', () => {
        // `jsprismarine:hatchling` declares a spawn event and nothing about its shape.
        expect(boxOf(registry(), 'jsprismarine:hatchling')).toStrictEqual(DEFAULT_BOX);
    });
});

/** Where the regression type stands: on the fixture's floor, at the origin. */
const SPAWN = { x: 0, y: FLOOR_Y + 1, z: 0 };

const LATE = 'jsprismarine:late_bloomer';

/**
 * A type that keeps every fact in a component group its spawn event adds.
 *
 * Which is what most of the vanilla pack does. Of the 128 entity files, 15
 * declare `minecraft:movement` only in a group, 18 `minecraft:attack`, 29
 * `minecraft:loot`, nine `minecraft:type_family`, six
 * `minecraft:collision_box`, five `minecraft:health`, three
 * `minecraft:knockback_resistance` and three `minecraft:underwater_movement`.
 * Only `minecraft:follow_range` is always in the base components, and it is
 * here anyway so that nothing is special-cased.
 */
const lateBloomer = {
    components: {},
    component_groups: {
        bloomed: {
            'minecraft:health': { value: 11, max: 11 },
            'minecraft:attack': { damage: 3 },
            'minecraft:knockback_resistance': { value: 0.5 },
            'minecraft:follow_range': { value: 24 },
            'minecraft:movement': { value: 2.5 },
            'minecraft:underwater_movement': { value: 1.5 },
            'minecraft:collision_box': { width: 0.4, height: 0.5 },
            'minecraft:type_family': { family: ['bloomer'] },
            'minecraft:loot': { table: 'loot_tables/entities/cow.json' }
        }
    },
    events: {
        'minecraft:entity_spawned': { add: { component_groups: ['bloomed'] } },
        'jsprismarine:wilt': { remove: { component_groups: ['bloomed'] } }
    }
};

/** What the group declares, which is what a live entity has to answer with. */
const BLOOMED = {
    identifier: LATE,
    box: { width: 0.4, height: 0.5 },
    health: 11,
    attackDamage: 3,
    knockbackResistance: 0.5,
    followRange: 24,
    movement: 2.5,
    underwaterMovement: 1.5,
    families: ['bloomer'],
    lootTable: 'loot_tables/entities/cow.json'
};

/**
 * A live entity's facts against the type's, for a type that declares its stats
 * in a component group.
 *
 * The regression this locks down: the facts used to be read once off a
 * throwaway instance built from the base components, so a type with its stats
 * in a group got zeroes. Fifteen vanilla types, the zombie among them, keep
 * `minecraft:movement` there, and all fifteen stood still - `MobBody.step`
 * scaled by a speed of zero and returned before moving anything. If any fact
 * goes back to a base-components-only read, the first test here goes red for
 * it by name.
 */
describe('the facts of a type that declares them in a component group', () => {
    const bloomed = () => {
        const fixture = entityFixture(new TestEntityWorld(), {}, { [LATE]: lateBloomer });
        const entity = fixture.runtime.spawn(LATE, SPAWN);
        if (entity === undefined) throw new Error(`the fixture declared no ${LATE}`);
        return { fixture, entity };
    };

    it('are the group’s on a live entity, for every fact the group carries', () => {
        expect(bloomed().entity.facts).toMatchObject(BLOOMED);
    });

    it('are zero on the type, which is why reading them off the type is the bug', () => {
        const { fixture } = bloomed();
        expect(fixture.runtime.typeFacts().get(LATE)).toMatchObject({
            box: DEFAULT_BOX,
            health: 0,
            attackDamage: 0,
            knockbackResistance: 0,
            followRange: 0,
            movement: 0,
            underwaterMovement: 0,
            families: [],
            lootTable: undefined
        });
    });

    it('uses the live movement value directly as one tick of path speed', () => {
        const { entity } = bloomed();
        entity.body.moveTo({ x: 8, y: SPAWN.y, z: 0 }, 1);
        entity.step();

        expect(entity.position.x).toBeCloseTo(BLOOMED.movement, 6);
    });

    it('follow the entity when the group goes away again', () => {
        const { entity } = bloomed();
        entity.instance.raise('jsprismarine:wilt', 'self', 'the test');
        entity.instance.tick();

        // The loot table is a component the group took with it. The attributes it wrote stay
        // at their last value, because a component writes an attribute when it initializes
        // and nothing takes one back - which is also what makes a re-added group reset one.
        expect(entity.facts.lootTable).toBeUndefined();
        expect(entity.facts.families).toStrictEqual([]);
        expect(entity.facts.movement).toBe(2.5);
    });
});
