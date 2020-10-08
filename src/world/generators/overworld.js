'use strict';
const Noise = require('simplex-noise');
const Chunk = require('../chunk/chunk');

const CHUNK_WIDTH = 16;
const CHUNK_HEIGHT = 256; // 1.17: 16?
const CHUNK_LENGTH = 16;

class Overworld {
    getChunk({ chunkX, chunkY = 0, chunkZ, seed }) {
        const noise = new Noise(seed);
        const chunk = new Chunk(chunkX, chunkZ);

        for (let x = 0; x < CHUNK_WIDTH; x++) {
            for (let z = 0; z < CHUNK_LENGTH; z++) {
                const noise_height = noise.noise2D((chunkX * CHUNK_WIDTH + x) * 0.005, (chunkZ * CHUNK_WIDTH + z) * 0.005)
                const height = 50 + (20 * noise_height)

                for (let y = 0; y < height; y++) {
                    if (y >= (height - 4))
                        chunk.setBlockId(x, y, z, 3); // Dirt
                    else
                        chunk.setBlockId(x, y, z, 1); // Stone
                }

                chunk.setBlockId(x, height, z, 2); // Grass
                chunk.setBlockId(x, 0, z, 7); // Bedrock
            }
        }

        return chunk;
    }
}
module.exports = Overworld;
