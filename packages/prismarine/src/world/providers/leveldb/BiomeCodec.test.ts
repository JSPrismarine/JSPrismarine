import { createHash } from 'node:crypto';

import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { ChunkBiomes } from '../../chunk/ChunkBiomes';
import { Dimensions } from '../../DimensionType';
import { decodeData3D, encodeData3D } from './BiomeCodec';

/** A column with uniform sections, a two-biome section and one of five biomes in short runs. */
const mixedColumn = (): ChunkBiomes => {
    const biomes = new ChunkBiomes(Dimensions.Overworld);
    biomes.fillSection(2, 2);
    biomes.set(3, 40, 9, 21);
    for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
            for (let y = 64; y < 80; y++) biomes.set(x, y, z, [1, 2, 4, 21, 35][(x + z * 3 + (y >> 2)) % 5]!);
        }
    }
    return biomes;
};

const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

describe('BiomeCodec', () => {
    it('keeps the Data3D bytes of a mixed column unchanged', () => {
        const biomes = mixedColumn();
        const heightmap = Uint16Array.from({ length: 256 }, (_, index) => index % 200);
        const encoded = encodeData3D({ heightmap, palettes: biomes.sectionsToEncode() }, Dimensions.Overworld);

        expect(digest(encoded)).toBe('a5b95db0a855496e58957c9d1c4bcf7266be382905623947389e482d6d060492');
        expect(encodeData3D({ heightmap, palettes: biomes.toSectionIds() }, Dimensions.Overworld)).toEqual(encoded);

        const decoded = decodeData3D(encoded, Dimensions.Overworld);
        expect(ChunkBiomes.fromSectionIds(decoded.palettes, Dimensions.Overworld).get(3, 40, 9)).toBe(21);
    });

    describe('a section of one biome', () => {
        /** A `Data3D` record: an empty heightmap, then the given section bytes. */
        const record = (...sections: string[]): Buffer =>
            Buffer.concat([Buffer.alloc(512), Buffer.from(sections.join(''), 'hex')]);

        it('reads the header and the id the game writes, with no palette size between them', () => {
            // As Bedrock Dedicated Server 1.26.51 wrote it: deep dark (24), then the rest inherit.
            const decoded = decodeData3D(record('0118000000', '0101000000', 'ffff'), Dimensions.Overworld);

            expect(decoded.palettes.slice(0, 4)).toEqual([24, 1, 1, 1]);
        });

        it('writes the bytes the game writes', () => {
            const encoded = encodeData3D(
                { heightmap: new Uint16Array(256), palettes: [24, 1] },
                Dimensions.Overworld
            ).subarray(512, 522);

            expect(encoded.toString('hex')).toBe('0118000000' + '0101000000');
        });

        it('still reads a section this server wrote with a palette size before', () => {
            const decoded = decodeData3D(record('000100000018000000', '000100000001000000'), Dimensions.Overworld);

            expect(decoded.palettes.slice(0, 2)).toEqual([24, 1]);
        });
    });

    it('keeps the network bytes of a mixed column unchanged', () => {
        const stream = new BinaryStream();
        mixedColumn().networkSerialize(stream, 24);

        expect(digest(stream.getBuffer())).toBe('9addc8c151cc7f2cde503921235402105262824f4e678ecd4e65fb400792a42b');
    });
});
