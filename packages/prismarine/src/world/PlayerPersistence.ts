import fs from 'node:fs';
import path from 'node:path';

import type { Logger } from '@jsprismarine/logger';

import type { WorldPlayerData } from '../config/JsonConfigTypes';
import { readJsonFile, writeJsonFile } from '../config/JsonFile';
import type BaseProvider from './providers/BaseProvider';
import { PLAYER_DATA_FOLDER } from './WorldPaths';

/** What the service needs from the level that owns it. */
export interface PlayerPersistenceOptions {
    /** The level's name, for log lines and errors. */
    readonly levelName: string;
    /** The level folder, which holds the fallback JSON records. */
    readonly folder: string;
    /** The level's provider, which stores records itself when it implements player storage. */
    readonly provider: Pick<BaseProvider, 'readPlayerData' | 'writePlayerData'>;
    /** Where read and write failures are logged. */
    readonly logger: () => Logger;
    /** Whether the level has closed, after which nothing is written. */
    readonly isClosed: () => boolean;
}

/**
 * Where and when one level's player records are read and written.
 *
 * The caller hands it a plain record and receives one. Building a record from a player and
 * applying one to a player are `playerRecordFrom` and `applyPlayerRecord` in `playerRecord.ts`,
 * which work on a live player and a store player alike, so this module knows nothing about a
 * player beyond the record's shape.
 *
 * Records are keyed by `playerKeyOf` in `playerIdentity.ts`: the XUID, or the name when there is
 * none. That is the key the record has always been filed under, `player_server_<key>` in LevelDB
 * and `playerdata/<key>.json` for a provider without player storage, so existing saves keep
 * loading. It is also the right key for a service. On an offline-mode server the UUID is drawn per
 * client install and two names may send one, so it would not find a returning player's record,
 * while the name is what the player types. On an online-mode server the XUID is the verified
 * account and survives a gamertag change, and the UUID is derived from it. Since #2951 one live
 * player holds a key at a time.
 *
 * A save cut under ADR 0018 builds every player's record at one tick boundary, without awaiting,
 * and hands the batch to {@link PlayerPersistence.saveAll}.
 */
export class PlayerPersistence {
    public constructor(private readonly options: PlayerPersistenceOptions) {}

    /**
     * The record filed under `key`, from the provider's player storage or the fallback JSON file.
     *
     * @param key - The player's key; see `playerKeyOf`.
     * @returns The record, or null when this save has none for the key. A provider read that fails
     *   is logged and falls through to the file.
     */
    public async load(key: string): Promise<Partial<WorldPlayerData> | null> {
        try {
            const data = await this.options.provider.readPlayerData?.(key);
            if (data) return data;
        } catch (error: unknown) {
            this.options.logger().error(`Failed to read player data for ${key}`);
            this.options.logger().error(error);
        }

        const file = this.recordFile(key);
        if (!fs.existsSync(file)) return null;

        // Parsed JSON is a boundary the compiler cannot see; the file is trusted as written.
        const data: unknown = (await readJsonFile(file, '{}')).get([]);
        return data as Partial<WorldPlayerData>;
    }

    /**
     * Writes one record, through the provider when it stores players and into the fallback JSON
     * file otherwise.
     *
     * Declined once the level has closed. A shutdown kicks everyone, and each client's connection
     * closes some time after the provider has gone, so a save arrives once more per player with
     * nothing left to write to; the shutdown's own save wrote them while they were still online.
     *
     * @param key - The player's key; see `playerKeyOf`.
     * @param record - The record to write.
     * @param requireSuccess - Propagate a persistence error, for a replay checkpoint. Otherwise a
     *   failed write is logged and the next save tries again.
     */
    public async save(key: string, record: WorldPlayerData, requireSuccess = false): Promise<void> {
        if (this.options.isClosed()) {
            if (requireSuccess) {
                throw new Error(
                    `Cannot save replay player data for ${key} after level ${this.options.levelName} closed`
                );
            }
            this.options.logger().debug(`${key} left after ${this.options.levelName} closed`, 'Level/savePlayerData');
            return;
        }

        try {
            if (this.options.provider.writePlayerData) {
                await this.options.provider.writePlayerData(key, record);
                return;
            }

            const file = this.recordFile(key);
            await fs.promises.mkdir(path.dirname(file), { recursive: true });
            const document = await readJsonFile(file, '{}');
            for (const [field, value] of Object.entries(record)) document.set([field], value);
            await writeJsonFile(file, document);
        } catch (error: unknown) {
            this.options.logger().error(`Failed to save player data for ${key}`);
            this.options.logger().error(error);
            if (requireSuccess) throw error;
        }
    }

    /**
     * Writes a batch of records built at one moment, all at once.
     *
     * @param records - Each player's record by key, as a save pass captured them.
     */
    public async saveAll(records: ReadonlyMap<string, WorldPlayerData>): Promise<void> {
        await Promise.all([...records].map(async ([key, record]) => this.save(key, record)));
    }

    private recordFile(key: string): string {
        return path.join(this.options.folder, PLAYER_DATA_FOLDER, `${key}.json`);
    }
}
