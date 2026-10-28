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
const lever = (open: boolean) => block(LEVER, { [ATTACHMENT_STATE]: 'down', [LEVER_OPEN_STATE]: open });

describe('a block placed through setBlockAndUpdate', () => {
    let test: TestEngine;

    beforeEach(() => {
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
});
