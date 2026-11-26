import { describe, expect, it } from 'vitest';

import { bestNeighborSignal, blockSignalToWire, directSignalTo, hasNeighborSignal, weakSignalOf } from './signal';
import { createTestWorld } from './testWorld';
import { block } from './world';

describe('a lever powering the block it hangs on', () => {
    const stone = { x: 0, y: 1, z: 2 };
    const lever = { x: 0, y: 1, z: 1 };
    const aboveStone = { x: 0, y: 2, z: 2 };

    const world = (open: boolean, leverDirection: string) => {
        const arranged = createTestWorld();
        arranged.place(stone, block('minecraft:stone'));
        arranged.place(lever, block('minecraft:lever', { open_bit: open, lever_direction: leverDirection }));
        return arranged;
    };

    it('reaches a block resting on the support block when the lever is on', () => {
        // `north` hangs the lever on the block to its south, which is the stone.
        expect(hasNeighborSignal(world(true, 'north'), aboveStone)).toBe(true);
    });

    it('gives that block nothing while the lever is off', () => {
        expect(hasNeighborSignal(world(false, 'north'), aboveStone)).toBe(false);
    });

    it('does not power a block next to a lever that hangs on a different block', () => {
        // `south` hangs the lever on the block to its north, so the stone is not its support.
        expect(hasNeighborSignal(world(true, 'south'), aboveStone)).toBe(false);
    });
});

describe('a detector rail with a minecart on it', () => {
    const stone = { x: 0, y: 0, z: 0 };
    const rail = { x: 0, y: 1, z: 0 };
    const beside = { x: 1, y: 1, z: 0 };
    const besideStone = { x: 1, y: 0, z: 0 };

    const world = (powered: boolean) => {
        const arranged = createTestWorld();
        arranged.place(stone, block('minecraft:stone'));
        arranged.place(rail, block('minecraft:detector_rail', { rail_data_bit: powered, rail_direction: 0 }));
        return arranged;
    };

    it('powers the blocks around it, and the block it rests on strongly, as DetectorRailBlock does', () => {
        expect(hasNeighborSignal(world(true), beside)).toBe(true);
        expect(directSignalTo(world(true), stone)).toBe(15);
        // The stone, strongly powered, passes it on to what sits beside it.
        expect(hasNeighborSignal(world(true), besideStone)).toBe(true);
    });

    it('gives nothing while no minecart is on it', () => {
        expect(hasNeighborSignal(world(false), beside)).toBe(false);
        expect(directSignalTo(world(false), stone)).toBe(0);
    });
});

describe('a button powering the block it is mounted on', () => {
    const stone = { x: 0, y: 1, z: 2 };
    const button = { x: 0, y: 1, z: 1 };
    const aboveStone = { x: 0, y: 2, z: 2 };

    // Bedrock's `facing_direction`: 0 down, 1 up, 2 north, 3 south, 4 west, 5 east.
    const world = (pressed: boolean, facing: number) => {
        const arranged = createTestWorld();
        arranged.place(stone, block('minecraft:stone'));
        arranged.place(
            button,
            block('minecraft:stone_button', { button_pressed_bit: pressed, facing_direction: facing })
        );
        return arranged;
    };

    it('reaches a block resting on the support block when the button is pressed', () => {
        // Facing north, the button is mounted on the block to its south, which is the stone.
        expect(hasNeighborSignal(world(true, 2), aboveStone)).toBe(true);
    });

    it('gives that block nothing while the button is released', () => {
        expect(hasNeighborSignal(world(false, 2), aboveStone)).toBe(false);
    });

    it('does not power a block next to a button mounted on a different block', () => {
        // Facing south, the button is mounted on the block to its north.
        expect(hasNeighborSignal(world(true, 3), aboveStone)).toBe(false);
    });

    it('strongly powers the block below a floor button and the block above a ceiling button', () => {
        const arranged = createTestWorld();
        arranged.place({ x: 0, y: 1, z: 0 }, block('minecraft:stone'));
        arranged.place(
            { x: 0, y: 2, z: 0 },
            block('minecraft:stone_button', { button_pressed_bit: true, facing_direction: 1 })
        );
        arranged.place({ x: 4, y: 3, z: 0 }, block('minecraft:stone'));
        arranged.place(
            { x: 4, y: 2, z: 0 },
            block('minecraft:stone_button', { button_pressed_bit: true, facing_direction: 0 })
        );

        expect(directSignalTo(arranged, { x: 0, y: 1, z: 0 })).toBe(15);
        expect(directSignalTo(arranged, { x: 4, y: 3, z: 0 })).toBe(15);
        // Not the block on the far side of the button.
        expect(directSignalTo(arranged, { x: 0, y: 3, z: 0 })).toBe(0);
    });
});

describe('a lit redstone torch', () => {
    const torch = { x: 0, y: 1, z: 1 };
    const behind = { x: 0, y: 1, z: 2 };
    const below = { x: 0, y: 0, z: 1 };
    const above = { x: 0, y: 2, z: 1 };

    const world = (facing: string) => {
        const arranged = createTestWorld();
        arranged.place(torch, block('minecraft:redstone_torch', { torch_facing_direction: facing }));
        return arranged;
    };

    it('does not power the block it hangs on, which Bedrock names in torch_facing_direction', () => {
        // `south` is the direction from the torch to its support, so the torch hangs on `behind`.
        expect(hasNeighborSignal(world('south'), behind)).toBe(false);
    });

    it('powers the block on its other sides', () => {
        expect(hasNeighborSignal(world('south'), below)).toBe(true);
        expect(hasNeighborSignal(world('south'), above)).toBe(true);
        expect(hasNeighborSignal(world('south'), { x: 1, y: 1, z: 1 })).toBe(true);
    });

    it('treats a floor torch as resting on the block below it', () => {
        // A standing torch does not power the block it stands on, and does power the one above.
        expect(hasNeighborSignal(world('top'), below)).toBe(false);
        expect(hasNeighborSignal(world('top'), above)).toBe(true);
    });
});

describe('a redstone wire', () => {
    const wire = (signal: number) => block('minecraft:redstone_wire', { redstone_signal: signal });
    const at = { x: 0, y: 1, z: 0 };
    const floor = (arranged: ReturnType<typeof createTestWorld>) =>
        arranged.placeLine({ x: -2, y: 0, z: 0 }, 'x', 5, block('minecraft:stone'));

    it('powers all four sides while it connects to nothing, as a placed cross does', () => {
        const arranged = createTestWorld();
        arranged.place(at, wire(15));

        for (const direction of ['north', 'south', 'east', 'west'] as const) {
            // The query asks the wire for the power it gives the block on its far side.
            expect(weakSignalOf(arranged, at, direction)).toBe(15);
        }
    });

    it('points out of the end of a run, and not out of its sides', () => {
        const arranged = createTestWorld();
        floor(arranged);
        arranged.place(at, wire(15));
        arranged.place({ x: 1, y: 1, z: 0 }, wire(14));

        // The block west of the run's end, which the wire's east-to-west line points into.
        expect(weakSignalOf(arranged, at, 'east')).toBe(15);
        // The blocks north and south of it, which the line runs past.
        expect(weakSignalOf(arranged, at, 'south')).toBe(0);
        expect(weakSignalOf(arranged, at, 'north')).toBe(0);
    });

    it('counts toward the full power reading but not toward the reading a wire takes', () => {
        const arranged = createTestWorld();
        floor(arranged);
        arranged.place(at, wire(0));
        arranged.place({ x: 1, y: 1, z: 0 }, wire(15));
        // A wire on the stone west of `at` strongly powers that stone, which passes it on.
        arranged.place({ x: -1, y: 1, z: 0 }, block('minecraft:stone'));
        arranged.place({ x: -1, y: 2, z: 0 }, wire(15));

        expect(bestNeighborSignal(arranged, at)).toBe(15);
        expect(blockSignalToWire(arranged, at)).toBe(0);

        arranged.place({ x: 1, y: 1, z: 0 }, block('minecraft:air'));
        // The stone alone still passes the wire's power on to anything but a wire.
        expect(bestNeighborSignal(arranged, at)).toBe(15);
    });

    it('still takes the power of a source in the reading a wire takes', () => {
        const arranged = createTestWorld();
        floor(arranged);
        arranged.place(at, wire(0));
        arranged.place({ x: 1, y: 1, z: 0 }, block('minecraft:redstone_block'));

        expect(blockSignalToWire(arranged, at)).toBe(15);
    });
});
