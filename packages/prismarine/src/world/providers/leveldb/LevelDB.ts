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
import { PLAYER_DATA_FOLDER } from '../../WorldPaths';
import {
    ChunkTag,
    decodeChunkKey,
    decodeDigest,
    decodePendingEntityKey,
    encodeActorKey,
    encodeChunkKey,
    encodeDigest,
    encodeDigestKey,
    encodePendingEntityKey,
    encodePlayerServerKey
} from './LevelDBKeys';
import {
    LEVEL_DAT_STORAGE_VERSION,
    LEVEL_DAT_BACKUP_FILE_NAME,
    LEVEL_DAT_FILE_NAME,
    LEVEL_NAME_FILE_NAME,
    decodeLevelDat,
    flatWorldLayersOf,
    levelDatGeneratorOf,
    readLevelDat,
    readLevelName,
    writeLevelDat,
    writeLevelName
} from './LevelDat';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';
import { decodeData3D, encodeData3D } from './BiomeCodec';
import { playerDataFromNbt, playerDataToNbt } from './PlayerCodec';
import { decodeSubChunk, encodeSubChunk, writableSubChunkVersion } from './SubChunkCodec';
import { OverlayBatch } from './OverlayBatch';
import { Dimensions } from '../../DimensionType';
import { maxSubChunk, minSubChunk } from '../../Dimension';
import BaseProvider from '../BaseProvider';
import type { SaveIdentity } from '../BaseProvider';
import type { Level } from '../../Level';
import Chunk from '../../chunk/Chunk';
import type { ChunkPersistedState, ChunkSaveCutHook } from '../../chunk/Chunk';
import type { ReadonlySubChunk } from '../../chunk/SubChunk';
import type { ProviderSavePass } from '../SavePass';
import { ChunkBiomes } from '../../chunk/ChunkBiomes';
import type { BlockEntity } from '../../../blockentity/BlockEntity';
import type { DimensionType } from '../../DimensionType';
import type { ChunkRequestOptions, Generator } from '../../Generator';
import type Server from '../../../Server';
import type { LegacyWorldEntity, WorldPersistenceData } from '../../WorldPersistence';
import type { LevelDatInputs } from '../Provider';
import type { ChunkSaveContext } from '../ChunkSaveContext';
import { createChunkSaveContext } from '../ChunkSaveContext';
import {
    isFlatGenerator,
    parseWorldPersistenceData,
    worldPersistenceDataOf,
    worldPersistenceJsonOf
} from '../../WorldPersistence';

/** The `Version` byte written since 1.21.120. Older values make the game run upgrade passes. */
export const CHUNK_VERSION = 42;

/** `FinalizedState`: 0 needs instaticking, 1 needs population, 2 is done. */
const FINALIZED_DONE = 2;

/**
 * The `SpawnY` a fresh `level.dat` carries before the world has found its spawn. The world spawn
 * is always in the Overworld, so the Overworld's floor is the one it stands on.
 */
const DEFAULT_SPAWN_Y = Dimensions.Overworld.minY + 100;

/** Java's Nether `coordinate_scale`, which is also the game's `NetherScale` default. */
const DEFAULT_NETHER_SCALE = Dimensions.Nether.java.coordinateScale;

const DATABASE_DIRECTORY = 'db';
const WORLD_DATA_KEY = Buffer.from('jsprismarine:world_data', 'ascii');
const REPLAY_SNAPSHOT_FORMAT = 'jsprismarine-leveldb-replay-snapshot';
const REPLAY_SNAPSHOT_VERSION = 1;
const REPLAY_SNAPSHOT_FILES = [LEVEL_DAT_FILE_NAME, LEVEL_DAT_BACKUP_FILE_NAME, LEVEL_NAME_FILE_NAME] as const;

interface LevelDBReplaySnapshot {
    readonly format: typeof REPLAY_SNAPSHOT_FORMAT;
    readonly version: typeof REPLAY_SNAPSHOT_VERSION;
    readonly entries: readonly (readonly [key: string, value: string])[];
    readonly playerData: readonly (readonly [name: string, contents: string])[];
    readonly files: {
        readonly 'level.dat': string | null;
        readonly 'level.dat_old': string | null;
        readonly 'levelname.txt': string | null;
    };
}

const recordOf = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isCanonicalBase64 = (value: unknown): value is string =>
    typeof value === 'string' && Buffer.from(value, 'base64').toString('base64') === value;

const decodeReplaySnapshot = (bytes: Uint8Array): LevelDBReplaySnapshot => {
    let value: unknown;
    try {
        value = JSON.parse(Buffer.from(bytes).toString('utf8'));
    } catch {
        throw new TypeError('Invalid LevelDB replay snapshot JSON');
    }

    if (
        !recordOf(value) ||
        value['format'] !== REPLAY_SNAPSHOT_FORMAT ||
        value['version'] !== REPLAY_SNAPSHOT_VERSION ||
        !Array.isArray(value['entries']) ||
        !Array.isArray(value['playerData']) ||
        !recordOf(value['files'])
    ) {
        throw new TypeError('Unsupported or invalid LevelDB replay snapshot');
    }

    const entries: [string, string][] = [];
    const seenKeys = new Set<string>();
    for (const entry of value['entries']) {
        if (!Array.isArray(entry) || entry.length !== 2) {
            throw new TypeError('Invalid LevelDB replay snapshot entry');
        }

        const key = entry[0];
        const item = entry[1];
        if (!isCanonicalBase64(key) || !isCanonicalBase64(item) || seenKeys.has(key)) {
            throw new TypeError('Invalid LevelDB replay snapshot entry');
        }
        seenKeys.add(key);
        entries.push([key, item]);
    }

    const files = value['files'];
    const levelDat = files['level.dat'];
    const levelDatOld = files['level.dat_old'];
    const levelName = files['levelname.txt'];
    if (
        !isCanonicalBase64(levelDat) ||
        !(levelDatOld === null || isCanonicalBase64(levelDatOld)) ||
        !isCanonicalBase64(levelName)
    ) {
        throw new TypeError('Invalid LevelDB replay snapshot files');
    }
    try {
        decodeLevelDat(Buffer.from(levelDat, 'base64'));
    } catch {
        throw new TypeError('Invalid LevelDB replay snapshot level.dat');
    }

    const playerData: [string, string][] = [];
    const seenPlayerFiles = new Set<string>();
    for (const entry of value['playerData']) {
        if (!Array.isArray(entry) || entry.length !== 2) {
            throw new TypeError('Invalid LevelDB replay snapshot player data');
        }

        const name = entry[0];
        const contents = entry[1];
        if (
            typeof name !== 'string' ||
            name.length === 0 ||
            name !== path.basename(name) ||
            name.includes('/') ||
            name.includes('\\') ||
            !name.endsWith('.json') ||
            !isCanonicalBase64(contents) ||
            seenPlayerFiles.has(name)
        ) {
            throw new TypeError('Invalid LevelDB replay snapshot player data');
        }
        seenPlayerFiles.add(name);
        playerData.push([name, contents]);
    }

    return {
        format: REPLAY_SNAPSHOT_FORMAT,
        version: REPLAY_SNAPSHOT_VERSION,
        entries,
        playerData,
        files: { 'level.dat': levelDat, 'level.dat_old': levelDatOld, 'levelname.txt': levelName }
    };
};

/**
 * Whether the save's owner is a whole `Level`, which knows its dimension types, rather than the
 * name and seed `WorldManager` attaches to read a save before its level exists.
 */
const knowsDimensionTypes = (level: SaveIdentity): level is SaveIdentity & Pick<Level, 'getDimensionTypes'> =>
    'getDimensionTypes' in level;

interface PendingLegacyEntity extends LegacyWorldEntity {
    uniqueId: string;
}

/**
 * Stores a world the way Minecraft: Bedrock Edition does - a `db` directory of LevelDB files, a
 * `level.dat` and a `levelname.txt` beside it - so a world written here opens in the game and a
 * world made in the game opens here.
 *
 * One instance serves one save folder and every dimension in it: a chunk's keys carry the
 * dimension the caller names, while the player records and `level.dat` are shared by the save.
 */
export default class LevelDB extends BaseProvider {
    public readonly supportsChunkUnload = true;

    private database: Database | null = null;
    private chunkWriteBatchBytes = 0;
    /** Whether a write made outside a save pass waits for the next pass; see {@link LevelDB.holdOutsideWrites}. */
    private holding = false;
    /** Writes made outside a pass that no pass has taken yet. */
    private held = new OverlayBatch();
    /** Each pass's batch from its start until the database has applied it, oldest first. */
    private readonly unapplied: OverlayBatch[] = [];
    /** The cuts of each chunk whose pass has not yet marked the chunk saved. */
    private readonly unsettled = new Map<Chunk, Set<LevelDBChunkCut>>();

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

    /**
     * Commits whatever is still held, then closes. A level's last pass took everything held
     * before it, so this is what was written after that pass's cut. A commit that fails is
     * logged and tried once more, and the database still closes, so the folder is not left
     * locked.
     */
    public override async disable(): Promise<void> {
        const held = this.held;
        this.held = new OverlayBatch();
        if (this.database !== null && held.count > 0) {
            this.chunkWriteBatchBytes += held.approximateSize;
            // Once more after a failure: the database reports a background flush's failure to
            // the next write and then takes writes again, so the second commit can land. One
            // whose append failed is refused again before anything is applied, so a batch is
            // never applied twice.
            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    await this.database.commit(held.toWriteBatch(), { sync: true });
                    break;
                } catch (error: unknown) {
                    this.getServer()
                        .getLogger()
                        .error(`Failed to commit ${held.count} held writes to ${this.getPath()} (attempt ${attempt})`);
                    this.getServer().getLogger().error(error);
                }
            }
        }
        await this.database?.close();
        this.database = null;
    }

    /**
     * Holds each write made outside a save pass, such as a chunk the unload pass writes or a
     * player's record on disconnect, until the next pass commits it with its own batch
     * (ADR 0018). A crash before that commit loses those writes and the pass's state together,
     * and reopening gives the previous pass whole. Every read here looks at the held writes
     * first, so a chunk or record read back before the commit is the one written.
     *
     * The level's save turns this on, since it is what commits the writes. A provider used on
     * its own has no pass to join and writes each batch when it is made.
     */
    public override holdOutsideWrites(): void {
        this.holding = true;
    }

    /** Bytes held for the next pass, as `WriteBatch.approximateSize` counts them. */
    public override heldWriteBytes(): number {
        return this.held.approximateSize;
    }

    /**
     * The value a read sees for `key`: the held writes first, then each pass's batch that the
     * database has not applied yet, newest first, then the database.
     *
     * A pass's batch is read too, although it is about to land: a write after a cut decides
     * what to put and what to delete from what is stored, and the pass's batch lands before it.
     */
    private read(key: Buffer): Buffer | null {
        const held = this.held.lookup(key);
        if (held !== undefined) return held;
        for (let index = this.unapplied.length - 1; index >= 0; index--) {
            const value = this.unapplied[index]!.lookup(key);
            if (value !== undefined) return value;
        }
        return this.requireDatabase().get(key);
    }

    /** Every write that has not reached the database, oldest first, as one batch. */
    private pendingWrites(): OverlayBatch {
        const pending = new OverlayBatch();
        for (const batch of this.unapplied) pending.append(batch);
        return pending.append(this.held);
    }

    /**
     * Captures LevelDB records, provider metadata, and fallback player records.
     * @throws {Error} When the fallback player-data directory contains unsupported entries.
     */
    public captureReplaySnapshot(): Uint8Array {
        const entries = [...this.entriesNow()].map(
            ([key, value]) => [key.toString('base64'), value.toString('base64')] as const
        );
        const readFile = (name: (typeof REPLAY_SNAPSHOT_FILES)[number]): string | null => {
            const file = path.join(this.getPath(), name);
            return fs.existsSync(file) ? fs.readFileSync(file).toString('base64') : null;
        };
        const playerDataPath = path.join(this.getPath(), PLAYER_DATA_FOLDER);
        const playerData = fs.existsSync(playerDataPath)
            ? fs
                  .readdirSync(playerDataPath, { withFileTypes: true })
                  .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
                  .map((entry) => {
                      if (!entry.isFile() || !entry.name.endsWith('.json')) {
                          throw new Error(`Cannot capture unsupported replay player data entry '${entry.name}'`);
                      }
                      return [
                          entry.name,
                          fs.readFileSync(path.join(playerDataPath, entry.name)).toString('base64')
                      ] as const;
                  })
            : [];

        const snapshot: LevelDBReplaySnapshot = {
            format: REPLAY_SNAPSHOT_FORMAT,
            version: REPLAY_SNAPSHOT_VERSION,
            entries,
            playerData,
            files: {
                'level.dat': readFile('level.dat'),
                'level.dat_old': readFile('level.dat_old'),
                'levelname.txt': readFile('levelname.txt')
            }
        };
        return Buffer.from(JSON.stringify(snapshot), 'utf8');
    }

    /**
     * Replaces this world's persisted records and metadata before LevelDB opens them.
     *
     * The database records are replaced in one LevelDB write batch. Bedrock stores level
     * metadata and fallback player records beside that database, so restoring those files cannot
     * join the same transaction. A filesystem error after the batch commits can leave the target
     * partly restored; discard that target instead of opening it.
     *
     * @param bytes - A snapshot returned by {@link LevelDB.captureReplaySnapshot}.
     * @throws {TypeError} When the bytes do not contain a supported LevelDB snapshot.
     * @throws {Error} When this provider is enabled, its player-data path is invalid, or a file write fails.
     */
    public async restoreReplaySnapshot(bytes: Uint8Array): Promise<void> {
        if (this.database !== null)
            throw new Error('Cannot restore a replay snapshot while the LevelDB provider is enabled');

        const snapshot = decodeReplaySnapshot(bytes);
        const playerDataPath = path.join(this.getPath(), PLAYER_DATA_FOLDER);
        if (fs.existsSync(playerDataPath)) {
            const playerDataStats = fs.lstatSync(playerDataPath);
            if (playerDataStats.isSymbolicLink() || !playerDataStats.isDirectory()) {
                throw new Error('Cannot restore replay player data into a non-directory path');
            }
        }

        const database = await Database.open(path.join(this.getPath(), DATABASE_DIRECTORY));
        try {
            const batch = new WriteBatch();
            for (const key of database.keys()) batch.del(key);
            for (const [key, value] of snapshot.entries) {
                batch.put(Buffer.from(key, 'base64'), Buffer.from(value, 'base64'));
            }
            database.write(batch);
        } finally {
            await database.close();
        }

        for (const [name, encoded] of REPLAY_SNAPSHOT_FILES.map((file) => [file, snapshot.files[file]] as const)) {
            const file = path.join(this.getPath(), name);
            if (encoded === null) {
                fs.rmSync(file, { force: true });
                continue;
            }

            const temporary = `${file}.replay-restore.${randomBytes(8).toString('hex')}.tmp`;
            fs.writeFileSync(temporary, Buffer.from(encoded, 'base64'), { flag: 'wx' });
            fs.rmSync(file, { force: true });
            fs.renameSync(temporary, file);
        }

        if (fs.existsSync(playerDataPath)) {
            for (const entry of fs.readdirSync(playerDataPath, { withFileTypes: true })) {
                if (entry.name.endsWith('.json')) {
                    fs.rmSync(path.join(playerDataPath, entry.name), { force: true, recursive: true });
                }
            }
        }
        if (snapshot.playerData.length > 0) fs.mkdirSync(playerDataPath, { recursive: true });
        for (const [name, contents] of snapshot.playerData) {
            fs.writeFileSync(path.join(playerDataPath, name), Buffer.from(contents, 'base64'));
        }
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

    /**
     * Writes a batch that is not a save pass's and is not held, such as the legacy migration or
     * any write of a provider used on its own: before returning when no commit is appending, and
     * behind the commit otherwise.
     *
     * Not always through `commit`, although that would be simpler. A chunk the unload pass
     * writes or a player record is a few kilobytes, which the thread pool's round trip costs more
     * than it saves, and appended at once it is on disk before the event loop turns, so an
     * unloading chunk is ready to leave at the next input step as it always was. A save pass's
     * batch can be megabytes, and goes through `commit` whatever this does.
     */
    private async writeSmall(batch: WriteBatch): Promise<void> {
        const database = this.requireDatabase();
        if (database.appending) await database.commit(batch);
        else database.write(batch);
    }

    /**
     * Writes a batch made outside a save pass: held for the next pass when the level's save
     * holds them, and written now otherwise.
     */
    private async writeOutsidePass(batch: OverlayBatch): Promise<void> {
        if (batch.count === 0) return;
        if (this.holding) {
            this.held.append(batch);
            return;
        }
        await this.writeSmall(batch.toWriteBatch());
    }

    /**
     * Every key and value a read sees, in key order: the database's with each pending write
     * over it.
     */
    private *entriesNow(): IterableIterator<[Buffer, Buffer]> {
        const pending = this.pendingWrites();
        if (pending.count === 0) {
            yield* this.requireDatabase().entries();
            return;
        }

        const entries = new Map<string, [Buffer, Buffer]>();
        for (const [key, value] of this.requireDatabase().entries()) entries.set(key.toString('latin1'), [key, value]);
        for (const { key, value } of pending.entries()) {
            if (value === null) entries.delete(key.toString('latin1'));
            else entries.set(key.toString('latin1'), [key, value]);
        }
        yield* [...entries.values()].sort(([left], [right]) => Buffer.compare(left, right));
    }

    private requireDatabase(): Database {
        if (!this.database) throw new Error('The world provider is not enabled');

        return this.database;
    }

    /** Approximate logical bytes passed to `Database.write` by chunk save batches. */
    public getChunkWriteBatchBytes(): number {
        return this.chunkWriteBatchBytes;
    }

    /** Reads world state from the provider record, or from `level.dat` on an imported world. */
    public override async readWorldData(): Promise<WorldPersistenceData | null> {
        return this.readWorldDataNow();
    }

    /** {@link LevelDB.readWorldData}, which reads nothing it has to wait for. */
    private readWorldDataNow(): WorldPersistenceData {
        const value = this.read(WORLD_DATA_KEY);
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
        if (
            root.getByte('JSPrismarineSpawnKnown', -1) === -1 &&
            spawn.x === 0 &&
            spawn.z === 0 &&
            spawn.y === DEFAULT_SPAWN_Y
        )
            return {};

        return { spawn };
    }

    /**
     * Stores world metadata in the provider's LevelDB record.
     *
     * `level.dat` is {@link saveLevelData}'s: the spawn lands there too, beside the clock and
     * the generator, when the world saves its level data. Held for the next pass while the
     * level's save holds writes; see {@link LevelDB.holdOutsideWrites}.
     */
    public override async writeWorldData(data: WorldPersistenceData): Promise<void> {
        await this.writeOutsidePass(new OverlayBatch().put(WORLD_DATA_KEY, this.levelRecordOf(data)));
    }

    /** The provider record's value for some world metadata, of which it keeps the fields below. */
    private levelRecordOf(data: WorldPersistenceData): Buffer {
        const metadata: WorldPersistenceData = {
            ...(data.spawn === undefined ? {} : { spawn: data.spawn }),
            ...(data.gameRules === undefined ? {} : { gameRules: data.gameRules }),
            ...(data.weather === undefined ? {} : { weather: data.weather }),
            ...(data.worldGenSettings === undefined ? {} : { worldGenSettings: data.worldGenSettings }),
            ...(data.dragonFight === undefined ? {} : { dragonFight: data.dragonFight })
        };
        const root = new NBTTagCompound('');
        root.addValue('Data', new Types.StringVal(JSON.stringify(worldPersistenceJsonOf(metadata))));
        return this.writeActorNbt(root);
    }

    /**
     * Moves legacy world metadata and actor snapshots into LevelDB before the sidecar is removed.
     *
     * Written at once even while writes are held: the level removes `level.json` once this
     * returns, so a held copy that a crash lost would be the only one. The level migrates when
     * it opens, before anything else writes, so nothing held can land on top of it.
     */
    public override async migrateLegacyWorldData(data: WorldPersistenceData): Promise<void> {
        const providerDataExists = this.read(WORLD_DATA_KEY) !== null;
        const stored = (await this.readWorldData()) ?? {};

        await this.migrateLegacyEntities(data.entities ?? []);

        const merged = providerDataExists ? { ...data, ...stored } : { ...stored, ...data };
        await this.writeSmall(new WriteBatch().put(WORLD_DATA_KEY, this.levelRecordOf(merged)));
    }

    // --------------------------------------------------------------- player data

    /** Reads the stored data for a player, or null when the LevelDB has no record for them. */
    public async readPlayerData(identifier: string): Promise<Partial<WorldPlayerData> | null> {
        const value = this.read(encodePlayerServerKey(identifier));
        return value === null ? null : this.readPlayerNbt(value);
    }

    /**
     * Writes the player's persistent state as Bedrock NBT under its server-side player key.
     * Held for the next pass while the level's save holds writes; see
     * {@link LevelDB.holdOutsideWrites}.
     */
    public async writePlayerData(identifier: string, data: WorldPlayerData): Promise<void> {
        const batch = new OverlayBatch();
        batch.put(encodePlayerServerKey(identifier), this.writeActorNbt(playerDataToNbt(data, this.knownDimensions())));
        await this.writeOutsidePass(batch);
    }

    private readPlayerNbt(value: Buffer): WorldPlayerData {
        return playerDataFromNbt(this.readActorNbt(value), this.knownDimensions());
    }

    /** The level's dimension types, which give a custom dimension its integer in a player record. */
    private knownDimensions(): Iterable<DimensionType> {
        const level = this.getLevel();
        return level !== undefined && knowsDimensionTypes(level) ? level.getDimensionTypes().values() : [];
    }

    // ------------------------------------------------------------------ chunks

    public async readChunk(
        dimension: DimensionType,
        cx: number,
        cz: number,
        seed: bigint,
        generator: Generator,
        config?: WorldConfig,
        options?: ChunkRequestOptions
    ): Promise<Chunk> {
        const key = (tag: ChunkTag, subChunk?: number) =>
            encodeChunkKey({ x: cx, z: cz, dimension: dimension.bedrockId, tag, subChunk });
        const pendingEntitiesKey = encodePendingEntityKey(cx, cz, dimension.bedrockId);

        // No version record means the chunk was never generated. Anything else - a version we do
        // not recognize included - is a chunk that exists and must not be overwritten by a fresh
        // one, so it is read as best we can.
        if (this.read(key(ChunkTag.Version)) === null && this.read(key(ChunkTag.LegacyVersion)) === null) {
            const chunk = await generator.generateChunk(cx, cz, seed, config, options);
            if (this.readPendingEntities(this.read(pendingEntitiesKey), chunk)) chunk.markChanged();
            return chunk;
        }

        const subChunks = new Map<number, ReturnType<typeof decodeSubChunk>['subChunk']>();
        const persistedSubChunkKeys = new Set<number>();
        for (let index = minSubChunk(dimension); index <= maxSubChunk(dimension); index++) {
            const value = this.read(key(ChunkTag.SubChunkPrefix, index));
            if (value === null) continue;

            const { subChunk } = decodeSubChunk(value);
            subChunks.set(index, subChunk);
            persistedSubChunkKeys.add(index);
        }

        const chunk = new Chunk(cx, cz, subChunks, dimension);

        const biomes = this.read(key(ChunkTag.Data3D));
        if (biomes !== null) {
            chunk.setBiomes(ChunkBiomes.fromSectionIds(decodeData3D(biomes, dimension).palettes, dimension));
        }

        const blockEntityRecord = this.read(key(ChunkTag.BlockEntity));
        for (const blockEntity of this.readBlockEntities(blockEntityRecord)) {
            chunk.setBlockEntity(blockEntity);
        }

        const digestKey = encodeDigestKey(cx, cz, dimension.bedrockId);
        const digest = this.read(digestKey);
        let repairActorDigest = false;
        if (digest === null) {
            this.readLegacyEntities(this.read(key(ChunkTag.Entity)), chunk);
        } else {
            repairActorDigest = this.readActorDigest(digest, chunk);
        }
        const hasPendingEntities = this.readPendingEntities(this.read(pendingEntitiesKey), chunk);

        // Loaded, not changed: a chunk read from disk and never touched must not be written back.
        chunk.markLoadedFromDisk(persistedSubChunkKeys, blockEntityRecord !== null);
        if (repairActorDigest || hasPendingEntities) chunk.markChanged();
        return chunk;
    }

    /**
     * Writes one chunk as it is now, in a batch of its own, or holds it for the next pass while
     * the level's save holds writes; see {@link LevelDB.holdOutsideWrites}.
     *
     * A save pass of one chunk, cut and committed at once; see {@link LevelDB.beginSavePass}.
     */
    public async writeChunk(chunk: Chunk, saveContext?: ChunkSaveContext): Promise<void> {
        const dimension = chunk.getDimension();
        const context =
            saveContext?.dimensionId === dimension.bedrockId ? saveContext : this.createSaveContext(dimension);
        const pass = this.savePass(async (batch) => {
            if (!this.holding) this.chunkWriteBatchBytes += batch.approximateSize;
            await this.writeOutsidePass(batch);
        }, new OverlayBatch());
        pass.cutChunk(chunk, context);
        await pass.commit({ sync: false });
    }

    /**
     * Starts a save pass whose writes go to the database as one batch (ADR 0018).
     *
     * A chunk's actor records, digest, block entities and the deletions it needs are encoded when
     * it is cut. Its changed sub chunks and its `Data3D` are encoded later, by
     * {@link ProviderSavePass.encode}, or first when a write is about to reach them, so a write
     * after the cut costs at most one sub chunk and the height and biome record.
     *
     * The pass takes every write held so far and commits it ahead of its own, in the same batch.
     * A write made after this call is held for the pass after it.
     */
    public beginSavePass(): ProviderSavePass {
        const preamble = this.held;
        this.held = new OverlayBatch();
        return this.savePass(async (batch, sync) => {
            this.chunkWriteBatchBytes += batch.approximateSize;
            await this.requireDatabase().commit(batch.toWriteBatch(), { sync });
        }, preamble);
    }

    /**
     * A save pass whose batch `write` puts into the database.
     * @param preamble - The held writes the pass carries ahead of its own. They go back to the
     *   front of the held writes if the pass is abandoned, since nothing else would write them.
     */
    private savePass(
        write: (batch: OverlayBatch, sync: boolean) => Promise<void>,
        preamble: OverlayBatch
    ): ProviderSavePass {
        const batch = new OverlayBatch().append(preamble);
        const heldWrites = preamble.count;
        this.unapplied.push(batch);
        const applied = () => {
            const index = this.unapplied.indexOf(batch);
            if (index >= 0) this.unapplied.splice(index, 1);
        };
        let committed = false;
        let returned = false;
        const cuts: LevelDBChunkCut[] = [];
        const counts = { subChunkEncodes: 0, forcedSubChunkEncodes: 0, bypassedWrites: 0 };
        let pending = 0;
        let open = true;
        const encoded = (forced: boolean) => {
            pending--;
            counts.subChunkEncodes++;
            if (forced) counts.forcedSubChunkEncodes++;
        };
        const bypassed = (chunk: Chunk, part: number | 'biomes') => {
            counts.bypassedWrites++;
            const what = part === 'biomes' ? 'The biomes' : `Sub chunk ${part}`;
            this.getServer()
                .getLogger()
                .error(
                    `${what} of chunk ${chunk.getX()},${chunk.getZ()} changed after the save cut without telling it; the save holds the later content`
                );
        };

        const letGo = () => {
            open = false;
            for (const cut of cuts) cut.chunk.setSaveCut(null);
        };
        const settle = () => {
            for (const cut of cuts) {
                const cutsOfChunk = this.unsettled.get(cut.chunk);
                cutsOfChunk?.delete(cut);
                if (cutsOfChunk?.size === 0) this.unsettled.delete(cut.chunk);
            }
        };

        return {
            cutChunk: (chunk, context) => {
                if (!open) throw new Error('This save pass has already committed');
                const cut = this.cutChunk(batch, chunk, context, { encoded, bypassed });
                pending += cut.pending;
                cuts.push(cut);
                const cutsOfChunk = this.unsettled.get(chunk) ?? new Set();
                this.unsettled.set(chunk, cutsOfChunk.add(cut));
            },
            putPlayer: (key, record) => {
                const playerKey = encodePlayerServerKey(key);
                const value = this.writeActorNbt(playerDataToNbt(record, this.knownDimensions()));
                if (!this.read(playerKey)?.equals(value)) batch.put(playerKey, value);
                return true;
            },
            putLevelRecord: (data) => {
                const value = this.levelRecordOf({ ...this.readWorldDataNow(), ...data });
                if (!this.read(WORLD_DATA_KEY)?.equals(value)) batch.put(WORLD_DATA_KEY, value);
            },
            get pendingEncodes() {
                return pending;
            },
            encode: (budget) => {
                let done = 0;
                for (const cut of cuts) {
                    if (done >= budget) break;
                    done += cut.encodeNext(budget - done);
                }
                return done;
            },
            commit: async ({ sync }) => {
                for (const cut of cuts) cut.encodeNext(Number.POSITIVE_INFINITY);
                letGo();
                // The database applies a commit before its first await, so a read after this
                // finds the batch there; it leaves the reads' layers in the same turn.
                const landed = batch.count > 0 ? write(batch, sync) : undefined;
                applied();
                await landed;
                committed = true;
                for (const cut of cuts) cut.chunk.markSavedAs(cut.state);
                settle();
            },
            abandon: () => {
                letGo();
                applied();
                settle();
                // The held writes the pass took go back ahead of those held since, for the next
                // pass: nothing else would write them. A commit that failed returns them too,
                // since either the database never applied the batch or it refuses every later
                // write anyway.
                if (committed || returned) return;
                returned = true;
                this.held = preamble.append(this.held);
            },
            get stats() {
                return { keys: batch.count, bytes: batch.approximateSize, heldWrites, ...counts };
            }
        };
    }

    /** Encodes what a chunk's cut writes at once into the batch, and holds back its sub chunks. */
    private cutChunk(
        batch: OverlayBatch,
        chunk: Chunk,
        context: ChunkSaveContext,
        report: ChunkCutReport
    ): LevelDBChunkCut {
        // A pass still holding part of this chunk encodes it first. This cut takes the chunk's
        // hook, after which a write would no longer tell the older pass, and it reads what the
        // older pass's batch holds to decide what to delete.
        chunk.finishSaveCut();
        const dimension = chunk.getDimension();
        const key = (tag: ChunkTag, subChunk?: number) =>
            encodeChunkKey({ x: chunk.getX(), z: chunk.getZ(), dimension: dimension.bedrockId, tag, subChunk });
        const state = chunk.persistedStateNow();
        const changes = chunk.getPersistenceChanges();
        const held = new Map<number, { subChunk: ReadonlySubChunk; revision: number }>();

        for (const { index, subChunk, stored } of changes.subChunks) {
            if (!stored || subChunk === null) {
                // Only loaded or previously written keys need tombstones; absent air slices have no value to remove.
                if (this.read(key(ChunkTag.SubChunkPrefix, index)) !== null) {
                    batch.del(key(ChunkTag.SubChunkPrefix, index));
                }
                continue;
            }

            held.set(index, { subChunk, revision: subChunk.getRevision() });
        }

        // A pass that cut this chunk and has not marked it saved yet may put a section the last
        // save did not hold, and its batch lands before this one. The change list compares with
        // the last save, so a section emptied since that pass's cut is not on it, and would
        // otherwise outlive this write.
        let emptied = false;
        for (const earlier of this.unsettled.get(chunk) ?? []) {
            for (const index of earlier.subChunkPuts) {
                const subChunkKey = key(ChunkTag.SubChunkPrefix, index);
                if (state.subChunkKeys.has(index) || this.read(subChunkKey) === null) continue;
                batch.del(subChunkKey);
                emptied = true;
            }
        }

        const versionKey = key(ChunkTag.Version);
        const version = Buffer.from([CHUNK_VERSION]);
        if (!this.read(versionKey)?.equals(version)) batch.put(versionKey, version);

        const finalized = Buffer.allocUnsafe(4);
        finalized.writeInt32LE(FINALIZED_DONE);
        const finalizedKey = key(ChunkTag.FinalizedState);
        if (!this.read(finalizedKey)?.equals(finalized)) batch.put(finalizedKey, finalized);
        const pendingEntitiesKey = encodePendingEntityKey(chunk.getX(), chunk.getZ(), dimension.bedrockId);
        if (this.read(pendingEntitiesKey) !== null) batch.del(pendingEntitiesKey);

        if (changes.blockEntities) {
            const blockEntities = this.writeBlockEntities(chunk.getBlockEntities());
            const blockEntitiesKey = key(ChunkTag.BlockEntity);
            if (blockEntities === null) {
                if (this.read(blockEntitiesKey) !== null) batch.del(blockEntitiesKey);
            } else {
                batch.put(blockEntitiesKey, blockEntities);
            }
        }

        this.writeEntities(batch, chunk, key, context);

        // An emptied section moves the heightmap `Data3D` carries.
        const data3D = changes.data3D || emptied;
        const cut = new LevelDBChunkCut(chunk, state, held, data3D, report, {
            subChunk: (index, subChunk) =>
                batch.put(
                    key(ChunkTag.SubChunkPrefix, index),
                    encodeSubChunk(subChunk, index, writableSubChunkVersion(subChunk))
                ),
            data3D: () =>
                batch.put(
                    key(ChunkTag.Data3D),
                    encodeData3D(
                        { heightmap: chunk.heightmap(), palettes: chunk.getBiomes().toSectionIds() },
                        dimension
                    )
                )
        });
        if (cut.pending > 0 || data3D) chunk.setSaveCut(cut);
        return cut;
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

            const value = this.read(encodeActorKey(actorId));
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

    /**
     * Queues the actor snapshots of a `level.json` for the chunks they stood in.
     *
     * The file belonged to a server that loaded one world, the Overworld, so that is where its
     * actors go.
     */
    private async migrateLegacyEntities(entities: readonly LegacyWorldEntity[]): Promise<void> {
        if (entities.length === 0) return;

        const dimension = Dimensions.Overworld;
        const chunks = new Map<
            string,
            { x: number; z: number; pending: PendingLegacyEntity[]; identities: Set<string> }
        >();
        const usedActorIds = new Set<bigint>();
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
                const identities = this.actorIdentitiesInChunk(cx, cz, dimension.bedrockId);
                const pending = this.readPendingEntityRecords(
                    this.read(encodePendingEntityKey(cx, cz, dimension.bedrockId))
                );
                for (const entity of pending) {
                    identities.add(legacyEntityIdentity(entity));
                    usedActorIds.add(BigInt(entity.uniqueId));
                }
                chunk = { x: cx, z: cz, pending, identities };
                chunks.set(chunkId, chunk);
            }

            const identity = legacyEntityIdentity(entity);
            if (seen.has(identity) || chunk.identities.has(identity)) continue;
            seen.add(identity);

            const uniqueId = this.generateActorId(usedActorIds);
            chunk.pending.push({ ...entity, uniqueId: uniqueId.toString() });
            chunk.identities.add(identity);
        }

        const batch = new WriteBatch();
        let hasUpdates = false;
        for (const { x, z, pending } of chunks.values()) {
            if (pending.length === 0) continue;
            batch.put(encodePendingEntityKey(x, z, dimension.bedrockId), this.writePendingEntityRecords(pending));
            hasUpdates = true;
        }

        if (hasUpdates) await this.writeSmall(batch);
    }

    private actorIdentitiesInChunk(x: number, z: number, dimension: number): Set<string> {
        const identities = new Set<string>();
        const digest = this.read(encodeDigestKey(x, z, dimension));
        if (digest !== null) {
            for (const actorId of decodeDigest(digest)) {
                const actor = this.read(encodeActorKey(actorId));
                if (actor === null) continue;

                const identity = entityIdentity(this.readActorNbt(actor));
                if (identity !== undefined) identities.add(identity);
            }
            return identities;
        }

        const legacy = this.read(encodeChunkKey({ x, z, dimension, tag: ChunkTag.Entity }));
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
        batch: OverlayBatch,
        chunk: Chunk,
        key: (tag: ChunkTag, subChunk?: number) => Buffer,
        saveContext: ChunkSaveContext
    ): void {
        const dimension = chunk.getDimension();
        const digestKey = encodeDigestKey(chunk.getX(), chunk.getZ(), dimension.bedrockId);
        const existingDigest = this.read(digestKey);
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

        const chunkIndex = Chunk.packXZ(chunk.getX(), chunk.getZ());
        const entities = saveContext.persistentEntitiesByChunk.get(chunkIndex) ?? [];
        const firstEntityByActorId = saveContext.firstEntityByActorId;
        const usedActorIds = saveContext.actorIdsInWorld;
        const actorIds: Buffer[] = [];
        const actorIdsInChunk = new Set<bigint>();

        for (const entity of entities) {
            const nbt = EntitySerializer.toNBT(entity);
            if (!nbt.has('UniqueID')) {
                const uniqueId = this.generateActorId(usedActorIds);
                nbt.addValue('UniqueID', new Types.LongVal(uniqueId));
                entity.persistentNbt = nbt;
            }

            let uniqueId = nbt.getLong('UniqueID', 0n);
            if (
                (firstEntityByActorId.has(uniqueId) && firstEntityByActorId.get(uniqueId) !== entity) ||
                actorIdsInChunk.has(uniqueId)
            ) {
                const duplicateActorIdHex = actorIdBytes(uniqueId).toString('hex');
                uniqueId = this.generateActorId(usedActorIds);
                nbt.addValue('UniqueID', new Types.LongVal(uniqueId));
                entity.persistentNbt = nbt;
                const newActorIdHex = actorIdBytes(uniqueId).toString('hex');
                this.getServer()
                    .getLogger()
                    .warn(
                        `Reassigned duplicate actor id ${duplicateActorIdHex} to ${newActorIdHex} in chunk ${chunk.getX()},${chunk.getZ()}`
                    );
            }

            actorIdsInChunk.add(uniqueId);
            const actorId = actorIdBytes(uniqueId);
            actorIds.push(actorId);
            const actorKey = encodeActorKey(actorId);
            const actorValue = this.writeActorNbt(nbt);
            if (!this.read(actorKey)?.equals(actorValue)) batch.put(actorKey, actorValue);
        }

        for (const actorId of previousActorIds) {
            const uniqueId = actorId.readBigInt64LE();
            if (actorIdsInChunk.has(uniqueId) || usedActorIds.has(uniqueId)) continue;

            const actorKey = encodeActorKey(actorId);
            if (this.read(actorKey) !== null) batch.del(actorKey);
        }

        const legacyEntityKey = key(ChunkTag.Entity);
        if (this.read(legacyEntityKey) !== null) batch.del(legacyEntityKey);
        const actorDigestVersionKey = key(ChunkTag.ActorDigestVersion);
        if (actorIds.length === 0) {
            if (existingDigest !== null) batch.del(digestKey);
            if (this.read(actorDigestVersionKey) !== null) batch.del(actorDigestVersionKey);
        } else {
            const digest = encodeDigest(actorIds);
            if (!existingDigest?.equals(digest)) batch.put(digestKey, digest);
            const digestVersion = Buffer.from([0]);
            if (!this.read(actorDigestVersionKey)?.equals(digestVersion)) {
                batch.put(actorDigestVersionKey, digestVersion);
            }
        }
    }

    private createSaveContext(dimension: DimensionType): ChunkSaveContext {
        return createChunkSaveContext(dimension.bedrockId, this.entitiesIn(dimension), (entity) => {
            const position = entity.getPosition();
            return Chunk.packXZ(Math.floor(position.getX() / 16), Math.floor(position.getZ() / 16));
        });
    }

    private generateActorId(usedActorIds: Set<bigint>): bigint {
        for (let attempt = 0; attempt < 32; attempt++) {
            const uniqueId = randomBytes(8).readBigInt64LE(0);
            const actorId = actorIdBytes(uniqueId);
            if (usedActorIds.has(uniqueId) || this.read(encodeActorKey(actorId)) !== null) continue;

            usedActorIds.add(uniqueId);
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
        const name = this.saveName();

        if (readLevelDat(this.getPath()) === null) {
            writeLevelDat(this.getPath(), {
                storageVersion: LEVEL_DAT_STORAGE_VERSION,
                root: this.buildLevelDat(name)
            });
        }

        if (readLevelName(this.getPath()) === null) writeLevelName(this.getPath(), name);
    }

    private buildLevelDat(name: string): NBTTagCompound {
        const root = new NBTTagCompound('');

        root.addValue('LevelName', new Types.StringVal(name));
        root.addValue('RandomSeed', new Types.LongVal(this.saveSeed()));
        root.addValue('StorageVersion', new Types.NumberVal(LEVEL_DAT_STORAGE_VERSION));
        root.addValue('lastOpenedWithVersion', versionList());

        root.addValue('SpawnX', new Types.NumberVal(0));
        root.addValue('SpawnY', new Types.NumberVal(DEFAULT_SPAWN_Y));
        root.addValue('SpawnZ', new Types.NumberVal(0));
        root.addValue('JSPrismarineSpawnKnown', new Types.ByteVal(0));
        root.addValue('Generator', new Types.NumberVal(levelDatGeneratorOf(undefined)));
        root.addValue('NetherScale', new Types.NumberVal(DEFAULT_NETHER_SCALE));
        root.addValue('Time', new Types.LongVal(0n));

        return root;
    }

    /**
     * Writes the level metadata back, called when the world saves.
     *
     * Each input replaces its own tags and leaves the rest of the file alone, so a save that
     * knows no spawn yet keeps the spawn the file already holds. `FlatWorldLayers` is written
     * for a flat Overworld stem and removed for any other, since the game reads it only when
     * `Generator` says flat.
     */
    public override saveLevelData(level: LevelDatInputs): void {
        const existing = readLevelDat(this.getPath());
        const root = existing?.root ?? this.buildLevelDat(this.saveName());

        if (level.spawn !== undefined) {
            root.addValue('SpawnX', new Types.NumberVal(Math.trunc(level.spawn.x)));
            root.addValue('SpawnY', new Types.NumberVal(Math.trunc(level.spawn.y)));
            root.addValue('SpawnZ', new Types.NumberVal(Math.trunc(level.spawn.z)));
            root.addValue('JSPrismarineSpawnKnown', new Types.ByteVal(1));
        }
        if (level.time !== undefined) root.addValue('Time', new Types.LongVal(BigInt(Math.trunc(level.time))));
        if (level.netherScale !== undefined) root.addValue('NetherScale', new Types.NumberVal(level.netherScale));
        if (level.stems !== undefined) {
            const overworld = level.stems[OVERWORLD_STEM_ID]?.generator;
            root.addValue('Generator', new Types.NumberVal(levelDatGeneratorOf(overworld)));
            if (overworld !== undefined && isFlatGenerator(overworld)) {
                root.addValue('FlatWorldLayers', new Types.StringVal(flatWorldLayersOf(overworld.settings)));
            } else {
                root.remove('FlatWorldLayers');
            }
        }

        writeLevelDat(this.getPath(), { storageVersion: LEVEL_DAT_STORAGE_VERSION, root });
    }

    /**
     * The clock `level.dat` holds, which {@link LevelDB.saveLevelData} writes as `Time`.
     *
     * Null before the file exists. A file without the tag, which this server never writes but
     * another might, answers no clock, so the level starts its own at zero.
     */
    public override readLevelData(): LevelDatInputs | null {
        const level = readLevelDat(this.getPath());
        if (level === null) return null;

        const time = level.root.getLong('Time', -1n);
        return time < 0n ? {} : { time: Number(time) };
    }

    /** Every chunk coordinate the database holds for one dimension, for tools that walk a world. */
    public *listChunks(dimension: DimensionType): IterableIterator<{ x: number; z: number }> {
        const seen = new Set<string>();

        for (const [key] of this.entriesNow()) {
            const decoded = decodePendingEntityKey(key) ?? decodeChunkKey(key);
            if (decoded === null || decoded.dimension !== dimension.bedrockId) continue;

            const id = `${decoded.x},${decoded.z}`;
            if (seen.has(id)) continue;

            seen.add(id);
            yield { x: decoded.x, z: decoded.z };
        }
    }

    /** The biomes stored for a chunk, or null when it has none yet. */
    public readBiomes(dimension: DimensionType, cx: number, cz: number): ReturnType<typeof decodeData3D> | null {
        const value = this.read(encodeChunkKey({ x: cx, z: cz, dimension: dimension.bedrockId, tag: ChunkTag.Data3D }));

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

/** What a chunk's cut tells its pass as it encodes. */
interface ChunkCutReport {
    /** One held-back sub chunk was encoded, before its turn when `forced`. */
    readonly encoded: (forced: boolean) => void;
    /** A held-back sub chunk, or the biomes, changed without a write telling the cut. */
    readonly bypassed: (chunk: Chunk, part: number | 'biomes') => void;
}

/**
 * The part of a chunk a LevelDB save pass holds back after the cut: its changed sub chunks and
 * its `Data3D`, encoded into the pass's batch on the pass's schedule or before a write reaches
 * them (ADR 0018).
 */
class LevelDBChunkCut implements ChunkSaveCutHook {
    private data3D: boolean;
    /** The sections this cut puts, which a later cut of the chunk deletes if they are empty by then. */
    public readonly subChunkPuts: ReadonlySet<number>;

    public constructor(
        public readonly chunk: Chunk,
        /** The chunk as the cut saw it, which it is marked saved as once the pass commits. */
        public readonly state: ChunkPersistedState,
        private readonly held: Map<number, { readonly subChunk: ReadonlySubChunk; readonly revision: number }>,
        data3D: boolean,
        private readonly report: ChunkCutReport,
        private readonly put: {
            readonly subChunk: (index: number, subChunk: ReadonlySubChunk) => void;
            readonly data3D: () => void;
        }
    ) {
        this.data3D = data3D;
        this.subChunkPuts = new Set(held.keys());
    }

    /** How many sub chunks are still held back. */
    public get pending(): number {
        return this.held.size;
    }

    public beforeSubChunkWrite(index: number): void {
        // The heightmap in `Data3D` is computed from every section, so any block write can move it.
        this.encodeData3D();
        this.encodeSubChunk(index, true);
        this.releaseWhenDone();
    }

    public beforeBiomeWrite(): void {
        this.encodeData3D();
        this.releaseWhenDone();
    }

    public finish(): void {
        this.encodeData3D();
        for (const index of [...this.held.keys()]) this.encodeSubChunk(index, true);
        this.releaseWhenDone();
    }

    /**
     * Encodes up to `budget` held-back sub chunks, and the `Data3D` with the first of them.
     * @returns How many sub chunks it encoded.
     */
    public encodeNext(budget: number): number {
        let done = 0;
        this.encodeData3D();
        for (const index of [...this.held.keys()]) {
            if (done >= budget) break;
            this.encodeSubChunk(index, false);
            done++;
        }
        this.releaseWhenDone();
        return done;
    }

    private encodeSubChunk(index: number, forced: boolean): void {
        const held = this.held.get(index);
        if (held === undefined) return;

        if (held.subChunk.getRevision() !== held.revision) this.report.bypassed(this.chunk, index);
        // Let go of only once it is in the batch, so a section whose encode throws is still
        // counted as pending, and the pass that cannot finish is abandoned rather than committed
        // without it.
        this.put.subChunk(index, held.subChunk);
        this.held.delete(index);
        this.report.encoded(forced);
    }

    private encodeData3D(): void {
        if (!this.data3D) return;
        this.data3D = false;
        // A biome write through the chunk encodes this first, so a revision past the cut's is a
        // write that went around it, such as through the column a plain JavaScript caller holds.
        if (this.chunk.getBiomes().getRevision() !== this.state.biomeRevision)
            this.report.bypassed(this.chunk, 'biomes');
        this.put.data3D();
    }

    /** Lets the chunk go once nothing of it is held back, so later writes cost it nothing. */
    private releaseWhenDone(): void {
        if (this.held.size === 0 && !this.data3D) this.chunk.setSaveCut(null);
    }
}
