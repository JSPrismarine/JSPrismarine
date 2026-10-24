import NetworkStructure from '../NetworkStructure';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * The docs enum `HeightMapDataType`: what a sub chunk contributes to the client's heightmap.
 *
 * `AllCopied` is only valid for `Render Height Map Type` and means the render heightmap equals
 * the regular one.
 */
export enum HeightMapDataType {
    /** No heightmap information. */
    NO_DATA = 0,
    /** A 16 by 16 heightmap follows. */
    HAS_DATA = 1,
    /** Every column's surface lies above this sub chunk. */
    ALL_TOO_HIGH = 2,
    /** Every column's surface lies below this sub chunk. */
    ALL_TOO_LOW = 3,
    /** The render heightmap is a copy of the regular heightmap. */
    ALL_COPIED = 4
}

/** Columns per side of a sub chunk, which is also the row count and row length of a heightmap. */
export const HEIGHT_MAP_SIDE = 16;

/**
 * A sub chunk heightmap: 16 rows indexed `[z][x]`, each height a signed byte. -1 means the
 * column's surface is below the sub chunk, 16 that it is above, and 0 to 15 the y inside it.
 */
export type HeightMap = number[][];

/**
 * The `SubChunkHeightmapData` carried by every `SubChunkPacket` entry.
 *
 * Protocol 2193 layout, in wire order: `Height Map Type` as one byte, `Subchunk Height Map` as
 * an optional {@link HeightMap} (a presence byte, then the rows only when present), `Render
 * Height Map Type` as one byte, then `Subchunk Render Height Map` as another optional
 * {@link HeightMap}. Each row of a heightmap is a varuint32 length (always 16) followed by 16
 * signed bytes; the row prefixes arrived with the Cereal migration at protocol 2168, which also
 * replaced "present when the type is `HasData`" with the presence bytes.
 *
 * Writing checks that a present heightmap is 16 rows of 16 and reading checks each row's
 * length, since a wrong size would leave the stream misaligned for everything after it.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/sub-chunk-heightmap-data/}
 */
export default class SubChunkHeightmapData extends NetworkStructure {
    public constructor(
        /** `Height Map Type`. */
        public heightMapType: HeightMapDataType = HeightMapDataType.NO_DATA,
        /** `Subchunk Height Map`, set when `heightMapType` is `HAS_DATA`. */
        public heightMap?: HeightMap,
        /** `Render Height Map Type`. */
        public renderHeightMapType: HeightMapDataType = HeightMapDataType.NO_DATA,
        /** `Subchunk Render Height Map`, set when `renderHeightMapType` is `HAS_DATA`. */
        public renderHeightMap?: HeightMap
    ) {
        super();
    }

    private static writeHeightMap(stream: NetworkBinaryStream, heightMap: HeightMap | undefined): void {
        stream.writeBoolean(heightMap !== undefined);
        if (heightMap === undefined) return;

        if (heightMap.length !== HEIGHT_MAP_SIDE) {
            throw new Error(`A heightmap needs ${HEIGHT_MAP_SIDE} rows, got ${heightMap.length}`);
        }
        for (const row of heightMap) {
            if (row.length !== HEIGHT_MAP_SIDE) {
                throw new Error(`A heightmap row needs ${HEIGHT_MAP_SIDE} heights, got ${row.length}`);
            }
            stream.writeUnsignedVarInt(row.length);
            for (const height of row) stream.writeSignedByte(height);
        }
    }

    private static readHeightMap(stream: NetworkBinaryStream): HeightMap | undefined {
        if (!stream.readBoolean()) return undefined;

        const heightMap: HeightMap = [];
        for (let z = 0; z < HEIGHT_MAP_SIDE; z++) {
            const length = stream.readUnsignedVarInt();
            if (length !== HEIGHT_MAP_SIDE) {
                throw new Error(`A heightmap row needs ${HEIGHT_MAP_SIDE} heights, got ${length}`);
            }
            const row: number[] = [];
            for (let x = 0; x < length; x++) row.push(stream.readSignedByte());
            heightMap.push(row);
        }
        return heightMap;
    }

    public serialize(stream: NetworkBinaryStream): void {
        stream.writeByte(this.heightMapType);
        SubChunkHeightmapData.writeHeightMap(stream, this.heightMap);
        stream.writeByte(this.renderHeightMapType);
        SubChunkHeightmapData.writeHeightMap(stream, this.renderHeightMap);
    }

    public deserialize(stream: NetworkBinaryStream): void {
        this.heightMapType = stream.readByte();
        this.heightMap = SubChunkHeightmapData.readHeightMap(stream);
        this.renderHeightMapType = stream.readByte();
        this.renderHeightMap = SubChunkHeightmapData.readHeightMap(stream);
    }
}
