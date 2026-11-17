/**
 * The form a feature pass's patches take across a worker or process boundary.
 *
 * A pass writes several thousand blocks, and as `{ x, y, z, block }` records each one is an
 * object the structured clone has to walk and rebuild on the other side. Packed, the positions
 * and the block of each write are three typed arrays and a palette of the distinct blocks, so
 * the receiving thread copies buffers instead of decoding thousands of objects.
 */
import { isRecord } from '../../../utils/isRecord';
import type { RegionBlock, RegionBlockPosition, RegionChunkPatch } from './GenerationRegion';
import { forEachBlockWrite, isOptionalFluidTickList, PackedBlockWrites } from './GenerationRegion';
import { PrismarineGenerationErrors } from '@jsprismarine/errors/prismarine/generation';

/** One chunk's patch, packed. */
export interface PackedRegionChunkPatch extends Omit<RegionChunkPatch, 'blocks' | 'structureBlocks'> {
    /** The distinct blocks the writes place, by identity. */
    readonly palette: readonly RegionBlock[];
    /** `Int32Array` of x, y and z for each write, in write order. */
    readonly writePositions: ArrayBuffer;
    /** `Uint32Array` of each write's slot in {@link palette}. */
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
const wholeBuffer = (array: Int32Array | Uint32Array): ArrayBuffer =>
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
        const writeBlocks = new Uint32Array(blocks.length);
        const writePositions = new Int32Array(blocks.length * 3);
        let index = 0;
        forEachBlockWrite(blocks, (x, y, z, block) => {
            let slot = slotOf.get(block);
            if (slot === undefined) {
                slot = palette.push(block) - 1;
                slotOf.set(block, slot);
            }
            writeBlocks[index] = slot;
            writePositions[index * 3] = x;
            writePositions[index * 3 + 1] = y;
            writePositions[index * 3 + 2] = z;
            index++;
        });

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
    patch.writePositions.byteLength === patch.writeBlocks.byteLength * 3 &&
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
        blocks: new PackedBlockWrites(palette, new Int32Array(writePositions), new Uint32Array(writeBlocks)),
        structureBlocks: unpackPositions(structureBlocks)
    }));
};
