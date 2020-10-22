const SubChunk = require('./sub-chunk');
const EmptySubChunk = require('./empty-sub-chunk');
const BinaryStream = require('@jsprismarine/jsbinaryutils').default;
const Entity = require('../../entity/entity');
const Player = require('../../player').default;


const MaxSubChunks = 16;
class Chunk {

    /** @type {number} */
    #x;
    /** @type {number} */
    #z;

    /** @type {boolean} */
    #hasChanged = false;

    /** @type {number} */
    #height = MaxSubChunks;

    /**
     * @type {Map<number, SubChunk>}
     */
    #subChunks = new Map();

    /** @type {number[]} */
    #biomes = [];

    // TODO: #tiles = []
    /** @type {Set<Entity>} */
    #entities = new Set();

    #heightMap = [];

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
    constructor(chunkX, chunkZ, subChunks = new Map(), entities = [], tiles = [], biomes = [], heightMap = []) {
        this.#x = chunkX;
        this.#z = chunkZ;

        for (let y = 0; y < this.#height; y++) {
            this.#subChunks.set(y, subChunks.has(y) ? subChunks.get(y) : new EmptySubChunk());
        }

        if (heightMap.length === 256) {
            this.#height = heightMap;
        } else {
            if (heightMap.length !== 0) throw new Error(`Wrong HrightMap value count, expected 256, got ${heightMap.length}`);
            this.#heightMap = new Array(256).fill(this.height * 16);
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

    static getIdIndex(x, y, z) {
        return (x << 12) | (z << 8) | y;
    }

    static getBiomeIndex(x, z) {
        return (z % 16) | x;
    }

    static getHeightMapIndex(x, z) {
        return (z % 16) | x;
    }

    setBiomeId(x, z, biomeId) {
        this.#hasChanged = true;
        this.#biomes[Chunk.getBiomeIndex(x, z)] = biomeId & 0xff;
    }

    getBlockId(x, y, z, id) {
        return this.getSubChunk(y >> 4, true).getBlockId(Math.abs(x), y & 0x0f, Math.abs(z), id);
    }
    setBlockId(x, y, z, id) {
        if (this.getSubChunk(y >> 4, true).setBlockId(Math.abs(x), y & 0x0f, Math.abs(x), id)) {
            this.#hasChanged = true;
        }
    }

    setBlock(x, y, z, block) {
        if (this.getSubChunk(y >> 4, true).setBlockId(Math.abs(x), y & 0x0f, Math.abs(x), block.id)) {
            this.#hasChanged = true;
        }
    }

    getSubChunk(y, generateNew = false) {
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

    setHeightMap(x, z, value) {
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

    getHighestBlock(x, z) {
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
    addEntity(entity) {
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

}
module.exports = Chunk;
