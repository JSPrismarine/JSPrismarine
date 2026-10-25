import { beforeEach, describe, expect, it } from 'vitest';

import {
    FLUID_BLOCKS,
    FLUID_RATES,
    LIQUID_DEPTH_STATE,
    fluidBlockOf,
    fluidKindOf,
    fluidStateOf,
    fluidTick,
    newLiquidAt
} from './fluids';
import type { TestEngine } from './testing';
import { createTestEngine } from './testing';
import type { BlockPosition, Dimension } from './world';
import { block } from './world';

const at = (x: number, y = 1, z = 0): BlockPosition => ({ x, y, z });
const stone = block('minecraft:stone');

const waterSource = block(FLUID_BLOCKS.water.source, { [LIQUID_DEPTH_STATE]: 0 });
const lavaSource = block(FLUID_BLOCKS.lava.source, { [LIQUID_DEPTH_STATE]: 0 });

/**
 * Build a one-block-wide trough running east: a floor at y = 0 and walls on
 * both sides and at the west end, so the fluid has exactly one way to go.
 */
const trough = (test: TestEngine, fromX: number, toX: number): void => {
    for (let x = fromX - 1; x <= toX + 1; x++) {
        for (const z of [-1, 0, 1]) test.world.place({ x, y: 0, z }, stone);
        test.world.place({ x, y: 1, z: -1 }, stone);
        test.world.place({ x, y: 1, z: 1 }, stone);
    }
    test.world.place({ x: fromX - 1, y: 1, z: 0 }, stone);
    test.world.place({ x: toX + 1, y: 1, z: 0 }, stone);
};

/** Run game ticks until nothing is queued, which is how far a fluid reaches. */
const settle = (test: TestEngine, maxTicks = 2000): number => {
    for (let i = 0; i < maxTicks; i++) {
        test.runGameTicks(1);
        if (test.world.scheduler.list('fluid').count() === 0) return i + 1;
    }
    return maxTicks;
};

/** How many blocks of fluid sit in the row east of the source. */
const reach = (test: TestEngine, kind: 'water' | 'lava'): number => {
    let count = 0;
    for (let x = 1; x < 40; x++) {
        if (fluidKindOf(test.world.getBlock(at(x))) !== kind) break;
        count++;
    }
    return count;
};

describe('fluid state encoding', () => {
    it('round-trips through Bedrock liquid_depth, which is Java getLegacyLevel', () => {
        const states = [
            { kind: 'water', amount: 8, falling: false, source: true },
            { kind: 'water', amount: 7, falling: false, source: false },
            { kind: 'water', amount: 1, falling: false, source: false },
            { kind: 'lava', amount: 8, falling: true, source: false }
        ] as const;

        for (const state of states) {
            expect(fluidStateOf(fluidBlockOf(state))).toEqual(state);
        }
    });

    it('spells a full flowing block as depth 1 and a source as depth 0', () => {
        expect(fluidBlockOf({ kind: 'water', amount: 8, falling: false, source: true }).states).toEqual({
            [LIQUID_DEPTH_STATE]: 0
        });
        expect(fluidBlockOf({ kind: 'water', amount: 7, falling: false, source: false }).states).toEqual({
            [LIQUID_DEPTH_STATE]: 1
        });
    });
});

describe('fluid rates', () => {
    it('takes the jar numbers for water and for lava in each dimension', () => {
        expect(FLUID_RATES.water.overworld).toEqual({ dropOff: 1, slopeFindDistance: 4, tickDelay: 5 });
        expect(FLUID_RATES.lava.overworld).toEqual({ dropOff: 2, slopeFindDistance: 2, tickDelay: 30 });
        expect(FLUID_RATES.lava.nether).toEqual({ dropOff: 1, slopeFindDistance: 4, tickDelay: 10 });
    });
});

describe('fluid spread', () => {
    let test: TestEngine;

    beforeEach(() => {
        test = createTestEngine();
    });

    it('carries water seven blocks from a source on a flat floor', () => {
        trough(test, 0, 20);
        test.world.place(at(0), waterSource);
        fluidTick(test.engine.updates, test.world, at(0));
        settle(test);

        expect(reach(test, 'water')).toBe(7);
        expect(test.world.stateAt(at(1), LIQUID_DEPTH_STATE)).toBe(1);
        expect(test.world.stateAt(at(7), LIQUID_DEPTH_STATE)).toBe(7);
        expect(test.world.nameAt(at(8))).toBe('minecraft:air');
    });

    it('asks the host to take a block the stream reached out, with its drops', () => {
        trough(test, 0, 20);
        test.world.place(at(1), block('minecraft:torch'));
        test.world.place(at(0), waterSource);

        fluidTick(test.engine.updates, test.world, at(0));
        settle(test);

        // Java's `beforeDestroyingBlock`: the torch is destroyed rather than overwritten, so
        // its loot table rolls and the water arrives in the same write.
        expect(test.world.destroyed).toHaveLength(1);
        const [washed] = test.world.destroyed;
        expect(washed?.at).toEqual(at(1));
        expect(washed?.block).toEqual(block('minecraft:torch'));
        expect(washed?.removal.drops).toBe(true);
        expect(washed?.removal.notifyNeighbors).toBe(true);
        expect(fluidKindOf(washed!.removal.replacement!)).toBe('water');
        expect(fluidKindOf(block(test.world.nameAt(at(1))))).toBe('water');
    });

    it('carries overworld lava three blocks, because it drops two levels per block', () => {
        trough(test, 0, 20);
        test.world.place(at(0), lavaSource);
        fluidTick(test.engine.updates, test.world, at(0));
        settle(test);

        expect(reach(test, 'lava')).toBe(3);
        expect(test.world.stateAt(at(3), LIQUID_DEPTH_STATE)).toBe(6);
    });

    it('carries nether lava seven blocks, because fast lava drops one', () => {
        const nether: Dimension = 'nether';
        test = createTestEngine({ dimension: nether });
        trough(test, 0, 20);
        test.world.place(at(0), lavaSource);
        fluidTick(test.engine.updates, test.world, at(0));
        settle(test);

        expect(reach(test, 'lava')).toBe(7);
    });

    it('makes a new source where two sources meet, which is infinite water', () => {
        trough(test, 0, 4);
        test.world.place(at(0), waterSource);
        test.world.place(at(2), waterSource);

        expect(newLiquidAt(test.world, at(1), 'water')).toEqual({
            kind: 'water',
            amount: 8,
            falling: false,
            source: true
        });
    });

    it('refuses the same for lava, because lava_source_conversion is off', () => {
        trough(test, 0, 4);
        test.world.place(at(0), lavaSource);
        test.world.place(at(2), lavaSource);

        expect(newLiquidAt(test.world, at(1), 'lava')).toEqual({
            kind: 'lava',
            amount: 6,
            falling: false,
            source: false
        });
    });

    it('runs straight at a one-block hole instead of spreading evenly', () => {
        // The trough is open both ways, with a gap in the floor two blocks east.
        // The slope search finds it and every drop of water heads that way.
        trough(test, -4, 4);
        test.world.place({ x: -5, y: 1, z: 0 }, block('minecraft:air'));
        test.world.place({ x: 2, y: 0, z: 0 }, block('minecraft:air'));
        test.world.place(at(0), waterSource);
        fluidTick(test.engine.updates, test.world, at(0));

        expect(test.world.nameAt(at(1))).toBe(FLUID_BLOCKS.water.flowing);
        expect(test.world.nameAt(at(-1))).toBe('minecraft:air');
    });

    it('drains the stream when the source is taken away', () => {
        trough(test, 0, 20);
        test.world.place(at(0), waterSource);
        fluidTick(test.engine.updates, test.world, at(0));
        settle(test);

        test.engine.setBlockAndUpdate(at(0), block('minecraft:air'));
        settle(test);

        expect(reach(test, 'water')).toBe(0);
    });
});

describe('lava reactions', () => {
    let test: TestEngine;

    beforeEach(() => {
        test = createTestEngine();
    });

    it('turns a lava source into obsidian when water reaches it', () => {
        trough(test, 0, 6);
        test.world.place(at(2), lavaSource);
        test.world.place(at(0), waterSource);
        fluidTick(test.engine.updates, test.world, at(0));
        settle(test);

        expect(test.world.nameAt(at(2))).toBe('minecraft:obsidian');
    });

    it('turns flowing lava into cobblestone when water reaches it', () => {
        trough(test, 0, 8);
        test.world.place(at(8), lavaSource);
        // The trough is closed at both ends, so the lava runs west only.
        fluidTick(test.engine.updates, test.world, at(8));
        settle(test);
        expect(test.world.nameAt(at(5))).toBe(FLUID_BLOCKS.lava.flowing);

        test.engine.setBlockAndUpdate(at(4), waterSource);

        expect(test.world.nameAt(at(5))).toBe('minecraft:cobblestone');
    });

    it('turns lava falling into water into stone', () => {
        test.world.place({ x: 0, y: 0, z: 0 }, stone);
        test.world.place(at(0, 1, 0), waterSource);
        test.world.place(at(0, 2, 0), lavaSource);

        fluidTick(test.engine.updates, test.world, at(0, 2, 0));

        expect(test.world.nameAt(at(0, 1, 0))).toBe('minecraft:stone');
    });

    it('turns lava over soul soil into basalt next to blue ice', () => {
        test.world.place({ x: 0, y: 0, z: 0 }, block('minecraft:soul_soil'));
        test.world.place(at(0), lavaSource);
        test.world.place(at(1), block('minecraft:blue_ice'));

        test.engine.updates.updateNeighborsAt(at(1), 'minecraft:blue_ice');

        expect(test.world.nameAt(at(0))).toBe('minecraft:basalt');
    });
});
