import BinaryStream from '@jsprismarine/jsbinaryutils';
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
        return this.storages.size === 0;
    }

    private getStorage(index: number): BlockStorage {
        if (!this.storages.has(index)) {
            // Create all missing storage layers
            for (let i = 0; i <= index; i++) {
                if (!this.storages.has(i)) {
                    this.storages.set(i, new BlockStorage());
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
    public getBlockId(
        bx: number,
        by: number,
        bz: number,
        layer: number
    ): number {
        return this.getStorage(layer).getBlockId(bx, by & 0xf, bz);
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
    public setBlock(
        bx: number,
        by: number,
        bz: number,
        runtimeId: number,
        layer: number
    ): void {
        this.getStorage(layer).setBlock(bx, by & 0xf, bz, runtimeId);
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
}
