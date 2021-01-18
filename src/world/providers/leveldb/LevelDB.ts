import BinaryStream from '@jsprismarine/jsbinaryutils';
import Chunk from '../../chunk/Chunk';
import EmptySubChunk from '../../chunk/EmptySubChunk';
import Level from '@beenotung/level-ts';
import Provider from '../../Provider';
import type Server from '../../../Server';
import SubChunk from '../../chunk/SubChunk';
import Vector3 from '../../../math/Vector3';
import path from 'path';

const Tags = {
    Version: 'v',
    SubChunkPrefix: '\u002F'
};

export default class LevelDB extends Provider {
    private readonly server: Server;
    private readonly db: Level;

    public constructor(levelPath: string, server: Server) {
        super(levelPath);
        this.db = new Level(path.join(levelPath, 'db'));
        this.server = server;
    }

    public async close() {
        // TODO: close the DB
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
    }: {
        x: number;
        z: number;
        generator: any;
        seed: number;
        server: Server;
    }): Promise<Chunk | null> {
        return new Promise(async (resolve, reject) => {
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
                            if (subChunkVersion === 0) {
                                const blocks = stream.read(4096);
                                const blockData = stream.read(2048);

                                const subChunk = new SubChunk();
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

                    // Await this.db.get(index + '\x2d');
                    resolve(new Chunk(x, z, subChunks));
                    return;
                }
            } catch (error) {
                if (!error.notFound) {
                    // Something else went wrong
                    reject(error);
                    return;
                }

                // Chunk doesn't exist
                await this.db.put(index + Tags.Version, 7);

                return (async () => {
                    const chunk = await generator.getChunk({
                        pos: new Vector3(x, 0, z),
                        seed,
                        server
                    });

                    // Put all sub chunks
                    for (const [y, subChunk] of chunk.getSubChunks()) {
                        if (subChunk instanceof EmptySubChunk) continue;
                        const key = index + Tags.SubChunkPrefix + y;
                        const buffer = Buffer.from([
                            0,
                            ...subChunk.ids,
                            ...subChunk.metadata
                        ]);
                        await this.db.put(key, buffer);
                    }

                    // Put data 2D
                    const data = Buffer.from([
                        ...chunk.getHeightMap(),
                        chunk.getBiomes()
                    ]);
                    await this.db.put(index + '\u002D', data);
                    resolve(chunk);
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
                for (const [y, subChunk] of chunk.getSubChunks()) {
                    if (subChunk instanceof EmptySubChunk) continue;
                    const key = index + Tags.SubChunkPrefix + y;
                    const buffer = Buffer.from([
                        0,
                        ...subChunk.ids,
                        ...subChunk.metadata
                    ]);
                    await this.db.put(key, buffer);
                }

                // Put data 2D
                const data = Buffer.from([
                    ...chunk.getHeightMap(),
                    chunk.getBiomes()
                ]);
                await this.db.put(index + '\u002D', data);
                resolve();
                return;
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Creates an string index from chunk
     * x and z, used to indentify chunks
     * in the db.
     */
    static chunkIndex(chunkX: number, chunkZ: number): string {
        const stream = new BinaryStream();
        stream.writeLInt(chunkX);
        stream.writeLInt(chunkZ);
        return stream.getBuffer().toString('hex');
    }
}
