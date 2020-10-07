'use strict'
const Noise = require('simplex-noise')
const Chunk = require('../chunk/chunk')

class Overworld {
    getChunk({ chunkX, chunkY = 0, chunkZ, seed }) {
        const noise = new Noise(seed)
        const chunk = new Chunk(chunkX, chunkZ)

        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                const height = parseInt(`${noise.noise2D(chunkX + x, chunkZ + z) * 10}`)
                for (let y = 0; y <= height; y++) {
                    if (y === height)
                        chunk.setBlockId(x, y, z, 2)
                    else
                        chunk.setBlockId(x, y, z, 3)
                }
            }
        }

        return chunk
    }
}
module.exports = Overworld
