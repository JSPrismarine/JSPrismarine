import { decodeSections, LevelChunkWithLight } from '@jsprismarine/protocol/java/chunk/levelChunk';
import { unpackHeightmap } from '@jsprismarine/protocol/java/chunk/palettedContainer';
import { decodeJavaPacket, encodeJavaPacket, readJavaPacketId } from '@jsprismarine/protocol/java/packet/JavaPacket';
import { BLOCK_STATES } from '@jsprismarine/protocol/java/versions/newest';
import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import Chunk from '../../world/chunk/Chunk';
import { JAVA_BIOMES } from './editionTranslation';
import { JAVA_SECTION_KINDS, JavaChunkTranslator } from './javaChunk';
import { NEWEST_JAVA_RELEASE } from '@jsprismarine/protocol/java/versions/javaReleases';

/** A chunk of a default flat world: bedrock, two dirt and grass, from the bottom of the overworld. */
const flatChunk = (): Chunk => {
    const chunk = new Chunk(0, -1);
    const layers = ['minecraft:bedrock', 'minecraft:dirt', 'minecraft:dirt', 'minecraft:grass_block'];
    for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
            layers.forEach((name, layer) =>
                chunk.setBlockRuntimeId(x, -64 + layer, z, BlockRuntimeIds.getByName(name))
            );
        }
    }
    return chunk;
};

describe('JavaChunkTranslator', () => {
    it('sends a flat chunk with the column vanilla sends for the same layers', () => {
        const column = new JavaChunkTranslator().columnOf(flatChunk());
        // Through the wire and back, as the client reads it.
        const read = decodeJavaPacket(
            NEWEST_JAVA_RELEASE,
            LevelChunkWithLight,
            readJavaPacketId(encodeJavaPacket(NEWEST_JAVA_RELEASE, LevelChunkWithLight, column)).body
        );
        const sections = decodeSections(read.data, 24, JAVA_SECTION_KINDS);
        const bottom = sections[0]!;

        expect([0, 1, 2, 3, 4].map((y) => bottom.blocks[y * 256 + 5 * 16 + 7])).toEqual([
            BLOCK_STATES.idOf('minecraft:bedrock'),
            BLOCK_STATES.idOf('minecraft:dirt'),
            BLOCK_STATES.idOf('minecraft:dirt'),
            BLOCK_STATES.idOf('minecraft:grass_block', { snowy: 'false' }),
            BLOCK_STATES.idOf('minecraft:air')
        ]);
        expect([bottom.blockCount, bottom.fluidCount, sections[1]!.blockCount]).toEqual([1024, 0, 0]);
        // A new chunk's biome is plains, as vanilla's flat world's is.
        expect(new Set(Array.from(bottom.biomes))).toEqual(new Set([JAVA_BIOMES.indexOf('minecraft:plains')]));
        expect(new Set(unpackHeightmap(read.heightmaps[0]!.data, 384))).toEqual(new Set([4]));
    });

    it('sends a block with water in its second layer as its waterlogged state, and counts it a fluid', () => {
        const chunk = flatChunk();
        const slab = BlockRuntimeIds.tryGetByState('minecraft:oak_slab', { 'minecraft:vertical_half': 'bottom' });
        if (slab === null) throw new Error('a bottom oak slab must be in the block palette');
        chunk.setBlockRuntimeId(7, -60, 5, slab);
        chunk.setBlockRuntimeId(7, -60, 5, BlockRuntimeIds.getByName('minecraft:water'), 1);
        chunk.setBlockRuntimeId(8, -60, 5, slab);

        const bottom = decodeSections(new JavaChunkTranslator().columnOf(chunk).data, 24, JAVA_SECTION_KINDS)[0]!;

        expect([bottom.blocks[4 * 256 + 5 * 16 + 7], bottom.blocks[4 * 256 + 5 * 16 + 8]]).toEqual([
            BLOCK_STATES.idOf('minecraft:oak_slab', { type: 'bottom', waterlogged: 'true' }),
            BLOCK_STATES.idOf('minecraft:oak_slab', { type: 'bottom', waterlogged: 'false' })
        ]);
        expect(bottom.fluidCount).toBe(1);
    });

    it('lights the sky above the ground and nothing below it', () => {
        const column = new JavaChunkTranslator().columnOf(flatChunk());
        const bottomLight = column.skyLight[0]!;
        const nibble = (y: number) => (bottomLight[(y * 256) >> 1]! >> (((y * 256) & 1) * 4)) & 15;

        expect([0, 3, 4, 15].map(nibble)).toEqual([0, 0, 15, 15]);
        expect(column.skyLight[1]!.every((byte) => byte === 0xff)).toBe(true);
        expect(column.emptySkyMask).toEqual([0]);
    });

    it("carries the world's light, listing each dark section as empty", () => {
        const chunk = flatChunk();
        // A torch's glow at one block just above the grass, at x 3, z 4.
        const column = new JavaChunkTranslator().columnOf(chunk, {
            sky: (_x, y) => (y >= -60 ? 15 : 0),
            block: (x, y, z) => (x === 3 && y === -60 && z === -12 ? 14 : 0)
        });

        expect(column.blockMask).toEqual([1]);
        expect(column.emptyBlockMask).toEqual([0, ...Array.from({ length: 23 }, (_, i) => i + 2)]);
        const glow = column.blockLight[0]!;
        const at = 4 * 256 + 4 * 16 + 3;
        expect((glow[at >> 1]! >> ((at & 1) * 4)) & 15).toBe(14);
        expect(column.skyMask).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    });
});
