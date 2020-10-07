const path = require('path')
const level = require('level')

const Provider = require('../provider')
const BinaryStream = require('@jsprismarine/jsbinaryutils')
const Chunk = require('../chunk/chunk')
const Experimental = require('../experimental/experimental')
const EmptySubChunk = require('../chunk/empty-sub-chunk')
const SubChunk = require('../chunk/sub-chunk')
const logger = require('../../utils/logger')
const { type } = require('os')

const Overworld = require('../generators/overworld')

'use strict'

const Tags = {
    Version: 'v',
    SubChunkPrefix: '\x2f'
}
class LevelDB extends Provider {

    /** @type {level} */
    db

    constructor(levelPath) {
        super(levelPath)
        this.db = new level(path.join(levelPath, 'db'))
    }

    /**
     * Decodes a serialized chunk from 
     * the database asynchronously.
     * 
     * @param {number} x - chunk X 
     * @param {number} z - chunk Z
     */
    async readChunk(x, z) {
        let index = LevelDB.chunkIndex(x, z)
        let subChunks = new Map()

        // Check if the chunks exists
        try {
            // Chunk exists
            let version = await this.db.get(index + Tags.Version)
            // Needed for future versions
            if (Number(version) === 7) {
                // Read all sub chunks
                for (let y = 0; y < 16; y++) {
                    try {
                        let subChunkBuffer = await this.db.get(index + Tags.SubChunkPrefix + y)
                        let stream = new BinaryStream(Buffer.from(subChunkBuffer))
                        let subChunkVersion = stream.readByte()
                        if (subChunkVersion == 0) {
                            let blocks = stream.read(4096)
                            let blockData = stream.read(2048)

                            let subChunk = new SubChunk()
                            subChunk.ids = blocks
                            subChunk.metadata = blockData

                            subChunks.set(y, subChunk)
                        } else {
                            logger.warn('Unsupported sub chunk version')
                        }
                    } catch {
                        // NO-OP
                    }
                }
                await this.db.get(index + '\x2d')
                return new Chunk(x, z, subChunks)
            }
        } catch {
            // Chunk doesn't exist
            await this.db.put(index + Tags.Version, 7)

            // TODO: get generator from GeneratorManager
            const generator = new Overworld()

            const chunk = await generator.getChunk({
                chunkX: x,
                chunkZ: z
            })

            // Put all sub chunks
            for (let [y, subChunk] of chunk.getSubChunks()) {
                if (subChunk instanceof EmptySubChunk) continue
                let key = index + Tags.SubChunkPrefix + y
                let buffer = Buffer.from([0, ...subChunk.ids, ...subChunk.metadata])
                await this.db.put(key, buffer)
            }
            // Put data 2D
            let data = Buffer.from([...chunk.getHeightMap(), chunk.getBiomes()])
            await this.db.put(index + '\x2d', data)
            return chunk
        }

        return null
    }

    /**
     * Serialize a chunk into the database asynchronously.
     * 
     * @param {Chunk} chunk 
     */
    async writeChunk(chunk) {
        let index = LevelDB.chunkIndex(chunk.getX(), chunk.getZ())
        await this.db.put(index + Tags.Version, 7)
        // Put all sub chunks
        for (let [y, subChunk] of chunk.getSubChunks()) {
            if (subChunk instanceof EmptySubChunk) continue
            let key = index + Tags.SubChunkPrefix + y
            let buffer = Buffer.from([0, ...subChunk.ids, ...subChunk.metadata])
            await this.db.put(key, buffer)
        }
        // Put data 2D
        let data = Buffer.from([...chunk.getHeightMap(), chunk.getBiomes()])
        await this.db.put(index + '\x2d', data)
    }

    /**
     * Creates an string index from chunk 
     * x and z, used to indentify chunks 
     * in the db.
     * 
     * @param {number} chunkX 
     * @param {number} chunkZ 
     */
    static chunkIndex(chunkX, chunkZ) {
        let stream = new BinaryStream()
        stream.writeLInt(chunkX)
        stream.writeLInt(chunkZ)
        return stream.buffer.toString('hex')
    }

}
module.exports = LevelDB
