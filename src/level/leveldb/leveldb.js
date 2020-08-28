const path = require('path')
const level = require('level')

const Provider = require('../provider')
const BinaryStream = require('jsbinaryutils')
const Chunk = require('../chunk/chunk')
const Experimental = require('../experimental/experimental')
const EmptySubChunk = require('../chunk/empty-sub-chunk')
const SubChunk = require('../chunk/sub-chunk')
const logger = require('../../utils/logger')
const { type } = require('os')

'use strict'

const Tags = {
    Version: 'v',
    SubChunkPrefix: '\x2f'
}
class LevelDB extends Provider{

    /** @type {level} */
    db

    constructor(levelPath) {
        super(levelPath)
        this.db = new level(path.join(levelPath, 'db'))

        // this.readChunk(0, 0)
    }

    async readChunk(chunkX, chunkZ) {
        let index = LevelDB.chunkIndex(chunkX, chunkZ)

        let stream = new BinaryStream()
        let subChunks = new Map()
        let heightMap = []
        let biomes = []

        let promise = new Promise((resolve, reject) => {
            this.db.get(index + Tags.Version, function(error, result) {
                if (error) {
                    console.log('generating new')
                    let chunk = new Chunk(chunkX, chunkZ)
                    for (let x = 0; x < 16; x++) {
                        for (let z = 0; z < 16; z++) {
                            let y = 0
                            chunk.setBlockId(x, y++, z, 7)
                            chunk.setBlockId(x, y++, z, 3)
                            chunk.setBlockId(x, y++, z, 3)
                            chunk.setBlockId(x, y, z, 2) 
                
                            // TODO: block light
                        }
                    }
                    chunk.recalculateHeightMap()
                    this.writeChunk(chunk)
                    return chunk
                }
                switch(Number(result)) {
                    case 7:
                    case 4:
                    case 3:
                        for (let y = 0; y < 16; y++) {
                            this.db.get(index + Tags.SubChunkPrefix + y, function(_, result) {    
                                // We don't care about errors 
                                if (typeof result === 'undefined') return
    
                                stream.buffer = Buffer.from(result)
                                let subChunkVersion = stream.readByte()
                                switch(subChunkVersion) {
                                    case 0:
                                        let blocks = stream.read(4096)
                                        let blockData = stream.read(2048)
                                        if (result < 4) {
                                            // Sky light
                                        }
    
                                        let subChunk = new SubChunk()
                                        subChunk.ids = blocks
                                        subChunk.metadata = blockData
    
                                        subChunks.set(y, subChunk)
                                        resolve(subChunks)  // Temporal solution
                                        break
                                    default:
                                        logger.error('SubChunk version not supported yet!')
                                }
                            })
                            this.db.get(index + '\x2d', function(error, result) {
                                if (error) console.log(error)
                                stream.buffer = result
                                heightMap = [...stream.read(256)]
                                biomes = [...stream.read(256)]
                            })
                        }
                        break  
                    default:
                        logger.error('Chunk version not supported yet!')     
                }
            }.bind(this)) 
        })

        let chunk = new Chunk(
            chunkX,
            chunkZ,
            await promise
        )
        chunk.recalculateHeightMap()

        return chunk 
    }

    /**
     * @param {Chunk} chunk 
     */
    writeChunk(chunk) {
        let index = LevelDB.chunkIndex(chunk.getChunkX(), chunk.getChunkZ())

        this.db.put(index + Tags.Version, 7)  // current level chunk version

        let subChunks = chunk.getSubChunks()
        for (let [y, subChunk] of subChunks) {
            let key = index + Tags.SubChunkPrefix + y
            if (subChunk instanceof EmptySubChunk) {
                this.db.del(key, function(err) {
                    if (err) console.log(err)
                })
            } else {
                this.db.put(key, Buffer.from([0, ...subChunk.ids, ...subChunk.metadata]), function(err) {
                    if (err) console.log(err)
                })
            }

            // tag data 2d
            this.db.put(index + '\x2d', Buffer.from([...chunk.heightMap, chunk.biomes]), function(err) {
                if (err) console.log(err)
            })
            // tag state finalisation
            this.db.put(index + '6', Buffer.from([2]), function(err) {
                if (err) console.log(err)
            }) 

            // TODO: entities and stuff
        } 
    }

    static chunkIndex(chunkX, chunkZ) {
        let stream = new BinaryStream()
        stream.writeLInt(chunkX)
        stream.writeLInt(chunkZ)
        return stream.buffer.toString('hex')
    }

}
module.exports = LevelDB