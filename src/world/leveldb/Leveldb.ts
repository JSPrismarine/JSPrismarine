import path from 'path';

import Provider from '../Provider';
import BinaryStream from '@jsprismarine/jsbinaryutils';
import Chunk from '../chunk/Chunk';
import EmptySubChunk from '../chunk/EmptySubChunk';
import SubChunk from '../chunk/SubChunk';
import Vector3 from '../../math/Vector3';
import type Prismarine from '../../Prismarine';
import Level from 'level';

interface readChunk {
    x: number;
    z: number;
    generator: any;
    seed: number;
    server: Prismarine;
}

const Tags = {
    Version: 'v',
    SubChunkPrefix: '\x2f'
};

export default class LevelDB extends Provider {
    private server: Prismarine;
    private db: Level;

    constructor(levelPath: string, server: Prismarine) {
        super(levelPath);
        this.db = new Level(path.join(levelPath, 'db'));
        this.server = server;
    }

    /**
     * Decodes a serialized chunk from
     * the database asynchronously.
     */
    public async readChunk({
        x,
        z,
        generator,
        seed,
        server
    }: readChunk): Promise<Chunk | null> {
        return await new Promise(async (resolve, reject) => {
            const index = LevelDB.chunkIndex(x, z);
            const subChunks: Map<number, SubChunk> = new Map();

            // Check if the chunks exists
            try {
                // Chunk exists
                const version = await this.db.get(index + Tags.Version);
                // Needed for future versions
                if (Number(version) === 7) {
                    // Read all sub chunks
                    for (let y = 0; y < 16; y++) {
                        try {
                            const subChunkBuffer = await this.db.get(
                                index + Tags.SubChunkPrefix + y
                            );
                            const stream = new BinaryStream(
                                Buffer.from(subChunkBuffer)
                            );
                            const subChunkVersion = stream.readByte();
                            if (subChunkVersion == 0) {
                                let blocks = stream.read(4096);
                                let blockData = stream.read(2048);

                                let subChunk = new SubChunk();
                                subChunk.ids = blocks;
                                subChunk.metadata = blockData;

                                subChunks.set(y, subChunk);
                            } else {
                                this.server
                                    .getLogger()
                                    .warn('Unsupported sub chunk version');
                            }
                        } catch {
                            // NO-OP
                        }
                    }
                    // await this.db.get(index + '\x2d');
                    return resolve(new Chunk(x, z, subChunks));
                }
            } catch (err) {
                if (!err.notFound) {
                    // Something else went wrong
                    return reject(err);
                }

                // Chunk doesn't exist
                await this.db.put(index + Tags.Version, 7);

                return await (async () => {
                    const chunk = await generator.getChunk({
                        pos: new Vector3(x, 0, z),
                        seed,
                        server
                    });

                    // Put all sub chunks
                    for (let [y, subChunk] of chunk.getSubChunks()) {
                        if (subChunk instanceof EmptySubChunk) continue;
                        let key = index + Tags.SubChunkPrefix + y;
                        let buffer = Buffer.from([
                            0,
                            ...subChunk.ids,
                            ...subChunk.metadata
                        ]);
                        await this.db.put(key, buffer);
                    }
                    // Put data 2D
                    let data = Buffer.from([
                        ...chunk.getHeightMap(),
                        chunk.getBiomes()
                    ]);
                    await this.db.put(index + '\x2d', data);
                    return resolve(chunk);
                })();
            }
        });
    }

    /**
     * Serialize a chunk into the database asynchronously.
     */
    async writeChunk(chunk: Chunk): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                const index = LevelDB.chunkIndex(chunk.getX(), chunk.getZ());
                await this.db.put(index + Tags.Version, 7);

                // Put all sub chunks
                for (let [y, subChunk] of chunk.getSubChunks()) {
                    if (subChunk instanceof EmptySubChunk) continue;
                    let key = index + Tags.SubChunkPrefix + y;
                    let buffer = Buffer.from([
                        0,
                        ...subChunk.ids,
                        ...subChunk.metadata
                    ]);
                    await this.db.put(key, buffer);
                }

                // Put data 2D
                let data = Buffer.from([
                    ...chunk.getHeightMap(),
                    chunk.getBiomes()
                ]);
                await this.db.put(index + '\x2d', data);
                return resolve();
            } catch (err) {
                return reject(err);
            }
        });
    }

    /**
     * Creates an string index from chunk
     * x and z, used to indentify chunks
     * in the db.
     */
    static chunkIndex(chunkX: number, chunkZ: number): string {
        let stream = new BinaryStream();
        stream.writeLInt(chunkX);
        stream.writeLInt(chunkZ);
        return stream.getBuffer().toString('hex');
    }
}
