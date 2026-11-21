import fs from 'node:fs';

import type Server from '../Server';
import type { BannedPlayerEntry } from '../config/JsonConfigTypes';
import { readJsonFile, removeListEntries, upsertListEntry, writeJsonFile } from '../config/JsonFile';
import { subjectEntryOf, subjectOfEntry } from '../config/subjectEntry';
import type { Subject } from '../identity/Subject';
import { sameSubject } from '../identity/Subject';
import type { PlayerIdentity } from '../playerIdentity';
import { withCwd } from '../utils/cwd';
import { isRecord } from '../utils/isRecord';
import { PrismarineServerErrors } from '@jsprismarine/errors/prismarine/server';

export type { BannedPlayerEntry } from '../config/JsonConfigTypes';

/** Whether a value read from the ban file is an entry this manager can use. */
const isBannedPlayerEntry = (value: unknown): value is BannedPlayerEntry =>
    isRecord(value) && typeof value.name === 'string' && (!('reason' in value) || typeof value.reason === 'string');

/** One ban as the manager holds it: the name it matches, the account it also matches once it has one, and the reason. */
interface Ban {
    readonly name: string;
    readonly subject: Subject | undefined;
    readonly reason: string;
}

/** The ban an entry of the file holds, or undefined for a value that is not one. */
const banOf = (value: unknown): Ban | undefined =>
    isBannedPlayerEntry(value)
        ? { name: value.name, subject: subjectOfEntry(value), reason: value.reason ?? '' }
        : undefined;

/** A ban as the file writes it: the name, the account's `kind` and `id` when it has one, and the reason. */
const entryOf = (ban: Ban): BannedPlayerEntry & { reason: string } => ({
    name: ban.name,
    ...(ban.subject === undefined ? {} : subjectEntryOf(ban.subject)),
    reason: ban.reason
});

/** Whether a ban is for this player: the name always matches, and the account matches once the ban has one. */
const bans = (ban: Ban, player: BanSubject): boolean =>
    ban.name === player.name || (ban.subject !== undefined && sameSubject(ban.subject, player.subject));

/**
 * The part of the server the ban manager uses. A test can hand in a logger
 * without building the rest.
 */
export type BanManagerServer = Pick<Server, 'getLogger'>;

/** The part of a player a ban check reads: the name every ban matches, and the account a ban matches once it has one. */
export type BanSubject = Pick<PlayerIdentity, 'name' | 'subject'>;

/** Who `/ban` bans: a name, and the account behind it when the player is online to tell. */
export interface BanTarget {
    readonly name: string;
    readonly subject?: Subject;
}

const FILE_NAME = 'banned-players.json';

/**
 * Ban manager.
 *
 * A ban has a name and, once a login it turned away has shown which account holds the name, that
 * account's `kind` and `id`. A ban matches a login by name always, as bans did before accounts
 * were written, and by account as well once it has one, so a ban never lapses when a player
 * changes their name on one platform or logs in from another.
 */
export default class BanManager {
    private readonly server: BanManagerServer;
    /** Every ban the file holds, in its order. */
    private banned: Ban[] = [];

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
        this.banned = [];
    }

    private async parseBanned() {
        try {
            const dir = withCwd(FILE_NAME);
            if (!fs.existsSync(dir)) {
                // A first start has no file yet; making one is routine, not a warning.
                this.server.getLogger().info(`Created an empty ban list in ${FILE_NAME}.`);
                await writeJsonFile(dir, await readJsonFile(dir, '[]'));
            }

            const banned = (await readJsonFile(dir, '[]')).get([]);
            if (!Array.isArray(banned)) throw new PrismarineServerErrors.BanListNotList({ fileName: FILE_NAME });
            this.banned = banned.flatMap((entry: unknown) => banOf(entry) ?? []);
        } catch (error: unknown) {
            this.server.getLogger().error(error);
        }
    }

    /**
     * Rewrites the lines of the ban file `matches` accepts, leaving the other lines and any
     * comments as they are, so a note somebody put beside a ban survives the next `/ban`.
     *
     * @param matches - The lines the entry replaces, or the lines to remove.
     * @param ban - The ban to write, or null to remove the matching lines.
     */
    private async writeEntry(matches: (candidate: unknown) => boolean, ban: Ban | null): Promise<void> {
        const file = withCwd(FILE_NAME);
        const document = await readJsonFile(file, '[]');

        if (ban === null) removeListEntries(document, matches);
        else upsertListEntry(document, matches, entryOf(ban));

        await writeJsonFile(file, document);
    }

    /** Whether a line of the file is a ban of this name. */
    private static lineNamed(name: string) {
        return (candidate: unknown): boolean => banOf(candidate)?.name === name;
    }

    /**
     * Bans a player by name, and by account when they are online to tell which account holds the
     * name. Every ban of the same name is replaced by this one, in the file as in memory.
     */
    public async setBanned(target: BanTarget, reason = '') {
        const ban: Ban = { name: target.name, subject: target.subject, reason };
        this.banned = [...this.banned.filter((entry) => entry.name !== ban.name), ban];
        const file = withCwd(FILE_NAME);
        const document = await readJsonFile(file, '[]');
        const list = document.get([]);
        const named = Array.isArray(list)
            ? list.flatMap((candidate: unknown, index) => (banOf(candidate)?.name === ban.name ? [index] : []))
            : [];
        // The first line of the name takes the ban where it is, so a comment beside it stays; the
        // others go, back to front so the indices still to be visited hold.
        for (const index of named.slice(1).reverse()) document.delete([index]);
        document.set([named[0] ?? (Array.isArray(list) ? list.length : 0)], entryOf(ban));
        await writeJsonFile(file, document);
        return true;
    }

    /** Lifts every ban on a name. */
    public async setUnbanned(username: string) {
        this.banned = this.banned.filter((entry) => entry.name !== username);
        await this.writeEntry(BanManager.lineNamed(username), null);
    }

    /**
     * Gives a ban that has only a name the account of the player it turns away, so it matches that
     * account from here on as well as the name. Call it before {@link isBanned} when a player logs in.
     *
     * @param identity - Who logged in.
     * @returns Whether an entry gained an account.
     */
    public async claimLegacy(identity: PlayerIdentity): Promise<boolean> {
        const index = this.banned.findIndex((entry) => entry.name === identity.name && entry.subject === undefined);
        if (index < 0) return false;
        const ban: Ban = { ...this.banned[index]!, subject: identity.subject };
        this.banned = this.banned.with(index, ban);
        await this.writeEntry((candidate) => {
            const line = banOf(candidate);
            return line?.name === ban.name && line.subject === undefined;
        }, ban);
        return true;
    }

    /**
     * Check if player is banned.
     * @param player - Who logged in.
     * @returns Reason if banned, false if not banned.
     */
    public isBanned(player: BanSubject): string | boolean {
        const ban = this.banned.find((entry) => bans(entry, player));
        if (ban === undefined) return false;
        return ban.reason || true;
    }
}
