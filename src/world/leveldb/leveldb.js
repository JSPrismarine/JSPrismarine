const path = require('path');
const level = require('level');

const Provider = require('../provider');
const BinaryStream = require('@jsprismarine/jsbinaryutils').default;
const Chunk = require('../chunk/Chunk');
const EmptySubChunk = require('../chunk/empty-sub-chunk');
const SubChunk = require('../chunk/SubChunk').default;

const Tags = {
    Version: 'v',
    SubChunkPrefix: '\x2f'
};
class LevelDB extends Provider {
    #server;
    /** @type {level} */
    db;

    constructor(levelPath, server) {
        super(levelPath);
        this.db = new level(path.join(levelPath, 'db'));
        this.#server = server;
    }

    /**
     * Decodes a serialized chunk from 
     * the database asynchronously.
     * 
     * @param {number} x - chunk X 
     * @param {number} z - chunk Z
     */
    readChunk({ x, z, generator, seed, server }) {
        return new Promise(async (resolve) => {
            let index = LevelDB.chunkIndex(x, z);
            let subChunks = new Map();

            // Check if the chunks exists
            try {
                // Chunk exists
                let version = await this.db.get(index + Tags.Version);
                // Needed for future versions
                if (Number(version) === 7) {
                    // Read all sub chunks
                    for (let y = 0; y < 16; y++) {
                        try {
                            let subChunkBuffer = await this.db.get(index + Tags.SubChunkPrefix + y);
                            let stream = new BinaryStream(Buffer.from(subChunkBuffer));
                            let subChunkVersion = stream.readByte();
                            if (subChunkVersion == 0) {
                                let blocks = stream.read(4096);
                                let blockData = stream.read(2048);

                                let subChunk = new SubChunk();
                                subChunk.ids = blocks;
                                subChunk.metadata = blockData;

                                subChunks.set(y, subChunk);
                            } else {
                                this.#server.getLogger().warn('Unsupported sub chunk version');
                            }
                        } catch {
                            // NO-OP
                        }
                    }
                    await this.db.get(index + '\x2d');
                    return resolve(new Chunk(x, z, subChunks));
                }
            } catch {
                // Chunk doesn't exist
                await this.db.put(index + Tags.Version, 7);

                return await (async () => {
                    const chunk = await generator.getChunk({
                        chunkX: x,
                        chunkZ: z,
                        seed,
                        server
                    });

                    // Put all sub chunks
                    for (let [y, subChunk] of chunk.getSubChunks()) {
                        if (subChunk instanceof EmptySubChunk)
                            continue;
                        let key = index + Tags.SubChunkPrefix + y;
                        let buffer = Buffer.from([0, ...subChunk.ids, ...subChunk.metadata]);
                        await this.db.put(key, buffer);
                    }
                    // Put data 2D
                    let data = Buffer.from([...chunk.getHeightMap(), chunk.getBiomes()]);
                    await this.db.put(index + '\x2d', data);
                    return resolve(chunk);
                })();
            }

            return null;
        });
    }

    /**
     * Serialize a chunk into the database asynchronously.
     * 
     * @param {Chunk} chunk 
     */
    async writeChunk(chunk) {
        let index = LevelDB.chunkIndex(chunk.getX(), chunk.getZ());
        await this.db.put(index + Tags.Version, 7);
        // Put all sub chunks
        for (let [y, subChunk] of chunk.getSubChunks()) {
            if (subChunk instanceof EmptySubChunk) continue;
            let key = index + Tags.SubChunkPrefix + y;
            let buffer = Buffer.from([0, ...subChunk.ids, ...subChunk.metadata]);
            await this.db.put(key, buffer);
        }
        // Put data 2D
        let data = Buffer.from([...chunk.getHeightMap(), chunk.getBiomes()]);
        await this.db.put(index + '\x2d', data);
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
        let stream = new BinaryStream();
        stream.writeLInt(chunkX);
        stream.writeLInt(chunkZ);
        return stream.buffer.toString('hex');
    }

}
module.exports = LevelDB;
