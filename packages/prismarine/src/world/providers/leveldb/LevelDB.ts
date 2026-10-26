import type { WorldConfig, WorldPlayerData } from '../../World';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTReader, NBTTagCompound, NBTWriter, Types } from '@jsprismarine/nbt';
import { Database, WriteBatch } from '@jsprismarine/leveldb';
import { blockSchemas } from '@jsprismarine/minecraft';

import { BlockEntityRegistry } from '../../../blockentity/BlockEntityRegistry';
import EntitySerializer from '../../../entity/EntitySerializer';
import Player from '../../../Player';
import {
    ChunkTag,
    decodeChunkKey,
    decodeDigest,
    encodeActorKey,
    encodeChunkKey,
    encodeDigest,
    encodeDigestKey,
    encodePlayerServerKey
} from './LevelDBKeys';
import { LEVEL_DAT_STORAGE_VERSION, readLevelDat, readLevelName, writeLevelDat, writeLevelName } from './LevelDat';
import { decodeData3D, encodeData3D } from './BiomeCodec';
import { playerDataFromNbt, playerDataToNbt } from './PlayerCodec';
import { decodeSubChunk, encodeSubChunk } from './SubChunkCodec';
import { maxSubChunk, minSubChunk } from '../../Dimension';
import BaseProvider from '../BaseProvider';
import Chunk from '../../chunk/Chunk';
import { ChunkBiomes } from '../../chunk/ChunkBiomes';
import type { BlockEntity } from '../../../blockentity/BlockEntity';
import type { Entity } from '../../../entity/Entity';
import type { DimensionDefinition } from '../../Dimension';
import type { ChunkRequestOptions, Generator } from '../../Generator';
import type Server from '../../../Server';

/** The `Version` byte written since 1.21.120. Older values make the game run upgrade passes. */
export const CHUNK_VERSION = 42;

/** `FinalizedState`: 0 needs instaticking, 1 needs population, 2 is done. */
const FINALIZED_DONE = 2;

const DATABASE_DIRECTORY = 'db';

/**
 * Stores a world the way Minecraft: Bedrock Edition does - a `db` directory of LevelDB files, a
 * `level.dat` and a `levelname.txt` beside it - so a world written here opens in the game and a
 * world made in the game opens here.
 */
export default class LevelDB extends BaseProvider {
    public readonly supportsChunkUnload = true;

    private database: Database | null = null;

    public constructor(folderPath: string, server: Server) {
        // Recursive, unlike the base class: a world folder's parent may not exist yet.
        if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

        super(folderPath, server);
    }

    public override async enable(): Promise<void> {
        this.warnIfFilesystemWorld();

        this.database = await Database.open(path.join(this.getPath(), DATABASE_DIRECTORY));
        this.ensureLevelMetadata();
    }

    public override async disable(): Promise<void> {
        await this.database?.close();
        this.database = null;
    }

    /**
     * A folder holding a `chunks` directory and no `db` was written by the old Filesystem
     * provider, which has since been removed.
     *
     * Nothing is touched - the chunks stay where they are and a fresh database is created beside
     * them - but silently starting an empty world where one already existed is the sort of thing
     * that reads as data loss, so it is said out loud. There is no longer anything to fall back
     * to: those files hold network chunk payloads and nothing else, no block entities, no
     * entities, no level metadata, so there is nothing to convert them into.
     */
    private warnIfFilesystemWorld(): void {
        const looksLikeFilesystem =
            fs.existsSync(path.join(this.getPath(), 'chunks')) &&
            !fs.existsSync(path.join(this.getPath(), DATABASE_DIRECTORY));

        if (!looksLikeFilesystem) return;

        this.getServer()
            .getLogger()
            .warn(
                `§e${this.getPath()}§r holds an old Filesystem world and no §bdb§r directory. Starting an ` +
                    `empty LevelDB world beside it; the old §bchunks§r folder is left untouched but cannot ` +
                    `be loaded, as that provider has been removed.`
            );
    }

    private requireDatabase(): Database {
        if (!this.database) throw new Error('The world provider is not enabled');

        return this.database;
    }

    private dimension(): DimensionDefinition {
        return this.getWorld().getDimension();
    }

    // --------------------------------------------------------------- player data

    /** Reads the stored data for a player, or null when the LevelDB has no record for them. */
    public async readPlayerData(identifier: string): Promise<Partial<WorldPlayerData> | null> {
        const value = this.requireDatabase().get(encodePlayerServerKey(identifier));
        return value === null ? null : this.readPlayerNbt(value);
    }

    /** Writes the player's persistent state as Bedrock NBT under its server-side player key. */
    public async writePlayerData(identifier: string, data: WorldPlayerData): Promise<void> {
        const batch = new WriteBatch();
        batch.put(encodePlayerServerKey(identifier), this.writeActorNbt(playerDataToNbt(data)));
        this.requireDatabase().write(batch);
    }

    private readPlayerNbt(value: Buffer): WorldPlayerData {
        return playerDataFromNbt(this.readActorNbt(value));
    }

    // ------------------------------------------------------------------ chunks

    public async readChunk(
        cx: number,
        cz: number,
        seed: bigint,
        generator: Generator,
        config?: WorldConfig,
        options?: ChunkRequestOptions
    ): Promise<Chunk> {
        const database = this.requireDatabase();
        const dimension = this.dimension();
        const key = (tag: ChunkTag, subChunk?: number) =>
            encodeChunkKey({ x: cx, z: cz, dimension: dimension.id, tag, subChunk });

        // No version record means the chunk was never generated. Anything else - a version we do
        // not recognize included - is a chunk that exists and must not be overwritten by a fresh
        // one, so it is read as best we can.
        if (database.get(key(ChunkTag.Version)) === null && database.get(key(ChunkTag.LegacyVersion)) === null) {
            return generator.generateChunk(cx, cz, seed, config, options);
        }

        const subChunks = new Map<number, ReturnType<typeof decodeSubChunk>['subChunk']>();
        for (let index = minSubChunk(dimension); index <= maxSubChunk(dimension); index++) {
            const value = database.get(key(ChunkTag.SubChunkPrefix, index));
            if (value === null) continue;

            const { subChunk } = decodeSubChunk(value);
            subChunks.set(index, subChunk);
        }

        const chunk = new Chunk(cx, cz, subChunks, dimension);

        const biomes = database.get(key(ChunkTag.Data3D));
        if (biomes !== null) {
            chunk.setBiomes(ChunkBiomes.fromSectionIds(decodeData3D(biomes, dimension).palettes, dimension));
        }

        for (const blockEntity of this.readBlockEntities(database.get(key(ChunkTag.BlockEntity)))) {
            chunk.setBlockEntity(blockEntity);
        }

        const digestKey = encodeDigestKey(cx, cz, dimension.id);
        const digest = database.get(digestKey);
        if (digest === null) {
            this.readLegacyEntities(database.get(key(ChunkTag.Entity)), chunk);
        } else {
            this.readActorDigest(digest, chunk);
        }

        // Loaded, not changed: a chunk read from disk and never touched must not be written back.
        chunk.markSaved();
        return chunk;
    }

    public async writeChunk(chunk: Chunk): Promise<void> {
        const database = this.requireDatabase();
        const dimension = chunk.getDimension();
        const batch = new WriteBatch();
        const key = (tag: ChunkTag, subChunk?: number) =>
            encodeChunkKey({ x: chunk.getX(), z: chunk.getZ(), dimension: dimension.id, tag, subChunk });

        for (let index = minSubChunk(dimension); index <= maxSubChunk(dimension); index++) {
            const subChunk = chunk.getSubChunk(index);

            if (!subChunk || subChunk.isEmpty()) {
                // An all-air slice is stored by not storing it, which is what the game does too.
                batch.del(key(ChunkTag.SubChunkPrefix, index));
                continue;
            }

            batch.put(key(ChunkTag.SubChunkPrefix, index), encodeSubChunk(subChunk, index, subChunk.sourceVersion));
        }

        batch.put(
            key(ChunkTag.Data3D),
            encodeData3D({ heightmap: chunk.heightmap(), palettes: chunk.getBiomes().toSectionIds() }, dimension)
        );

        batch.put(key(ChunkTag.Version), Buffer.from([CHUNK_VERSION]));

        const finalized = Buffer.allocUnsafe(4);
        finalized.writeInt32LE(FINALIZED_DONE);
        batch.put(key(ChunkTag.FinalizedState), finalized);

        const blockEntities = this.writeBlockEntities(chunk.getBlockEntities());
        if (blockEntities === null) {
            batch.del(key(ChunkTag.BlockEntity));
        } else {
            batch.put(key(ChunkTag.BlockEntity), blockEntities);
        }

        this.writeEntities(database, batch, chunk, key);

        database.write(batch);
        chunk.markSaved();
    }

    // ------------------------------------------------------------ block entities

    /** A `BlockEntity` record is NBT compounds one after another, with no count in front. */
    private readBlockEntities(value: Buffer | null): BlockEntity[] {
        if (value === null || value.byteLength === 0) return [];

        const stream = new BinaryStream(value);
        const reader = new NBTReader(stream, ByteOrder.LITTLE_ENDIAN);
        reader.setUseVarint(false);

        const blockEntities: BlockEntity[] = [];
        while (stream.getReadIndex() < value.byteLength) {
            try {
                blockEntities.push(BlockEntityRegistry.fromNBT(reader.parse()));
            } catch (error) {
                // One malformed tile must not cost the chunk. Stop reading, keep what was read.
                const reason = error instanceof Error ? error.message : String(error);
                this.getServer().getLogger().warn(`Stopped reading block entities: ${reason}`);
                break;
            }
        }

        return blockEntities;
    }

    private writeBlockEntities(blockEntities: IterableIterator<BlockEntity>): Buffer | null {
        const stream = new BinaryStream();
        const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
        writer.setUseVarint(false);

        let count = 0;
        for (const blockEntity of blockEntities) {
            writer.writeCompound(blockEntity.toNBT());
            count++;
        }

        return count === 0 ? null : stream.getBuffer();
    }

    // ----------------------------------------------------------------------- entities

    private readActorDigest(digest: Buffer, chunk: Chunk): void {
        let actorIds: Buffer[];
        try {
            actorIds = decodeDigest(digest);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            this.getServer().getLogger().warn(`Stopped reading chunk actors: ${reason}`);
            return;
        }

        for (const actorId of actorIds) {
            const value = this.requireDatabase().get(encodeActorKey(actorId));
            if (value === null) {
                this.getServer()
                    .getLogger()
                    .warn(`Missing actor ${actorId.toString('hex')} listed by a chunk digest`);
                continue;
            }

            try {
                chunk.addStoredEntity(this.readActorNbt(value));
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                this.getServer()
                    .getLogger()
                    .warn(`Skipped malformed actor ${actorId.toString('hex')}: ${reason}`);
            }
        }
    }

    /** Reads legacy 0x32 entity data, which is a run of NBT compounds without a count. */
    private readLegacyEntities(value: Buffer | null, chunk: Chunk): void {
        if (value === null || value.byteLength === 0) return;

        const stream = new BinaryStream(value);
        const reader = new NBTReader(stream, ByteOrder.LITTLE_ENDIAN);
        reader.setUseVarint(false);

        while (stream.getReadIndex() < value.byteLength) {
            try {
                chunk.addStoredEntity(reader.parse());
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                this.getServer().getLogger().warn(`Stopped reading legacy chunk entities: ${reason}`);
                break;
            }
        }
    }

    private readActorNbt(value: Buffer): NBTTagCompound {
        const reader = new NBTReader(new BinaryStream(value), ByteOrder.LITTLE_ENDIAN);
        reader.setUseVarint(false);
        return reader.parse();
    }

    private writeEntities(
        database: Database,
        batch: WriteBatch,
        chunk: Chunk,
        key: (tag: ChunkTag, subChunk?: number) => Buffer
    ): void {
        const dimension = chunk.getDimension();
        const digestKey = encodeDigestKey(chunk.getX(), chunk.getZ(), dimension.id);
        const existingDigest = database.get(digestKey);
        const previousActorIds = existingDigest === null ? [] : decodeDigest(existingDigest);
        const entities = this.getWorld()
            .getEntities()
            .filter((entity) => entity.shouldPersist() && this.belongsToChunk(entity, chunk));
        const usedActorIds = this.actorIdsInWorld();
        const actorIds: Buffer[] = [];
        const actorIdsInChunk = new Set<string>();

        for (const entity of entities) {
            const nbt = EntitySerializer.toNBT(entity);
            if (!nbt.has('UniqueID')) {
                const uniqueId = this.generateActorId(database, usedActorIds);
                nbt.addValue('UniqueID', new Types.LongVal(uniqueId));
                entity.persistentNbt = nbt;
            }

            const actorId = actorIdBytes(nbt.getLong('UniqueID', 0n));
            const actorIdHex = actorId.toString('hex');
            if (actorIdsInChunk.has(actorIdHex)) {
                throw new Error(`Duplicate actor id ${actorIdHex} in chunk ${chunk.getX()},${chunk.getZ()}`);
            }

            actorIdsInChunk.add(actorIdHex);
            actorIds.push(actorId);
            batch.put(encodeActorKey(actorId), this.writeActorNbt(nbt));
        }

        const actorIdsStillInWorld = this.actorIdsInWorld();
        for (const actorId of previousActorIds) {
            const actorIdHex = actorId.toString('hex');
            if (actorIdsInChunk.has(actorIdHex) || actorIdsStillInWorld.has(actorIdHex)) continue;

            batch.del(encodeActorKey(actorId));
        }

        batch.del(key(ChunkTag.Entity));
        if (actorIds.length === 0) {
            batch.del(digestKey);
            batch.del(key(ChunkTag.ActorDigestVersion));
        } else {
            batch.put(digestKey, encodeDigest(actorIds));
            batch.put(key(ChunkTag.ActorDigestVersion), Buffer.from([0]));
        }
    }

    private belongsToChunk(entity: Entity, chunk: Chunk): boolean {
        if (entity instanceof Player) return false;

        const position = entity.getPosition();
        return Math.floor(position.getX() / 16) === chunk.getX() && Math.floor(position.getZ() / 16) === chunk.getZ();
    }

    private actorIdsInWorld(): Set<string> {
        const actorIds = new Set<string>();
        for (const entity of this.getWorld().getEntities()) {
            if (entity instanceof Player || !entity.shouldPersist() || !entity.persistentNbt?.has('UniqueID')) continue;

            actorIds.add(actorIdBytes(entity.persistentNbt.getLong('UniqueID', 0n)).toString('hex'));
        }

        return actorIds;
    }

    private generateActorId(database: Database, usedActorIds: Set<string>): bigint {
        for (let attempt = 0; attempt < 32; attempt++) {
            const uniqueId = randomBytes(8).readBigInt64LE(0);
            const actorId = actorIdBytes(uniqueId);
            const actorIdHex = actorId.toString('hex');
            if (usedActorIds.has(actorIdHex) || database.get(encodeActorKey(actorId)) !== null) continue;

            usedActorIds.add(actorIdHex);
            return uniqueId;
        }

        throw new Error('Could not allocate a unique actor id after 32 attempts');
    }

    private writeActorNbt(nbt: NBTTagCompound): Buffer {
        const stream = new BinaryStream();
        const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
        writer.setUseVarint(false);
        writer.writeCompound(nbt);
        return stream.getBuffer();
    }

    // ------------------------------------------------------------ level metadata

    /** Creates `level.dat` and `levelname.txt` when the folder has none. */
    private ensureLevelMetadata(): void {
        const name = this.getWorld().getName();

        if (readLevelDat(this.getPath()) === null) {
            writeLevelDat(this.getPath(), {
                storageVersion: LEVEL_DAT_STORAGE_VERSION,
                root: this.buildLevelDat(name)
            });
        }

        if (readLevelName(this.getPath()) === null) writeLevelName(this.getPath(), name);
    }

    private buildLevelDat(name: string): NBTTagCompound {
        const world = this.getWorld();
        const root = new NBTTagCompound('');

        root.addValue('LevelName', new Types.StringVal(name));
        root.addValue('RandomSeed', new Types.LongVal(world.getSeed()));
        root.addValue('StorageVersion', new Types.NumberVal(LEVEL_DAT_STORAGE_VERSION));
        root.addValue('lastOpenedWithVersion', versionList());

        const dimension = this.dimension();
        root.addValue('SpawnX', new Types.NumberVal(0));
        root.addValue('SpawnY', new Types.NumberVal(dimension.minY + 100));
        root.addValue('SpawnZ', new Types.NumberVal(0));

        return root;
    }

    /** Writes the level metadata back, called when the world saves. */
    public override saveLevelData(spawn: { x: number; y: number; z: number }): void {
        const existing = readLevelDat(this.getPath());
        const root = existing?.root ?? this.buildLevelDat(this.getWorld().getName());

        root.addValue('SpawnX', new Types.NumberVal(Math.trunc(spawn.x)));
        root.addValue('SpawnY', new Types.NumberVal(Math.trunc(spawn.y)));
        root.addValue('SpawnZ', new Types.NumberVal(Math.trunc(spawn.z)));

        writeLevelDat(this.getPath(), { storageVersion: LEVEL_DAT_STORAGE_VERSION, root });
    }

    /** Every chunk coordinate the database holds, for tools that want to walk a whole world. */
    public *listChunks(): IterableIterator<{ x: number; z: number }> {
        const seen = new Set<string>();

        for (const key of this.requireDatabase().keys()) {
            const decoded = decodeChunkKey(key);
            if (decoded === null || decoded.dimension !== this.dimension().id) continue;

            const id = `${decoded.x},${decoded.z}`;
            if (seen.has(id)) continue;

            seen.add(id);
            yield { x: decoded.x, z: decoded.z };
        }
    }

    /** The biomes stored for a chunk, or null when it has none yet. */
    public readBiomes(cx: number, cz: number): ReturnType<typeof decodeData3D> | null {
        const dimension = this.dimension();
        const value = this.requireDatabase().get(
            encodeChunkKey({ x: cx, z: cz, dimension: dimension.id, tag: ChunkTag.Data3D })
        );

        return value === null ? null : decodeData3D(value, dimension);
    }
}

const versionList = (): Set<Types.NumberVal> =>
    new Set([...blockSchemas.minecraftVersion.split('.').map(Number), 0, 0].map((part) => new Types.NumberVal(part)));

const actorIdBytes = (uniqueId: bigint): Buffer => {
    const actorId = Buffer.allocUnsafe(8);
    actorId.writeBigInt64LE(uniqueId);
    return actorId;
};
