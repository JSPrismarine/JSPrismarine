/**
 * `Chunk Data and Update Light`: one chunk column's heightmaps, sections and light, as a Java
 * Edition client reads them. The layout was read off the vanilla 26.3 server's own encoder and a
 * captured chunk, which `levelChunk.test.ts` decodes.
 *
 * A section is its non-air block count, its fluid count, then its block states and its biomes as
 * paletted containers. Light comes as four bit sets over the light sections, which reach one past
 * the world at each end, then one 2048-byte array per section a mask names.
 */
import BinaryStream from '@jsprismarine/binaryutils';
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';

import type { WireType } from '../../wire/fieldTypes';
import { byteArray, custom, list, record } from '../../wire/fieldTypes';
import { defineJavaPacket } from '../packet/JavaPacket';
import { int, long, varInt } from '../wire/javaTypes';
import type { PalettedContainerKind } from './palettedContainer';
import { readPalettedContainer, writePalettedContainer } from './palettedContainer';

/** One chunk section: 16 by 16 by 16 blocks and 4 by 4 by 4 biomes. */
export interface JavaChunkSection {
    /** How many of its blocks are not air. */
    readonly blockCount: number;
    /** How many of its blocks hold a fluid. */
    readonly fluidCount: number;
    /** Each block's state id, y slowest, then z, then x. */
    readonly blocks: ArrayLike<number>;
    /** Each 4-block cell's biome id, in the same order. */
    readonly biomes: ArrayLike<number>;
}

/** The registries a section's containers index into. */
export interface JavaSectionKinds {
    readonly blocks: PalettedContainerKind;
    readonly biomes: PalettedContainerKind;
}

/**
 * The sections as the packet's data carries them.
 * @param sections - Every section of the column, bottom first.
 * @param kinds - The block state and biome registries' sizes.
 * @returns The bytes.
 */
export const encodeSections = (sections: readonly JavaChunkSection[], kinds: JavaSectionKinds): Buffer => {
    const stream = new BinaryStream();
    for (const section of sections) {
        stream.writeShort(section.blockCount);
        stream.writeShort(section.fluidCount);
        writePalettedContainer(stream, section.blocks, kinds.blocks);
        writePalettedContainer(stream, section.biomes, kinds.biomes);
    }
    return stream.getBuffer();
};

/**
 * The sections in a packet's data.
 * @param data - The bytes.
 * @param count - How many sections the dimension has.
 * @param kinds - The block state and biome registries' sizes.
 * @returns The sections, bottom first.
 */
export const decodeSections = (data: Buffer, count: number, kinds: JavaSectionKinds): JavaChunkSection[] => {
    const stream = new BinaryStream(data);
    return Array.from({ length: count }, () => ({
        blockCount: stream.readShort(),
        fluidCount: stream.readShort(),
        blocks: readPalettedContainer(stream, kinds.blocks),
        biomes: readPalettedContainer(stream, kinds.biomes)
    }));
};

/**
 * `BitSet`: Java's `BitSet.toByteArray`, least significant byte first, behind a VarInt length, as
 * the set bits' indices in ascending order.
 */
export const bitSet: WireType<number[]> = custom<number[]>(
    'BitSet',
    (s, indices) => {
        const bytes = Buffer.alloc(indices.length === 0 ? 0 : Math.floor(Math.max(...indices) / 8) + 1);
        for (const index of indices) bytes[index >> 3] = bytes[index >> 3]! | (1 << (index & 7));
        varInt.write(s, bytes.byteLength);
        s.write(bytes);
    },
    (s) => {
        const bytes = s.read(varInt.read(s));
        const indices: number[] = [];
        for (let index = 0; index < bytes.byteLength * 8; index++) {
            if ((bytes[index >> 3]! >> (index & 7)) & 1) indices.push(index);
        }
        return indices;
    }
);

/** The block entities a chunk carries, which this server does not send yet: always none. */
const noBlockEntities: WireType<[]> = custom<[]>(
    'Prefixed Array of Block Entity',
    (s) => varInt.write(s, 0),
    (s) => {
        const count = varInt.read(s);
        if (count !== 0) throw new ProtocolWireErrors.JavaChunkHasBlockEntities({ count });
        return [];
    }
);

/** Which heightmap an entry is, by Java's `Heightmap.Types` ordinal. */
export enum JavaHeightmapType {
    WorldSurface = 1,
    MotionBlocking = 4,
    MotionBlockingNoLeaves = 5
}

/** `Chunk Data and Update Light` (clientbound). */
export const LevelChunkWithLight = defineJavaPacket(
    'Chunk Data and Update Light',
    'play/clientbound/level_chunk_with_light',
    {
        x: int,
        z: int,
        heightmaps: list(record({ type: varInt, data: list(long) })),
        data: byteArray,
        blockEntities: noBlockEntities,
        skyMask: bitSet,
        blockMask: bitSet,
        emptySkyMask: bitSet,
        emptyBlockMask: bitSet,
        skyLight: list(byteArray),
        blockLight: list(byteArray)
    }
);
