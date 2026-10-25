import { describe, expect, it } from 'vitest';

import { hardnessOf, isFullCube, isRedstoneConductor, pushReactionOf } from './blockRules';
import { block } from './world';

describe('push reaction', () => {
    it('comes from the mapping table, not from a list kept here', () => {
        expect(pushReactionOf(block('minecraft:stone'))).toBe('push_pull');
        expect(pushReactionOf(block('minecraft:obsidian'))).toBe('immoveable');
        expect(pushReactionOf(block('minecraft:torch'))).toBe('popped');
        expect(pushReactionOf(block('minecraft:piston'))).toBe('immoveable');
    });

    it('falls back to the push_pull default for a block the table does not hold', () => {
        expect(pushReactionOf(block('minecraft:not_a_real_block'))).toBe('push_pull');
    });

    it('reports bedrock as unbreakable, which is what stops a piston first', () => {
        expect(hardnessOf(block('minecraft:bedrock'))).toBe(-1);
    });
});

describe('redstone conductivity', () => {
    it('reads an opaque cube as a conductor', () => {
        expect(isRedstoneConductor(block('minecraft:stone'))).toBe(true);
        expect(isRedstoneConductor(block('minecraft:dirt'))).toBe(true);
    });

    it('refuses the blocks whose Java registration calls isRedstoneConductor(never)', () => {
        for (const name of [
            'minecraft:glass',
            'minecraft:glowstone',
            'minecraft:sea_lantern',
            'minecraft:redstone_block',
            'minecraft:observer',
            'minecraft:tnt',
            'minecraft:ice'
        ]) {
            expect(isRedstoneConductor(block(name))).toBe(false);
        }
    });

    it('accepts the two blocks whose registration calls isRedstoneConductor(always)', () => {
        expect(isRedstoneConductor(block('minecraft:soul_sand'))).toBe(true);
        expect(isRedstoneConductor(block('minecraft:mud'))).toBe(true);
    });

    it('treats slime and honey as the full cubes they are', () => {
        expect(isFullCube(block('minecraft:slime'))).toBe(true);
        expect(isFullCube(block('minecraft:honey_block'))).toBe(true);
    });

    it('refuses the shapes that are not cubes', () => {
        expect(isFullCube(block('minecraft:oak_slab'))).toBe(false);
        expect(isFullCube(block('minecraft:oak_stairs'))).toBe(false);
        expect(isFullCube(block('minecraft:hopper'))).toBe(false);
        expect(isFullCube(block('minecraft:air'))).toBe(false);
    });
});
