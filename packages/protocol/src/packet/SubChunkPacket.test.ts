import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import SubChunkHeightmapData, { HeightMapDataType } from '../structure/SubChunkHeightmapData';
import SubChunkPos from '../structure/SubChunkPos';
import SubChunkPosOffset from '../structure/SubChunkPosOffset';
import SubChunkPacket, { SubChunkRequestResult } from './SubChunkPacket';

import type { HeightMap } from '../structure/SubChunkHeightmapData';
import type { SubChunk } from './SubChunkPacket';

/** Row z holds z in every column, except the first row's first column, which is below the sub chunk. */
const HEIGHT_MAP: HeightMap = Array.from({ length: 16 }, (_, z) => Array.from({ length: 16 }, () => z));
HEIGHT_MAP[0]![0] = -1;

/** `HEIGHT_MAP` on the wire: 16 rows, each a varuint32 length of 16 and then 16 signed bytes. */
const HEIGHT_MAP_BYTES = HEIGHT_MAP.flatMap((row) => [0x10, ...row.map((height) => height & 0xff)]);

/** Cache on: one sub chunk with terrain, a heightmap and a blob id, and one that is all air. */
const CACHED: SubChunk = {
    cacheEnabled: true,
    dimension: 1,
    centerPos: new SubChunkPos(-3, 4, 100),
    entries: [
        {
            offset: new SubChunkPosOffset(-1, 2, 0),
            result: SubChunkRequestResult.SUCCESS,
            serializedSubChunk: Buffer.from([0x0a, 0x0b, 0x0c]),
            heightMaps: new SubChunkHeightmapData(
                HeightMapDataType.HAS_DATA,
                HEIGHT_MAP,
                HeightMapDataType.ALL_COPIED,
                undefined
            ),
            blobId: 0x0102030405060708n
        },
        {
            offset: new SubChunkPosOffset(0, -4, 1),
            result: SubChunkRequestResult.SUCCESS_ALL_AIR,
            heightMaps: new SubChunkHeightmapData(HeightMapDataType.ALL_TOO_LOW, undefined, HeightMapDataType.NO_DATA)
        }
    ]
};

/** `CACHED` on the wire, header included, written by hand in the order the docs list the fields. */
const CACHED_BYTES = Buffer.from([
    ...[0xae, 0x01], // packet id header: 174 as a varuint32
    0x01, // Cache Enabled
    0x02, // Dimension Type: ZigZag(1)
    ...[0xfd, 0xff, 0xff, 0xff], // Center Pos: Subchunk Position X -3, little-endian int32
    ...[0x04, 0x00, 0x00, 0x00], // Subchunk Position Y 4
    ...[0x64, 0x00, 0x00, 0x00], // Subchunk Position Z 100
    0x02, // SubChunk Data count, a varuint32
    ...[0xff, 0x02, 0x00], // entry 1: SubChunk Pos Offset (-1, 2, 0), three signed bytes
    0x01, // SubChunk Request Result: Success
    0x01, // Serialized Sub Chunk present
    ...[0x03, 0x0a, 0x0b, 0x0c], // Serialized Sub Chunk: varuint32 length 3, then the bytes
    0x01, // Height Map Type: HasData
    0x01, // Subchunk Height Map present
    ...HEIGHT_MAP_BYTES, // Subchunk Height Map: 16 rows of (0x10, 16 signed bytes)
    0x04, // Render Height Map Type: AllCopied
    0x00, // Subchunk Render Height Map absent
    0x01, // Blob Id present
    ...[0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01], // Blob Id 0x0102030405060708, little-endian uint64
    ...[0x00, 0xfc, 0x01], // entry 2: SubChunk Pos Offset (0, -4, 1)
    0x06, // SubChunk Request Result: SuccessAllAir
    0x00, // Serialized Sub Chunk absent
    0x03, // Height Map Type: AllTooLow
    0x00, // Subchunk Height Map absent
    0x00, // Render Height Map Type: NoData
    0x00, // Subchunk Render Height Map absent
    0x00 // Blob Id absent
]);

/** Cache off, no heightmaps: the shape a server without blob caching sends for a plain sub chunk. */
const PLAIN: SubChunk = {
    cacheEnabled: false,
    dimension: 0,
    centerPos: new SubChunkPos(0, 0, 0),
    entries: [
        {
            offset: new SubChunkPosOffset(0, 0, 0),
            result: SubChunkRequestResult.SUCCESS,
            serializedSubChunk: Buffer.from([0x09]),
            heightMaps: new SubChunkHeightmapData(HeightMapDataType.NO_DATA, undefined, HeightMapDataType.NO_DATA)
        }
    ]
};

/** `PLAIN` on the wire. */
const PLAIN_BYTES = Buffer.from([
    ...[0xae, 0x01], // packet id header
    0x00, // Cache Enabled
    0x00, // Dimension Type: ZigZag(0)
    ...Array.from({ length: 12 }, () => 0x00), // Center Pos (0, 0, 0)
    0x01, // SubChunk Data count
    ...[0x00, 0x00, 0x00], // SubChunk Pos Offset (0, 0, 0)
    0x01, // SubChunk Request Result: Success
    0x01, // Serialized Sub Chunk present
    ...[0x01, 0x09], // Serialized Sub Chunk: one byte
    0x00, // Height Map Type: NoData
    0x00, // Subchunk Height Map absent
    0x00, // Render Height Map Type: NoData
    0x00, // Subchunk Render Height Map absent
    0x00 // Blob Id absent
]);

/** Cache off with both heightmaps present, which the hand-written buffers do not cover. */
const BOTH_HEIGHT_MAPS: SubChunk = {
    cacheEnabled: false,
    dimension: 2,
    centerPos: new SubChunkPos(7, -2, -9),
    entries: [
        {
            offset: new SubChunkPosOffset(127, -128, 3),
            result: SubChunkRequestResult.SUCCESS,
            serializedSubChunk: Buffer.alloc(0),
            heightMaps: new SubChunkHeightmapData(
                HeightMapDataType.HAS_DATA,
                HEIGHT_MAP,
                HeightMapDataType.HAS_DATA,
                HEIGHT_MAP.map((row) => row.map((height) => 15 - height))
            )
        },
        {
            offset: new SubChunkPosOffset(0, 0, 0),
            result: SubChunkRequestResult.INDEX_OUT_OF_BOUNDS,
            heightMaps: new SubChunkHeightmapData(HeightMapDataType.NO_DATA, undefined, HeightMapDataType.NO_DATA)
        }
    ]
};

describe('SubChunkPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new SubChunkPacket(CACHED).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...CACHED_BYTES]);
    });

    it('reads a hand-built cached buffer to its end', () => {
        const stream = new NetworkBinaryStream(CACHED_BYTES);
        const data = new SubChunkPacket().deserialize(stream);

        expect(data).toEqual(CACHED);
        expect(stream.feof()).toBe(true);
    });

    it('writes a plain sub chunk without cache or heightmaps', () => {
        const buffer = new SubChunkPacket(PLAIN).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...PLAIN_BYTES]);
    });

    it('reads a hand-built plain buffer to its end', () => {
        const stream = new NetworkBinaryStream(PLAIN_BYTES);
        const data = new SubChunkPacket().deserialize(stream);

        expect(data).toEqual(PLAIN);
        expect(stream.feof()).toBe(true);
    });

    it.each([
        ['cache on', CACHED],
        ['cache off without heightmaps', PLAIN],
        ['cache off with both heightmaps', BOTH_HEIGHT_MAPS]
    ])('round-trips %s', (_, data) => {
        const buffer = new SubChunkPacket(data).serialize(new NetworkBinaryStream());
        const stream = new NetworkBinaryStream(buffer);

        expect(new SubChunkPacket().deserialize(stream)).toEqual(data);
        expect(stream.feof()).toBe(true);
    });
});
