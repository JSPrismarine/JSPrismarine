/**
 * `SubChunkPacket`: a batch of sub chunks answering a `SubChunkRequestPacket`.
 *
 * The payload is `Cache Enabled`, `Dimension Type`, `Center Pos`, then `SubChunk Data`, a
 * varuint32 count followed by one `SubChunkPacketData` entry per sub chunk. Protocol 2207
 * renumbered every entry's `SubChunk Request Result`, and a wire type has no protocol to
 * consult. The list is therefore declared twice, once per numbering, under the gates that admit
 * each. Exactly one travels at any version; the other stays empty.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/sub-chunk-packet/
 */
import SubChunkHeightmapData from '../../structure/SubChunkHeightmapData';
import SubChunkPos from '../../structure/SubChunkPos';
import SubChunkPosOffset from '../../structure/SubChunkPosOffset';
import { definePacket, gated } from '../define';
import * as t from '../fieldTypes';
import { SINCE_2207_SUB_CHUNK_RESULTS, UNTIL_2207_SUB_CHUNK_RESULTS } from '../wireGates';

import type { PayloadOf } from '../define';
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';

/**
 * The semantic `SubChunkRequestResult` values used by the server and clients.
 *
 * Protocol 2193 writes `SUCCESS` as 0 and `SUCCESS_ALL_AIR` as 5. Protocol 2207 shifted the
 * six wire values up by one and reserves 0 for `UNDEFINED`; the layout applies that version
 * difference while keeping this API stable.
 */
export enum SubChunkRequestResult {
    /** No result; never sent on purpose. */
    UNDEFINED = 0,
    /** `Serialized Sub Chunk` holds the sub chunk. */
    SUCCESS = 1,
    /** The server has no chunk at that column. */
    LEVEL_CHUNK_DOESNT_EXIST = 2,
    /** The player was in another dimension when the request arrived. */
    WRONG_DIMENSION = 3,
    /** The requesting player is unknown, for example already logged off. */
    PLAYER_DOESNT_EXIST = 4,
    /** The sub chunk y lies outside the dimension's range. */
    INDEX_OUT_OF_BOUNDS = 5,
    /** The sub chunk is all air, so no `Serialized Sub Chunk` is needed. */
    SUCCESS_ALL_AIR = 6
}

/** One `SubChunkPacketData` entry of the `SubChunk Data` list. */
export interface SubChunkEntry {
    /** `SubChunk Pos Offset` from `Center Pos`, in sub chunks. */
    offset: SubChunkPosOffset;
    /** `SubChunk Request Result`. */
    result: SubChunkRequestResult;
    /**
     * `Serialized Sub Chunk`, left as bytes: the sub chunk's block storage followed by its block
     * entities, in the same form `LevelChunkPacket` carries. Absent when a cached blob stands
     * in for the bytes.
     */
    serializedSubChunk?: Buffer;
    /** `Height Map Data`. */
    heightMaps: SubChunkHeightmapData;
    /**
     * `Blob Id`, the hash the client fetches the sub chunk by when `Cache Enabled` is set. The
     * blob covers the whole `Serialized Sub Chunk`, block entities included, so it differs from
     * the id the same terrain would have in a `LevelChunkPacket`.
     */
    blobId?: bigint;
}

/** `Center Pos`: three little-endian int32, bridged to the `SubChunkPos` class. */
const subChunkPos = t.custom<SubChunkPos>(
    'SubChunkPos',
    (stream, value) => value.serialize(stream),
    (stream) => {
        const value = new SubChunkPos();
        value.deserialize(stream);
        return value;
    }
);

/** `SubChunk Pos Offset`: three signed bytes, bridged to the `SubChunkPosOffset` class. */
const subChunkPosOffset = t.custom<SubChunkPosOffset>(
    'SubChunkPosOffset',
    (stream, value) => value.serialize(stream),
    (stream) => {
        const value = new SubChunkPosOffset();
        value.deserialize(stream);
        return value;
    }
);

/** `Height Map Data`, bridged to the `SubChunkHeightmapData` class. */
const subChunkHeightmapData = t.custom<SubChunkHeightmapData>(
    'SubChunkHeightmapData',
    (stream, value) => value.serialize(stream),
    (stream) => {
        const value = new SubChunkHeightmapData();
        value.deserialize(stream);
        return value;
    }
);

/**
 * `SubChunk Request Result` as one byte, written as the wire value `semantic - shift`.
 *
 * Protocol 2193 numbers the results from `SUCCESS` at 0, a shift of 1; protocol 2207 on numbers
 * them as the enum does, a shift of 0. Writing refuses a value outside the enum, and refuses
 * `UNDEFINED` where the shift leaves no wire value for it. Reading refuses a byte that maps
 * outside the enum.
 */
const resultAt = (shift: 0 | 1) =>
    t.custom<SubChunkRequestResult>(
        'SubChunkRequestResult',
        (stream, result) => {
            if (
                !Number.isInteger(result) ||
                result < SubChunkRequestResult.UNDEFINED ||
                result > SubChunkRequestResult.SUCCESS_ALL_AIR
            ) {
                throw new ProtocolWireErrors.UnknownSubChunkRequestResult({ result });
            }
            if (result - shift < 0) {
                throw new ProtocolWireErrors.UndefinedSubChunkResultUnsupported();
            }
            stream.writeByte(result - shift);
        },
        (stream) => {
            const wireResult = stream.readByte();
            const result: SubChunkRequestResult = wireResult + shift;
            if (result > SubChunkRequestResult.SUCCESS_ALL_AIR) {
                throw new ProtocolWireErrors.UnknownSubChunkRequestResult({ result: wireResult });
            }
            return result;
        }
    );

/**
 * One `SubChunkPacketData` with its request result numbered by `shift`.
 *
 * An entry's optional `Serialized Sub Chunk` and `Blob Id` each travel as a presence byte, then
 * the value only when present. Reading leaves an absent one off the entry.
 */
const entryAt = (shift: 0 | 1) => {
    const fields = t.record({
        offset: subChunkPosOffset,
        result: resultAt(shift),
        serializedSubChunk: t.present(t.byteArray),
        heightMaps: subChunkHeightmapData,
        blobId: t.present(t.lu64)
    });
    return t.custom<SubChunkEntry>(
        'SubChunkPacketData',
        (stream, entry) =>
            fields.write(stream, {
                offset: entry.offset,
                result: entry.result,
                serializedSubChunk: entry.serializedSubChunk,
                heightMaps: entry.heightMaps,
                blobId: entry.blobId
            }),
        (stream) => {
            const { offset, result, serializedSubChunk, heightMaps, blobId } = fields.read(stream);
            const entry: SubChunkEntry = { offset, result, heightMaps };
            if (serializedSubChunk !== undefined) entry.serializedSubChunk = serializedSubChunk;
            if (blobId !== undefined) entry.blobId = blobId;
            return entry;
        }
    );
};

/** `SubChunk Data` with each entry's request result numbered by `shift`. */
const entriesAt = (shift: 0 | 1) => t.list(entryAt(shift));

/** The `SubChunkPacket` field list; the module doc carries the wire provenance. */
export const subChunkPacket = definePacket('SubChunkPacket', {
    /** `Cache Enabled`: the client agreed to blob caching and each entry may carry a `Blob Id`. */
    cacheEnabled: t.bool,
    /** `Dimension Type`: 0 for the Overworld, 1 for the Nether, 2 for the End. */
    dimension: t.varint32,
    /** `Center Pos`, the absolute sub chunk position every entry's offset is relative to. */
    centerPos: subChunkPos,
    /** `SubChunk Data` with the results numbered from `SUCCESS` at 0; the class leaves it empty from 2207 on. */
    entriesUntil2207: gated<SubChunkEntry[]>(UNTIL_2207_SUB_CHUNK_RESULTS, entriesAt(1), []),
    /** `SubChunk Data` with the results numbered as the enum; the class leaves it empty before 2207. */
    entriesSince2207: gated<SubChunkEntry[]>(SINCE_2207_SUB_CHUNK_RESULTS, entriesAt(0), [])
});

/** Wire-shaped payload of `SubChunkPacket`: the entries under the key their numbering travels as. */
export type SubChunkLayoutPayload = PayloadOf<typeof subChunkPacket>;
