import type { WorldConfig } from '../World';
import type { Generator, World } from '../';
import type { ChunkRequestOptions } from '../Generator';
import type { Server } from '../../';
import type Chunk from '../chunk/Chunk';
import type { DimensionType } from '../Dimension';
import type { Entity } from '../../entity/Entity';
import type { Level } from '../Level';
import type Provider from './Provider';
import type { LevelDatInputs } from './Provider';

import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTReader, NBTTagCompound, NBTWriter, Types } from '@jsprismarine/nbt';
import fs from 'node:fs';
import path from 'node:path';
import type { WorldPersistenceData } from '../WorldPersistence';
import { parseWorldPersistenceData, worldPersistenceJsonOf } from '../WorldPersistence';

const WORLD_DATA_FILE_NAME = 'jsprismarine-world.dat';

/**
 * Answers the live entities of one dimension when a provider writes a chunk there.
 *
 * The provider serves every dimension of a save, so it cannot read one world's entity list;
 * whoever owns the worlds hands it this instead.
 */
export type EntitySource = (dimension: DimensionType) => readonly Entity[];

/**
 * What the provider formats share: the folder, the server, the fallback world data file and
 * the hooks the owning world or level attaches.
 */
export default abstract class BaseProvider implements Provider {
    protected path: string;
    protected server: Server;
    protected world!: World;
    private level: Level | undefined;
    private entitySource: EntitySource | null = null;

    public constructor(path: string, server: Server) {
        this.server = server;
        this.path = path;
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path);
        }
    }

    /**
     * Attaches the world this provider logs and names the save after. Until an entity source is
     * attached, that world's entities are also the ones a chunk write persists.
     *
     * A provider that serves a {@link Level} is told about the level instead; see
     * {@link BaseProvider.setLevel}.
     */
    public setWorld(world: World) {
        this.world = world;
    }
    public getWorld() {
        return this.world;
    }

    /**
     * Attaches the level whose save this provider is, which is where the save's name and seed
     * come from once a level owns it. A level has no world until one is asked for, so the
     * metadata a format writes on open cannot wait for one.
     */
    public setLevel(level: Level): void {
        this.level = level;
    }

    /** The level this provider serves, or undefined before {@link BaseProvider.setLevel}. */
    public getLevel(): Level | undefined {
        return this.level;
    }

    /** The save's name: the level's, or the attached world's before a level owns the save. */
    protected saveName(): string {
        return this.level?.name ?? this.world.getName();
    }

    /** The save's seed: the level's, or the attached world's before a level owns the save. */
    protected saveSeed(): bigint {
        return this.level?.seed ?? this.world.getSeed();
    }

    /** Attaches where a chunk write finds the entities of the chunk's dimension. */
    public setEntitySource(source: EntitySource): void {
        this.entitySource = source;
    }

    /**
     * The live entities of one dimension, from the attached source, or from the attached world
     * when it is the only one.
     */
    protected entitiesIn(dimension: DimensionType): readonly Entity[] {
        if (this.entitySource !== null) return this.entitySource(dimension);
        if (this.world === undefined || this.world.getDimension().bedrockId !== dimension.bedrockId) return [];
        return this.world.getEntities();
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
     * Returns a chunk decoded from the provider, generating it when the save has none.
     *
     * @param dimension - the dimension the chunk belongs to.
     * @param cx - the chunk x coordinate.
     * @param cz - the chunk z coordinate.
     */
    public abstract readChunk(
        dimension: DimensionType,
        cx: number,
        cz: number,
        seed: bigint,
        generator: Generator,
        config?: WorldConfig,
        options?: ChunkRequestOptions
    ): Promise<Chunk>;

    /**
     * Writes a chunk into the dimension `chunk.getDimension()` names.
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
        root.addValue('Data', new Types.StringVal(JSON.stringify(worldPersistenceJsonOf(data))));

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

    /** Persists provider-specific level metadata when the format supports it. */
    public saveLevelData(_level: LevelDatInputs): void {}
}
