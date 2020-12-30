import fs from 'fs';
import type Server from '../Server';
import type Chunk from './chunk/Chunk';

export default class Provider {
    private path: string;

    public constructor(path: string) {
        this.path = path;
        if (!fs.existsSync(path)) fs.mkdirSync(path);
    }

    public getPath(): string {
        return this.path;
    }

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
        return null;
    }
}
