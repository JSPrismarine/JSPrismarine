import { beforeEach, describe, expect, it } from 'vitest';

import {
    ATTACHMENT_STATE,
    FACING_STATE,
    LEVER,
    LEVER_OPEN_STATE,
    PISTON,
    PISTON_ARM,
    PISTON_EXTENDED_STATE,
    REDSTONE_BLOCK,
    STICKY_BLOCKS
} from './components';
import { MAX_PUSH_DEPTH, pistonIsPowered, resolvePistonStructure } from './pistons';
import type { TestEngine } from './testing';
import { createTestEngine } from './testing';
import type { BlockPosition, BlockRef } from './world';
import { block } from './world';

const at = (x: number, y = 1, z = 0): BlockPosition => ({ x, y, z });
const stone = block('minecraft:stone');
const lever = (open: boolean): BlockRef => block(LEVER, { [ATTACHMENT_STATE]: 'down', [LEVER_OPEN_STATE]: open });

/** A piston at x = 0 facing east, so it pushes toward larger x. */
const placePiston = (test: TestEngine, sticky = false): void => {
    test.world.place(at(0), {
        name: sticky ? PISTON.sticky : PISTON.plain,
        states: { [FACING_STATE]: 'east', [PISTON_EXTENDED_STATE]: false }
    });
};

describe('piston structure resolver', () => {
    let test: TestEngine;

    beforeEach(() => {
        test = createTestEngine();
    });

    it('uses the jar limit of 12 blocks', () => {
        expect(MAX_PUSH_DEPTH).toBe(12);
    });

    it('resolves a row of 12 and refuses a row of 13', () => {
        placePiston(test);
        test.world.placeLine(at(1), 'x', 12, stone);
        expect(resolvePistonStructure(test.world, at(0), 'east', true).toPush).toHaveLength(12);

        test.world.place(at(13), stone);
        expect(resolvePistonStructure(test.world, at(0), 'east', true).resolved).toBe(false);
    });

    it('refuses an immovable block, taking the reaction from the mapping table', () => {
        placePiston(test);
        test.world.place(at(1), block('minecraft:obsidian'));

        expect(resolvePistonStructure(test.world, at(0), 'east', true).resolved).toBe(false);
    });

    it('refuses an unbreakable block before it reads the push reaction', () => {
        placePiston(test);
        test.world.place(at(1), block('minecraft:bedrock'));

        expect(resolvePistonStructure(test.world, at(0), 'east', true).resolved).toBe(false);
    });

    it('breaks a popped block instead of moving it', () => {
        placePiston(test);
        test.world.place(at(1), block('minecraft:torch'));

        const structure = resolvePistonStructure(test.world, at(0), 'east', true);
        expect(structure.resolved).toBe(true);
        expect(structure.toPush).toHaveLength(0);
        expect(structure.toDestroy).toEqual([at(1)]);
    });

    it('drags the blocks stuck to a slime block along the sides', () => {
        placePiston(test);
        test.world.place(at(1), block(STICKY_BLOCKS.slime));
        test.world.place({ x: 1, y: 2, z: 0 }, stone);
        test.world.place({ x: 1, y: 0, z: 0 }, stone);

        const structure = resolvePistonStructure(test.world, at(0), 'east', true);

        expect(structure.resolved).toBe(true);
        expect(structure.toPush).toEqual(expect.arrayContaining([at(1), { x: 1, y: 2, z: 0 }, { x: 1, y: 0, z: 0 }]));
        expect(structure.toPush).toHaveLength(3);
    });

    it('does not let honey drag slime, which is the one sticky pair that refuses', () => {
        placePiston(test);
        test.world.place(at(1), block(STICKY_BLOCKS.honey));
        test.world.place({ x: 1, y: 2, z: 0 }, block(STICKY_BLOCKS.slime));

        const structure = resolvePistonStructure(test.world, at(0), 'east', true);

        expect(structure.toPush).toEqual([at(1)]);
    });

    it('counts the dragged blocks against the same 12', () => {
        placePiston(test);
        test.world.place(at(1), block(STICKY_BLOCKS.slime));
        // Eleven blocks ahead plus the slime is twelve; one more on its side is thirteen.
        test.world.placeLine(at(2), 'x', 11, stone);
        test.world.place({ x: 1, y: 2, z: 0 }, stone);

        expect(resolvePistonStructure(test.world, at(0), 'east', true).resolved).toBe(false);
    });
});

describe('piston power', () => {
    let test: TestEngine;

    beforeEach(() => {
        test = createTestEngine();
    });

    it('reads the block above itself, which is Java quasi-connectivity', () => {
        placePiston(test);
        // A block of redstone diagonally above the piston powers the position above it,
        // and Java's `getNeighborSignal` reads that position as if it were the piston.
        test.world.place({ x: 1, y: 2, z: 0 }, block(REDSTONE_BLOCK));

        expect(pistonIsPowered(test.world, at(0), 'east')).toBe(true);
    });

    it('ignores power coming from the direction it pushes', () => {
        placePiston(test);
        test.world.place(at(1), block(REDSTONE_BLOCK));

        expect(pistonIsPowered(test.world, at(0), 'east')).toBe(false);
    });
});

describe('piston move', () => {
    let test: TestEngine;

    beforeEach(() => {
        test = createTestEngine();
    });

    it('pushes a row of three one block and leaves its arm behind', () => {
        placePiston(test);
        test.world.placeLine(at(1), 'x', 3, stone);
        test.world.place({ x: 0, y: 0, z: 0 }, stone);

        test.engine.setBlockAndUpdate(at(0, 0, 0), lever(true));

        expect(test.world.nameAt(at(0))).toBe(PISTON.plain);
        expect(test.world.stateAt(at(0), PISTON_EXTENDED_STATE)).toBe(true);
        expect(test.world.nameAt(at(1))).toBe(PISTON_ARM.plain);
        expect(test.world.nameAt(at(2))).toBe('minecraft:stone');
        expect(test.world.nameAt(at(3))).toBe('minecraft:stone');
        expect(test.world.nameAt(at(4))).toBe('minecraft:stone');
        expect(test.world.nameAt(at(5))).toBe('minecraft:air');
    });

    it('refuses to extend into a row of thirteen', () => {
        placePiston(test);
        test.world.placeLine(at(1), 'x', 13, stone);
        test.world.place({ x: 0, y: 0, z: 0 }, stone);

        test.engine.setBlockAndUpdate(at(0, 0, 0), lever(true));

        expect(test.world.stateAt(at(0), PISTON_EXTENDED_STATE)).toBe(false);
        expect(test.world.nameAt(at(1))).toBe('minecraft:stone');
    });

    it('pulls the block back when a sticky piston retracts', () => {
        placePiston(test, true);
        test.world.place(at(1), stone);
        test.world.place({ x: 0, y: 0, z: 0 }, stone);

        test.engine.setBlockAndUpdate(at(0, 0, 0), lever(true));
        expect(test.world.nameAt(at(2))).toBe('minecraft:stone');

        test.engine.setBlockAndUpdate(at(0, 0, 0), lever(false));

        expect(test.world.stateAt(at(0), PISTON_EXTENDED_STATE)).toBe(false);
        expect(test.world.nameAt(at(1))).toBe('minecraft:stone');
        expect(test.world.nameAt(at(2))).toBe('minecraft:air');
    });

    it('leaves the block behind when a plain piston retracts', () => {
        placePiston(test);
        test.world.place(at(1), stone);
        test.world.place({ x: 0, y: 0, z: 0 }, stone);

        test.engine.setBlockAndUpdate(at(0, 0, 0), lever(true));
        test.engine.setBlockAndUpdate(at(0, 0, 0), lever(false));

        expect(test.world.nameAt(at(1))).toBe('minecraft:air');
        expect(test.world.nameAt(at(2))).toBe('minecraft:stone');
    });

    it('carries a pushed block entity with the block, rather than writing the block twice', () => {
        placePiston(test);
        test.world.place(at(1), block('minecraft:chest'));
        test.world.setBlockEntityData(at(1), { analogOutput: 9 });
        test.world.place({ x: 0, y: 0, z: 0 }, stone);

        test.engine.setBlockAndUpdate(at(0, 0, 0), lever(true));

        expect(test.world.moved).toEqual([{ from: at(1), to: at(2) }]);
        expect(test.world.nameAt(at(2))).toBe('minecraft:chest');
        // The block entity is at the new position rather than lost with the write, which is
        // what keeps a pushed chest's contents.
        expect(test.world.getBlockEntityData(at(2))).toEqual({ analogOutput: 9 });
        expect(test.world.getBlockEntityData(at(1))).toBeUndefined();
    });

    it('moves a row of blocks farthest first, so none lands on one that has not left', () => {
        placePiston(test);
        test.world.place(at(1), block('minecraft:stone'));
        test.world.place(at(2), block('minecraft:dirt'));
        test.world.place(at(3), block('minecraft:oak_planks'));
        test.world.place({ x: 0, y: 0, z: 0 }, stone);

        test.engine.setBlockAndUpdate(at(0, 0, 0), lever(true));

        expect(test.world.nameAt(at(1))).toBe(PISTON_ARM.plain);
        expect(test.world.nameAt(at(2))).toBe('minecraft:stone');
        expect(test.world.nameAt(at(3))).toBe('minecraft:dirt');
        expect(test.world.nameAt(at(4))).toBe('minecraft:oak_planks');
    });

    it('asks the host to take a popped block in the way out, with its drops', () => {
        placePiston(test);
        test.world.place(at(1), block('minecraft:torch'));
        test.world.place({ x: 0, y: 0, z: 0 }, stone);

        test.engine.setBlockAndUpdate(at(0, 0, 0), lever(true));

        // What falls is the host's, from the torch's own loot table. This package says only
        // that the torch is destroyed rather than moved and that it yields what it yields.
        expect(test.world.destroyed).toEqual([
            { at: at(1), block: block('minecraft:torch'), removal: { drops: true, notifyNeighbors: false } }
        ]);
        expect(test.world.nameAt(at(1))).toBe(PISTON_ARM.plain);
    });
});
