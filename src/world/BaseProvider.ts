import type Chunk from './chunk/Chunk';
import Generator from './Generator';
import Provider from './Provider';
import SharedSeedRandom from './util/SharedSeedRandom';
import fs from 'fs';

export default abstract class BaseProvider implements Provider {
    private path: string;

    public constructor(path: string) {
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
     *
     * @param cx - chunk x
     * @param cz - chunk z
     */
    public abstract readChunk(
        cx: number,
        cz: number,
        seed: SharedSeedRandom,
        generator: Generator
    ): Chunk;
}
