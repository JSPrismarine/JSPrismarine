import type Chunk from '../chunk/Chunk';
import { GameRules } from '../GameruleManager';
import Generator from '../Generator';
import Provider from './Provider';
import type Server from '../../Server';
import Vector3 from '../../math/Vector3';
import type World from '../World';
import fs from 'fs';

export interface LevelMeta {
    spawn: Vector3;
    gameRules: Array<[string, any]>;
}

export default abstract class BaseProvider implements Provider {
    private path: string;
    private server: Server;
    private world!: World;

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

    public async onEnable() {}
    public async onDisable() {}

    public async close() {}

    public getServer(): Server {
        return this.server;
    }

    /**
     * Returns the path to the world folder.
     */
    public getPath(): string {
        return this.path;
    }

    public async getLevelMetadata(): Promise<LevelMeta> {
        return {
            spawn: new Vector3(0, 10, 0),
            gameRules: [
                [GameRules.DoDayLightCycle, true],
                [GameRules.ShowCoordinates, true]
            ]
        };
    }

    /**
     * Returns a chunk decoded from the provider.
     *
     * @param cx the chunk x coordinate.
     * @param cz the chunk y coordinate.
     */
    public abstract readChunk(cx: number, cz: number, seed: number, generator: Generator, config?: any): Promise<Chunk>;

    /**
     * Writes a chunk.
     *
     * @param chunk the chunk data.
     */
    public abstract writeChunk(chunk: Chunk): Promise<void>;
}
