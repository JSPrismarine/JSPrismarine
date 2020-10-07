'use strict'
const Chunk = require('../chunk/chunk')

class Flat {
    getChunk({ chunkX, chunkY, chunkZ, seed }) {
        const chunk = new Chunk(chunkX, chunkZ)

        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                let y = 0
                chunk.setBlockId(x, y++, z, 7)
                chunk.setBlockId(x, y++, z, 3)
                chunk.setBlockId(x, y++, z, 3)
                chunk.setBlockId(x, y, z, 2)
            }
        }

        return chunk
    }
}
module.exports = Flat
