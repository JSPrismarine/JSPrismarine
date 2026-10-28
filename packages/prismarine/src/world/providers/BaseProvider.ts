import type { WorldConfig } from '../World';
import type { Generator, World } from '../';
import type { ChunkRequestOptions } from '../Generator';
import type { Server } from '../../';
import type Chunk from '../chunk/Chunk';
import type Provider from './Provider';

import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTReader, NBTTagCompound, NBTWriter, Types } from '@jsprismarine/nbt';
import fs from 'node:fs';
import path from 'node:path';
import type { WorldPersistenceData } from '../WorldPersistence';
import { parseWorldPersistenceData } from '../WorldPersistence';

const WORLD_DATA_FILE_NAME = 'jsprismarine-world.dat';

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

    /**
     * On enable hook.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {}
    /**
     * On disable hook.
     * @group Lifecycle
     */
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
    public abstract readChunk(
        cx: number,
        cz: number,
        seed: bigint,
        generator: Generator,
        config?: WorldConfig,
        options?: ChunkRequestOptions
    ): Promise<Chunk>;

    /**
     * Writes a chunk.
     *
     * @param chunk - the chunk data.
     */
    public abstract writeChunk(chunk: Chunk): Promise<void>;

    /** Reads world state from the provider's fallback NBT file. */
    public async readWorldData(): Promise<WorldPersistenceData | null> {
        const file = path.join(this.path, WORLD_DATA_FILE_NAME);
        if (!fs.existsSync(file)) return null;

        const stream = new BinaryStream(await fs.promises.readFile(file));
        const reader = new NBTReader(stream, ByteOrder.LITTLE_ENDIAN);
        reader.setUseVarint(false);
        const encoded = reader.parse().getString('Data', '');
        return encoded.length === 0 ? {} : parseWorldPersistenceData(encoded);
    }

    /** Writes world state as one provider-owned NBT compound. */
    public async writeWorldData(data: WorldPersistenceData): Promise<void> {
        const root = new NBTTagCompound('');
        root.addValue('Data', new Types.StringVal(JSON.stringify(data)));

        const stream = new BinaryStream();
        const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
        writer.setUseVarint(false);
        writer.writeCompound(root);

        const file = path.join(this.path, WORLD_DATA_FILE_NAME);
        const temporary = `${file}.tmp`;
        await fs.promises.writeFile(temporary, stream.getBuffer(), { flush: true });
        await fs.promises.rename(temporary, file);
    }

    /** Moves legacy metadata into this provider, keeping provider data when both copies exist. */
    public async migrateLegacyWorldData(data: WorldPersistenceData): Promise<void> {
        const stored = await this.readWorldData();
        await this.writeWorldData({
            ...data,
            ...stored,
            entities: stored?.entities ?? data.entities
        });
    }

    /** Persists provider-specific world metadata when the format supports it. */
    public saveLevelData(_spawn: { x: number; y: number; z: number }): void {}
}
