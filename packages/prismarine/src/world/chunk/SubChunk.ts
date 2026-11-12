import type BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import type { BlockState } from '../../block/state/BlockState';
import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import BlockStorage from './BlockStorage';
import type { ReadonlyBlockStorage } from './BlockStorage';

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

/**
 * A sub chunk that can be read and not written, which is what a chunk hands out.
 *
 * A write goes through the chunk, which tells a save cut holding this sub chunk before the write
 * lands (ADR 0018). Its storages are read-only too, since a write to one is a write to the sub
 * chunk.
 */
export interface ReadonlySubChunk extends Pick<
    SubChunk,
    'getRevision' | 'isEmpty' | 'getBlock' | 'getBlockRuntimeId' | 'networkSerialize'
> {
    readonly sourceVersion: SubChunkVersion;
    getStorages(): readonly ReadonlyBlockStorage[];
}

export default class SubChunk implements ReadonlySubChunk {
    private storages: Array<BlockStorage | undefined> = [];
    private readonly storageOrder: number[] = [];

    /**
     * The version this sub chunk was read from, so writing it back does not silently upgrade it.
     * Defaults to what the disk format uses, since a freshly generated sub chunk has no source.
     */
    public sourceVersion: SubChunkVersion = 9;

    public constructor(storages: Map<number, BlockStorage> = new Map()) {
        for (const [index, storage] of storages) this.setStorage(index, storage);
    }

    public getRevision(): number {
        // Storage objects are exposed by getStorages(), so their own write revisions must
        // participate in the section revision used by serialization and random-tick caches.
        let revision = 0;
        for (const index of this.storageOrder) revision += this.storages[index]!.getRevision();
        return revision;
    }

    /**
     * Returns if the SubChunk is all air (basically empty).
     */
    public isEmpty(): boolean {
        for (const index of this.storageOrder) {
            const storage = this.storages[index]!;
            if (!storage.isEmpty()) return false;
        }
        return true;
    }

    private setStorage(index: number, storage: BlockStorage): void {
        if (this.storages[index] === undefined) this.storageOrder.push(index);
        this.storages[index] = storage;
        BlockStorage.writeEpoch++;
    }

    private getOrCreateStorage(index: number): BlockStorage {
        for (let i = 0; i <= index; i++) {
            if (this.storages[i] === undefined) this.setStorage(i, new BlockStorage({}));
        }

        return this.storages[index]!;
    }

    public getStorages(): BlockStorage[] {
        return this.storageOrder.map((index) => this.storages[index]!);
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

        const storage = this.storages[layer];
        if (storage) return storage.getBlock(bx, by, bz);

        // An absent layer is all air; allocating it on a read changes the serialized layer count.
        const air = BlockRuntimeIds.getState(BlockRuntimeIds.getByName('minecraft:air'));
        if (!air) throw new Error('The air block state is not registered');
        return air;
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
        return this.storages[layer]?.getRuntimeId(bx, by, bz) ?? BlockRuntimeIds.getByName('minecraft:air');
    }

    public setBlock(bx: number, by: number, bz: number, runtimeId: number, layer: number): void {
        this.getOrCreateStorage(layer).setBlock(bx, by, bz, runtimeId);
    }

    public networkSerialize(stream: BinaryStream): void {
        // SubChunk version
        stream.writeByte(8);
        // Layer count
        stream.writeByte(this.storageOrder.length);
        for (const index of this.storageOrder) this.storages[index]!.networkSerialize(stream);
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
            subChunk.setStorage(i, BlockStorage.networkDeserialize(stream));
        }

        return subChunk;
    }
}
