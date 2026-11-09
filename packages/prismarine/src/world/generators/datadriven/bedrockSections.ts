/**
 * The block pass of a chunk's Bedrock translation: from a region's center column of palette slots
 * to per-section block indices and palettes.
 *
 * Split from the rest of the translation so it can run in a generation worker. It reads no tables:
 * the server thread translates each region palette slot to a runtime id first, which is a few dozen
 * lookups, and hands the ids over. What is left is the walk over every block of every section,
 * about a hundred thousand steps a chunk, and that is the part worth moving off the server thread.
 * The same function runs on the server thread when there is no worker, so both paths produce the
 * same bytes by construction.
 */

/** Blocks in one 16 by 16 by 16 section. */
export const BLOCKS_PER_SECTION = 4096;

/** What the block pass reads. Every field is plain data, so it crosses a thread or a process. */
export interface BedrockSectionsInput {
    readonly kind: 'bedrock-sections';
    /** The center chunk's palette slot of every block, column by column, each column `height` long. */
    readonly slots: Uint16Array;
    /** The highest block of each of the 256 columns, or `minY - 1` for an empty column. */
    readonly columnTops: Int32Array;
    /** The Bedrock runtime id of each region palette slot, already mapped to air when unknown. */
    readonly runtimeIds: Int32Array;
    /** 1 for a palette slot whose Java state is waterlogged, which Bedrock keeps in layer 1. */
    readonly waterSlots: Uint8Array;
    readonly air: number;
    readonly minY: number;
    readonly height: number;
}

/** One section that holds anything besides air. */
export interface BedrockSection {
    /** The section index, `y >> 4`. */
    readonly section: number;
    /** Indices into {@link palette}, in Bedrock's x, z, y order. */
    readonly blocks: Uint16Array<ArrayBuffer>;
    /** Runtime ids, air first, in order of first appearance. */
    readonly palette: Int32Array<ArrayBuffer>;
    /** Layer 1: 1 where the block is waterlogged. Absent when nothing in the section is. */
    readonly water?: Uint16Array<ArrayBuffer>;
}

/**
 * Builds every non-empty section.
 *
 * Within a section, a runtime id gets a palette entry the first time a block with it is visited,
 * visiting x, then z, then y, which is what `BlockStorage.setBlock` would have produced. Two region
 * slots that translate to the same runtime id share an entry. A section whose palette never grows
 * past air is left out.
 */
export const buildBedrockSections = (input: BedrockSectionsInput): BedrockSection[] => {
    const { slots, columnTops, runtimeIds, waterSlots, air, minY, height } = input;
    let top = minY - 1;
    for (let column = 0; column < 256; column++) {
        if (columnTops[column]! > top) top = columnTops[column]!;
    }

    const sections: BedrockSection[] = [];
    const localSlots = new Int32Array(runtimeIds.length);
    for (let section = minY >> 4; section <= top >> 4; section++) {
        const sectionMinY = section * 16;
        const blocks = new Uint16Array(BLOCKS_PER_SECTION);
        let waterBlocks: Uint16Array<ArrayBuffer> | undefined;
        const sectionPalette = [air];
        // Two lookups rather than one. The array answers for a slot already seen in this
        // section, which is almost every block; the map is what keeps two region slots that
        // translate to the same runtime id from taking two palette entries, the way
        // `BlockStorage.setBlock` does.
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
                        waterBlocks ??= new Uint16Array(BLOCKS_PER_SECTION);
                        waterBlocks[target | (y & 0xf)] = 1;
                    }
                }
            }
        }

        if (sectionPalette.length === 1) continue;
        sections.push({
            section,
            blocks,
            palette: Int32Array.from(sectionPalette),
            ...(waterBlocks === undefined ? {} : { water: waterBlocks })
        });
    }

    return sections;
};

/** Every buffer the sections own, so a worker moves them rather than copying. */
export const sectionBuffers = (sections: readonly BedrockSection[]): ArrayBuffer[] =>
    sections.flatMap((section) => [
        section.blocks.buffer,
        section.palette.buffer,
        ...(section.water === undefined ? [] : [section.water.buffer])
    ]);

/** Whether a task input asks for the block pass. Checked at the worker boundary. */
export const isBedrockSectionsInput = (value: unknown): value is BedrockSectionsInput =>
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'bedrock-sections' &&
    'slots' in value &&
    value.slots instanceof Uint16Array &&
    'columnTops' in value &&
    value.columnTops instanceof Int32Array &&
    'runtimeIds' in value &&
    value.runtimeIds instanceof Int32Array &&
    'waterSlots' in value &&
    value.waterSlots instanceof Uint8Array &&
    'air' in value &&
    typeof value.air === 'number' &&
    'minY' in value &&
    typeof value.minY === 'number' &&
    'height' in value &&
    typeof value.height === 'number';

/** Whether a worker's answer is a list of sections. Checked when it arrives on the server thread. */
export const isBedrockSections = (value: unknown): value is BedrockSection[] =>
    Array.isArray(value) &&
    value.every(
        (section: unknown) =>
            typeof section === 'object' &&
            section !== null &&
            'section' in section &&
            typeof section.section === 'number' &&
            'blocks' in section &&
            section.blocks instanceof Uint16Array &&
            section.blocks.length === BLOCKS_PER_SECTION &&
            'palette' in section &&
            section.palette instanceof Int32Array &&
            (!('water' in section) || section.water instanceof Uint16Array)
    );
