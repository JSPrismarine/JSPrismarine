import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import BlockStorage from './chunk/BlockStorage';
import SubChunk from './chunk/SubChunk';
import { sectionTakesRandomTicks, takesRandomTicks } from './randomTickSections';

const idOf = (name: string, states?: Record<string, string | number>): number => {
    const runtimeId = BlockRuntimeIds.tryGetByState(name, states);
    expect(runtimeId).not.toBeNull();
    return runtimeId!;
};

/** A storage that records how many times something read a block rather than the palette. */
class CountingStorage extends BlockStorage {
    public blockReads = 0;

    public constructor() {
        super({});
    }

    public override getRuntimeId(bx: number, by: number, bz: number): number {
        this.blockReads += 1;
        return super.getRuntimeId(bx, by, bz);
    }
}

/** A sub chunk with one block written into the layer given, the rest air. */
const sectionHolding = (name: string, states?: Record<string, string | number>, layer = 0): SubChunk => {
    const section = new SubChunk();
    section.setBlock(1, 2, 3, idOf(name, states), layer);
    return section;
};

describe('takesRandomTicks', () => {
    it("answers the mapping table, which is Java's `BlockState.isRandomlyTicking`", () => {
        expect(takesRandomTicks(idOf('minecraft:wheat'))).toBe(true);
        expect(takesRandomTicks(idOf('minecraft:stone'))).toBe(false);
        expect(takesRandomTicks(idOf('minecraft:air'))).toBe(false);
    });

    it('answers per state, so a crop stops ticking once it is grown', () => {
        expect(takesRandomTicks(idOf('minecraft:wheat', { growth: 3 }))).toBe(true);
        expect(takesRandomTicks(idOf('minecraft:wheat', { growth: 7 }))).toBe(false);
    });

    it('answers false for an id no registered block produces, rather than throwing', () => {
        expect(takesRandomTicks(0x7f_ff_ff_ff)).toBe(false);
    });
});

describe('sectionTakesRandomTicks', () => {
    it('skips a section of solid stone, which is the one an empty test kept', () => {
        const section = new SubChunk();
        for (let y = 0; y < 16; y++) section.setBlock(0, y, 0, idOf('minecraft:stone'), 0);

        expect(section.isEmpty()).toBe(false);
        expect(sectionTakesRandomTicks(section)).toBe(false);
    });

    it('skips an empty section', () => {
        expect(sectionTakesRandomTicks(new SubChunk())).toBe(false);
    });

    it('draws for a section holding one randomly ticking block among four thousand', () => {
        const section = new SubChunk();
        for (let y = 0; y < 16; y++) section.setBlock(0, y, 0, idOf('minecraft:stone'), 0);
        section.setBlock(5, 5, 5, idOf('minecraft:wheat'), 0);

        expect(sectionTakesRandomTicks(section)).toBe(true);
    });

    it('counts the second block layer, where a waterlogged position keeps its fluid', () => {
        expect(sectionTakesRandomTicks(sectionHolding('minecraft:wheat', undefined, 1))).toBe(true);
    });

    it('keeps answering yes for a palette entry whose last block was replaced', () => {
        // Java's `PalettedContainer.maybeHas` has the same slack: the palette keeps the entry,
        // so the section still draws, and the draws land on blocks that take no tick and are
        // discarded. Matching the slack matters because the draw state is shared world-wide.
        const section = sectionHolding('minecraft:wheat');
        section.setBlock(1, 2, 3, idOf('minecraft:stone'), 0);

        expect(section.getBlock(1, 2, 3).name).toBe('minecraft:stone');
        expect(sectionTakesRandomTicks(section)).toBe(true);
    });

    it('reads the palette rather than the 4096 blocks', () => {
        const storage = new CountingStorage();
        storage.setBlock(1, 2, 3, idOf('minecraft:wheat'));

        expect(sectionTakesRandomTicks(new SubChunk(new Map([[0, storage]])))).toBe(true);
        expect(storage.blockReads).toBe(0);
    });
});
