import BinaryStream from '@jsprismarine/jsbinaryutils';
import BlockStorage from './BlockStorage';

export default class SubChunk {
    private storages: Map<number, BlockStorage> = new Map();
    private blockLight: Buffer;
    private skyLight: Buffer;

    public constructor(
        storages: Map<number, BlockStorage> = new Map(),
        blockLight?: Buffer,
        skyLight?: Buffer
    ) {
        // Restore storages if they exists
        if (storages.has(0)) {
            this.storages.set(0, storages.get(0) as BlockStorage);
        } // Terrain storage
        // TODO: if (storages[1]) this.storages[1] = storages[1];  // Water storage

        // Restore block and sky lighting
        this.blockLight = blockLight ?? Buffer.alloc(2048).fill(0);
        this.skyLight = skyLight ?? Buffer.alloc(2048).fill(0);
    }

    public getBlockLight(): Buffer {
        return this.blockLight;
    }

    public getSkyLight(): Buffer {
        return this.skyLight;
    }

    public isEmpty(): boolean {
        return this.storages.size === 0;
    }

    public getStorage(index: number): BlockStorage {
        if (!this.storages.has(index)) {
            // Create all missing storage layers
            for (let i = 0; i <= index; i++) {
                if (!this.storages.has(i)) {
                    this.storages.set(i, new BlockStorage());
                }
            }
        }

        return this.storages.get(index) as BlockStorage;
    }

    public getStorages(): BlockStorage[] {
        return Array.from(this.storages.values());
    }

    public networkSerialize(): Buffer {
        const stream = new BinaryStream();
        // SubChunk version
        stream.writeByte(8);
        // Layer count
        stream.writeByte(this.storages.size);
        for (const storage of this.storages.values()) {
            stream.append(storage.networkSerialize());
        }
        return stream.getBuffer();
    }
}
