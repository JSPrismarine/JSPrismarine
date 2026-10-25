import { describe, expect, it } from 'vitest';

import { DEFAULT_BOX, boxOf } from './facts';
import { entityFixture } from './testing';

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
