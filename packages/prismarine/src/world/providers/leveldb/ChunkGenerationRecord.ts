/**
 * This project's per-chunk generation record, and Java's rule for reading a chunk as old.
 *
 * The record is little-endian NBT shaped like the two fields Java keeps in a chunk for the same
 * purpose: `DataVersion`, and `blending_data` with `min_section`, `max_section` and, once known,
 * `heights`. It sits under its own key prefix, so BDS never reads it.
 */
import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTReader, NBTTagCompound, NBTWriter, Types } from '@jsprismarine/nbt';
import type { PackedBlendingData } from '@jsprismarine/worldgen/blending/BlendingData';
import { GENERATION_DATA_VERSION, isOldGenerationDataVersion } from '@jsprismarine/worldgen/blending/generationVersion';

import type { ChunkGeneration } from '../../chunk/ChunkGeneration';
import type { DimensionType } from '../../DimensionType';
import { Dimensions } from '../../DimensionType';

/**
 * Prefix of the record. The key carries the chunk's x, z and dimension as three little endian
 * int32s, the dimension always present, as {@link import('./LevelDBKeys').PENDING_ENTITY_PREFIX}
 * does.
 */
export const CHUNK_GENERATION_PREFIX = Buffer.from('jsprismarine:chunk_generation:', 'ascii');

/**
 * The first Bedrock chunk `Version` written by the 1.18 generator, PocketMine's
 * `ChunkVersion::v1_18_0_20_beta`. Lower values are Bedrock's pre-1.18 terrain and the Caves and
 * Cliffs experiments, which covered y 0 to 255 in the overworld.
 */
export const FIRST_CAVES_AND_CLIFFS_CHUNK_VERSION = 33;

/** The sections a pre-1.18 overworld chunk covers: Java's `BlendingDataFix` area for them. */
const PRE_CAVES_AND_CLIFFS_AREA = { minSection: 0, maxSection: 16 } as const;

/** The record key for a chunk. */
export const encodeChunkGenerationKey = (x: number, z: number, dimension: number): Buffer => {
    const coordinates = Buffer.allocUnsafe(12);
    coordinates.writeInt32LE(x, 0);
    coordinates.writeInt32LE(z, 4);
    coordinates.writeInt32LE(dimension, 8);
    return Buffer.concat([CHUNK_GENERATION_PREFIX, coordinates]);
};

/**
 * Encodes the record a chunk is saved with. Java rewrites `DataVersion` to its own on every save
 * and keeps `blending_data`, and so does this.
 */
export const encodeChunkGeneration = (generation: ChunkGeneration): Buffer => {
    const root = new NBTTagCompound('');
    root.addValue('DataVersion', new Types.NumberVal(GENERATION_DATA_VERSION));
    const blending = generation.blending;
    if (blending !== undefined) {
        const tag = new NBTTagCompound('blending_data');
        tag.addValue('min_section', new Types.NumberVal(blending.minSection));
        tag.addValue('max_section', new Types.NumberVal(blending.maxSection));
        if (blending.heights !== undefined) {
            tag.addValue('heights', new Set(blending.heights.map((height) => new Types.FloatVal(height))));
        }
        root.addChild(tag);
    }

    const stream = new BinaryStream();
    const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
    writer.setUseVarint(false);
    writer.writeCompound(root);
    return stream.getBuffer();
};

/** What a stored record says, before Java's load rule is applied to it. */
export interface StoredChunkGeneration {
    readonly dataVersion: number;
    readonly blending?: PackedBlendingData;
}

/**
 * Reads a record, or undefined for one that is not valid NBT, which the load rule then treats as
 * a chunk with no record.
 */
export const decodeChunkGeneration = (value: Buffer): StoredChunkGeneration | undefined => {
    let root: NBTTagCompound;
    try {
        const reader = new NBTReader(new BinaryStream(value), ByteOrder.LITTLE_ENDIAN);
        reader.setUseVarint(false);
        root = reader.parse();
    } catch {
        return undefined;
    }

    const dataVersion = root.getNumber('DataVersion', 0);
    const tag = root.getCompound('blending_data', false);
    if (tag === null) return { dataVersion };

    const list = tag.getList('heights', false);
    const heights = list === null ? undefined : floatsOf(list);
    return {
        dataVersion,
        blending: {
            minSection: tag.getNumber('min_section', 0),
            maxSection: tag.getNumber('max_section', 0),
            ...(heights === undefined ? {} : { heights })
        }
    };
};

/** A list of floats as numbers, or undefined when any entry is not a float, which drops the heights. */
const floatsOf = (list: ReadonlySet<unknown>): number[] | undefined => {
    const floats: number[] = [];
    for (const entry of list) {
        if (!(entry instanceof Types.FloatVal)) return undefined;
        floats.push(entry.getValue());
    }
    return floats;
};

/** What the load rule reads about a stored chunk. */
export interface StoredChunkFacts {
    /** The chunk's record, or undefined when it has none. */
    readonly record: StoredChunkGeneration | undefined;
    /** Bedrock's chunk `Version`, or its pre-1.16.100 `LegacyVersion`. */
    readonly chunkVersion: number;
    readonly dimension: DimensionType;
}

/**
 * Java's load-time rule, `BlendingDataFix` and `BlendingDataRemoveFromNetherEndFix`, for a chunk
 * read from a save.
 *
 * A record with `blending_data` keeps it. Otherwise an overworld chunk with no record, or with a
 * `DataVersion` older than the blending boundary, becomes old: covering sections 0 to 16 when
 * Bedrock's pre-1.18 generator made it, and the whole dimension otherwise. Any other chunk is
 * current. The Nether, the End and every custom dimension never blend, as in Java.
 */
export const generationOnLoad = ({ record, chunkVersion, dimension }: StoredChunkFacts): ChunkGeneration => {
    const dataVersion = record?.dataVersion ?? 0;
    if (dimension.id !== Dimensions.Overworld.id) return { dataVersion };
    if (record?.blending !== undefined) return { dataVersion, blending: record.blending };
    if (!isOldGenerationDataVersion(record?.dataVersion)) return { dataVersion };

    const area =
        chunkVersion < FIRST_CAVES_AND_CLIFFS_CHUNK_VERSION
            ? PRE_CAVES_AND_CLIFFS_AREA
            : { minSection: dimension.minY >> 4, maxSection: (dimension.minY + dimension.height) >> 4 };
    return { dataVersion, blending: area };
};
