import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import SubChunkHeightmapData, { HeightMapDataType } from './SubChunkHeightmapData';

import type { HeightMap } from './SubChunkHeightmapData';

/** Row z holds z in every column, except the first row's first column, which is below the sub chunk. */
const HEIGHT_MAP: HeightMap = Array.from({ length: 16 }, (_, z) => Array.from({ length: 16 }, () => z));
HEIGHT_MAP[0]![0] = -1;

/** `HEIGHT_MAP` on the wire: 16 rows, each a varuint32 length of 16 and then 16 signed bytes. */
const HEIGHT_MAP_BYTES = HEIGHT_MAP.flatMap((row) => [0x10, ...row.map((height) => height & 0xff)]);

const WITH_DATA = new SubChunkHeightmapData(
    HeightMapDataType.HAS_DATA,
    HEIGHT_MAP,
    HeightMapDataType.ALL_COPIED,
    undefined
);

const WITH_DATA_BYTES = Buffer.from([
    0x01, // Height Map Type: HasData
    0x01, // Subchunk Height Map present
    ...HEIGHT_MAP_BYTES,
    0x04, // Render Height Map Type: AllCopied
    0x00 // Subchunk Render Height Map absent
]);

const WITHOUT_DATA = new SubChunkHeightmapData(HeightMapDataType.ALL_TOO_LOW, undefined, HeightMapDataType.NO_DATA);

/** Two type bytes, each followed by an absent heightmap. */
const WITHOUT_DATA_BYTES = Buffer.from([0x03, 0x00, 0x00, 0x00]);

describe('SubChunkHeightmapData', () => {
    it('writes a present heightmap as 16 length-prefixed rows', () => {
        const stream = new NetworkBinaryStream();
        WITH_DATA.serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...WITH_DATA_BYTES]);
    });

    it('reads a present heightmap to the end of the buffer', () => {
        const stream = new NetworkBinaryStream(WITH_DATA_BYTES);
        const data = SubChunkHeightmapData.deserialize(stream);

        expect(data).toEqual(WITH_DATA);
        expect(stream.feof()).toBe(true);
    });

    it('writes two absent heightmaps as four bytes', () => {
        const stream = new NetworkBinaryStream();
        WITHOUT_DATA.serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...WITHOUT_DATA_BYTES]);
    });

    it('reads two absent heightmaps', () => {
        const stream = new NetworkBinaryStream(WITHOUT_DATA_BYTES);
        const data = SubChunkHeightmapData.deserialize(stream);

        expect(data).toEqual(WITHOUT_DATA);
        expect(stream.feof()).toBe(true);
    });

    it('round-trips a render heightmap of its own', () => {
        const render = HEIGHT_MAP.map((row) => row.map((height) => 15 - height));
        const data = new SubChunkHeightmapData(
            HeightMapDataType.HAS_DATA,
            HEIGHT_MAP,
            HeightMapDataType.HAS_DATA,
            render
        );
        const stream = new NetworkBinaryStream();
        data.serialize(stream);

        expect(SubChunkHeightmapData.deserialize(new NetworkBinaryStream(stream.getBuffer()))).toEqual(data);
    });

    it('refuses to write a heightmap that is not 16 by 16', () => {
        const stream = new NetworkBinaryStream();
        const shortRow = HEIGHT_MAP.map((row) => [...row]);
        shortRow[3] = [1, 2, 3];

        expect(() => new SubChunkHeightmapData(HeightMapDataType.HAS_DATA, [[0]]).serialize(stream)).toThrow('16 rows');
        expect(() => new SubChunkHeightmapData(HeightMapDataType.HAS_DATA, shortRow).serialize(stream)).toThrow(
            '16 heights'
        );
    });

    it('refuses a row whose length prefix is not 16', () => {
        const stream = new NetworkBinaryStream(Buffer.from([0x01, 0x01, 0x03, 0x00, 0x00, 0x00]));

        expect(() => SubChunkHeightmapData.deserialize(stream)).toThrow('got 3');
    });
});
