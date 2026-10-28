import { describe, expect, it } from 'vitest';

import { isFullCube, isRedstoneConductor } from './blockRules';
import { block } from './world';

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

    it('refuses a piston, which `pistonProperties()` registers with never', () => {
        // Both are opaque cubes, so the light dampening test reads them as full cubes and the
        // override is the only thing that stops a piston carrying a signal into the block
        // beside it. The call site is shared by the two of them, which is why it was missed.
        expect(isFullCube(block('minecraft:piston'))).toBe(true);
        expect(isRedstoneConductor(block('minecraft:piston'))).toBe(false);
        expect(isRedstoneConductor(block('minecraft:sticky_piston'))).toBe(false);
    });

    it('refuses every copper bulb, weathered and waxed alike', () => {
        // `WeatheringCopperCollection.registerBlocks` takes one properties factory and runs it
        // for all four weather states and their waxed twins, so one never call covers eight
        // blocks. Not conducting is the whole point of a bulb in a circuit.
        for (const stage of ['', 'exposed_', 'weathered_', 'oxidized_']) {
            for (const wax of ['', 'waxed_']) {
                const name = `minecraft:${wax}${stage}copper_bulb`;
                expect(isFullCube(block(name))).toBe(true);
                expect(isRedstoneConductor(block(name))).toBe(false);
            }
        }
    });

    it('refuses a repeater without needing an override, because it is not a full cube', () => {
        // Java's `REPEATER` registration calls `isRedstoneConductor` not at all. The two
        // Bedrock names used to be listed as overrides; the default answers the same.
        expect(isFullCube(block('minecraft:powered_repeater'))).toBe(false);
        expect(isRedstoneConductor(block('minecraft:powered_repeater'))).toBe(false);
        expect(isRedstoneConductor(block('minecraft:unpowered_repeater'))).toBe(false);
    });

    it('leaves the overrides `isFullCube` already refuses out of the set', () => {
        // Java overrides 65 blocks and this package writes down the 26 where the override
        // changes an answer. Leaves, stained glass and copper grates all dampen light by less
        // than 15, so the default refuses them and the override would be dead weight.
        for (const name of ['minecraft:oak_leaves', 'minecraft:white_stained_glass', 'minecraft:copper_grate']) {
            expect(isFullCube(block(name))).toBe(false);
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
