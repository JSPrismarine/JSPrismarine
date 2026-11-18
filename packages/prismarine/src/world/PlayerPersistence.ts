import fs from 'node:fs';
import path from 'node:path';

import type { Logger } from '@jsprismarine/logger';

import type { WorldPlayerData } from '../config/JsonConfigTypes';
import { readJsonFile, writeJsonFile } from '../config/JsonFile';
import type BaseProvider from './providers/BaseProvider';
import { PLAYER_DATA_FOLDER, playerDataFileName } from './WorldPaths';
import { PrismarineWorldErrors } from '@jsprismarine/errors/prismarine/world';

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
    /**
     * Settles once a save pass whose cut is taken has committed. A record written to the
     * fallback JSON while one is pending is written after it, so the older record the pass hands
     * over once it commits never lands on top of it.
     */
    readonly pendingCommit?: () => Promise<void>;
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
 * and `playerdata/<key>.json` for a provider without player storage (with the characters a file
 * name cannot carry escaped; see `playerDataFileName`), so existing saves keep loading. It is also the right key for a service. On an offline-mode server the UUID is drawn per
 * client install and two names may send one, so it would not find a returning player's record,
 * while the name is what the player types. On an online-mode server the XUID is the verified
 * account and survives a gamertag change, and the UUID is derived from it. Since #2951 one live
 * player holds a key at a time.
 *
 * A save pass under ADR 0018 builds every player's record at its cut and writes it with the
 * pass, not through this. A provider without player storage gets them here once the pass has
 * committed. A record saved here outside a pass, on a disconnect or a dimension change, goes to
 * a provider that holds it for the next pass's commit and answers a read of it at once; see
 * `LevelDB.holdOutsideWrites`.
 */
export class PlayerPersistence {
    /**
     * The last write started for each key, until it settles. A tick hands a record's save off and
     * does not wait for it, so a read and a later write of the same key wait for it here: a
     * player who leaves and joins again reads the record they left with.
     */
    private readonly writing = new Map<string, Promise<void>>();
    /**
     * The pending commit each key's last write to the fallback JSON waits for, while it waits. Such
     * a write holds the player as they are after that pass's cut, so the record the pass hands
     * over for the key is older and is not written.
     */
    private readonly waitingOn = new Map<string, Promise<void>>();

    public constructor(private readonly options: PlayerPersistenceOptions) {}

    /**
     * The record filed under `key`, from the provider's player storage or the fallback JSON file.
     *
     * @param key - The player's key; see `playerKeyOf`.
     * @returns The record, or null when this save has none for the key. A provider read that fails
     *   is logged and falls through to the file.
     */
    public async load(key: string): Promise<Partial<WorldPlayerData> | null> {
        await this.writing.get(key);
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
    public save(key: string, record: WorldPlayerData, requireSuccess = false): Promise<void> {
        // Taken now, not when the write runs: a record built before a cut is older than the one
        // the cut holds and may land first, while one built after it has to land after (ADR 0018).
        // A provider that stores records orders them itself, holding one made after a cut for
        // the commit after that cut's, so only the fallback JSON waits.
        const behind = this.options.provider.writePlayerData
            ? undefined
            : (this.options.pendingCommit?.() ?? Promise.resolve());
        return this.queue(key, record, requireSuccess, behind);
    }

    /**
     * Queues one write behind the key's last write, so the writes of one player land in the order
     * they started, and behind `behind` when it is given.
     */
    private queue(
        key: string,
        record: WorldPlayerData,
        requireSuccess: boolean,
        behind: Promise<void> | undefined
    ): Promise<void> {
        const write = Promise.all([this.writing.get(key), behind]).then(() => this.write(key, record, requireSuccess));
        const settled = write.then(
            () => undefined,
            () => undefined
        );
        this.writing.set(key, settled);
        if (behind === undefined) this.waitingOn.delete(key);
        else this.waitingOn.set(key, behind);
        void settled.then(() => {
            if (this.writing.get(key) !== settled) return;
            this.writing.delete(key);
            this.waitingOn.delete(key);
        });
        return write;
    }

    /**
     * Writes the records a save pass's cut built, once the pass has committed and before the
     * commit counts as settled, so a record saved after the cut, which waits for that, lands
     * after these. A record of a key already saved after the cut is older than that one and is
     * left out.
     *
     * @param records - Each player's record by key, as a save pass's cut built them.
     * @param requireSuccess - Propagate a persistence error, for a replay checkpoint.
     */
    public async saveAll(records: ReadonlyMap<string, WorldPlayerData>, requireSuccess = false): Promise<void> {
        const pending = this.options.pendingCommit?.();
        await Promise.all(
            [...records].flatMap(([key, record]) =>
                pending !== undefined && this.waitingOn.get(key) === pending
                    ? []
                    : [this.queue(key, record, requireSuccess, undefined)]
            )
        );
    }

    private async write(key: string, record: WorldPlayerData, requireSuccess: boolean): Promise<void> {
        if (this.options.isClosed()) {
            if (requireSuccess) {
                throw new PrismarineWorldErrors.PlayerDataSaveAfterClose({ key, levelName: this.options.levelName });
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
     * Where the fallback JSON for a player key lives: one file directly in the save's player
     * data folder, whatever the key holds.
     * @throws Error when the file would land anywhere else, which {@link playerDataFileName}
     *   should already have made impossible.
     */
    private recordFile(key: string): string {
        const folder = path.resolve(this.options.folder, PLAYER_DATA_FOLDER);
        const file = path.resolve(folder, playerDataFileName(key));
        if (path.dirname(file) !== folder)
            throw new PrismarineWorldErrors.PlayerDataPathEscapes({ key: JSON.stringify(key), folder });
        return file;
    }
}
