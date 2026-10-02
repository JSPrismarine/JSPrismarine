/**
 * The keys a Bedrock world's LevelDB is addressed by.
 *
 * A chunk record's key is the chunk's x and z as signed 32 bit little endian integers, then the
 * dimension - omitted entirely for the Overworld, which is why keys come in two lengths - then a
 * one byte tag saying what the record is, and for a sub chunk one more byte holding its index.
 *
 * That index byte is *signed*: 0xfc is -4, the Overworld's bottom sub chunk. Reading it unsigned
 * is the classic way to end up with terrain stacked in the wrong order.
 * @see https://minecraft.wiki/w/Bedrock_Edition_level_format
 */

export enum ChunkTag {
    /** Heightmap and 3D biome palettes. Replaced Data2D in 1.18. */
    Data3D = 0x2b,
    /** The chunk's format version, one byte. */
    Version = 0x2c,
    /** Heightmap and 2D biomes. Written by worlds older than 1.18. */
    Data2D = 0x2d,
    Data2DLegacy = 0x2e,
    /** A sub chunk's blocks. The key carries the sub chunk index. */
    SubChunkPrefix = 0x2f,
    /** Pre-1.0 block storage. */
    LegacyTerrain = 0x30,
    /** Concatenated NBT compounds, one per block entity. */
    BlockEntity = 0x31,
    /** Concatenated NBT compounds, one per entity. Superseded by actorprefix in 1.18.30. */
    Entity = 0x32,
    PendingTicks = 0x33,
    LegacyBlockExtraData = 0x34,
    BiomeState = 0x35,
    /** Four bytes: 0 needs instaticking, 1 needs population, 2 done. */
    FinalizedState = 0x36,
    ConversionData = 0x37,
    BorderBlocks = 0x38,
    HardcodedSpawners = 0x39,
    RandomTicks = 0x3a,
    /** xxHash checksums of the other records. Dropped in 1.18. */
    Checksums = 0x3b,
    MetaDataHash = 0x3d,
    GeneratedPreCavesAndCliffsBlending = 0x3e,
    BlendingBiomeHeight = 0x3f,
    BlendingData = 0x40,
    ActorDigestVersion = 0x41,
    /** Where the chunk version lived before 1.16.100. */
    LegacyVersion = 0x76,
    AABBVolumes = 0x77
}

/** The one dimension whose id is left out of the key entirely. */
export const OVERWORLD_DIMENSION = 0;

/** The list of actor ids belonging to a chunk. Each actor's NBT lives under `actorprefix`. */
export const DIGEST_PREFIX = Buffer.from('digp', 'ascii');
export const ACTOR_PREFIX = Buffer.from('actorprefix', 'ascii');

export interface ChunkKey {
    x: number;
    z: number;
    dimension: number;
    tag: ChunkTag;
    /** Only present for {@link ChunkTag.SubChunkPrefix}. Signed. */
    subChunk?: number;
}

export const encodeChunkKey = ({ x, z, dimension, tag, subChunk }: ChunkKey): Buffer => {
    const hasDimension = dimension !== OVERWORLD_DIMENSION;
    const hasSubChunk = tag === ChunkTag.SubChunkPrefix;

    const key = Buffer.allocUnsafe(8 + (hasDimension ? 4 : 0) + 1 + (hasSubChunk ? 1 : 0));
    key.writeInt32LE(x, 0);
    key.writeInt32LE(z, 4);

    let at = 8;
    if (hasDimension) {
        key.writeInt32LE(dimension, at);
        at += 4;
    }

    key.writeUInt8(tag, at++);
    if (hasSubChunk) key.writeInt8(subChunk ?? 0, at);

    return key;
};

/**
 * Reads a chunk key, or null when the key is not one - the database is full of `~local_player`,
 * `portals`, `map_-1` and the rest, and telling them apart is purely a matter of length and shape.
 */
export const decodeChunkKey = (key: Buffer): ChunkKey | null => {
    // 9 and 10 are Overworld records; 13 and 14 carry a dimension.
    if (![9, 10, 13, 14].includes(key.byteLength)) return null;

    const hasDimension = key.byteLength >= 13;
    const tagAt = hasDimension ? 12 : 8;
    const tag = key.readUInt8(tagAt);

    if (!(tag in ChunkTag)) return null;

    const hasSubChunk = key.byteLength === (hasDimension ? 14 : 10);
    if (hasSubChunk !== (tag === ChunkTag.SubChunkPrefix)) return null;

    return {
        x: key.readInt32LE(0),
        z: key.readInt32LE(4),
        dimension: hasDimension ? key.readInt32LE(8) : OVERWORLD_DIMENSION,
        tag,
        ...(hasSubChunk ? { subChunk: key.readInt8(tagAt + 1) } : {})
    };
};

/** The `digp` key listing which actors belong to a chunk. */
export const encodeDigestKey = (x: number, z: number, dimension: number): Buffer => {
    const hasDimension = dimension !== OVERWORLD_DIMENSION;
    const key = Buffer.allocUnsafe(DIGEST_PREFIX.byteLength + 8 + (hasDimension ? 4 : 0));

    DIGEST_PREFIX.copy(key, 0);
    key.writeInt32LE(x, DIGEST_PREFIX.byteLength);
    key.writeInt32LE(z, DIGEST_PREFIX.byteLength + 4);
    if (hasDimension) key.writeInt32LE(dimension, DIGEST_PREFIX.byteLength + 8);

    return key;
};

/** The key an actor's NBT lives under, given the 8 byte unique id from its chunk's digest. */
export const encodeActorKey = (uniqueId: Buffer): Buffer => {
    if (uniqueId.byteLength !== 8) {
        throw new RangeError(`An actor id is 8 bytes, got ${uniqueId.byteLength}`);
    }

    return Buffer.concat([ACTOR_PREFIX, uniqueId]);
};

/** The 8 byte ids packed into a `digp` value. */
export const decodeDigest = (value: Buffer): Buffer[] => {
    if (value.byteLength % 8 !== 0) {
        throw new RangeError(`An actor digest is a whole number of 8 byte ids, got ${value.byteLength} bytes`);
    }

    return Array.from({ length: value.byteLength / 8 }, (_, i) => value.subarray(i * 8, i * 8 + 8));
};

export const encodeDigest = (uniqueIds: readonly Buffer[]): Buffer => Buffer.concat(uniqueIds as Buffer[]);
