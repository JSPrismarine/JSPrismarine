const Chunk = require('../chunk/Chunk').default;

class Debug {
    getChunk({ chunkX, chunkY, chunkZ, seed }) {
        const chunk = new Chunk(chunkX, chunkZ);

        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                chunk.setBlockId(x, 1, z, chunkX * 16 + x);
                chunk.setBlockId(x, 0, z, 7);
            }
        }

        return chunk;
    }
}
module.exports = Debug;
