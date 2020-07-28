const SubChunk = require('./sub-chunk')
const EmptySubChunk = require('./empty-sub-chunk')
const BinaryStream = require('jsbinaryutils')

'use strict'

const MaxSubChunks = 16
class Chunk {

    /** @protected */
    _x
    /** @protected */
    _z

    /** @protected */
    _hasChanged = false

    /** @protected */
    _height = MaxSubChunks

    /**
     * @type {Map<number, SubChunk>}
     * @protected
     */
    _subChunks = new Map()

    /** @protected */
    _biomes = []

    /** @protected */
    _tiles = []
    /** @protected */
    _entities = []

    /** @protected */
    _heightMap = []

    constructor(chunkX, chunkZ, subChunks = new Map(), entities = new Map(), tiles = new Map(), biomes = [], heightMap = []) {
        this._x = chunkX
        this._z = chunkZ

        for (let y = 0; y < this._height; y++) {
            this._subChunks.set(y, subChunks.has(y) ? subChunks.get(y) : new EmptySubChunk())
        }

        if (heightMap.length === 256) {
            this._height = heightMap
        } else {
            if (heightMap.length !== 0) throw new Error(`Wrong HrightMap value count, expected 256, got ${heightMap.length}`)
            this._heightMap = new Array(256).fill(this._height * 16)
        }

        if (biomes.length === 256) {
            this._biomes = biomes
        } else {
            if (biomes.length !== 0) throw new Error(`Wrong Biomes value count, expected 256, got ${biomes.length}`)
            this._biomes = new Array(256).fill(0x00)
        }
    }

    getChunkX() {
        return this._x
    }

    getChunkZ() {
        return this._z
    }

    static getIdIndex(x, y, z) {
        return (x << 12) | (z << 8) | y
    }

    static getBiomeIndex(x, z) {
        return (z << 4) | x
    }

    static getHeightMapIndex(x, z) {
        return (z << 4) | x
    }

    setBiomeId(x, z, biomeId) {
        this._hasChanged = true
        this._biomes[Chunk.getBiomeIndex(x, z)] = biomeId & 0xff
    }

    setBlockId(x, y, z, id) {
        if (this.getSubChunk(y >> 4, true).setBlockId(x, y & 0x0f, z, id)) {
            this._hasChanged = true
        }
    }

    getSubChunk(y, generateNew = false) {
        if (y < 0 || y >= this._height) {
            return new EmptySubChunk()
        } else if (generateNew && this._subChunks.get(y) instanceof EmptySubChunk) {
            this._subChunks.set(y, new SubChunk())
        }

        return this._subChunks.get(y)
    }

    setHeightMap(x, z, value) {
        this._heightMap[Chunk.getHeightMapIndex(x, z)] = value
    }

    getHighestSubChunkIndex() {
        for (let y = this._subChunks.size - 1; y >= 0; --y) {
            if (this._subChunks.get(y) instanceof EmptySubChunk) {
                continue
            }
            return y
        }

        return -1
    }

    getHighestBlock(x, z) {
        let index = this.getHighestSubChunkIndex()
        if (index === -1) {
            return -1
        }

        for (let y = index; y >= 0; --y) {
            let height = this.getSubChunk(y).getHighestBlockAt(x, z) | (y << 4)
            if (height !== -1) {
                return height
            } 
        }

        return -1
    }

    getSubChunkSendCount() {
        return this.getHighestSubChunkIndex() + 1
    }

    recalculateHeightMap() {
        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                this.setHeightMap(x, z, this.getHighestBlock(x, z) + 1)
            }
        }
    }

    toBinary() {
        let stream = new BinaryStream()
        let subChunkCount = this.getSubChunkSendCount()
        for (let y = 0; y < subChunkCount; ++y) {
            stream.append(this._subChunks.get(y).toBinary())
        }
        for (let biome of this._biomes) {
            stream.writeByte(biome)
        }
        stream.writeByte(0)
        return stream.buffer
    }

}
module.exports = Chunk