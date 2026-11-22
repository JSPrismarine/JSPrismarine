/**
 * The allow list: the players who may join while it is on, kept in `allowlist.json` beside
 * `config.json`, in Bedrock Dedicated Server's format, and turned on by the `allow-list` setting.
 *
 * `@minecraft/server-admin`'s `dedicatedServer.allowList` reads and writes it. The `admin-server`
 * scenario of the parity suite recorded how BDS treats it: a name matches exactly, case and all;
 * adding a name or xuid already listed changes nothing; and every change is written to the file
 * at once, so `reloadFile` reads back what was there.
 *
 * The file is read and written synchronously: a script's `reloadFile` reads it back before the
 * script's next line, the list is a few entries long, and it changes when an operator says so.
 */
import fs from 'node:fs';

import { PrismarineServerErrors } from '@jsprismarine/errors/prismarine/server';

import { parseConfigDocument } from '../config/ConfigDocument';
import type Server from '../Server';
import { withCwd } from '../utils/cwd';
import { isRecord } from '../utils/isRecord';

const FILE_NAME = 'allowlist.json';

/** One player on the list, by name, by xuid, or both. */
export interface AllowListEntry {
    readonly name?: string;
    readonly xuid?: string;
    /** Whether the player may join a full server. */
    readonly ignoresPlayerLimit: boolean;
}

/** Who an entry is looked up by: a name, a xuid, or both. */
export interface AllowListPlayer {
    readonly name?: string;
    readonly xuid?: string;
}

/** The part of the server the allow list reads. */
export type AllowListServer = Pick<Server, 'getLogger' | 'getConfig'>;

const nonEmpty = (value: unknown): string | undefined =>
    typeof value === 'string' && value.length > 0 ? value : undefined;

/** An entry of the file, or undefined for one that names nobody. */
const entryOf = (value: unknown): AllowListEntry | undefined => {
    if (!isRecord(value)) return undefined;
    const name = nonEmpty(value.name);
    const xuid = nonEmpty(value.xuid);
    if (name === undefined && xuid === undefined) return undefined;
    return {
        ...(name === undefined ? {} : { name }),
        ...(xuid === undefined ? {} : { xuid }),
        ignoresPlayerLimit: value.ignoresPlayerLimit === true
    };
};

/** Whether an entry is the player's: by name, exactly, or by xuid. */
const matches = (entry: AllowListEntry, player: AllowListPlayer): boolean =>
    (player.name !== undefined && entry.name === player.name) ||
    (player.xuid !== undefined && entry.xuid === player.xuid);

/** The allow list of one server. */
export default class AllowList {
    private entries: AllowListEntry[] = [];
    private enabled = false;

    public constructor(private readonly server: AllowListServer) {}

    /**
     * Reads the file, making an empty one on a first start, and takes `allow-list` from the config.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        this.enabled = this.server.getConfig().getAllowList();
        if (!fs.existsSync(withCwd(FILE_NAME))) {
            // A first start has no file yet; making one is routine, not a warning.
            this.server.getLogger().info(`Created an empty allow list in ${FILE_NAME}.`);
            this.save();
        }
        this.reload();
    }

    /** @group Lifecycle */
    public async disable(): Promise<void> {
        this.entries = [];
    }

    /** Reads the file again. A file that is not a list is logged and leaves the list as it was. */
    public reload(): void {
        try {
            const listed = parseConfigDocument(fs.readFileSync(withCwd(FILE_NAME), 'utf8')).get([]);
            if (!Array.isArray(listed)) throw new PrismarineServerErrors.AllowListNotList({ fileName: FILE_NAME });
            this.entries = listed.flatMap((entry: unknown) => entryOf(entry) ?? []);
        } catch (error: unknown) {
            this.server.getLogger().error(error);
        }
    }

    /** Whether only the players on the list may join. */
    public isEnabled(): boolean {
        return this.enabled;
    }

    /** Turns the list on or off until the server stops; `allow-list` says what it starts as. */
    public setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    /** Every entry, in the order they were added. */
    public getEntries(): readonly AllowListEntry[] {
        return this.entries;
    }

    /** Whether the player is on the list. */
    public contains(player: AllowListPlayer): boolean {
        return this.entries.some((entry) => matches(entry, player));
    }

    /** Whether a player may join: the list is off, or they are on it. */
    public allows(player: AllowListPlayer): boolean {
        return !this.enabled || this.contains(player);
    }

    /**
     * Whether a player may join a full server: their entry says it ignores the player limit.
     * It holds whether or not the list is on, as the entry's own setting.
     */
    public ignoresPlayerLimit(player: AllowListPlayer): boolean {
        return this.entries.some((entry) => entry.ignoresPlayerLimit && matches(entry, player));
    }

    /**
     * Adds a player, unless the list has them already, and writes the file.
     * @returns Whether they were added.
     */
    public add(entry: AllowListEntry): boolean {
        if (this.contains(entry)) return false;
        this.entries = [...this.entries, entry];
        this.save();
        return true;
    }

    /**
     * Takes a player off the list, and writes the file.
     * @returns Whether they were on it.
     */
    public remove(player: AllowListPlayer): boolean {
        const kept = this.entries.filter((entry) => !matches(entry, player));
        if (kept.length === this.entries.length) return false;
        this.entries = kept;
        this.save();
        return true;
    }

    /** Empties the list, and writes the file. */
    public clear(): void {
        this.entries = [];
        this.save();
    }

    /** Writes the list as it is now, in BDS's format. A failed write is logged. */
    private save(): void {
        const entries = this.entries.map((entry) => ({
            ignoresPlayerLimit: entry.ignoresPlayerLimit,
            ...(entry.name === undefined ? {} : { name: entry.name }),
            ...(entry.xuid === undefined ? {} : { xuid: entry.xuid })
        }));
        try {
            fs.writeFileSync(withCwd(FILE_NAME), `${JSON.stringify(entries, null, 4)}\n`);
        } catch (error: unknown) {
            this.server.getLogger().error(`Failed to write ${FILE_NAME}: ${error}`);
        }
    }
}
