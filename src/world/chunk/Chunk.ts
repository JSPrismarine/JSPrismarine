import type Block from "../../block/Block";
import SubChunk from "./SubChunk";

const EmptySubChunk = require('./empty-sub-chunk');
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
    constructor(chunkX: number, chunkZ: number, subChunks = new Map(), entities = [], tiles = [], biomes = [], heightMap = []) {
        this.#x = chunkX;
        this.#z = chunkZ;

        for (let y = 0; y < this.#height; y++) {
            this.#subChunks.set(y, subChunks.has(y) ? subChunks.get(y) : new EmptySubChunk());
        }

        if (heightMap.length === 256) {
            this.#heightMap = heightMap;
        } else {
            if (heightMap.length !== 0) throw new Error(`Wrong HrightMap value count, expected 256, got ${heightMap.length}`);
            this.#heightMap = new Array(256).fill(this.#height * 16);
        }

        if (biomes.length === 256) {
            this.#biomes = biomes;
        } else {
            if (biomes.length !== 0) throw new Error(`Wrong Biomes value count, expected 256, got ${biomes.length}`);
            this.#biomes = new Array(256).fill(0x00);
        }
    }

    getX() {
        return this.#x;
    }

    getZ() {
        return this.#z;
    }

    static getIdIndex(x: number, y: number, z: number) {
        return (x << 12) | (z << 8) | y;
    }

    static getBiomeIndex(x: number, z: number) {
        return (z % 16) | x;
    }

    static getHeightMapIndex(x: number, z: number) {
        return (z % 16) | x;
    }

    setBiomeId(x: number, z: number, biomeId: any) {
        this.#biomes[Chunk.getBiomeIndex(x, z)] = biomeId & 0xff;
        this.#hasChanged = true;
    }

    getBlockId(x: number, y: number, z: number) {
        return this.getSubChunk(y >> 4, true).getBlockId(x, y & 0x0f, z);
    }
    getBlockMetadata(x: number, y: number, z: number) {
        return this.getSubChunk(y >> 4, true).getBlockMetadata(x, y & 0x0f, z);
    }
    setBlockId(x: number, y: number, z: number, id: number) {
        this.getSubChunk(y >> 4, true).setBlockId(x, y & 0x0f, z, id);
        this.#hasChanged = true;
    }

    setBlock(x: number, y: number, z: number, block: Block | null) {
        if (!block)
            return;

        this.getSubChunk(y >> 4, true).setBlock(x, y & 0x0f, z, block);
        this.#hasChanged = true;
    }

    getSubChunk(y: number, generateNew = false) {
        if (y < 0 || y >= this.#height) {
            return new EmptySubChunk();
        } else if (generateNew && this.#subChunks.get(y) instanceof EmptySubChunk) {
            this.#subChunks.set(y, new SubChunk());
        }

        return this.#subChunks.get(y);
    }

    getSubChunks() {
        return this.#subChunks;
    }

    setHeightMap(x: number, z: number, value: number) {
        this.#heightMap[Chunk.getHeightMapIndex(x, z)] = value;
    }

    getHighestSubChunkIndex() {
        for (let y = this.#subChunks.size - 1; y >= 0; --y) {
            if (this.#subChunks.get(y) instanceof EmptySubChunk) {
                continue;
            }
            return y;
        }

        return -1;
    }

    getHighestBlock(x: number, z: number) {
        let index = this.getHighestSubChunkIndex();
        if (index === -1) {
            return -1;
        }

        for (let y = index; y >= 0; --y) {
            let height = this.getSubChunk(y).getHighestBlockAt(x, z) | (y << 4);
            if (height !== -1) {
                return height;
            }
        }

        return -1;
    }

    getSubChunkSendCount() {
        return this.getHighestSubChunkIndex() + 1;
    }

    recalculateHeightMap() {
        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                this.setHeightMap(x, z, this.getHighestBlock(x, z) + 1);
            }
        }
    }

    /**
     * Returns true if the chunk has been modified.
     * 
     * @returns {boolean}
     */
    hasChanged() {
        return this.#hasChanged;
    }

    setChanged(bool = true) {
        this.#hasChanged = bool;
    }

    /**
     * Adds an entity into the chunk
     * 
     * @param {Entity} entity 
     */
    addEntity(entity: any) {
        this.#entities.push(entity);
    }

    getHeightMap() {
        return this.#heightMap;
    }

    getBiomes() {
        return this.#biomes;
    }

    toBinary() {
        let stream = new BinaryStream();
        let subChunkCount = this.getSubChunkSendCount();
        for (let y = 0; y < subChunkCount; ++y) {
            stream.append(this.#subChunks.get(y).toBinary());
        }
        for (let biome of this.#biomes) {
            stream.writeByte(biome);
        }
        stream.writeByte(0);
        return stream.buffer;
    }
};
