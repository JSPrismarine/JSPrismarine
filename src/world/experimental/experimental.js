const fs = require('fs');
const path = require('path');

const Provider = require('../provider');
const Chunk = require('../chunk/chunk');
const BinaryStream = require('@jsprismarine/jsbinaryutils').default;
const SubChunk = require('../chunk/sub-chunk');


class Experimental extends Provider {

    /**
     * Experimental world saving:
     * saves all chunks buffers into binary 
     * files then when needed decodes them.
     * 
     * @param {number} x - chunk X 
     * @param {number} z - chunk Z
     */
    async readChunk(x, z) {
        // Check if chunks folder exists
        let filesPath = path.join(this.path, 'chunks');
        try {
            await fs.promises.access(filesPath);
            // Folder exists
        } catch {
            // Folder doesn't exists
            await fs.promises.mkdir(filesPath);
        }

        let chunkPath = path.join(filesPath, `${x}.${z}.bin`);
        // Check if chunk file exists
        try {
            await fs.promises.access(chunkPath);
            // Chunk file exists
            let chunkBuffer = await fs.promises.readFile(chunkPath);
            let stream = new BinaryStream(chunkBuffer);
            let subChunks = new Map();
            for (let i = 0; i < stream.readByte(); i++) {
                // each sub chunk is 6145 bytes
                let subChunk = new SubChunk();
                stream.read(1);
                subChunk.ids = stream.read(16 * 16 * 16);
                subChunk.metadata = stream.read((16 * 16 * 16) / 2);
                subChunks.set(i, subChunk);
            }
            let chunk = new Chunk(x, z, subChunks);
            return chunk;
            // We don't care about biomes for now
        } catch {
            // Chunk file doesn't exists, create one and save
            // To disk (TODO: this should use the generator logic)
            let chunk = new Chunk(x, z);
            for (let x = 0; x < 16; x++) {
                for (let z = 0; z < 16; z++) {
                    let y = 0;
                    chunk.setBlockId(x, y++, z, 7);  
                    chunk.setBlockId(x, y++, z, 3);
                    chunk.setBlockId(x, y++, z, 3);
                    chunk.setBlockId(x, y, z, 2); 
                }
            }

            let stream = new BinaryStream();
            stream.writeByte(chunk.getSubChunkSendCount());
            stream.append(chunk.toBinary());

            // Don't block function while writing, this will just
            // delay the chunk to the client
            fs.promises.writeFile(chunkPath, stream.buffer);
            return chunk;
        }
    }

    /**
     * Experimental world saving:
     * Writes a chunk into the disk asynchronously.
     * 
     * @param {Chunk} chunk 
     */
    async writeChunk(chunk) {
        // Check if chunks folder exists
        let filesPath = path.join(this.path, 'chunks');
        try {
            await fs.promises.access(filesPath);
            // Folder exists
        } catch {
            // Folder doesn't exists
            await fs.promises.mkdir(filesPath);
        }

        let stream = new BinaryStream();
        stream.writeByte(chunk.getSubChunkSendCount());
        stream.append(chunk.toBinary());

        let filePath = path.join(filesPath, `${chunk.getX()}.${chunk.getZ()}.bin`);
        await fs.promises.writeFile(filePath, stream.buffer);
    }

}
module.exports = Experimental;
