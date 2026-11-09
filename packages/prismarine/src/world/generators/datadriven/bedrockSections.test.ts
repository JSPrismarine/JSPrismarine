import { describe, expect, it } from 'vitest';

import type { BedrockSectionsInput } from './bedrockSections';
import { BLOCKS_PER_SECTION, buildBedrockSections, isBedrockSections, isBedrockSectionsInput } from './bedrockSections';

/**
 * The block pass exactly as `DataDrivenGenerator.buildSubChunks` ran it on the server thread
 * before it moved, reduced to plain arrays. Kept as the reference the moved function is held to.
 */
const reference = (input: BedrockSectionsInput) => {
    const { slots, columnTops, runtimeIds, waterSlots, air, minY, height } = input;
    let top = minY - 1;
    for (let column = 0; column < 256; column++) {
        if (columnTops[column]! > top) top = columnTops[column]!;
    }

    const out: { section: number; blocks: number[]; palette: number[]; water?: number[] }[] = [];
    const localSlots = new Int32Array(runtimeIds.length);
    for (let section = minY >> 4; section <= top >> 4; section++) {
        const sectionMinY = section * 16;
        const blocks = new Uint16Array(4096);
        let waterBlocks: Uint16Array | undefined;
        const sectionPalette = [air];
        const byRuntimeId = new Map<number, number>([[air, 0]]);
        localSlots.fill(-1);
        for (let localX = 0; localX < 16; localX++) {
            for (let localZ = 0; localZ < 16; localZ++) {
                const column = localX * 16 + localZ;
                const columnBase = column * height - minY;
                const target = (localX << 8) | (localZ << 4);
                const columnTop = Math.min(columnTops[column]!, sectionMinY + 15);
                for (let y = sectionMinY; y <= columnTop; y++) {
                    const slot = slots[columnBase + y]!;
                    let local = localSlots[slot]!;
                    if (local < 0) {
                        const runtimeId = runtimeIds[slot]!;
                        local = byRuntimeId.get(runtimeId) ?? sectionPalette.push(runtimeId) - 1;
                        byRuntimeId.set(runtimeId, local);
                        localSlots[slot] = local;
                    }
                    blocks[target | (y & 0xf)] = local;
                    if (waterSlots[slot] === 1) {
                        waterBlocks ??= new Uint16Array(4096);
                        waterBlocks[target | (y & 0xf)] = 1;
                    }
                }
            }
        }
        if (sectionPalette.length === 1) continue;
        out.push({
            section,
            blocks: [...blocks],
            palette: sectionPalette,
            ...(waterBlocks === undefined ? {} : { water: [...waterBlocks] })
        });
    }
    return out;
};

/** A small deterministic generator, so every run builds the same chunks. */
const lcg = (seed: number) => {
    let state = seed >>> 0;
    return (bound: number): number => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state % bound;
    };
};

const AIR = 0;

/**
 * A synthetic chunk: a palette whose slots include air, duplicates that share a runtime id, and
 * waterlogged states, filled to varying column heights.
 */
const chunk = (seed: number, minY = -64, height = 384): BedrockSectionsInput => {
    const next = lcg(seed);
    const paletteSize = 4 + next(40);
    const runtimeIds = new Int32Array(paletteSize);
    const waterSlots = new Uint8Array(paletteSize);
    for (let slot = 0; slot < paletteSize; slot++) {
        // Slot 0 and roughly one in eight others are air; the rest draw from a small id range so
        // two slots often share a runtime id.
        runtimeIds[slot] = slot === 0 || next(8) === 0 ? AIR : 100 + next(12);
        waterSlots[slot] = next(6) === 0 ? 1 : 0;
    }

    const slots = new Uint16Array(256 * height);
    const columnTops = new Int32Array(256);
    for (let column = 0; column < 256; column++) {
        // Some columns are empty, the rest stop anywhere in the chunk.
        const top = next(10) === 0 ? minY - 1 : minY + next(height);
        columnTops[column] = top;
        for (let y = minY; y <= top; y++) slots[column * height + (y - minY)] = next(paletteSize);
    }

    return { kind: 'bedrock-sections', slots, columnTops, runtimeIds, waterSlots, air: AIR, minY, height };
};

const plain = (sections: ReturnType<typeof buildBedrockSections>) =>
    sections.map(({ section, blocks, palette, water }) => ({
        section,
        blocks: [...blocks],
        palette: [...palette],
        ...(water === undefined ? {} : { water: [...water] })
    }));

describe('the block pass', () => {
    it('builds exactly the sections the server-thread pass built, over many synthetic chunks', () => {
        for (let seed = 1; seed <= 40; seed++) {
            const input = chunk(seed);
            expect(plain(buildBedrockSections(input)), `seed ${seed}`).toEqual(reference(input));
        }
    });

    it('agrees in a dimension with a different floor and height', () => {
        for (let seed = 1; seed <= 10; seed++) {
            const input = chunk(seed, 0, 256);
            expect(plain(buildBedrockSections(input)), `seed ${seed}`).toEqual(reference(input));
        }
    });

    it('leaves out sections that hold only air, including slots that translate to air', () => {
        const input = chunk(7);
        const allAir = { ...input, runtimeIds: new Int32Array(input.runtimeIds.length) };

        expect(buildBedrockSections(allAir)).toEqual([]);
        expect(reference(allAir)).toEqual([]);
    });

    it('arrives intact after crossing to another thread', () => {
        const sections = buildBedrockSections(chunk(3));
        // A worker posts the result through the structured clone algorithm.
        const crossed: unknown = structuredClone(sections);

        if (!isBedrockSections(crossed)) throw new Error('the sections did not survive the crossing');
        expect(plain(crossed)).toEqual(plain(sections));
        expect(isBedrockSectionsInput(structuredClone(chunk(3)))).toBe(true);
    });

    it('refuses shapes it was not built to read', () => {
        expect(isBedrockSections([{ section: 0, blocks: new Uint16Array(10), palette: new Int32Array(1) }])).toBe(
            false
        );
        expect(isBedrockSections([{ section: 0, blocks: new Uint16Array(BLOCKS_PER_SECTION) }])).toBe(false);
        expect(isBedrockSectionsInput({ kind: 'bedrock-sections' })).toBe(false);
    });
});
