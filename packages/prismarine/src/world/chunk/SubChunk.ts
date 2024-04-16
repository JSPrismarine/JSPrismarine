import type BinaryStream from '@jsprismarine/jsbinaryutils';
import type { LegacyId } from '../../block/BlockMappings';
import { Vector3 } from '../../math';
import BlockStorage from './BlockStorage';

export default class SubChunk {
    private storages: Map<number, BlockStorage> = new Map();

    public constructor(storages: Map<number, BlockStorage> = new Map()) {
        this.storages = storages;
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
    public getBlock(bx: Vector3 | number, by: number = 0, bz: number = 0, layer: number = 0): LegacyId {
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
    public setBlock(bx: number, by: number, bz: number, runtimeId: number, layer: number): void {
        this.getStorage(layer).setBlock(bx, by, bz, runtimeId);
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

        // const version = stream.readByte();
        const layerCount = stream.readByte();

        for (let i = 0; i < layerCount; i++) {
            subChunk.storages.set(i, BlockStorage.networkDeserialize(stream));
        }

        return subChunk;
    }
}
