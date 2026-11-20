/**
 * The form a feature pass's patches take across a worker or process boundary.
 *
 * A pass writes several thousand blocks, and as `{ x, y, z, block }` records each one is an
 * object the structured clone has to walk and rebuild on the other side. Packed, each write is
 * its position within the patch's chunk and a slot in a palette of the distinct blocks, two
 * typed arrays, so the receiving thread copies buffers instead of decoding thousands of objects.
 */
import { isRecord } from '../../../utils/isRecord';
import type { RegionBlock, RegionBlockPosition, RegionChunkPatch } from './GenerationRegion';
import {
    forEachBlockWrite,
    isOptionalFluidTickList,
    isPackableY,
    PackedBlockWrites,
    packWritePosition
} from './GenerationRegion';
import { PrismarineGenerationErrors } from '@jsprismarine/errors/prismarine/generation';

/** One chunk's patch, packed. */
export interface PackedRegionChunkPatch extends Omit<RegionChunkPatch, 'blocks' | 'structureBlocks'> {
    /** The distinct blocks the writes place, by identity. */
    readonly palette: readonly RegionBlock[];
    /** `Uint32Array` of each write's position within the chunk, in write order; see {@link packWritePosition}. */
    readonly writePositions: ArrayBuffer;
    /**
     * Each write's slot in {@link palette}: a `Uint16Array`, or a `Uint32Array` for a palette past
     * 65,536 blocks, which the byte length tells apart.
     */
    readonly writeBlocks: ArrayBuffer;
    /** `Int32Array` of x, y and z for each structure block. */
    readonly structureBlocks: ArrayBuffer;
}

const packPositions = (positions: readonly RegionBlockPosition[]): Int32Array<ArrayBuffer> => {
    const packed = new Int32Array(positions.length * 3);
    for (const [index, { x, y, z }] of positions.entries()) {
        packed[index * 3] = x;
        packed[index * 3 + 1] = y;
        packed[index * 3 + 2] = z;
    }
    return packed;
};

const unpackPositions = (buffer: ArrayBuffer): RegionBlockPosition[] => {
    const packed = new Int32Array(buffer);
    const positions: RegionBlockPosition[] = [];
    for (let index = 0; index < packed.length; index += 3) {
        positions.push({ x: packed[index]!, y: packed[index + 1]!, z: packed[index + 2]! });
    }
    return positions;
};

/** A typed array's own buffer when the array covers all of it, or a copy of just its bytes. */
const wholeBuffer = (array: Uint16Array | Uint32Array): ArrayBuffer =>
    array.byteOffset === 0 && array.byteLength === array.buffer.byteLength && array.buffer instanceof ArrayBuffer
        ? array.buffer
        : array.slice().buffer;

/**
 * Packs the patches a feature pass returns, or the patches a merge task carries back to a worker.
 *
 * Writes that are packed already, as the patches a worker sent are, keep their arrays. Those
 * still belong to the patch, which a retried merge reads again, so they are left out of the
 * transfer list and the boundary clones them.
 *
 * @returns The packed patches, and the buffers a worker thread can move rather than copy.
 */
export const packFeaturePatches = (
    patches: readonly RegionChunkPatch[]
): { readonly payload: PackedRegionChunkPatch[]; readonly transferList: ArrayBuffer[] } => {
    const transferList: ArrayBuffer[] = [];
    const payload = patches.map(({ blocks, structureBlocks, ...rest }): PackedRegionChunkPatch => {
        if (blocks instanceof PackedBlockWrites) {
            const packed = {
                ...rest,
                palette: blocks.palette,
                writePositions: wholeBuffer(blocks.positions),
                writeBlocks: wholeBuffer(blocks.slots),
                structureBlocks: packPositions(structureBlocks).buffer
            };
            transferList.push(packed.structureBlocks);
            return packed;
        }

        const palette: RegionBlock[] = [];
        const slotOf = new Map<RegionBlock, number>();
        const slots = new Uint32Array(blocks.length);
        const writePositions = new Uint32Array(blocks.length);
        let index = 0;
        forEachBlockWrite(blocks, (x, y, z, block) => {
            if (Math.floor(x / 16) !== rest.chunkX || Math.floor(z / 16) !== rest.chunkZ || !isPackableY(y)) {
                throw new PrismarineGenerationErrors.PackedWriteOutsideChunk({ x, y, z });
            }
            let slot = slotOf.get(block);
            if (slot === undefined) {
                slot = palette.push(block) - 1;
                slotOf.set(block, slot);
            }
            slots[index] = slot;
            writePositions[index] = packWritePosition(x, y, z);
            index++;
        });
        // A pass places a few dozen distinct blocks, so a slot nearly always fits in 16 bits.
        const writeBlocks = palette.length <= 0x10000 ? Uint16Array.from(slots) : slots;

        const packed = {
            ...rest,
            palette,
            writePositions: writePositions.buffer,
            writeBlocks: writeBlocks.buffer,
            structureBlocks: packPositions(structureBlocks).buffer
        };
        transferList.push(packed.writePositions, packed.writeBlocks, packed.structureBlocks);
        return packed;
    });
    return { payload, transferList };
};

/** Whether a value that crossed a thread or process boundary is one packed patch. */
export const isPackedPatch = (patch: unknown): patch is PackedRegionChunkPatch =>
    isRecord(patch) &&
    typeof patch.chunkX === 'number' &&
    typeof patch.chunkZ === 'number' &&
    Array.isArray(patch.palette) &&
    patch.writePositions instanceof ArrayBuffer &&
    patch.writeBlocks instanceof ArrayBuffer &&
    patch.structureBlocks instanceof ArrayBuffer &&
    (patch.writePositions.byteLength === patch.writeBlocks.byteLength * 2 ||
        patch.writePositions.byteLength === patch.writeBlocks.byteLength) &&
    patch.writePositions.byteLength % 4 === 0 &&
    Array.isArray(patch.blockEntityRemovals) &&
    Array.isArray(patch.blockEntities) &&
    Array.isArray(patch.entitySpawns) &&
    isOptionalFluidTickList(patch.fluidTicks);

/**
 * Rebuilds the patches a feature worker packed, keeping their block writes packed.
 * @param value - The worker's payload, which crossed a boundary the compiler cannot follow.
 * @throws TypeError when the payload is not a packed patch list, or a write names a block the
 *   palette does not hold.
 */
export const unpackFeaturePatches = (value: unknown): RegionChunkPatch[] => {
    if (!Array.isArray(value) || !value.every(isPackedPatch)) {
        throw new PrismarineGenerationErrors.InvalidFeaturePatchList();
    }

    // Kept packed: the region applies them as they are, so no write becomes an object of its own.
    return value.map(({ palette, writePositions, writeBlocks, structureBlocks, ...rest }) => ({
        ...rest,
        blocks: new PackedBlockWrites(
            palette,
            rest.chunkX,
            rest.chunkZ,
            new Uint32Array(writePositions),
            // Equal byte lengths mean 32-bit slots; see `PackedRegionChunkPatch.writeBlocks`.
            writeBlocks.byteLength === writePositions.byteLength
                ? new Uint32Array(writeBlocks)
                : new Uint16Array(writeBlocks)
        ),
        structureBlocks: unpackPositions(structureBlocks)
    }));
};
