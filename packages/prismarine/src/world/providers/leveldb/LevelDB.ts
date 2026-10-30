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
import type { DimensionType } from '../../Dimension';
import type { ChunkRequestOptions, Generator } from '../../Generator';
import type Server from '../../../Server';
import type { LegacyWorldEntity, WorldPersistenceData } from '../../WorldPersistence';
import { parseWorldPersistenceData, worldPersistenceDataOf } from '../../WorldPersistence';

/** The `Version` byte written since 1.21.120. Older values make the game run upgrade passes. */
export const CHUNK_VERSION = 42;

/** `FinalizedState`: 0 needs instaticking, 1 needs population, 2 is done. */
const FINALIZED_DONE = 2;

const DATABASE_DIRECTORY = 'db';
const WORLD_DATA_KEY = Buffer.from('jsprismarine:world_data', 'ascii');
const PENDING_ENTITY_PREFIX = Buffer.from('jsprismarine:pending_entities:', 'ascii');

interface PendingLegacyEntity extends LegacyWorldEntity {
    uniqueId: string;
}

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

    private dimension(): DimensionType {
        return this.getWorld().getDimension();
    }

    /** Reads world state from the provider record, or from `level.dat` on an imported world. */
    public override async readWorldData(): Promise<WorldPersistenceData | null> {
        const value = this.requireDatabase().get(WORLD_DATA_KEY);
        if (value !== null) {
            const encoded = this.readActorNbt(value).getString('Data', '');
            if (encoded.length > 0) return parseWorldPersistenceData(encoded);
        }

        const level = readLevelDat(this.getPath());
        if (level === null || level.root.getByte('JSPrismarineSpawnKnown', -1) === 0) return {};

        const root = level.root;
        const spawn = {
            x: root.getNumber('SpawnX', 0),
            y: root.getNumber('SpawnY', 0),
            z: root.getNumber('SpawnZ', 0)
        };
        const dimension = this.dimension();
        if (
            root.getByte('JSPrismarineSpawnKnown', -1) === -1 &&
            spawn.x === 0 &&
            spawn.z === 0 &&
            spawn.y === dimension.minY + 100
        )
            return {};

        return { spawn };
    }

    /** Stores world metadata in LevelDB and the spawn in Bedrock's standard `level.dat` tags. */
    public override async writeWorldData(data: WorldPersistenceData): Promise<void> {
        const metadata: WorldPersistenceData = {
            ...(data.spawn === undefined ? {} : { spawn: data.spawn }),
            ...(data.gameRules === undefined ? {} : { gameRules: data.gameRules }),
            ...(data.weather === undefined ? {} : { weather: data.weather })
        };
        const root = new NBTTagCompound('');
        root.addValue('Data', new Types.StringVal(JSON.stringify(metadata)));
        this.requireDatabase().write(new WriteBatch().put(WORLD_DATA_KEY, this.writeActorNbt(root)));

        if (metadata.spawn !== undefined) this.saveSpawnInLevelDat(metadata.spawn);
    }

    /** Moves legacy world metadata and actor snapshots into LevelDB before the sidecar is removed. */
    public override async migrateLegacyWorldData(data: WorldPersistenceData): Promise<void> {
        const database = this.requireDatabase();
        const providerDataExists = database.get(WORLD_DATA_KEY) !== null;
        const stored = (await this.readWorldData()) ?? {};

        await this.migrateLegacyEntities(data.entities ?? []);

        const merged = providerDataExists ? { ...data, ...stored } : { ...stored, ...data };
        await this.writeWorldData(merged);
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
            encodeChunkKey({ x: cx, z: cz, dimension: dimension.bedrockId, tag, subChunk });
        const pendingEntitiesKey = pendingEntityKey(cx, cz, dimension.bedrockId);

        // No version record means the chunk was never generated. Anything else - a version we do
        // not recognize included - is a chunk that exists and must not be overwritten by a fresh
        // one, so it is read as best we can.
        if (database.get(key(ChunkTag.Version)) === null && database.get(key(ChunkTag.LegacyVersion)) === null) {
            const chunk = await generator.generateChunk(cx, cz, seed, config, options);
            if (this.readPendingEntities(database.get(pendingEntitiesKey), chunk)) chunk.markChanged();
            return chunk;
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

        const digestKey = encodeDigestKey(cx, cz, dimension.bedrockId);
        const digest = database.get(digestKey);
        let repairActorDigest = false;
        if (digest === null) {
            this.readLegacyEntities(database.get(key(ChunkTag.Entity)), chunk);
        } else {
            repairActorDigest = this.readActorDigest(digest, chunk);
        }
        const hasPendingEntities = this.readPendingEntities(database.get(pendingEntitiesKey), chunk);

        // Loaded, not changed: a chunk read from disk and never touched must not be written back.
        chunk.markSaved();
        if (repairActorDigest || hasPendingEntities) chunk.markChanged();
        return chunk;
    }

    public async writeChunk(chunk: Chunk): Promise<void> {
        const database = this.requireDatabase();
        const dimension = chunk.getDimension();
        const batch = new WriteBatch();
        const key = (tag: ChunkTag, subChunk?: number) =>
            encodeChunkKey({ x: chunk.getX(), z: chunk.getZ(), dimension: dimension.bedrockId, tag, subChunk });

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
        batch.del(pendingEntityKey(chunk.getX(), chunk.getZ(), dimension.bedrockId));

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

    /**
     * Loads each distinct actor in a chunk digest and reports whether the chunk needs repair.
     *
     * Duplicate references, missing records, malformed actor NBT, and an invalid digest all mark
     * the chunk dirty. Its next save writes a digest from the actors that could be loaded.
     */
    private readActorDigest(digest: Buffer, chunk: Chunk): boolean {
        let actorIds: Buffer[];
        try {
            actorIds = decodeDigest(digest);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            this.getServer().getLogger().warn(`Stopped reading chunk actors: ${reason}`);
            return true;
        }

        let repairNeeded = false;
        const seenActorIds = new Set<string>();
        for (const actorId of actorIds) {
            const actorIdHex = actorId.toString('hex');
            if (seenActorIds.has(actorIdHex)) {
                this.getServer()
                    .getLogger()
                    .warn(`Skipped duplicate actor ${actorIdHex} listed by chunk ${chunk.getX()},${chunk.getZ()}`);
                repairNeeded = true;
                continue;
            }
            seenActorIds.add(actorIdHex);

            const value = this.requireDatabase().get(encodeActorKey(actorId));
            if (value === null) {
                this.getServer()
                    .getLogger()
                    .warn(`Missing actor ${actorIdHex} listed by chunk ${chunk.getX()},${chunk.getZ()}`);
                repairNeeded = true;
                continue;
            }

            try {
                chunk.addStoredEntity(this.readActorNbt(value));
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                this.getServer().getLogger().warn(`Skipped malformed actor ${actorIdHex}: ${reason}`);
                repairNeeded = true;
            }
        }

        return repairNeeded;
    }

    private async migrateLegacyEntities(entities: readonly LegacyWorldEntity[]): Promise<void> {
        if (entities.length === 0) return;

        const database = this.requireDatabase();
        const dimension = this.dimension();
        const chunks = new Map<
            string,
            { x: number; z: number; pending: PendingLegacyEntity[]; identities: Set<string> }
        >();
        const usedActorIds = new Set<string>();
        const seen = new Set<string>();

        for (const entity of entities) {
            // A level.json item row has no stack payload. The full item actor in LevelDB is the
            // only copy that can be restored as an item, and an unmatched row was never usable.
            if (entity.type === 'minecraft:item') continue;

            const { x, z } = entity.position;
            const cx = Math.floor(x / 16);
            const cz = Math.floor(z / 16);
            const chunkId = `${cx},${cz}`;
            let chunk = chunks.get(chunkId);
            if (chunk === undefined) {
                const identities = this.actorIdentitiesInChunk(database, cx, cz, dimension.bedrockId);
                const pending = this.readPendingEntityRecords(database.get(pendingEntityKey(cx, cz, dimension.bedrockId)));
                for (const entity of pending) {
                    identities.add(legacyEntityIdentity(entity));
                    usedActorIds.add(actorIdBytes(BigInt(entity.uniqueId)).toString('hex'));
                }
                chunk = { x: cx, z: cz, pending, identities };
                chunks.set(chunkId, chunk);
            }

            const identity = legacyEntityIdentity(entity);
            if (seen.has(identity) || chunk.identities.has(identity)) continue;
            seen.add(identity);

            const uniqueId = this.generateActorId(database, usedActorIds);
            chunk.pending.push({ ...entity, uniqueId: uniqueId.toString() });
            chunk.identities.add(identity);
        }

        const batch = new WriteBatch();
        let hasUpdates = false;
        for (const { x, z, pending } of chunks.values()) {
            if (pending.length === 0) continue;
            batch.put(pendingEntityKey(x, z, dimension.bedrockId), this.writePendingEntityRecords(pending));
            hasUpdates = true;
        }

        if (hasUpdates) database.write(batch);
    }

    private actorIdentitiesInChunk(database: Database, x: number, z: number, dimension: number): Set<string> {
        const identities = new Set<string>();
        const digest = database.get(encodeDigestKey(x, z, dimension));
        if (digest !== null) {
            for (const actorId of decodeDigest(digest)) {
                const actor = database.get(encodeActorKey(actorId));
                if (actor === null) continue;

                const identity = entityIdentity(this.readActorNbt(actor));
                if (identity !== undefined) identities.add(identity);
            }
            return identities;
        }

        const legacy = database.get(encodeChunkKey({ x, z, dimension, tag: ChunkTag.Entity }));
        for (const actor of this.readLegacyEntityNbt(legacy)) {
            const identity = entityIdentity(actor);
            if (identity !== undefined) identities.add(identity);
        }

        return identities;
    }

    private readPendingEntityRecords(value: Buffer | null): PendingLegacyEntity[] {
        if (value === null) return [];

        const encoded = this.readActorNbt(value).getString('Data', '');
        if (encoded.length === 0) return [];
        const parsed: unknown = JSON.parse(encoded);
        if (!Array.isArray(parsed)) throw new Error('Pending actor migration data is not an array');

        return parsed.flatMap((entry) => {
            if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return [];
            // JSON is the provider-record boundary; the world entity parser checks the fields we use.
            const record = entry as Record<string, unknown>;
            const uniqueId = record['uniqueId'];
            if (typeof uniqueId !== 'string') return [];
            try {
                BigInt(uniqueId);
            } catch {
                return [];
            }
            const legacy = worldPersistenceDataOf({ entities: [record] }).entities?.[0];
            if (legacy === undefined) return [];

            return [{ ...legacy, uniqueId }];
        });
    }

    private readPendingEntities(value: Buffer | null, chunk: Chunk): boolean {
        const pending = this.readPendingEntityRecords(value);
        for (const entity of pending) chunk.addStoredEntity(this.legacyActorNbt(entity));

        return pending.length > 0;
    }

    private writePendingEntityRecords(entities: readonly PendingLegacyEntity[]): Buffer {
        const root = new NBTTagCompound('');
        root.addValue('Data', new Types.StringVal(JSON.stringify(entities)));
        return this.writeActorNbt(root);
    }

    private legacyActorNbt(entity: PendingLegacyEntity): NBTTagCompound {
        const { x, y, z, yaw = 0, pitch = 0 } = entity.position;
        const nbt = new NBTTagCompound('');
        nbt.addValue('UniqueID', new Types.LongVal(BigInt(entity.uniqueId)));
        nbt.addValue('identifier', new Types.StringVal(entity.type));
        nbt.addValue('Pos', new Set([x, y, z].map((value) => new Types.FloatVal(value))));
        nbt.addValue('Rotation', new Set([yaw, pitch].map((value) => new Types.FloatVal(value))));
        nbt.addValue('OnGround', new Types.ByteVal(1));
        nbt.addValue('FallDistance', new Types.FloatVal(0));
        nbt.addValue('Fire', new Types.ShortVal(0));
        nbt.addValue('Air', new Types.ShortVal(300));
        nbt.addValue('Invulnerable', new Types.ByteVal(0));
        return nbt;
    }

    /** Reads legacy 0x32 entity data, which is a run of NBT compounds without a count. */
    private readLegacyEntities(value: Buffer | null, chunk: Chunk): void {
        for (const entity of this.readLegacyEntityNbt(value)) chunk.addStoredEntity(entity);
    }

    private readLegacyEntityNbt(value: Buffer | null): NBTTagCompound[] {
        if (value === null || value.byteLength === 0) return [];

        const stream = new BinaryStream(value);
        const reader = new NBTReader(stream, ByteOrder.LITTLE_ENDIAN);
        reader.setUseVarint(false);
        const entities: NBTTagCompound[] = [];

        while (stream.getReadIndex() < value.byteLength) {
            try {
                entities.push(reader.parse());
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                this.getServer().getLogger().warn(`Stopped reading legacy chunk entities: ${reason}`);
                break;
            }
        }

        return entities;
    }

    private readActorNbt(value: Buffer): NBTTagCompound {
        const reader = new NBTReader(new BinaryStream(value), ByteOrder.LITTLE_ENDIAN);
        reader.setUseVarint(false);
        return reader.parse();
    }

    /**
     * Writes this chunk's persistent actors and gives duplicate identities fresh, stable IDs.
     *
     * The first world entity with an existing ID keeps it. Later entities with that ID receive a
     * new ID that is absent from both the loaded world and the database, and the new value is
     * stored on the entity so later saves keep using it. An unreadable digest is rebuilt from the
     * actors currently in the world.
     */
    private writeEntities(
        database: Database,
        batch: WriteBatch,
        chunk: Chunk,
        key: (tag: ChunkTag, subChunk?: number) => Buffer
    ): void {
        const dimension = chunk.getDimension();
        const digestKey = encodeDigestKey(chunk.getX(), chunk.getZ(), dimension.bedrockId);
        const existingDigest = database.get(digestKey);
        let previousActorIds: Buffer[] = [];
        if (existingDigest !== null) {
            try {
                previousActorIds = decodeDigest(existingDigest);
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                this.getServer()
                    .getLogger()
                    .warn(`Rebuilding invalid actor digest for chunk ${chunk.getX()},${chunk.getZ()}: ${reason}`);
            }
        }

        const worldEntities = this.getWorld()
            .getEntities()
            .filter((entity) => !(entity instanceof Player) && entity.shouldPersist());
        const entities = worldEntities.filter((entity) => this.belongsToChunk(entity, chunk));
        const firstEntityByActorId = new Map<string, Entity>();
        for (const entity of worldEntities) {
            const persistentNbt = entity.persistentNbt;
            if (!persistentNbt?.has('UniqueID')) continue;

            const actorIdHex = actorIdBytes(persistentNbt.getLong('UniqueID', 0n)).toString('hex');
            if (!firstEntityByActorId.has(actorIdHex)) firstEntityByActorId.set(actorIdHex, entity);
        }

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

            let actorId = actorIdBytes(nbt.getLong('UniqueID', 0n));
            let actorIdHex = actorId.toString('hex');
            if (
                (firstEntityByActorId.has(actorIdHex) && firstEntityByActorId.get(actorIdHex) !== entity) ||
                actorIdsInChunk.has(actorIdHex)
            ) {
                const duplicateActorIdHex = actorIdHex;
                const uniqueId = this.generateActorId(database, usedActorIds);
                nbt.addValue('UniqueID', new Types.LongVal(uniqueId));
                entity.persistentNbt = nbt;
                actorId = actorIdBytes(uniqueId);
                actorIdHex = actorId.toString('hex');
                this.getServer()
                    .getLogger()
                    .warn(
                        `Reassigned duplicate actor id ${duplicateActorIdHex} to ${actorIdHex} in chunk ${chunk.getX()},${chunk.getZ()}`
                    );
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
        root.addValue('JSPrismarineSpawnKnown', new Types.ByteVal(0));

        return root;
    }

    /** Writes the level metadata back, called when the world saves. */
    public override saveLevelData(spawn: { x: number; y: number; z: number }): void {
        this.saveSpawnInLevelDat(spawn);
    }

    private saveSpawnInLevelDat(spawn: { x: number; y: number; z: number }): void {
        const existing = readLevelDat(this.getPath());
        const root = existing?.root ?? this.buildLevelDat(this.getWorld().getName());

        root.addValue('SpawnX', new Types.NumberVal(Math.trunc(spawn.x)));
        root.addValue('SpawnY', new Types.NumberVal(Math.trunc(spawn.y)));
        root.addValue('SpawnZ', new Types.NumberVal(Math.trunc(spawn.z)));
        root.addValue('JSPrismarineSpawnKnown', new Types.ByteVal(1));

        writeLevelDat(this.getPath(), { storageVersion: LEVEL_DAT_STORAGE_VERSION, root });
    }

    /** Every chunk coordinate the database holds, for tools that want to walk a whole world. */
    public *listChunks(): IterableIterator<{ x: number; z: number }> {
        const seen = new Set<string>();

        for (const key of this.requireDatabase().keys()) {
            const pending = decodePendingEntityKey(key, this.dimension().bedrockId);
            const decoded = pending ?? decodeChunkKey(key);
            if (decoded === null || decoded.dimension !== this.dimension().bedrockId) continue;

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
            encodeChunkKey({ x: cx, z: cz, dimension: dimension.bedrockId, tag: ChunkTag.Data3D })
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

const pendingEntityKey = (x: number, z: number, dimension: number): Buffer => {
    const coordinates = Buffer.allocUnsafe(12);
    coordinates.writeInt32LE(x, 0);
    coordinates.writeInt32LE(z, 4);
    coordinates.writeInt32LE(dimension, 8);
    return Buffer.concat([PENDING_ENTITY_PREFIX, coordinates]);
};

const decodePendingEntityKey = (key: Buffer, dimension: number): { x: number; z: number; dimension: number } | null => {
    if (key.byteLength !== PENDING_ENTITY_PREFIX.byteLength + 12) return null;
    if (!key.subarray(0, PENDING_ENTITY_PREFIX.byteLength).equals(PENDING_ENTITY_PREFIX)) return null;

    const offset = PENDING_ENTITY_PREFIX.byteLength;
    const storedDimension = key.readInt32LE(offset + 8);
    if (storedDimension !== dimension) return null;

    return {
        x: key.readInt32LE(offset),
        z: key.readInt32LE(offset + 4),
        dimension: storedDimension
    };
};

const legacyEntityIdentity = (entity: LegacyWorldEntity): string => {
    const { x, y, z } = entity.position;
    return `${entity.type}|${Math.fround(x)},${Math.fround(y)},${Math.fround(z)}`;
};

const entityIdentity = (entity: NBTTagCompound): string | undefined => {
    const type = entity.getString('identifier', '');
    const position = [...(entity.getList('Pos', false) ?? [])].map((value) => Number(value.getValue()));
    if (type.length === 0 || position.length !== 3 || !position.every(Number.isFinite)) return undefined;

    return `${type}|${position.map(Math.fround).join(',')}`;
};
