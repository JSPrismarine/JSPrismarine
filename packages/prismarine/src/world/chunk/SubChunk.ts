import type BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import type { BlockState } from '../../block/state/BlockState';
import BlockStorage from './BlockStorage';

/**
 * 1 is the original single-layer form, 8 adds a layer count, 9 adds the sub chunk's own index.
 * The server writes 8 on the wire and 9 on disk, and reads all three from either.
 */
export type SubChunkVersion = 1 | 8 | 9;

/**
 * Narrows a version byte read from disk or the wire to the sub chunk formats this server reads.
 */
export const isSubChunkVersion = (version: number): version is SubChunkVersion =>
    version === 1 || version === 8 || version === 9;

export default class SubChunk {
    private storages: Map<number, BlockStorage> = new Map();

    /**
     * The version this sub chunk was read from, so writing it back does not silently upgrade it.
     * Defaults to what the disk format uses, since a freshly generated sub chunk has no source.
     */
    public sourceVersion: SubChunkVersion = 9;

    /**
     * Bumped on every write, so the owning chunk can tell whether its serialised copy is
     * still good.
     *
     * It only ever goes up, and only by one write at a time, which is what lets `Chunk` sum
     * these into a single number and trust that a change can never leave the sum where it
     * was.
     */
    private revision = 0;

    public constructor(storages: Map<number, BlockStorage> = new Map()) {
        this.storages = storages;
    }

    public getRevision(): number {
        return this.revision;
    }

    /**
     * Returns if the SubChunk is all air (basically empty).
     */
    public isEmpty(): boolean {
        for (const storage of this.storages.values()) {
            if (!storage.isEmpty()) return false;
        }
        return true;
    }

    private getStorage(index: number): BlockStorage {
        if (!this.storages.has(index)) {
            // Create all missing storage layers
            for (let i = 0; i <= index; i++) {
                if (!this.storages.has(i)) {
                    this.storages.set(i, new BlockStorage({}));
                }
            }
        }

        return this.storages.get(index)!;
    }

    public getStorages(): BlockStorage[] {
        return Array.from(this.storages.values());
    }

    /**
     * Returns the legacy block id in the given position.
     *
     * @param bx - block x
     * @param by - block y
     * @param bz - block z
     * @param layer - block storage layer
     */
    public getBlock(bx: Vector3 | number, by: number = 0, bz: number = 0, layer: number = 0): BlockState {
        if (bx instanceof Vector3) {
            return this.getBlock(bx.getX(), bx.getY(), bx.getZ(), layer);
        }

        return this.getStorage(layer).getBlock(bx, by, bz);
    }

    /**
     * Sets a block by runtime Id in the given storage layer.
     *
     * @param bx - block x
     * @param by - block y
     * @param bz - block z
     * @param runtimeId - block runtime Id
     * @param layer - block storage layer
     */
    public getBlockRuntimeId(bx: number, by: number, bz: number, layer = 0): number {
        return this.getStorage(layer).getRuntimeId(bx, by, bz);
    }

    public setBlock(bx: number, by: number, bz: number, runtimeId: number, layer: number): void {
        this.getStorage(layer).setBlock(bx, by, bz, runtimeId);
        this.revision++;
    }

    public networkSerialize(stream: BinaryStream): void {
        // SubChunk version
        stream.writeByte(8);
        // Layer count
        stream.writeByte(this.storages.size);
        for (const storage of this.storages.values()) {
            storage.networkSerialize(stream);
        }
    }

    public static networkDeserialize(stream: BinaryStream): SubChunk {
        const subChunk = new SubChunk();

        // The version byte was being skipped, so its value - 8 - was read as the layer count and
        // every deserialisation ran off the end of the stream.
        const version = stream.readByte();
        if (!isSubChunkVersion(version)) {
            throw new Error(`Unsupported sub chunk version ${version}`);
        }

        subChunk.sourceVersion = version;
        const layerCount = version === 1 ? 1 : stream.readByte();

        // Version 9 names its own sub chunk y as a signed byte after the layer count. A sender
        // writes the column in order from the floor, so the position already says which sub
        // chunk this is; the byte is consumed so the layers that follow are read from the right
        // place, which they were not before.
        if (version === 9) stream.readSignedByte();

        for (let i = 0; i < layerCount; i++) {
            subChunk.storages.set(i, BlockStorage.networkDeserialize(stream));
        }

        return subChunk;
    }
}
