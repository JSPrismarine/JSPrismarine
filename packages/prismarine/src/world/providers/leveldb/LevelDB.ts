import fs from 'node:fs';
import path from 'node:path';

import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTReader, NBTTagCompound, NBTWriter, Types } from '@jsprismarine/nbt';
import { Database, WriteBatch } from '@jsprismarine/leveldb';

import { BlockEntityRegistry } from '../../../blockentity/BlockEntityRegistry';
import { ChunkTag, decodeChunkKey, encodeChunkKey } from './LevelDBKeys';
import { LEVEL_DAT_STORAGE_VERSION, readLevelDat, readLevelName, writeLevelDat, writeLevelName } from './LevelDat';
import { decodeData3D, encodeData3D, uniformData3D } from './BiomeCodec';
import { decodeSubChunk, encodeSubChunk } from './SubChunkCodec';
import { maxSubChunk, minSubChunk } from '../../Dimension';
import BaseProvider from '../BaseProvider';
import Chunk from '../../chunk/Chunk';
import type { BlockEntity } from '../../../blockentity/BlockEntity';
import type { DimensionDefinition } from '../../Dimension';
import type { Generator } from '../../Generator';
import type Server from '../../../Server';

/** The `Version` byte 1.21 writes. Older values make the game run its upgrade passes. */
export const CHUNK_VERSION = 41;

/** `FinalizedState`: 0 needs instaticking, 1 needs population, 2 is done. */
const FINALIZED_DONE = 2;

const DATABASE_DIRECTORY = 'db';

/**
 * Stores a world the way Minecraft: Bedrock Edition does - a `db` directory of LevelDB files, a
 * `level.dat` and a `levelname.txt` beside it - so a world written here opens in the game and a
 * world made in the game opens here.
 */
export default class LevelDB extends BaseProvider {
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

    // ------------------------------------------------------------------ chunks

    public async readChunk(cx: number, cz: number, seed: number, generator: Generator, config?: any): Promise<Chunk> {
        const database = this.requireDatabase();
        const dimension = this.dimension();
        const key = (tag: ChunkTag, subChunk?: number) =>
            encodeChunkKey({ x: cx, z: cz, dimension: dimension.id, tag, subChunk });

        // No version record means the chunk was never generated. Anything else - a version we do
        // not recognise included - is a chunk that exists and must not be overwritten by a fresh
        // one, so it is read as best we can.
        if (database.get(key(ChunkTag.Version)) === null && database.get(key(ChunkTag.LegacyVersion)) === null) {
            return generator.generateChunk(cx, cz, seed, config);
        }

        const subChunks = new Map<number, ReturnType<typeof decodeSubChunk>['subChunk']>();
        for (let index = minSubChunk(dimension); index <= maxSubChunk(dimension); index++) {
            const value = database.get(key(ChunkTag.SubChunkPrefix, index));
            if (value === null) continue;

            const { subChunk } = decodeSubChunk(value);
            subChunks.set(index, subChunk);
        }

        const chunk = new Chunk(cx, cz, subChunks, dimension);

        for (const blockEntity of this.readBlockEntities(database.get(key(ChunkTag.BlockEntity)))) {
            chunk.setBlockEntity(blockEntity);
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

        // TODO: carry the biomes the generator chose, once it chooses any.
        const existingBiomes = database.get(key(ChunkTag.Data3D));
        batch.put(key(ChunkTag.Data3D), existingBiomes ?? encodeData3D(uniformData3D(1, dimension), dimension));

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
                this.getServer()
                    .getLogger()
                    .warn(`Stopped reading block entities: ${(error as Error).message}`);
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
        root.addValue('RandomSeed', new Types.LongVal(BigInt(Math.trunc(world.getSeed()))));
        root.addValue('StorageVersion', new Types.NumberVal(LEVEL_DAT_STORAGE_VERSION));
        root.addValue('lastOpenedWithVersion', versionList());

        const dimension = this.dimension();
        root.addValue('SpawnX', new Types.NumberVal(0));
        root.addValue('SpawnY', new Types.NumberVal(dimension.minY + 100));
        root.addValue('SpawnZ', new Types.NumberVal(0));

        return root;
    }

    /** Writes the level metadata back, called when the world saves. */
    public saveLevelData(spawn: { x: number; y: number; z: number }): void {
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

const versionList = (): Set<Types.NumberVal> => new Set([1, 21, 40, 0, 0].map((part) => new Types.NumberVal(part)));
