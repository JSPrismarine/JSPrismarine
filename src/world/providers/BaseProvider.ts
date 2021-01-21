import type Chunk from '../chunk/Chunk';
import Generator from '../Generator';
import Provider from './Provider';
import type Server from '../../Server';
import fs from 'fs';

export default abstract class BaseProvider implements Provider {
    private path: string;
    private server: Server;

    public constructor(path: string, server: Server) {
        this.server = server;
        this.path = path;
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path);
        }
    }

    public getServer(): Server {
        return this.server;
    }

    /**
     * Returns the path to the world folder.
     */
    public getPath(): string {
        return this.path;
    }

    /**
     * Returns a chunk decoded from the provider.
     *
     * @param cx the chunk x coordinate
     * @param cz the chunk y coordinate
     */
    public abstract readChunk(
        cx: number,
        cz: number,
        seed: number,
        generator: Generator
    ): Promise<Chunk>;

    /**
     * Writes a chunk
     *
     * @param chunk the chunk data
     */
    public abstract writeChunk(chunk: Chunk): Promise<void>;
}
