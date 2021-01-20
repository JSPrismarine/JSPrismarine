import BaseProvider from '../../BaseProvider';
import BinaryStream from '@jsprismarine/jsbinaryutils';
import Chunk from '../../chunk/Chunk';
import Generator from '../../Generator';
import Level from '@beenotung/level-ts';
import type Server from '../../../Server';
import path from 'path';

export default class LevelDB extends BaseProvider {
    private storage: Level;

    public constructor(folderPath: string, server: Server) {
        super(folderPath, server);

        this.storage = new Level(path.join(this.getPath(), 'db'));
    }

    public async readChunk(
        cx: number,
        cz: number,
        seed: number,
        generator: Generator
    ): Promise<Chunk> {
        try {
            const version = Number(
                await this.storage.get(`${LevelDB.chunkIndex(cx, cz)}v`)
            );

            if (version !== 8)
                throw new Error(
                    `version of chunk is either too new or too old (${version})`
                );

            return Chunk.networkDeserialize(
                await this.storage.get(LevelDB.chunkIndex(cx, cz))
            );
        } catch (error) {
            if (!error.notFound) throw error;

            return generator.generateChunk(cx, cz, seed);
        }
    }

    public async writeChunk(chunk: Chunk): Promise<void> {
        const index = LevelDB.chunkIndex(chunk.getX(), chunk.getZ());
        await this.storage.put(`${index}v`, 8);
        await this.storage.put(index, chunk.networkSerialize());
    }

    /**
     * Creates an string index from chunk
     * x and z, used to identify chunks
     * in the db.
     */
    public static chunkIndex(chunkX: number, chunkZ: number): string {
        const stream = new BinaryStream();
        stream.writeLInt(chunkX);
        stream.writeLInt(chunkZ);
        return stream.getBuffer().toString('hex');
    }
}
