import fs from 'node:fs';
import path from 'node:path';

import type { Logger } from '@jsprismarine/logger';

import type { WorldPlayerData } from '../config/JsonConfigTypes';
import { readJsonFile, writeJsonFile } from '../config/JsonFile';
import type BaseProvider from './providers/BaseProvider';
import { PLAYER_DATA_FOLDER, playerDataFileName } from './WorldPaths';

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
 * The caller hands it a plain record and receives one. Building a record from a player is
 * `playerRecordOf`'s job and applying one is the player's, so this module knows nothing about a
 * player beyond the record's shape.
 *
 * Records are keyed by `playerKeyOf` in `playerIdentity.ts`: the XUID, or the name when there is
 * none. That is the key the record has always been filed under, `player_server_<key>` in LevelDB
 * and `playerdata/<key>.json` for a provider without player storage (with the characters a file
 * name cannot carry escaped; see `playerDataFileName`), so existing saves keep loading. It is also the right key for a service. On an offline-mode server the UUID is drawn per
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

        const file = await this.existingRecordFile(key);
        if (file === undefined) return null;

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
            // Another key's record still under its old name, which is this key's name now, moves
            // to its owner's new name first, so this save neither reads nor overwrites it.
            const owner = await this.foreignOwnerOf(key, file);
            if (owner !== undefined) {
                const ownersFile = this.recordFile(owner);
                if (fs.existsSync(ownersFile)) {
                    throw new Error(`${file} holds ${owner}'s record, which also has ${ownersFile}`);
                }
                await fs.promises.rename(file, ownersFile);
            }
            // A record still under the name it had before names were escaped moves to the new
            // one, so the save extends it rather than starting the player over.
            const legacy = await this.legacyRecordFile(key);
            if (legacy !== undefined && !fs.existsSync(file)) await fs.promises.rename(legacy, file);
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

    /**
     * Where the fallback JSON for a player key lives: one file directly in the save's player
     * data folder, whatever the key holds.
     * @throws Error when the file would land anywhere else, which {@link playerDataFileName}
     *   should already have made impossible.
     */
    private recordFile(key: string): string {
        const folder = path.resolve(this.options.folder, PLAYER_DATA_FOLDER);
        const file = path.resolve(folder, playerDataFileName(key));
        if (path.dirname(file) !== folder)
            throw new Error(`Player data for ${JSON.stringify(key)} would leave ${folder}`);
        return file;
    }

    /**
     * The fallback JSON a key was stored in before {@link playerDataFileName} escaped names, when
     * that differs from today's name, is a regular file directly in the player data folder, and
     * holds this key's record. A name that pointed anywhere else, or at a link, is never read.
     *
     * The name alone does not say whose record it is: `100%25.json` is both where key `100%25`
     * used to live and where key `100%` lives now. Only a key with a character that is now
     * escaped can have a legacy file, and a key like that is a player name, so the record's
     * `username` has to be the key. A key holding NUL never had a file, since no file name can.
     */
    private async legacyRecordFile(key: string): Promise<string | undefined> {
        if (key.includes('\0')) return undefined;

        const folder = path.resolve(this.options.folder, PLAYER_DATA_FOLDER);
        const legacy = path.resolve(folder, `${key}.json`);
        if (path.dirname(legacy) !== folder || legacy === this.recordFile(key)) return undefined;
        if (!fs.lstatSync(legacy, { throwIfNoEntry: false })?.isFile()) return undefined;

        try {
            return (await readJsonFile(legacy, '{}')).get(['username']) === key ? legacy : undefined;
        } catch {
            return undefined;
        }
    }

    /**
     * The key whose record sits in `file`, today's name for `key`, when it is not `key`'s own.
     *
     * Only an escaped key's name can be another key's legacy name: `100%25.json` is where key
     * `100%` lives now and where key `100%25` lived before. An escaped key is a player name, and
     * every record stores the player's `username`, so the file is another key's exactly when its
     * `username` differs from `key` and names the file the way the old scheme did.
     */
    private async foreignOwnerOf(key: string, file: string): Promise<string | undefined> {
        if (playerDataFileName(key) === `${key}.json` || !fs.existsSync(file)) return undefined;

        try {
            const username = (await readJsonFile(file, '{}')).get(['username']);
            return typeof username === 'string' && username !== key && `${username}.json` === path.basename(file)
                ? username
                : undefined;
        } catch {
            return undefined;
        }
    }

    /**
     * The file a key's fallback record is in now: today's name first, unless it holds another
     * key's legacy record, else its own legacy name.
     */
    private async existingRecordFile(key: string): Promise<string | undefined> {
        const file = this.recordFile(key);
        if (fs.existsSync(file) && (await this.foreignOwnerOf(key, file)) === undefined) return file;
        return this.legacyRecordFile(key);
    }
}
