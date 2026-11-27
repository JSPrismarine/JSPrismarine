import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { decodeJavaPacket, encodeJavaPacket, readJavaPacketId, javaPacketId } from '../packet/JavaPacket';
import { NEWEST_JAVA_RELEASE } from '../versions/javaReleases';
import { BLOCK_STATES } from '../versions/newest';
import { CONFIGURATION } from '../versions/newest';
import { decodeSections, encodeSections, LevelChunkWithLight } from './levelChunk';
import { biomesKind, blockStatesKind, unpackHeightmap } from './palettedContainer';

/** The chunk at (0, -1) of a vanilla 26.3 flat world, as the server sent it, without its packet id. */
const vanilla = Buffer.from(
    readFileSync(new URL('./__fixtures__/vanilla-26.3-flat-chunk-0-m1.hex', import.meta.url), 'utf8').trim(),
    'hex'
);

const biomeIds = CONFIGURATION.registries.find(({ registry }) => registry === 'minecraft:worldgen/biome')!.entries;
const kinds = { blocks: blockStatesKind(BLOCK_STATES.size), biomes: biomesKind(biomeIds.length) };

/** The fixture read through the packet definition. */
const read = () => {
    const frame = Buffer.concat([Buffer.from([javaPacketId(NEWEST_JAVA_RELEASE, LevelChunkWithLight)]), vanilla]);
    return decodeJavaPacket(NEWEST_JAVA_RELEASE, LevelChunkWithLight, readJavaPacketId(frame).body);
};

describe('LevelChunkWithLight', () => {
    it("reads vanilla's flat chunk: bedrock, two dirt and grass on a plains column", () => {
        const chunk = read();
        const sections = decodeSections(chunk.data, 24, kinds);
        const bottom = sections[0]!;
        const column = [0, 1, 2, 3, 4].map((y) => bottom.blocks[y * 256]);

        expect([chunk.x, chunk.z]).toEqual([0, -1]);
        expect(column).toEqual([
            BLOCK_STATES.idOf('minecraft:bedrock'),
            BLOCK_STATES.idOf('minecraft:dirt'),
            BLOCK_STATES.idOf('minecraft:dirt'),
            BLOCK_STATES.idOf('minecraft:grass_block', { snowy: 'false' }),
            BLOCK_STATES.idOf('minecraft:air')
        ]);
        expect([bottom.blockCount, bottom.fluidCount]).toEqual([1024, 0]);
        expect(new Set(sections.flatMap((section) => Array.from(section.biomes)))).toEqual(
            new Set([biomeIds.indexOf('minecraft:plains')])
        );
        // The top of the grass, y -61, is 4 above the bottom of the world, in every column.
        expect(new Set(unpackHeightmap(chunk.heightmaps[0]!.data, 384))).toEqual(new Set([4]));
        // Sky light for the two bottom sections, below the world empty, no block light.
        expect([chunk.skyMask, chunk.blockMask, chunk.emptySkyMask, chunk.emptyBlockMask]).toEqual([
            [1, 2],
            [],
            [0],
            [0, 1, 2]
        ]);
        expect(chunk.skyLight.map((array) => array.byteLength)).toEqual([2048, 2048]);
    });

    it('writes back the bytes vanilla sent, sections and light included', () => {
        const chunk = read();
        const sections = decodeSections(chunk.data, 24, kinds);

        const written = encodeJavaPacket(NEWEST_JAVA_RELEASE, LevelChunkWithLight, {
            ...chunk,
            data: encodeSections(sections, kinds)
        });

        expect(written.subarray(1)).toEqual(vanilla);
    });
});
