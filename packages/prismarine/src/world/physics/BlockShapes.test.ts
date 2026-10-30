import { blockSchemas } from '@jsprismarine/minecraft/generated/block-schemas';
import { describe, expect, it } from 'vitest';

import { FULL_BLOCK, PASSABLE } from '@jsprismarine/blocks';
import { collisionTopOf } from './BlockShapes';

describe('block shapes', () => {
    it('answers for every block in the palette', () => {
        // The point of reading the capture rather than a name list: the list knew eighty of these.
        const blocks = Object.keys(blockSchemas.blocks);
        expect(blocks.length).toBeGreaterThan(1400);
        expect(blocks.every((name) => Number.isFinite(collisionTopOf(name)))).toBe(true);
    });

    it('makes a fence taller than a jump', () => {
        // The whole reason fences exist. A mob's jump peaks at 1.252 blocks, so 1.5 is precisely
        // the height nothing clears - and reading a fence as an ordinary cube, which is what
        // happens when a block is only ever solid or not, lets every animal out of the paddock.
        expect(collisionTopOf('minecraft:oak_fence')).toBe(1.5);
        expect(collisionTopOf('minecraft:nether_brick_fence')).toBe(1.5);
        expect(collisionTopOf('minecraft:cobblestone_wall')).toBe(1.5);
    });

    it('opens a gate and shuts it again', () => {
        expect(collisionTopOf('minecraft:fence_gate', { open_bit: 0 })).toBe(1.5);
        expect(collisionTopOf('minecraft:fence_gate', { open_bit: 1 })).toBe(PASSABLE);
        expect(collisionTopOf('minecraft:spruce_fence_gate', { open_bit: 1 })).toBe(PASSABLE);
    });

    it('knows which half of its cell a slab fills', () => {
        expect(collisionTopOf('minecraft:oak_slab', { 'minecraft:vertical_half': 'bottom' })).toBe(0.5);

        // A top slab fills the upper half, which one number per block cannot express - so it is
        // taken as a full cube. Nothing can stand under one anyway.
        expect(collisionTopOf('minecraft:oak_slab', { 'minecraft:vertical_half': 'top' })).toBe(FULL_BLOCK);

        // A double slab is a block, and it is only the `_slab` suffix that could suggest otherwise.
        expect(collisionTopOf('minecraft:oak_double_slab', { 'minecraft:vertical_half': 'bottom' })).toBe(FULL_BLOCK);

        // And this one the suffix rule got wrong: a cut copper double slab is a full block whose
        // name ends in `_slab` without ending in `_double_slab`.
        expect(collisionTopOf('minecraft:double_cut_copper_slab')).toBe(FULL_BLOCK);
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
        // villagers can use their own houses. A trapdoor is answered by the capture, which knows
        // it is a panel on the floor until it is opened.
        expect(collisionTopOf('minecraft:trapdoor', { open_bit: 0, upside_down_bit: 0 })).toBe(0.1825);
        expect(collisionTopOf('minecraft:trapdoor', { open_bit: 1, upside_down_bit: 0 })).toBe(FULL_BLOCK);
        expect(collisionTopOf('minecraft:wooden_door')).toBe(PASSABLE);
        expect(collisionTopOf('minecraft:iron_door')).toBe(PASSABLE);
    });

    it('carries the rest of the vanilla heights', () => {
        expect(collisionTopOf('minecraft:white_carpet')).toBe(0.0625);
        expect(collisionTopOf('minecraft:farmland')).toBe(0.9375);
        expect(collisionTopOf('minecraft:grass_path')).toBe(0.9375);
        expect(collisionTopOf('minecraft:soul_sand')).toBe(0.875);
        expect(collisionTopOf('minecraft:bed')).toBe(0.5625);
        expect(collisionTopOf('minecraft:cake')).toBe(0.5);
        expect(collisionTopOf('minecraft:waterlily')).toBe(0.09375);

        // Two boxes in vanilla, a bottom slab with a quarter on top, and the lower of the two is
        // the step a mob has to get its feet over.
        expect(collisionTopOf('minecraft:oak_stairs')).toBe(0.5);
    });

    it('knows the blocks a hand-written list never named', () => {
        expect(collisionTopOf('minecraft:candle')).toBe(0.375);
        expect(collisionTopOf('minecraft:glow_lichen')).toBe(PASSABLE);
        expect(collisionTopOf('minecraft:tube_coral_fan')).toBe(PASSABLE);
        expect(collisionTopOf('minecraft:heavy_core')).toBe(0.5);

        // A cell a mob stands inside rather than on top of, which one blanket cube could not say.
        expect(collisionTopOf('minecraft:cauldron')).toBe(0.3125);
    });

    it('treats anything it has never heard of as a block', () => {
        // The safe way to be wrong: an unknown block that read as air would be a hole in the world.
        expect(collisionTopOf('minecraft:some_block_from_a_later_version')).toBe(FULL_BLOCK);
        expect(collisionTopOf('minecraft:stone')).toBe(FULL_BLOCK);
        expect(collisionTopOf('minecraft:air')).toBe(PASSABLE);
    });
});
