/**
 * Java Edition's paletted containers, which carry a chunk section's block states and biomes.
 *
 * A container writes its bits per entry, then either one value (zero bits), a palette of the
 * values it holds (indirect), or nothing (direct, the registry's own ids). The values follow
 * packed into longs, as many whole entries a long as fit and none spanning two, with no length
 * in front: the reader works the count out from the bits. The palette lists values in the order
 * they first appear, which is the order the vanilla server writes them in.
 */
import type BinaryStream from '@jsprismarine/binaryutils';
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';

import { varInt } from '../wire/javaTypes';

/** How one kind of container sizes its palette. */
export interface PalettedContainerKind {
    /** How many entries a container holds: 4096 block states, or 64 biomes. */
    readonly entries: number;
    /** The fewest bits an indirect palette uses. */
    readonly minIndirectBits: number;
    /** The most bits an indirect palette uses; past them, entries are the registry's own ids. */
    readonly maxIndirectBits: number;
    /** The bits a registry id takes, used when the palette would need more than the indirect most. */
    readonly directBits: number;
}

/** The bits that hold `count` distinct values: the ceiling of their base-2 logarithm, at least 1. */
export const bitsFor = (count: number): number => Math.max(1, Math.ceil(Math.log2(count)));

/** A section's block states: 4 to 8 bits indirect, then the block state registry's ids. */
export const blockStatesKind = (stateCount: number): PalettedContainerKind => ({
    entries: 4096,
    minIndirectBits: 4,
    maxIndirectBits: 8,
    directBits: bitsFor(stateCount)
});

/** A section's biomes, a 4 by 4 by 4 grid: 1 to 3 bits indirect, then the biome registry's ids. */
export const biomesKind = (biomeCount: number): PalettedContainerKind => ({
    entries: 64,
    minIndirectBits: 1,
    maxIndirectBits: 3,
    directBits: bitsFor(biomeCount)
});

/** Packs `values` at `bits` each into longs, none spanning two, as the signed longs the wire carries. */
const pack = (values: ArrayLike<number>, bits: number): bigint[] => {
    const perLong = Math.floor(64 / bits);
    const longs: bigint[] = new Array(Math.ceil(values.length / perLong)).fill(0n);
    for (let i = 0; i < values.length; i++) {
        const at = Math.floor(i / perLong);
        longs[at] = longs[at]! | (BigInt(values[i]!) << BigInt((i % perLong) * bits));
    }
    return longs.map((long) => BigInt.asIntN(64, long));
};

/** The `count` entries packed at `bits` each in `longs`. */
const unpack = (longs: readonly bigint[], bits: number, count: number): number[] => {
    const perLong = Math.floor(64 / bits);
    const mask = (1n << BigInt(bits)) - 1n;
    const values: number[] = [];
    for (let i = 0; i < count; i++) {
        const long = BigInt.asUintN(64, longs[Math.floor(i / perLong)]!);
        values.push(Number((long >> BigInt((i % perLong) * bits)) & mask));
    }
    return values;
};

/**
 * Writes one container.
 * @param stream - Where it goes.
 * @param values - Every entry's registry id, in index order.
 * @param kind - Blocks or biomes.
 */
export const writePalettedContainer = (
    stream: BinaryStream,
    values: ArrayLike<number>,
    kind: PalettedContainerKind
): void => {
    const palette: number[] = [];
    const indexOf = new Map<number, number>();
    for (let i = 0; i < values.length; i++) {
        const value = values[i]!;
        if (!indexOf.has(value)) {
            indexOf.set(value, palette.length);
            palette.push(value);
        }
    }
    if (palette.length === 1) {
        stream.writeByte(0);
        varInt.write(stream, palette[0]!);
        return;
    }
    const needed = Math.max(kind.minIndirectBits, bitsFor(palette.length));
    if (needed <= kind.maxIndirectBits) {
        stream.writeByte(needed);
        varInt.write(stream, palette.length);
        for (const value of palette) varInt.write(stream, value);
        const indices = Array.from(values, (value) => indexOf.get(value)!);
        for (const long of pack(indices, needed)) stream.writeLong(long);
        return;
    }
    stream.writeByte(kind.directBits);
    for (const long of pack(values, kind.directBits)) stream.writeLong(long);
};

/**
 * Reads one container.
 * @param stream - Where it comes from.
 * @param kind - Blocks or biomes.
 * @returns Every entry's registry id, in index order.
 * @throws {Error} For bits the kind does not use.
 */
export const readPalettedContainer = (stream: BinaryStream, kind: PalettedContainerKind): number[] => {
    const bits = stream.readByte();
    if (bits === 0) return new Array<number>(kind.entries).fill(varInt.read(stream));
    const readLongs = (width: number) =>
        Array.from({ length: Math.ceil(kind.entries / Math.floor(64 / width)) }, () => stream.readLong());
    if (bits <= kind.maxIndirectBits) {
        if (bits < kind.minIndirectBits) {
            throw new ProtocolWireErrors.JavaPalettedContainerBits({ bits, entries: kind.entries });
        }
        const palette = Array.from({ length: varInt.read(stream) }, () => varInt.read(stream));
        return unpack(readLongs(bits), bits, kind.entries).map((index) => palette[index] ?? 0);
    }
    if (bits !== kind.directBits) {
        throw new ProtocolWireErrors.JavaPalettedContainerBits({ bits, entries: kind.entries });
    }
    return unpack(readLongs(bits), bits, kind.entries);
};

/**
 * A heightmap's longs: one entry a column, 256 of them, each the height above the bottom of the
 * world plus one of the column's highest block, or zero for an empty column.
 * @param heights - The 256 entries, x fastest then z.
 * @param worldHeight - How many blocks tall the dimension is, which sizes an entry.
 * @returns The packed longs.
 */
export const packHeightmap = (heights: ArrayLike<number>, worldHeight: number): bigint[] =>
    pack(heights, bitsFor(worldHeight + 1));

/**
 * The entries a heightmap's longs hold.
 * @param longs - The packed longs.
 * @param worldHeight - How many blocks tall the dimension is.
 * @returns The 256 entries.
 */
export const unpackHeightmap = (longs: readonly bigint[], worldHeight: number): number[] =>
    unpack(longs, bitsFor(worldHeight + 1), 256);
