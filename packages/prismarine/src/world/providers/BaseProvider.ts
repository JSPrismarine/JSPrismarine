import type { Generator, World } from '../';
import type { Server } from '../../';
import type Chunk from '../chunk/Chunk';
import type Provider from './Provider';

import fs from 'node:fs';

export default abstract class BaseProvider implements Provider {
    protected path: string;
    protected server: Server;
    protected world!: World;

    public constructor(path: string, server: Server) {
        this.server = server;
        this.path = path;
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path);
        }
    }

    public setWorld(world: World) {
        this.world = world;
    }
    public getWorld() {
        return this.world;
    }

    public async enable(): Promise<void> {}
    public async disable(): Promise<void> {}

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
     * @param cx - the chunk x coordinate.
     * @param cz - the chunk y coordinate.
     */
    public abstract readChunk(cx: number, cz: number, seed: number, generator: Generator, config?: any): Promise<Chunk>;

    /**
     * Writes a chunk.
     *
     * @param chunk - the chunk data.
     */
    public abstract writeChunk(chunk: Chunk): Promise<void>;
}
