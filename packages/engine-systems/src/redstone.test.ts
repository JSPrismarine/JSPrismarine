import { beforeEach, describe, expect, it } from 'vitest';

import {
    ATTACHMENT_STATE,
    COMPARATOR,
    COMPARATOR_SUBTRACT_STATE,
    FACING_STATE,
    LEVER,
    LEVER_OPEN_STATE,
    OBSERVER,
    OBSERVER_POWERED_STATE,
    REDSTONE_BLOCK,
    REDSTONE_TORCH,
    REDSTONE_WIRE,
    REPEATER,
    REPEATER_DELAY_STATE,
    SIGNAL_STATE
} from './components';
import { repeaterDelayTicks, repeaterIsLocked } from './diodes';
import type { TestEngine } from './testing';
import { createTestEngine } from './testing';
import type { BlockPosition, BlockRef } from './world';
import { block } from './world';

const at = (x: number, y = 1, z = 0): BlockPosition => ({ x, y, z });

const stone = block('minecraft:stone');
const wire = block(REDSTONE_WIRE, { [SIGNAL_STATE]: 0 });
const litTorch = (attachment = 'down'): BlockRef => block(REDSTONE_TORCH.lit, { [ATTACHMENT_STATE]: attachment });
const lever = (open: boolean): BlockRef => block(LEVER, { [ATTACHMENT_STATE]: 'down', [LEVER_OPEN_STATE]: open });

/** A floor of stone under the whole circuit, which is what wire needs to survive on. */
const floor = (test: TestEngine, fromX: number, toX: number, z = 0): void => {
    for (let x = fromX; x <= toX; x++) test.world.place({ x, y: 0, z }, stone);
};

describe('redstone dust', () => {
    let test: TestEngine;

    beforeEach(() => {
        test = createTestEngine();
    });

    it('steps down by one per block away from a block of redstone', () => {
        floor(test, -1, 20);
        test.world.place(at(-1), block(REDSTONE_BLOCK));
        test.world.placeLine(at(0), 'x', 20, wire);

        test.engine.updates.updateNeighborsAt(at(-1), REDSTONE_BLOCK);

        expect(test.world.stateAt(at(0), SIGNAL_STATE)).toBe(15);
        expect(test.world.stateAt(at(1), SIGNAL_STATE)).toBe(14);
        expect(test.world.stateAt(at(14), SIGNAL_STATE)).toBe(1);
        expect(test.world.stateAt(at(15), SIGNAL_STATE)).toBe(0);
    });

    it('falls back to zero along the whole line when the source goes away', () => {
        floor(test, -1, 20);
        test.world.place(at(-1), block(REDSTONE_BLOCK));
        test.world.placeLine(at(0), 'x', 16, wire);
        test.engine.updates.updateNeighborsAt(at(-1), REDSTONE_BLOCK);

        test.engine.setBlockAndUpdate(at(-1), block('minecraft:air'));

        for (let x = 0; x < 16; x++) expect(test.world.stateAt(at(x), SIGNAL_STATE)).toBe(0);
    });

    it('does not read a conductor as a source, so dust next to dust still steps down', () => {
        floor(test, 0, 5);
        test.world.place(at(0), lever(true));
        test.world.placeLine(at(1), 'x', 4, wire);
        test.engine.updates.updateNeighborsAt(at(0), LEVER);

        expect(test.world.stateAt(at(1), SIGNAL_STATE)).toBe(15);
        expect(test.world.stateAt(at(2), SIGNAL_STATE)).toBe(14);
    });
});

describe('redstone torch', () => {
    let test: TestEngine;

    beforeEach(() => {
        test = createTestEngine();
    });

    it('inverts its support: powering the block it hangs on turns it off two ticks later', () => {
        // A stone block with a torch on its west face, a lever standing on top,
        // and dust past the torch. This is the inverter every clock is built from.
        floor(test, -3, 3);
        test.world.place(at(0), stone);
        test.world.place(at(-1), litTorch('east'));
        test.world.place(at(-2), wire);
        test.engine.updates.updateNeighborsAt(at(-1), REDSTONE_TORCH.lit);
        expect(test.world.stateAt(at(-2), SIGNAL_STATE)).toBe(15);

        test.engine.setBlockAndUpdate(at(0, 2, 0), lever(true));
        expect(test.world.nameAt(at(-1))).toBe(REDSTONE_TORCH.lit);

        test.runGameTicks(2);
        expect(test.world.nameAt(at(-1))).toBe(REDSTONE_TORCH.unlit);
        expect(test.world.stateAt(at(-2), SIGNAL_STATE)).toBe(0);
    });

    it('lights again two ticks after the power goes away', () => {
        floor(test, -3, 3);
        test.world.place(at(0), stone);
        test.world.place(at(-1), litTorch('east'));
        test.world.place(at(-2), wire);
        test.engine.setBlockAndUpdate(at(0, 2, 0), lever(true));
        test.runGameTicks(2);
        expect(test.world.nameAt(at(-1))).toBe(REDSTONE_TORCH.unlit);

        test.engine.setBlockAndUpdate(at(0, 2, 0), lever(false));
        expect(test.world.nameAt(at(-1))).toBe(REDSTONE_TORCH.unlit);

        test.runGameTicks(2);
        expect(test.world.nameAt(at(-1))).toBe(REDSTONE_TORCH.lit);
        expect(test.world.stateAt(at(-2), SIGNAL_STATE)).toBe(15);
    });
});

describe('repeater', () => {
    let test: TestEngine;

    beforeEach(() => {
        test = createTestEngine();
    });

    it('takes its delay state times 2 game ticks, the jar formula', () => {
        for (let delay = 0; delay <= 3; delay++) {
            expect(repeaterDelayTicks(block(REPEATER.unpowered, { [REPEATER_DELAY_STATE]: delay }))).toBe(
                (delay + 1) * 2
            );
        }
    });

    it('turns on two ticks after its input, at the shortest setting', () => {
        floor(test, 0, 4);
        // The repeater faces west, so its input is the lever side and its output is east.
        test.world.place(at(1), block(REPEATER.unpowered, { [FACING_STATE]: 'west', [REPEATER_DELAY_STATE]: 0 }));
        test.world.place(at(2), wire);
        test.world.place(at(0), lever(true));

        test.engine.updates.updateNeighborsAt(at(0), LEVER);
        expect(test.world.nameAt(at(1))).toBe(REPEATER.unpowered);

        test.runGameTicks(1);
        expect(test.world.nameAt(at(1))).toBe(REPEATER.unpowered);

        test.runGameTicks(1);
        expect(test.world.nameAt(at(1))).toBe(REPEATER.powered);
        expect(test.world.stateAt(at(2), SIGNAL_STATE)).toBe(15);
    });

    it('carries a chain of three at full strength, each adding its own delay', () => {
        floor(test, 0, 40);
        test.world.place(at(0), lever(true));
        // Three repeaters at the longest setting, each 8 ticks, with dust between.
        for (const x of [1, 3, 5]) {
            test.world.place(at(x), block(REPEATER.unpowered, { [FACING_STATE]: 'west', [REPEATER_DELAY_STATE]: 3 }));
            test.world.place(at(x + 1), wire);
        }

        test.engine.updates.updateNeighborsAt(at(0), LEVER);
        test.runGameTicks(23);
        expect(test.world.nameAt(at(5))).toBe(REPEATER.unpowered);

        test.runGameTicks(1);
        expect(test.world.nameAt(at(1))).toBe(REPEATER.powered);
        expect(test.world.nameAt(at(3))).toBe(REPEATER.powered);
        expect(test.world.nameAt(at(5))).toBe(REPEATER.powered);
        expect(test.world.stateAt(at(6), SIGNAL_STATE)).toBe(15);
    });

    it('locks while a repeater powers its side, and refuses to change', () => {
        floor(test, 0, 4, 0);
        floor(test, 0, 4, 1);
        const main = block(REPEATER.unpowered, { [FACING_STATE]: 'west', [REPEATER_DELAY_STATE]: 0 });
        test.world.place(at(1, 1, 0), main);
        // A powered repeater to the south of the main one, facing north into its side.
        test.world.place(at(1, 1, 1), block(REPEATER.powered, { [FACING_STATE]: 'south', [REPEATER_DELAY_STATE]: 0 }));
        test.world.place(at(0, 1, 0), lever(true));

        expect(repeaterIsLocked(test.world, at(1, 1, 0), main)).toBe(true);

        test.engine.updates.updateNeighborsAt(at(0, 1, 0), LEVER);
        test.runGameTicks(10);
        expect(test.world.nameAt(at(1, 1, 0))).toBe(REPEATER.unpowered);
    });
});

describe('comparator', () => {
    let test: TestEngine;

    beforeEach(() => {
        test = createTestEngine();
    });

    const placeComparator = (mode: 'compare' | 'subtract'): void => {
        test.world.place(
            at(1),
            block(COMPARATOR.unpowered, {
                [FACING_STATE]: 'west',
                [COMPARATOR_SUBTRACT_STATE]: mode === 'subtract'
            })
        );
    };

    it('subtracts the side signal from the back signal', () => {
        floor(test, 0, 4, 0);
        floor(test, 0, 4, 1);
        placeComparator('subtract');
        test.world.place(at(0), block(REDSTONE_WIRE, { [SIGNAL_STATE]: 9 }));
        test.world.place(at(1, 1, 1), block(REDSTONE_WIRE, { [SIGNAL_STATE]: 4 }));
        test.world.place(at(2), wire);

        test.engine.updates.updateNeighborsAt(at(0), REDSTONE_WIRE);
        test.runGameTicks(2);

        expect(test.world.getBlockEntityData(at(1))?.comparatorOutput).toBe(5);
        expect(test.world.stateAt(at(2), SIGNAL_STATE)).toBe(5);
    });

    it('passes the back signal through in compare mode when the side is weaker', () => {
        floor(test, 0, 4, 0);
        floor(test, 0, 4, 1);
        placeComparator('compare');
        test.world.place(at(0), block(REDSTONE_WIRE, { [SIGNAL_STATE]: 9 }));
        test.world.place(at(1, 1, 1), block(REDSTONE_WIRE, { [SIGNAL_STATE]: 4 }));
        test.world.place(at(2), wire);

        test.engine.updates.updateNeighborsAt(at(0), REDSTONE_WIRE);
        test.runGameTicks(2);

        expect(test.world.getBlockEntityData(at(1))?.comparatorOutput).toBe(9);
        expect(test.world.stateAt(at(2), SIGNAL_STATE)).toBe(9);
    });

    it('goes dark when the side signal is stronger than the back signal', () => {
        floor(test, 0, 4, 0);
        floor(test, 0, 4, 1);
        placeComparator('compare');
        test.world.place(at(0), block(REDSTONE_WIRE, { [SIGNAL_STATE]: 4 }));
        test.world.place(at(1, 1, 1), block(REDSTONE_WIRE, { [SIGNAL_STATE]: 9 }));
        test.world.place(at(2), wire);

        test.engine.updates.updateNeighborsAt(at(0), REDSTONE_WIRE);
        test.runGameTicks(2);

        expect(test.world.getBlockEntityData(at(1))?.comparatorOutput ?? 0).toBe(0);
        expect(test.world.nameAt(at(1))).toBe(COMPARATOR.unpowered);
        expect(test.world.stateAt(at(2), SIGNAL_STATE)).toBe(0);
    });

    it('reads a chest in front of it as its back signal', () => {
        floor(test, 0, 4);
        placeComparator('compare');
        test.world.place(at(0), block('minecraft:chest'));
        // A chest reports its fill as the analog output the host computes.
        test.world.setBlockEntityData(at(0), { analogOutput: 7 });
        test.world.place(at(2), wire);

        test.engine.updates.updateNeighborsAt(at(0), 'minecraft:chest');
        test.runGameTicks(2);

        expect(test.world.getBlockEntityData(at(1))?.comparatorOutput).toBe(7);
        expect(test.world.stateAt(at(2), SIGNAL_STATE)).toBe(7);
    });

    it('reads a chest one block further through a conductor', () => {
        floor(test, 0, 4);
        placeComparator('compare');
        test.world.place(at(0), stone);
        test.world.place(at(-1), block('minecraft:chest'));
        test.world.setBlockEntityData(at(-1), { analogOutput: 12 });
        test.world.place(at(2), wire);

        test.engine.updates.updateNeighborsAt(at(0), 'minecraft:stone');
        test.runGameTicks(2);

        expect(test.world.getBlockEntityData(at(1))?.comparatorOutput).toBe(12);
    });
});

describe('observer', () => {
    let test: TestEngine;

    beforeEach(() => {
        test = createTestEngine();
    });

    it('pulses 15 for exactly two game ticks after the block it watches changes', () => {
        floor(test, 0, 4);
        // Facing west: it watches x - 1 and powers x + 1.
        test.world.place(at(1), block(OBSERVER, { [FACING_STATE]: 'west', [OBSERVER_POWERED_STATE]: false }));
        test.world.place(at(2), wire);

        test.engine.setBlockAndUpdate(at(0), stone);
        expect(test.world.stateAt(at(1), OBSERVER_POWERED_STATE)).toBe(false);

        test.runGameTicks(2);
        expect(test.world.stateAt(at(1), OBSERVER_POWERED_STATE)).toBe(true);
        expect(test.world.stateAt(at(2), SIGNAL_STATE)).toBe(15);

        test.runGameTicks(2);
        expect(test.world.stateAt(at(1), OBSERVER_POWERED_STATE)).toBe(false);
        expect(test.world.stateAt(at(2), SIGNAL_STATE)).toBe(0);
    });

    it('ignores a change behind it, which is what makes it not a block update detector', () => {
        floor(test, 0, 4);
        test.world.place(at(1), block(OBSERVER, { [FACING_STATE]: 'west', [OBSERVER_POWERED_STATE]: false }));

        test.engine.setBlockAndUpdate(at(2), stone);
        test.runGameTicks(4);

        expect(test.world.stateAt(at(1), OBSERVER_POWERED_STATE)).toBe(false);
    });
});
