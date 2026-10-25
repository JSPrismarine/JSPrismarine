import fs from 'node:fs';

import type Player from '../Player';
import type Server from '../Server';
import type { BannedPlayerEntry } from '../config/JsonConfigTypes';
import { readJsonFile, removeListEntries, upsertListEntry, writeJsonFile } from '../config/JsonFile';
import { withCwd } from '../utils/cwd';

export type { BannedPlayerEntry } from '../config/JsonConfigTypes';

/** Whether a value read from the ban file is an entry this manager can use. */
const isBannedPlayerEntry = (value: unknown): value is BannedPlayerEntry =>
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string' &&
    (!('reason' in value) || typeof value.reason === 'string');

/**
 * The part of the server the ban manager uses. A test can hand in a logger
 * without building the rest.
 */
export type BanManagerServer = Pick<Server, 'getLogger'>;

/**
 * The part of a player a ban check reads. Bans are keyed by name only.
 */
export type BanSubject = Pick<Player, 'getName'>;

const FILE_NAME = 'banned-players.json';

/**
 * Ban manager.
 */
export default class BanManager {
    private readonly server: BanManagerServer;
    private readonly banned: Map<string, Omit<BannedPlayerEntry, 'name'>> = new Map();

    public constructor(server: BanManagerServer) {
        this.server = server;
    }

    /**
     * On enable hook.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        await this.parseBanned();
    }

    /**
     * On disable hook.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {
        this.banned.clear();
    }

    private async parseBanned() {
        try {
            const dir = withCwd(FILE_NAME);
            if (!fs.existsSync(dir)) {
                this.server.getLogger().warn(`Failed to load ban list!`);
                await writeJsonFile(dir, await readJsonFile(dir, '[]'));
            }

            const banned = (await readJsonFile(dir, '[]')).get([]);
            if (!Array.isArray(banned)) throw new Error(`${FILE_NAME} must hold a list of banned players`);
            for (const entry of banned) {
                if (!isBannedPlayerEntry(entry)) continue;
                this.banned.set(entry.name, { reason: entry.reason ?? '' });
            }
        } catch (error: unknown) {
            this.server.getLogger().error(error);
        }
    }

    /**
     * Rewrites one player's line in the ban file, leaving the other lines and any comments as
     * they are, so a note somebody put beside a ban survives the next `/ban`.
     */
    private async writeEntry(username: string, entry: (BannedPlayerEntry & { reason: string }) | null): Promise<void> {
        const file = withCwd(FILE_NAME);
        const document = await readJsonFile(file, '[]');
        const sameName = (candidate: unknown) => isBannedPlayerEntry(candidate) && candidate.name === username;

        if (entry === null) removeListEntries(document, sameName);
        else upsertListEntry(document, sameName, entry);

        await writeJsonFile(file, document);
    }

    public async setBanned(username: string, reason = '') {
        this.banned.set(username, {
            reason
        });

        await this.writeEntry(username, { name: username, reason });
        return true;
    }

    public async setUnbanned(username: string) {
        this.banned.delete(username);

        await this.writeEntry(username, null);
    }

    /**
     * Check if player is banned.
     * @param {BanSubject} player - Player to check.
     * @returns {string | boolean} Reason if banned, false if not banned.
     */
    public isBanned(player: BanSubject): string | boolean {
        if (this.banned.has(player.getName())) {
            return this.banned.get(player.getName())?.reason || true;
        }

        return false;
    }
}
