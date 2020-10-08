const Noise = require('../synth/Noise');
const Chunk = require('../chunk/chunk');

const CHUNK_WIDTH = 16;
const CHUNK_HEIGHT = 256; // 1.17: 16?
const CHUNK_LENGTH = 16;
const SEA_LEVEL = 63;

module.exports = class Overworld {
    noise;
    
    async getChunk({ chunkX, chunkY = 0, chunkZ, seed }) {
        if (!this.noise) this.noise = new Noise(seed);

        const noise = this.noise;
        const chunk = new Chunk(chunkX, chunkZ);

        for (let x = 0; x < CHUNK_WIDTH; x++) {
            for (let z = 0; z < CHUNK_LENGTH; z++) {
                //const noise_height = noise.noise2D((chunkX * CHUNK_WIDTH + x) * 0.005, (chunkZ * CHUNK_WIDTH + z) * 0.005);
                const noise_height = noise.perlin2((chunkX * CHUNK_WIDTH + x) * 0.04, (chunkZ * CHUNK_WIDTH + z) * 0.04);
                const height = Math.floor(60 + (20 * noise_height));
                
                for (let y = 0; y < height; y++) {
                    if (y >= (height - 4))
                        chunk.setBlockId(x, y, z, 3); // Dirt
                    else
                        chunk.setBlockId(x, y, z, 1); // Stone
                }

                for (let y = 0; y < SEA_LEVEL; y++) {
                    const subChunk = chunk.getSubChunk(y >> 4, false);
                    if (subChunk.getBlockId(x, y & 0x0f, z) == 0) {
                        subChunk.setBlockId(x, y & 0x0f, z, 9); // Stationary Water
                    }
                }

                chunk.setBlockId(x, height, z, 2); // Grass
                chunk.setBlockId(x, 0, z, 7); // Bedrock
            }
        }

        chunk.recalculateHeightMap();

        return chunk;
    }
};