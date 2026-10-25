import { beforeEach, describe, expect, it } from 'vitest';

import {
    ATTACHMENT_STATE,
    LEVER,
    LEVER_OPEN_STATE,
    PISTON,
    PISTON_EXTENDED_STATE,
    REDSTONE_WIRE,
    SIGNAL_STATE
} from './components';
import { FIRE, FIRE_AGE_STATE, FIRE_TICK_DELAY_MIN, FIRE_TICK_DELAY_SPREAD } from './fire';
import { pistonArmFor } from './pistons';
import type { TestEngine } from './testing';
import { createTestEngine } from './testing';
import type { BlockPosition } from './world';
import { block } from './world';

/**
 * `Engine.setBlockAndUpdate`, which is Java's `Level.setBlockAndUpdate`.
 *
 * The generic six neighbor updates have always run. What these cover is each block's own
 * `onPlace`: the work that reads the world the new block landed in, rather than telling the
 * world about it. Every one of these was missing, and each looked like a system that does
 * not work rather than a first tick nobody booked.
 */

const at = (x: number, y = 1, z = 0): BlockPosition => ({ x, y, z });

const stone = block('minecraft:stone');
const planks = block('minecraft:oak_planks');
const lever = (open: boolean) => block(LEVER, { [ATTACHMENT_STATE]: 'down', [LEVER_OPEN_STATE]: open });

describe('a block placed through setBlockAndUpdate', () => {
    let test: TestEngine;

    beforeEach(() => {
        // Every draw returns 0, so the fire delay below is its minimum rather than a range.
        test = createTestEngine();
        for (let x = -1; x <= 4; x++) test.world.place({ x, y: 0, z: 0 }, stone);
    });

    it('works out the power of dust that landed beside a lever already on', () => {
        test.world.place(at(-1), lever(true));

        test.engine.setBlockAndUpdate(at(0), block(REDSTONE_WIRE, { [SIGNAL_STATE]: 0 }));

        // `RedstoneWireBlock.onPlace`. The six updates tell the lever about the dust and
        // nothing tells the dust about the lever, so without this the dust stayed dark.
        expect(test.world.stateAt(at(0), SIGNAL_STATE)).toBe(15);
    });

    it('extends a piston that landed in a position something already powers', () => {
        test.world.place(at(0), lever(true));

        test.engine.setBlockAndUpdate(at(1), block(PISTON.plain, { facing_direction: 'east' }));

        // `PistonBaseBlock.onPlace` runs `checkIfExtend`.
        expect(test.world.nameAt(at(2))).toBe(pistonArmFor(PISTON.plain));
        expect(test.world.stateAt(at(1), PISTON_EXTENDED_STATE)).toBe(true);
    });

    it('books fire its first tick, 30 to 40 game ticks out', () => {
        test.world.place(at(1), planks);

        test.engine.setBlockAndUpdate(at(0), block(FIRE, { [FIRE_AGE_STATE]: 0 }));

        // `FireBlock.onPlace`. Nothing else ever books a fire tick, so placed fire used to
        // sit where it was lit: it never aged, never spread and never burned out.
        expect(test.world.hasScheduledTick('block', at(0), FIRE)).toBe(true);
        test.runGameTicks(FIRE_TICK_DELAY_MIN - 1);
        expect(test.world.nameAt(at(1))).toBe('minecraft:oak_planks');

        test.runGameTicks(FIRE_TICK_DELAY_SPREAD + 1);
        expect(test.world.nameAt(at(1))).toBe(FIRE);
    });

    it('books a fluid its first tick', () => {
        test.engine.setBlockAndUpdate(at(0), block('minecraft:water', { liquid_depth: 0 }));

        // A fluid tick is filed under the flowing block, which is the type `fluidTick` runs.
        expect(test.world.hasScheduledTick('fluid', at(0), 'minecraft:flowing_water')).toBe(true);
    });
});

describe('fire with the spread radius against it', () => {
    it('reschedules itself and does nothing else', () => {
        const test = createTestEngine({ engine: { canSpreadFireAround: () => false } });
        test.world.place(at(0, 0, 0), stone);
        test.world.place(at(1), planks);
        test.engine.setBlockAndUpdate(at(0), block(FIRE, { [FIRE_AGE_STATE]: 0 }));

        test.runGameTicks(FIRE_TICK_DELAY_MIN * 4);

        // Java's `ServerLevel.canSpreadFireAround` gates everything after the reschedule, so
        // the plank stands, the fire stands, and both carry on the moment the rule comes back.
        expect(test.world.nameAt(at(1))).toBe('minecraft:oak_planks');
        expect(test.world.nameAt(at(0))).toBe(FIRE);
        expect(test.world.hasScheduledTick('block', at(0), FIRE)).toBe(true);
    });
});
