import fs from 'node:fs';

import type Server from '../Server';
import type { BannedPlayerEntry } from '../config/JsonConfigTypes';
import { readJsonFile, removeListEntries, upsertListEntry, writeJsonFile } from '../config/JsonFile';
import { subjectEntryOf, subjectOfEntry } from '../config/subjectEntry';
import type { Subject } from '../identity/Subject';
import { sameSubject, subjectId } from '../identity/Subject';
import type { PlayerIdentity } from '../playerIdentity';
import { withCwd } from '../utils/cwd';
import { isRecord } from '../utils/isRecord';
import { PrismarineServerErrors } from '@jsprismarine/errors/prismarine/server';

export type { BannedPlayerEntry } from '../config/JsonConfigTypes';

/** Whether a value read from the ban file is an entry this manager can use. */
const isBannedPlayerEntry = (value: unknown): value is BannedPlayerEntry =>
    isRecord(value) && typeof value.name === 'string' && (!('reason' in value) || typeof value.reason === 'string');

/** Whether an entry bans a name on every platform, as entries written before subjects existed do. */
const isLegacyEntry = (value: unknown): value is BannedPlayerEntry =>
    isBannedPlayerEntry(value) && subjectOfEntry(value) === undefined;

/**
 * The part of the server the ban manager uses. A test can hand in a logger
 * without building the rest.
 */
export type BanManagerServer = Pick<Server, 'getLogger'>;

/**
 * The part of a player a ban check reads: the subject an entry names, and the name an entry
 * written before subjects existed names.
 */
export type BanSubject = Pick<PlayerIdentity, 'name' | 'subject'>;

/** Who `/ban` bans: a name, and the subject behind it when the player is online to tell. */
export interface BanTarget {
    readonly name: string;
    readonly subject?: Subject;
}

const FILE_NAME = 'banned-players.json';

/**
 * Ban manager.
 */
export default class BanManager {
    private readonly server: BanManagerServer;
    /** Bans of one player, by {@link subjectId}. */
    private readonly banned: Map<string, Omit<BannedPlayerEntry, 'name'>> = new Map();
    /** Bans of a name on every platform, from entries written before subjects existed. */
    private readonly bannedNames: Map<string, Omit<BannedPlayerEntry, 'name'>> = new Map();

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
        this.bannedNames.clear();
    }

    private async parseBanned() {
        try {
            const dir = withCwd(FILE_NAME);
            if (!fs.existsSync(dir)) {
                // A first start has no list yet; making one is routine, not a warning.
                this.server.getLogger().info(`Created an empty ban list in ${FILE_NAME}.`);
                await writeJsonFile(dir, await readJsonFile(dir, '[]'));
            }

            const banned = (await readJsonFile(dir, '[]')).get([]);
            if (!Array.isArray(banned)) throw new PrismarineServerErrors.BanListNotList({ fileName: FILE_NAME });
            for (const entry of banned) {
                if (!isBannedPlayerEntry(entry)) continue;
                const subject = subjectOfEntry(entry);
                if (subject === undefined) this.bannedNames.set(entry.name, { reason: entry.reason ?? '' });
                else this.banned.set(subjectId(subject), { reason: entry.reason ?? '' });
            }
        } catch (error: unknown) {
            this.server.getLogger().error(error);
        }
    }

    /**
     * Rewrites one player's line in the ban file, leaving the other lines and any comments as
     * they are, so a note somebody put beside a ban survives the next `/ban`.
     *
     * @param matches - The lines the entry replaces, or the lines to remove.
     * @param entry - The line to write, or null to remove the matching lines.
     */
    private async writeEntry(
        matches: (candidate: unknown) => boolean,
        entry: (BannedPlayerEntry & { reason: string }) | null
    ): Promise<void> {
        const file = withCwd(FILE_NAME);
        const document = await readJsonFile(file, '[]');

        if (entry === null) removeListEntries(document, matches);
        else upsertListEntry(document, matches, entry);

        await writeJsonFile(file, document);
    }

    /** Whether an entry bans this subject. */
    private static entryOf(subject: Subject) {
        return (candidate: unknown): boolean => {
            const own = subjectOfEntry(candidate);
            return own !== undefined && sameSubject(own, subject);
        };
    }

    /**
     * Bans a player. With a subject, the entry names that one player; with a name alone, as when
     * the player is offline and nothing says which platform they are on, it names every player of
     * that name until one logs in and claims it.
     */
    public async setBanned(target: BanTarget, reason = '') {
        const { name, subject } = target;
        if (subject === undefined) {
            this.bannedNames.set(name, { reason });
            await this.writeEntry((candidate) => isLegacyEntry(candidate) && candidate.name === name, { name, reason });
            return true;
        }
        this.banned.set(subjectId(subject), { reason });
        await this.writeEntry(BanManager.entryOf(subject), { name, ...subjectEntryOf(subject), reason });
        return true;
    }

    /** Lifts every ban on a name, whichever platform each entry names. */
    public async setUnbanned(username: string) {
        this.bannedNames.delete(username);
        const file = withCwd(FILE_NAME);
        const document = await readJsonFile(file, '[]');
        const list = document.get([]);
        if (Array.isArray(list)) {
            for (const entry of list) {
                if (!isBannedPlayerEntry(entry) || entry.name !== username) continue;
                const subject = subjectOfEntry(entry);
                if (subject !== undefined) this.banned.delete(subjectId(subject));
            }
        }
        removeListEntries(document, (candidate) => isBannedPlayerEntry(candidate) && candidate.name === username);
        await writeJsonFile(file, document);
    }

    /**
     * Gives a ban written before subjects existed the subject of the player it turns away, so it
     * names that one player from here on. Call it before {@link isBanned} when a player logs in.
     *
     * @param identity - Who logged in.
     * @returns Whether an entry was claimed.
     */
    public async claimLegacy(identity: PlayerIdentity): Promise<boolean> {
        const ban = this.bannedNames.get(identity.name);
        if (ban === undefined) return false;
        this.bannedNames.delete(identity.name);
        this.banned.set(subjectId(identity.subject), ban);
        await this.writeEntry((candidate) => isLegacyEntry(candidate) && candidate.name === identity.name, {
            name: identity.name,
            ...subjectEntryOf(identity.subject),
            reason: ban.reason ?? ''
        });
        return true;
    }

    /**
     * Check if player is banned.
     * @param player - Who logged in.
     * @returns Reason if banned, false if not banned.
     */
    public isBanned(player: BanSubject): string | boolean {
        const ban = this.banned.get(subjectId(player.subject)) ?? this.bannedNames.get(player.name);
        if (ban === undefined) return false;
        return ban.reason || true;
    }
}
