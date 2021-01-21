import BaseProvider from '../BaseProvider';
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

        try {
            this.storage = new Level(path.join(this.getPath(), 'db'));
        } catch (error) {
            server.getLogger().silly(error.stack, 'providers/LevelDB');
            throw new Error(`failed to open world for reading with id ${folderPath}`);
        }
    }

    public async close() {
        (this as any).storage?.DB?.close?.();
        (this as any).storage = undefined;
    }

    public async readChunk(
        cx: number,
        cz: number,
        seed: number,
        generator: Generator
    ): Promise<Chunk> {
        try {
            const version = Number(await this.storage.get(`${LevelDB.chunkIndex(cx, cz)}v`));

            switch (version) {
                case 7:
                    this.getServer()
                        .getLogger()
                        .error(
                            `Please use an older build of JSPrismarine for v(${version}) chunks.`,
                            'providers/LevelDB/readChunk'
                        );
                    await this.getServer().kill({ withoutSaving: true });
                    break;
                case 8:
                    break;
                default:
                    throw new Error(`version of chunk is either too new or too old (${version})`);
            }

            const buffer = Buffer.from(await this.storage.get(LevelDB.chunkIndex(cx, cz)));
            const chunk = Chunk.networkDeserialize(new BinaryStream(buffer));
            (chunk as any).x = cx;
            (chunk as any).z = cz;
            return chunk;
        } catch (error) {
            if (!error.notFound) throw error;

            return generator.generateChunk(cx, cz, seed);
        }
    }

    public async writeChunk(chunk: Chunk): Promise<void> {
        const index = LevelDB.chunkIndex(chunk.getX(), chunk.getZ());
        await this.storage.put(`${index}v`, 8);
        await this.storage.put(index, chunk.networkSerialize(true));
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
