import type Chunk from './chunk/Chunk';
import Generator from './Generator';
import Provider from './Provider';
import type Server from '../Server';
import fs from 'fs';

export default class BaseProvider implements Provider {
    private path: string;

    public constructor(path: string, server: Server) {
        this.path = path;
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path);
        }
    }

    /**
     * Returns the path to the world folder.
     */
    public getPath(): string {
        return this.path;
    }

    /**
     * Returns a chunk decoded from the provider.
     */
    public async readChunk(
        cx: number,
        cz: number,
        seed: number,
        generator: Generator
    ): Promise<Chunk> {
        throw new Error('readChunk was not implemented by the child class!');
    }
}
