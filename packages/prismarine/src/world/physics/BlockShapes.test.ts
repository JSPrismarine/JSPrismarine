import { describe, expect, it } from 'vitest';

import { FENCE_HEIGHT, FULL_BLOCK, PASSABLE, collisionTopOf } from './BlockShapes';

describe('block shapes', () => {
    it('makes a fence taller than a jump', () => {
        // The whole reason fences exist. A mob's jump peaks at 1.252 blocks, so 1.5 is precisely
        // the height nothing clears - and reading a fence as an ordinary cube, which is what
        // happens when a block is only ever solid or not, lets every animal out of the paddock.
        expect(FENCE_HEIGHT).toBeGreaterThan(1.252);

        expect(collisionTopOf('minecraft:oak_fence')).toBe(FENCE_HEIGHT);
        expect(collisionTopOf('minecraft:nether_brick_fence')).toBe(FENCE_HEIGHT);
        expect(collisionTopOf('minecraft:cobblestone_wall')).toBe(FENCE_HEIGHT);
    });

    it('opens a gate and shuts it again', () => {
        expect(collisionTopOf('minecraft:fence_gate', { open_bit: 0 })).toBe(FENCE_HEIGHT);
        expect(collisionTopOf('minecraft:fence_gate', { open_bit: 1 })).toBe(PASSABLE);
        expect(collisionTopOf('minecraft:oak_fence_gate', { open_bit: 1 })).toBe(PASSABLE);
    });

    it('knows which half of its cell a slab fills', () => {
        expect(collisionTopOf('minecraft:oak_slab', { 'minecraft:vertical_half': 'bottom' })).toBe(0.5);

        // A top slab fills the upper half, which one number per block cannot express - so it is
        // taken as a full cube. Nothing can stand under one anyway.
        expect(collisionTopOf('minecraft:oak_slab', { 'minecraft:vertical_half': 'top' })).toBe(FULL_BLOCK);

        // A double slab is a block, and it is only the `_slab` suffix that could suggest otherwise.
        expect(collisionTopOf('minecraft:oak_double_slab', { 'minecraft:vertical_half': 'bottom' })).toBe(FULL_BLOCK);
    });

    it('deepens with the snow', () => {
        // Eight layers of an eighth each, and the first has no collision at all - which is why a
        // dusting of snow does not trip anything up.
        expect(collisionTopOf('minecraft:snow_layer', { height: 0 })).toBe(PASSABLE);
        expect(collisionTopOf('minecraft:snow_layer', { height: 4 })).toBe(0.5);
        expect(collisionTopOf('minecraft:snow_layer', { height: 7 })).toBe(0.875);

        // Snow the block, not snow the layer, despite the name.
        expect(collisionTopOf('minecraft:snow')).toBe(FULL_BLOCK);
    });

    it('does not read a trapdoor as a doorway', () => {
        // `_trapdoor` ends in `_door`, and doors are deliberately walked through here so that
        // villagers can use their own houses. Answered by name before the families are consulted,
        // or every trapdoor in the world is a hole in the floor.
        expect(collisionTopOf('minecraft:oak_trapdoor', { open_bit: 0, upside_down_bit: 0 })).toBe(0.1875);
        expect(collisionTopOf('minecraft:oak_trapdoor', { open_bit: 1, upside_down_bit: 0 })).toBe(FULL_BLOCK);
        expect(collisionTopOf('minecraft:wooden_door')).toBe(PASSABLE);
    });

    it('carries the rest of the vanilla heights', () => {
        expect(collisionTopOf('minecraft:white_carpet')).toBe(0.0625);
        expect(collisionTopOf('minecraft:farmland')).toBe(0.9375);
        expect(collisionTopOf('minecraft:grass_path')).toBe(0.9375);
        expect(collisionTopOf('minecraft:soul_sand')).toBe(0.875);
        expect(collisionTopOf('minecraft:chest')).toBe(0.875);
        expect(collisionTopOf('minecraft:bed')).toBe(0.5625);
        expect(collisionTopOf('minecraft:cake')).toBe(0.5);
        expect(collisionTopOf('minecraft:waterlily')).toBe(0.09375);
        expect(collisionTopOf('minecraft:oak_stairs')).toBe(0.5);
    });

    it('treats anything it has never heard of as a block', () => {
        // The safe way to be wrong. The class registry covers eighty of the twelve hundred blocks
        // the client knows, so most of what world generation places is answered by this line - and
        // an unknown block that read as air would be a hole in the world.
        expect(collisionTopOf('minecraft:some_block_from_a_later_version')).toBe(FULL_BLOCK);
        expect(collisionTopOf('minecraft:stone')).toBe(FULL_BLOCK);
        expect(collisionTopOf('minecraft:air')).toBe(PASSABLE);
    });
});
