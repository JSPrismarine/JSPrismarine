import type Block from '../../block/Block';
import EmptySubChunk from './EmptySubChunk';
import SubChunk from './SubChunk';

const BinaryStream = require('@jsprismarine/jsbinaryutils').default;

const MaxSubChunks = 16;
export default class Chunk {
    /** @type {number} */
    #x = 0;
    /** @type {number} */
    #z = 0;

    /** @type {boolean} */
    #hasChanged = false;

    /** @type {number} */
    #height: number = MaxSubChunks;

    /**
     * @type {Map<number, SubChunk>}
     */
    #subChunks = new Map();

    /** @type {number[]} */
    #biomes: any = [];

    // TODO: #tiles = []
    /** @type {Set<Entity>} */
    #entities: any = new Set();

    #heightMap: any = [];

    /**
     * Chunk constructor.
     *
     * @param {number} chunkX
     * @param {number} chunkZ
     * @param {Map<Number, SubChunk>} subChunks
     * @param {Entity[]} entities
     * @param {undefined[]} tiles
     * @param {number[]} biomes
     * @param {number[]} heightMap
     */
    public constructor(
        chunkX: number,
        chunkZ: number,
        subChunks = new Map(),
        entities: any[] = [],
        tiles: any[] = [],
        biomes: number[] = [],
        heightMap: number[] = []
    ) {
        this.#x = chunkX;
        this.#z = chunkZ;

        for (let y = 0; y < this.#height; y++) {
            this.#subChunks.set(
                y,
                subChunks.has(y) ? subChunks.get(y) : new EmptySubChunk()
            );
        }

        if (heightMap.length === 256) {
            this.#heightMap = heightMap;
        } else {
            if (heightMap.length !== 0)
                throw new Error(
                    `Wrong HeightMap value count, expected 256, got ${heightMap.length}`
                );
            this.#heightMap = new Array(256).fill(this.#height * 16);
        }

        if (biomes.length === 256) {
            this.#biomes = biomes;
        } else {
            if (biomes.length !== 0)
                throw new Error(
                    `Wrong Biomes value count, expected 256, got ${biomes.length}`
                );
            this.#biomes = new Array(256).fill(0x00);
        }
    }

    public getX() {
        return this.#x;
    }

    public getZ() {
        return this.#z;
    }

    public static getIdIndex(x: number, y: number, z: number) {
        return (x << 12) | (z << 8) | y;
    }

    public static getBiomeIndex(x: number, z: number) {
        return z % 16 | x;
    }

    public static getHeightMapIndex(x: number, z: number) {
        return z % 16 | x;
    }

    public setBiomeId(x: number, z: number, biomeId: any) {
        this.#biomes[Chunk.getBiomeIndex(x, z)] = biomeId & 0xff;
        this.#hasChanged = true;
    }

    public getFullBlock(x: number, y: number, z: number) {
        if (y < 0) throw new Error(`y can't be less than 0`);

        return this.getSubChunk(y >> 4, true).getFullBlock(x, y & 0x0f, z);
    }

    public getBlockId(x: number, y: number, z: number) {
        if (y < 0) throw new Error(`y can't be less than 0`);

        return this.getSubChunk(y >> 4, true).getBlockId(x, y & 0x0f, z);
    }

    public getBlockMetadata(x: number, y: number, z: number) {
        if (y < 0) throw new Error(`y can't be less than 0`);

        return this.getSubChunk(y >> 4, true).getBlockMetadata(x, y & 0x0f, z);
    }

    public setBlockId(x: number, y: number, z: number, id: number) {
        if (y < 0) throw new Error(`y can't be less than 0`);

        this.getSubChunk(y >> 4, true).setBlockId(x, y & 0x0f, z, id);
        this.#hasChanged = true;
    }

    public setBlock(x: number, y: number, z: number, block: Block | null) {
        if (y < 0) throw new Error(`y can't be less than 0`);
        if (!block) throw new Error(`block can't be undefined or null`);

        this.getSubChunk(y >> 4, true).setBlock(x, y & 0x0f, z, block);
        this.#hasChanged = true;
    }

    public getSubChunk(y: number, generateNew = false) {
        if (y < 0 ?? y >= this.#height) return new EmptySubChunk();

        if (generateNew && this.#subChunks.get(y) instanceof EmptySubChunk)
            this.#subChunks.set(y, new SubChunk());

        return this.#subChunks.get(y);
    }

    public getSubChunks() {
        return this.#subChunks;
    }

    public setHeightMap(x: number, z: number, value: number) {
        this.#heightMap[Chunk.getHeightMapIndex(x, z)] = value;
    }

    public getHighestSubChunkIndex() {
        for (let y = this.#subChunks.size - 1; y >= 0; --y) {
            if (this.#subChunks.get(y) instanceof EmptySubChunk) {
                continue;
            }
            return y;
        }

        return -1;
    }

    public getHighestBlock(x: number, z: number) {
        const index = this.getHighestSubChunkIndex();
        if (index === -1) {
            return -1;
        }

        for (let y = index; y >= 0; --y) {
            const height =
                this.getSubChunk(y).getHighestBlockAt(x, z) | (y << 4);
            if (height !== -1) {
                return height;
            }
        }

        return -1;
    }

    public getSubChunkSendCount() {
        return this.getHighestSubChunkIndex() + 1;
    }

    public recalculateHeightMap() {
        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                this.setHeightMap(x, z, this.getHighestBlock(x, z) + 1);
            }
        }
    }

    /**
     * Returns true if the chunk has been modified.
     */
    public hasChanged(): boolean {
        return this.#hasChanged;
    }

    public setChanged(bool = true) {
        this.#hasChanged = bool;
    }

    /**
     * Adds an entity into the chunk
     *
     * @param {Entity} entity
     */
    public addEntity(entity: any) {
        this.#entities.push(entity);
    }

    public getHeightMap() {
        return this.#heightMap;
    }

    public getBiomes() {
        return this.#biomes;
    }

    public toBinary() {
        const stream = new BinaryStream();
        const subChunkCount = this.getSubChunkSendCount();
        for (let y = 0; y < subChunkCount; ++y) {
            stream.append(this.#subChunks.get(y).toBinary());
        }
        for (const biome of this.#biomes) {
            stream.writeByte(biome);
        }
        stream.writeByte(0);
        return stream.buffer;
    }
}
