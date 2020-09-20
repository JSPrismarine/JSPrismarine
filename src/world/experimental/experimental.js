const fs = require('fs')
const path = require('path')

const Provider = require('../provider')
const Chunk = require('../chunk/chunk')
const BinaryStream = require('jsbinaryutils')
const SubChunk = require('../chunk/sub-chunk')

'use strict'

class Experimental extends Provider {

    readChunk(x, z) {
        let filesPath = path.join(this.path, 'chunks')
        if (!(fs.existsSync(filesPath))) {
            fs.mkdirSync(filesPath)
        }

        let filePath = path.join(filesPath, `${x}.${z}.bin`)
        if (!(fs.existsSync(filePath))) {
            // Flat world
            let chunk = new Chunk(x, z)
            for (let x = 0; x < 16; x++) {
                for (let z = 0; z < 16; z++) {
                    let y = 0
                    chunk.setBlockId(x, y++, z, 7)  
                    chunk.setBlockId(x, y++, z, 3)
                    chunk.setBlockId(x, y++, z, 3)
                    chunk.setBlockId(x, y, z, 2) 
                }
            }

            let stream = new BinaryStream()
            stream.writeByte(chunk.getSubChunkSendCount())
            stream.append(chunk.toBinary())

            fs.writeFileSync(filePath, stream.buffer)
            return chunk
        } else {
            let stream = new BinaryStream(fs.readFileSync(filePath))
            let subChunks = new Map()
            for (let i = 0; i < stream.readByte(); i++) {
                // each sub chunk is 6145 bytes
                let subChunk = new SubChunk()
                stream.read(1)
                subChunk.ids = stream.read(16 * 16 * 16)
                subChunk.metadata = stream.read((16 * 16 * 16) / 2)
                subChunks.set(i, subChunk)
            }
            let chunk = new Chunk(x, z, subChunks)
            return chunk
            // We don't care about biomes for now
        }
    }

    writeChunk(x, z, buffer) {
        let filesPath = path.join(this.path, 'chunks')
        if (!(fs.existsSync(filesPath))) {
            fs.mkdirSync(filesPath)
        }

        let filePath = path.join(filesPath, `${x}-${z}.bin`)
        return fs.writeFileSync(filePath, buffer)
    }

}
module.exports = Experimental