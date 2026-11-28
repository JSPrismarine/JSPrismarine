import { lstat, mkdir, readdir, readFile, realpath, rm, stat, symlink } from 'node:fs/promises';
import path from 'node:path';

import { addonVersionsInRange, isAddonName, satisfiesAddonRange } from '@jsprismarine/addon-tools/addonIndex';
import { fetchPublishedIndex, releaseDownloadUrl } from '@jsprismarine/addon-tools/build';
import { PrismarineAddonErrors } from '@jsprismarine/errors/prismarine/addon';

import type { AddonRequest, AddonsFile, AddonsLockFile, LockedAddon, LockedWorld } from './addonFiles';
import {
    ADDONS_DIRECTORY,
    ADDONS_FILE,
    ADDONS_LOCK_FILE,
    isPathLock,
    isSourceLock,
    readAddonFiles,
    writeAddonFiles
} from './addonFiles';
import type { ArchiveWorld, InstalledPack, PackSummary, SkippedMember } from './addonPack';
import {
    downloadPack,
    httpsFetch,
    messageOf,
    readInstalledPacks,
    refuseEditorProject,
    releaseOf,
    removeAddonFolder,
    serverMeets,
    sha256Of,
    summarizeFiles,
    summarizeFolder,
    unpackArchive,
    writePackFolder
} from './addonPack';
import { isPackFile, keyOfDroppedPack, parseAddonSpec } from './addonSpec';
import { SerialQueue } from '../utils/serialQueue';

/** Where the installer writes what it does. */
export interface AddonLog {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}

/** What an {@link AddonManager} needs from the server. */
export interface AddonManagerOptions {
    /** The server's folder, which holds `config.json`, the two addon files and `addons/`. */
    readonly directory: string;
    /** What a relative path given to `install` is relative to; the server's folder when absent. */
    readonly cwd?: string;
    /** The server's version, which an addon's `minServer` is checked against. */
    readonly serverVersion: string;
    /**
     * Every download goes through it, wrapped so each request stays on `https:` and has a
     * deadline; the global `fetch` when absent.
     */
    readonly fetch?: typeof fetch;
    readonly log: AddonLog;
    /**
     * Loads the pack list again after an install, an update or a removal changed it, or when a
     * sync asked for it. `restart` says an addon changed, so each pack's manifest must be read
     * again rather than the scripts reloaded in place.
     */
    readonly reload?: (options: { readonly restart: boolean }) => Promise<void>;
    /**
     * Imports a world an archive holds as a level of the server's, and says which. A server that
     * gives none installs an archive's packs and leaves its worlds out.
     */
    readonly importWorld?: (world: AddonWorld) => Promise<{ readonly id: string; readonly name: string }>;
}

/** A world an addon's archive holds, for {@link AddonManagerOptions.importWorld}. */
export interface AddonWorld {
    /** The addon's local name. */
    readonly key: string;
    /** Where the world sat in the archive, or an empty string for an archive that is the world. */
    readonly member: string;
    /** Whether it is a world template: a new level made from it, rather than a saved world. */
    readonly template: boolean;
    /** Its files, by their path inside the world's folder. */
    readonly files: ReadonlyMap<string, Uint8Array>;
}

/** A resource pack an installed addon holds, which the server sends to clients as they join. */
export interface AddonResourcePack extends InstalledPack {
    /** The addon's local name. */
    readonly key: string;
}

/** One installed addon, as `addon list` shows it. */
export interface InstalledAddon {
    readonly key: string;
    readonly request?: AddonRequest;
    readonly locked?: LockedAddon;
    /** The packs its folder holds now. */
    readonly packs: readonly InstalledPack[];
}

/** An installed addon's name and version, as its lock records them. */
export interface LoadedAddon {
    readonly name: string;
    readonly version: string;
}

/** One pack a resolution installs, and its folder inside the addon's. */
interface ResolvedPack {
    readonly folder: string;
    readonly summary: PackSummary;
}

/** What a resolution produced: the lock entry and the packs' files, or a folder to link. */
interface Resolved {
    readonly locked: LockedAddon;
    readonly packs: readonly ResolvedPack[];
    /** Every pack's files, by their path inside the addon's folder. */
    readonly files?: ReadonlyMap<string, Uint8Array>;
    readonly folder?: string;
    /** The worlds the archive holds, which import into the server's levels. */
    readonly worlds?: readonly ArchiveWorld[];
    /** What the archive holds that does not install, such as a skin pack. */
    readonly skipped?: readonly SkippedMember[];
}

/** The version an archive installs as: its first behavior pack's, else its first resource pack's. */
const versionOf = (packs: readonly ResolvedPack[]): string =>
    (packs.find(({ summary }) => summary.kind === 'behavior') ?? packs[0])?.summary.version ?? '0.0.0';

/** What in an addon's packs waits for a restart, each named inside its pack's folder. */
const needsRestartOf = (packs: readonly { readonly folder: string; readonly summary: PackSummary }[]): string[] =>
    packs.flatMap(({ folder, summary }) =>
        summary.needsRestart.map((entry) => (folder === '.' ? entry : `${folder}/${entry}`))
    );

/** A pack as the console names it: `behavior pack Furniture 1.0.0`. */
const describePack = ({ summary }: { readonly summary: PackSummary }): string =>
    `${summary.kind} pack ${summary.name} ${summary.version}`;

/** The warning for a deprecated addon, or undefined when its lock says nothing of one. */
export const deprecationWarning = (key: string, locked: LockedAddon): string | undefined => {
    if (!isSourceLock(locked) || locked.deprecated === undefined) return undefined;
    const replacement =
        locked.replacedBy === undefined ? '' : ` Install its replacement with addon install ${locked.replacedBy}.`;
    return `${key} ${locked.version} is deprecated: "${locked.deprecated}"${replacement}`;
};

/** Where an addon came from, as the console reports it. */
const originOf = (locked: LockedAddon): string => {
    if (isSourceLock(locked)) return `${locked.source}, checked against its index's SHA-256`;
    if (isPathLock(locked)) return locked.path;
    return `${locked.url}, which no index vouches for, so no hash was checked; its SHA-256 is locked now`;
};

/**
 * Installs, updates and removes a server's addons, and keeps `addons/` in line with
 * `addons.json` and `addons.lock.json`. One operation runs at a time, in the order they were
 * asked for. Each reads both files again, so a hand edit of `addons.json` counts at once.
 */
export class AddonManager {
    private readonly options: AddonManagerOptions;
    private readonly fetcher: typeof fetch;
    /** The keys whose folder holds the locked addon, in key order. */
    private installed: readonly string[] = [];
    /** The packs of each installed key, in key order. */
    private installedPacks: readonly AddonResourcePack[] = [];
    /**
     * The resource packs among them. A new list only when {@link track} runs, so a reader can tell
     * from the list alone that the packs changed.
     */
    private installedResourcePacks: readonly AddonResourcePack[] = [];
    /** The name and version each installed key locks, in key order. */
    private loaded: readonly LoadedAddon[] = [];
    private readonly queue = new SerialQueue();
    /**
     * Whether the last reload did not finish, so the running scripts may not be the installed
     * addons'. The next sync reloads while it is set, though nothing else changed.
     */
    private reloadPending = false;

    public constructor(options: AddonManagerOptions) {
        this.options = options;
        this.fetcher = httpsFetch(options.fetch ?? fetch);
    }

    /** The folder each addon installs into: `addons/` in the server's folder. */
    public get addonsDirectory(): string {
        return path.join(this.options.directory, ADDONS_DIRECTORY);
    }

    /**
     * The folders of the installed addons, in key order: the packs that join the world's pack
     * list after `content-world-packs`.
     */
    public packDirectories(): readonly string[] {
        return this.installedPacks
            .filter(({ summary }) => summary.kind === 'behavior')
            .map(({ directory }) => directory);
    }

    /**
     * The resource packs of the installed addons, in key order and, inside an addon, in the order
     * of their folders: the packs the server sends to clients as they join.
     */
    public resourcePacks(): readonly AddonResourcePack[] {
        return this.installedResourcePacks;
    }

    /**
     * The installed addons as their locks name them, in key order: what query reports as the
     * server's plugins. Read from memory, so a status reply never waits on the disk.
     */
    public loadedAddons(): readonly LoadedAddon[] {
        return this.loaded;
    }

    /** Every key either file names, with what each says about it. */
    public list(): Promise<readonly InstalledAddon[]> {
        return this.queue.run(async () => {
            const { requested, lock } = await readAddonFiles(this.options.directory);
            const keys = [...new Set([...Object.keys(requested.addons), ...Object.keys(lock.addons)])].sort();
            const listed: InstalledAddon[] = [];
            for (const key of keys) {
                const request = own(requested.addons, key);
                const locked = own(lock.addons, key);
                listed.push({
                    key,
                    ...(request === undefined ? {} : { request }),
                    ...(locked === undefined ? {} : { locked }),
                    packs: await this.packsOf(key)
                });
            }
            return listed;
        });
    }

    /**
     * `addon install`: resolves the newest version the spec allows, downloads it, checks its hash
     * and its `minServer`, unpacks it into `addons/<key>/`, records it in both files and loads it.
     *
     * @param spec - What to install; see `parseAddonSpec`.
     * @param as - The local name, which a spec that names no addon needs and a second addon of
     *   the same name takes to install beside the first.
     * @returns What was locked.
     */
    public install(spec: string, as?: string): Promise<LockedAddon> {
        return this.queue.run(async () => {
            const parsed = parseAddonSpec(spec, this.options.directory, this.options.cwd ?? this.options.directory);
            const key = as ?? parsed.key;
            if (key === undefined)
                throw new PrismarineAddonErrors.InvalidAddonSpec({ spec, problem: 'name it with as <name>' });
            if (!isAddonName(key)) throw new PrismarineAddonErrors.InvalidAddonKey({ key });

            const { requested, lock } = await readAddonFiles(this.options.directory);
            if (own(requested.addons, key) !== undefined)
                throw new PrismarineAddonErrors.AddonAlreadyInstalled({ key });

            const resolved = await this.resolve(key, parsed.request);
            const request = this.requestFor(key, parsed.request, parsed.range, resolved.locked);
            const locked = await this.place(key, resolved);
            await this.write(
                { addons: { ...requested.addons, [key]: request } },
                { ...lock, addons: { ...lock.addons, [key]: locked } }
            );
            this.report('Installed', key, resolved);
            await this.reload();
            return locked;
        });
    }

    /**
     * `addon update`: resolves each addon again within its range and installs what changed. Besides
     * a sync of an `addons.json` entry its lock no longer satisfies, it is the only operation that
     * moves a locked version. An addon that fails stops the update, after the ones before it are
     * locked and loaded.
     *
     * @param key - One addon to update, or every addon when absent.
     * @returns The keys whose lock changed.
     */
    public update(key?: string): Promise<readonly string[]> {
        return this.queue.run(async () => {
            const { requested, lock } = await readAddonFiles(this.options.directory);
            if (key !== undefined && own(requested.addons, key) === undefined)
                throw new PrismarineAddonErrors.AddonNotInstalled({ key });
            const keys = key === undefined ? Object.keys(requested.addons).sort() : [key];
            const locks = { ...lock.addons };
            const changed: string[] = [];
            let relocked = false;
            try {
                for (const each of keys) {
                    const resolved = await this.resolve(each, requested.addons[each]!);
                    const before = own(locks, each);
                    if (
                        before !== undefined &&
                        sameLock(before, resolved.locked) &&
                        (await this.isPresent(each, before))
                    ) {
                        this.options.log.info(`${each} ${before.version} is up to date`);
                        this.warnDeprecated(each, resolved.locked);
                        // A lock an older server wrote lacks the deprecation the index now gives.
                        if (JSON.stringify(before) !== JSON.stringify(resolved.locked)) {
                            locks[each] = resolved.locked;
                            relocked = true;
                        }
                        continue;
                    }
                    const outgoing = await this.packsOf(each);
                    locks[each] = await this.place(each, resolved, before);
                    changed.push(each);
                    this.report(before === undefined ? 'Installed' : `Updated ${before.version} to`, each, resolved);
                    this.reportOutgoing(each, outgoing);
                }
            } finally {
                // What was replaced is locked and loaded even when a later addon fails, so the
                // lock always names what the folders hold.
                if (changed.length > 0 || relocked) await this.write(requested, { ...lock, addons: locks });
                if (changed.length > 0) await this.reload();
            }
            return changed;
        });
    }

    /**
     * `addon remove`: deletes the addon's folder, and its file when it was a pack dropped into
     * `addons/`, takes it out of both files and unloads it. The folder goes first, so a deletion
     * that fails leaves both files naming the addon, and the removal can run again.
     */
    public remove(key: string): Promise<void> {
        return this.queue.run(async () => {
            const { requested, lock } = await readAddonFiles(this.options.directory);
            const locked = own(lock.addons, key);
            if (own(requested.addons, key) === undefined && locked === undefined)
                throw new PrismarineAddonErrors.AddonNotInstalled({ key });
            const outgoing = needsRestartOf(await this.packsOf(key));
            await removeAddonFolder(path.join(this.addonsDirectory, key));
            // A pack dropped into addons/ would install again on the next sync while its file stays.
            const request = own(requested.addons, key);
            const dropped = request === undefined ? undefined : this.droppedPackOf(request);
            if (dropped !== undefined) await rm(dropped, { force: true });
            await this.write(
                { addons: without(requested.addons, key) },
                { ...lock, addons: without(lock.addons, key) }
            );
            this.options.log.info(`Removed ${key}${locked === undefined ? '' : ` ${locked.version}`}`);
            if (outgoing.length > 0)
                this.options.log.info(
                    `${key} also had ${outgoing.join(', ')}, which stay loaded until the server restarts`
                );
            this.reportWorldsKept(key, locked);
            await this.reload();
        });
    }

    /**
     * `addon sync`, which the server also runs at startup and on `/reload`: brings `addons/` in
     * line with the two files. It creates `addons/` first when it is missing.
     *
     * An `.mcaddon` or `.mcpack` dropped into `addons/` installs as if `addon install` had been
     * given its path: it joins `addons.json` under a key made from its file name. One whose file
     * was replaced installs again, and one whose file is gone leaves `addons.json` and is removed.
     *
     * A locked addon whose folder is missing, or holds another version, installs again from its
     * locked URL, and one whose download no longer matches its hash is refused. An entry of
     * `addons.json` with no lock, or whose lock it no longer allows, resolves and locks. A locked
     * addon `addons.json` no longer names is removed.
     *
     * One addon that cannot install or be removed does not stop the others, or the startup: it is
     * logged and listed, and left out of the pack list. One that could not be removed keeps its
     * lock, so the next sync tries again. A reload that failed, here or in another operation, runs
     * again on the next sync that reloads.
     *
     * @param options - `reload: false` at startup, where the content build loads the packs, and
     *   `'always'` on `/reload`, which reloads the scripts whether or not an addon changed.
     * @returns The keys that could not be installed or removed.
     */
    public sync(options: { readonly reload?: boolean | 'always' } = {}): Promise<readonly string[]> {
        return this.queue.run(async () => {
            await mkdir(this.addonsDirectory, { recursive: true });
            const files = await readAddonFiles(this.options.directory);
            const { lock } = files;
            const requested = await this.adoptDroppedPacks(files.requested);
            // A Map rather than a copy of the record: deleting a key from an object changes its
            // shape, which leaves Bun's AOT compiler unable to type objects that share it.
            const locks = new Map(Object.entries(lock.addons));
            const failed: string[] = [];
            const active = this.installed;
            let changed = false;
            // A startup sync runs before the content build, which loads what it installs.
            const startup = options.reload === false;

            for (const key of [...locks.keys()]) {
                if (own(requested.addons, key) !== undefined) continue;
                try {
                    await removeAddonFolder(path.join(this.addonsDirectory, key));
                } catch (error: unknown) {
                    failed.push(key);
                    this.options.log.error(`Could not remove ${key}: ${messageOf(error)}`);
                    continue;
                }
                locks.delete(key);
                changed = true;
                this.options.log.info(`Removed ${key}, which ${ADDONS_FILE} no longer names`);
            }

            for (const key of Object.keys(requested.addons).sort()) {
                const request = requested.addons[key]!;
                const locked = locks.get(key);
                try {
                    if (
                        locked !== undefined &&
                        allows(key, request, locked) &&
                        !(await this.droppedPackReplaced(request, locked))
                    ) {
                        // A lock from before archives listed their packs installs again from what
                        // it locked, checked against its hash, to take the packs it left out.
                        const migrating = predatesContents(locked);
                        if (!migrating && (await this.isPresent(key, locked))) continue;
                        const resolved = await this.fromLock(key, locked);
                        locks.set(key, await this.place(key, resolved, locked));
                        this.report(migrating ? 'Reinstalled' : 'Restored', key, resolved, startup);
                    } else {
                        const outgoing = await this.packsOf(key);
                        const resolved = await this.resolve(key, request);
                        locks.set(key, await this.place(key, resolved, locked));
                        this.report(
                            locked === undefined ? 'Installed' : `Updated ${locked.version} to`,
                            key,
                            resolved,
                            startup
                        );
                        this.reportOutgoing(key, outgoing);
                    }
                    changed = true;
                } catch (error: unknown) {
                    failed.push(key);
                    this.options.log.error(`Could not install ${key}: ${messageOf(error)}`);
                }
            }

            const addons = Object.fromEntries(locks);
            // A dropped pack that failed to install stays in addons.json, so the next sync tries again.
            if (changed || requested !== files.requested) await this.write(requested, { ...lock, addons }, failed);
            else await this.track(addons, failed);
            // A folder that vanished and could not come back leaves the pack list, so the scripts
            // reload even when the folder holds nothing new.
            const restart = changed || !sameKeys(active, this.installed) || this.reloadPending;
            if (options.reload === 'always' || (restart && options.reload !== false)) await this.reload(restart);
            return failed;
        });
    }

    /**
     * Writes both files and records which keys are installed.
     * @param failed - Keys left out of the pack list whatever their folders hold, as a sync's failures are.
     */
    private async write(requested: AddonsFile, lock: AddonsLockFile, failed: readonly string[] = []): Promise<void> {
        await writeAddonFiles(this.options.directory, requested, lock);
        await this.track(lock.addons, failed);
    }

    /** Records which keys are installed, the packs each holds, and the name and version each one locks. */
    private async track(locks: Readonly<Record<string, LockedAddon>>, failed: readonly string[]): Promise<void> {
        this.installed = await this.presentKeys(locks, failed);
        this.loaded = this.installed.map((key) => ({ name: locks[key]!.name, version: locks[key]!.version }));
        const packs: AddonResourcePack[] = [];
        for (const key of this.installed) packs.push(...(await this.packsOf(key)).map((pack) => ({ key, ...pack })));
        this.installedPacks = packs;
        this.installedResourcePacks = packs.filter(({ summary }) => summary.kind === 'resource');
    }

    private async presentKeys(
        locks: Readonly<Record<string, LockedAddon>>,
        failed: readonly string[]
    ): Promise<string[]> {
        const keys: string[] = [];
        for (const key of Object.keys(locks).sort()) {
            if (!failed.includes(key) && (await this.isPresent(key, locks[key]!))) keys.push(key);
        }
        return keys;
    }

    /** @param restart - Whether an addon changed, so the scripts start over from the manifests. */
    private async reload(restart = true): Promise<void> {
        if (this.options.reload === undefined) return;
        this.reloadPending = true;
        await this.options.reload({ restart });
        this.reloadPending = false;
    }

    /**
     * The pack file in `addons/` a request installs, or undefined when it names none: a pack
     * dropped into `addons/` is requested by its path there.
     */
    private droppedPackOf(request: AddonRequest): string | undefined {
        if (!('path' in request)) return undefined;
        const file = path.resolve(this.options.directory, request.path);
        return path.dirname(file) === path.resolve(this.addonsDirectory) && isPackFile(file) ? file : undefined;
    }

    /**
     * Brings `addons.json` in line with the pack files in `addons/`: each file no entry names joins
     * it, and each entry whose file is gone leaves it.
     *
     * @returns The new `addons.json`, or the one given when nothing changed.
     */
    private async adoptDroppedPacks(requested: AddonsFile): Promise<AddonsFile> {
        const dropped = (await readdir(this.addonsDirectory, { withFileTypes: true }))
            .filter((entry) => entry.isFile() && isPackFile(entry.name))
            .map((entry) => entry.name)
            .sort();
        const kept = Object.entries(requested.addons).filter(([key, request]) => {
            const file = this.droppedPackOf(request);
            if (file === undefined || dropped.includes(path.basename(file))) return true;
            this.options.log.info(`${key}'s file ${path.basename(file)} is gone from ${ADDONS_DIRECTORY}/`);
            return false;
        });
        const claimed = new Set(
            kept.map(([, request]) => this.droppedPackOf(request)).filter((file) => file !== undefined)
        );
        const addons = Object.fromEntries(kept);
        let changed = kept.length !== Object.keys(requested.addons).length;
        for (const file of dropped) {
            if (claimed.has(path.resolve(this.addonsDirectory, file))) continue;
            const key = keyOfDroppedPack(file);
            if (key === undefined) {
                this.options.log.warn(
                    `${ADDONS_DIRECTORY}/${file} has no letter or digit in its name to install it under; rename it`
                );
                continue;
            }
            if (own(addons, key) !== undefined) {
                this.options.log.warn(
                    `${ADDONS_DIRECTORY}/${file} would install as ${key}, which is already installed; rename the file`
                );
                continue;
            }
            addons[key] = { path: path.join(ADDONS_DIRECTORY, file) };
            changed = true;
            this.options.log.info(`Found ${file} in ${ADDONS_DIRECTORY}/, installing it as ${key}`);
        }
        return changed ? { addons } : requested;
    }

    /** Whether a dropped pack's file is no longer the one its lock hashed, so it installs again. */
    private async droppedPackReplaced(request: AddonRequest, locked: LockedAddon): Promise<boolean> {
        const file = this.droppedPackOf(request);
        if (file === undefined || !isPathLock(locked) || locked.sha256 === undefined) return false;
        const bytes = await readFile(file).catch(() => undefined);
        return bytes !== undefined && sha256Of(new Uint8Array(bytes)) !== locked.sha256;
    }

    /** Warns when an addon's author has deprecated the version it locks. */
    private warnDeprecated(key: string, locked: LockedAddon): void {
        const warning = deprecationWarning(key, locked);
        if (warning !== undefined) this.options.log.warn(warning);
    }

    /**
     * Logs an install, where it came from, the packs it holds, whether it is deprecated, what in
     * it waits for a restart or a player's next join, and the packs it needs that none installed
     * holds. What every install of its kind does, such as content that loads at the next restart,
     * is info whatever the archive was, so an `.mcaddon` and an addon from a source read alike; a
     * warning is something the owner should act on.
     * @param beforeContent - Whether the install runs before the content build, as a startup sync
     *   does. That build loads everything the addon holds, so nothing waits for a restart.
     */
    private report(verb: string, key: string, { locked, packs, skipped }: Resolved, beforeContent = false): void {
        const { log } = this.options;
        log.info(`${verb} ${key} ${locked.version} from ${originOf(locked)}`);
        if (packs.length > 1 || packs.some(({ summary }) => summary.kind !== 'behavior'))
            log.info(`${key} holds ${packs.map(describePack).join(', ')}`);
        this.warnDeprecated(key, locked);
        for (const { member, reason } of skipped ?? [])
            log.warn(`${key} also holds ${member}, which the server does not install: ${reason}`);
        const needsRestart = beforeContent ? [] : needsRestartOf(packs);
        if (needsRestart.length > 0)
            log.info(`${key} also has ${needsRestart.join(', ')}, which load when the server restarts`);
        if (packs.some(({ summary }) => summary.kind === 'resource'))
            log.info(`${key}'s resource packs reach each player when they next join`);

        const known = new Set([
            ...this.installedPacks.filter((pack) => pack.key !== key).map(({ summary }) => summary.uuid),
            ...packs.map(({ summary }) => summary.uuid)
        ]);
        for (const { summary } of packs) {
            const missing = summary.dependencies.filter(({ uuid }) => !known.has(uuid));
            for (const { uuid, version } of missing)
                log.warn(
                    `${key}'s ${summary.kind} pack ${summary.name} needs the pack ${uuid} ${version}, which no installed addon holds`
                );
        }
    }

    /** Says that an addon's old version had content that stays loaded until a restart. */
    private reportOutgoing(key: string, outgoing: readonly InstalledPack[]): void {
        const needsRestart = needsRestartOf(outgoing);
        if (needsRestart.length > 0)
            this.options.log.info(
                `${key}'s old version had ${needsRestart.join(', ')}, which stay loaded until the server restarts`
            );
    }

    /** Says which levels a removed addon's worlds became, since removing an addon keeps its worlds. */
    private reportWorldsKept(key: string, locked: LockedAddon | undefined): void {
        const worlds = locked === undefined || isSourceLock(locked) ? undefined : locked.worlds;
        if (worlds !== undefined && worlds.length > 0)
            this.options.log.info(
                `${key}'s worlds stay as the levels ${worlds.map(({ level }) => level).join(', ')}; world detach takes one out of play`
            );
    }

    /** What `addons.json` records for an install: a source's range is the one asked for, or `^<version>`. */
    private requestFor(
        key: string,
        request: AddonRequest,
        range: string | undefined,
        locked: LockedAddon
    ): AddonRequest {
        if (!('source' in request)) return request;
        const name = request.name ?? key;
        return {
            source: request.source,
            ...(name === key ? {} : { name }),
            version: range ?? `^${locked.version}`
        };
    }

    /**
     * Resolves a request to what installs now: the newest version in range that this server runs,
     * downloaded and checked.
     */
    private async resolve(key: string, request: AddonRequest): Promise<Resolved> {
        if ('source' in request) {
            const name = request.name ?? key;
            const baseUrl = releaseDownloadUrl(request.source);
            const index = await fetchPublishedIndex(baseUrl, this.fetcher);
            if (index === undefined)
                throw new PrismarineAddonErrors.NoAddonIndex({ source: request.source, url: baseUrl });
            const candidates = addonVersionsInRange(index, name, request.version);
            const newest = candidates[0];
            if (newest === undefined)
                throw new PrismarineAddonErrors.AddonVersionNotFound({
                    source: request.source,
                    name,
                    range: request.version
                });
            const entry = candidates.find(({ minServer }) => serverMeets(this.options.serverVersion, minServer));
            if (entry === undefined)
                throw new PrismarineAddonErrors.AddonNeedsNewerServer({
                    name,
                    version: newest.version,
                    minServer: newest.minServer,
                    server: releaseOf(this.options.serverVersion)
                });
            // Servers before listings install the same entry without the warning.
            const { deprecated, replacedBy } = entry.listing ?? {};
            const locked: LockedAddon = {
                source: request.source,
                name,
                version: entry.version,
                url: entry.url,
                sha256: entry.sha256,
                ...(deprecated === undefined ? {} : { deprecated }),
                ...(deprecated === undefined || replacedBy === undefined ? {} : { replacedBy })
            };
            return this.download(key, locked, `the index of ${request.source}`);
        }
        if ('url' in request) {
            refuseEditorProject(key, new URL(request.url).pathname);
            const bytes = await downloadPack(this.fetcher, request.url);
            return this.fromArchive(key, bytes, (version) => ({
                url: request.url,
                name: key,
                version,
                sha256: sha256Of(bytes)
            }));
        }
        return this.fromPath(key, request.path);
    }

    /** What a lock entry installs: its URL's download, checked against the lock's hash, or its path. */
    private fromLock(key: string, locked: LockedAddon): Promise<Resolved> {
        if (isPathLock(locked)) return this.fromPath(key, locked.path, locked.sha256);
        return this.download(key, locked, ADDONS_LOCK_FILE);
    }

    /** Downloads a locked URL and refuses a pack whose hash is not the one recorded. */
    private async download(
        key: string,
        locked: Exclude<LockedAddon, { path: string }>,
        recordedBy: string
    ): Promise<Resolved> {
        const bytes = await downloadPack(this.fetcher, locked.url);
        const actual = sha256Of(bytes);
        if (actual !== locked.sha256)
            throw new PrismarineAddonErrors.AddonHashMismatch({
                url: locked.url,
                actual,
                expected: locked.sha256,
                recordedBy
            });
        const resolved = this.fromArchive(key, bytes, () => locked);
        // A matching hash says these are the bytes the index or the lock vouched for, not that
        // they are the version it lists, and a folder whose version differs would never count
        // as installed.
        const version = versionOf(resolved.packs);
        if (version !== locked.version)
            throw new PrismarineAddonErrors.AddonVersionDiffers({
                key,
                actual: version,
                expected: locked.version,
                recordedBy
            });
        // An index's addon is one behavior pack, which its lock needs no list of packs for.
        if (isSourceLock(locked)) return resolved;
        return { ...resolved, locked: { ...locked, packs: lockedPacksOf(resolved.packs) } };
    }

    /** A folder, which installs as a link to it, or an `.mcpack` on disk. */
    private async fromPath(key: string, stored: string, expected?: string): Promise<Resolved> {
        const absolute = path.resolve(this.options.directory, stored);
        const found = await stat(absolute).catch(() => undefined);
        if (found === undefined) throw new PrismarineAddonErrors.AddonPathMissing({ key, path: stored });
        if (found.isDirectory()) {
            // A lock with a hash was an .mcpack, which a folder in its place must not stand in for.
            if (expected !== undefined) throw new PrismarineAddonErrors.AddonPathNotPack({ key, path: stored });
            const summary = this.checked(key, await summarizeFolder(key, absolute));
            return {
                locked: { path: stored, name: key, version: summary.version },
                packs: [{ folder: '.', summary }],
                folder: absolute
            };
        }
        refuseEditorProject(key, absolute);
        const bytes = new Uint8Array(await readFile(absolute));
        const sha256 = sha256Of(bytes);
        if (expected !== undefined && sha256 !== expected)
            throw new PrismarineAddonErrors.AddonHashMismatch({
                url: stored,
                actual: sha256,
                expected,
                recordedBy: ADDONS_LOCK_FILE
            });
        return this.fromArchive(key, bytes, (version) => ({ path: stored, name: key, version, sha256 }));
    }

    /**
     * Unpacks an archive and checks each of its packs.
     * @param lockOf - The lock entry, given the version the archive installs as; its list of packs
     *   is added here.
     */
    private fromArchive(key: string, bytes: Uint8Array, lockOf: (version: string) => LockedAddon): Resolved {
        const { packs, worlds, skipped } = unpackArchive(key, bytes);
        const resolvedPacks = packs.map(({ folder, files }) => ({
            folder,
            summary: this.checked(key, summarizeFiles(key, files))
        }));
        const files = new Map<string, Uint8Array>();
        for (const { folder, files: packFiles } of packs)
            for (const [name, data] of packFiles) files.set(folder === '.' ? name : `${folder}/${name}`, data);
        const locked = lockOf(versionOf(resolvedPacks));
        return {
            locked: isSourceLock(locked) ? locked : { ...locked, packs: lockedPacksOf(resolvedPacks) },
            packs: resolvedPacks,
            files,
            worlds,
            skipped
        };
    }

    /** Refuses a pack whose `addon.json` asks for a newer server than this one. */
    private checked(key: string, summary: PackSummary): PackSummary {
        if (summary.minServer !== undefined && !serverMeets(this.options.serverVersion, summary.minServer))
            throw new PrismarineAddonErrors.AddonNeedsNewerServer({
                name: key,
                version: summary.version,
                minServer: summary.minServer,
                server: releaseOf(this.options.serverVersion)
            });
        return summary;
    }

    /**
     * Puts a resolved addon into its folder, its files or a link to the folder it came from, and
     * imports the worlds of its archive that an earlier install did not.
     *
     * @param previous - What the key locked before, whose imported worlds stay as they are.
     * @returns What to lock, the levels its worlds became included.
     */
    private async place(key: string, resolved: Resolved, previous?: LockedAddon): Promise<LockedAddon> {
        await mkdir(this.addonsDirectory, { recursive: true });
        const target = path.join(this.addonsDirectory, key);
        if (resolved.files !== undefined) {
            const leftover = await writePackFolder(target, resolved.files);
            if (leftover !== undefined)
                this.options.log.warn(
                    `${key}'s old version stays in ${leftover.path}, since deleting it failed: ${leftover.reason}`
                );
            return this.importWorlds(key, resolved, previous);
        }
        // Linking replaces the addon's folder, so a source that is that folder, or inside it,
        // would be deleted before it is linked. Resolved paths, so no link hides the overlap.
        const source = await realpath(resolved.folder!);
        const destination = path.join(await realpath(this.addonsDirectory), key);
        if (source === destination || source.startsWith(`${destination}${path.sep}`))
            throw new PrismarineAddonErrors.AddonSourceInsideTarget({ key, path: source });
        await removeAddonFolder(target);
        // A junction on Windows, which needs no administrator rights; other systems ignore the type.
        await symlink(resolved.folder!, target, 'junction');
        return resolved.locked;
    }

    /**
     * Imports each world of an archive whose member an earlier install of the key did not import,
     * and records the level it became. A world imports once: a level is the owner's to keep, so
     * reinstalling the archive, or restoring it on another machine, never makes a second copy.
     */
    private async importWorlds(key: string, resolved: Resolved, previous?: LockedAddon): Promise<LockedAddon> {
        const { locked, worlds = [] } = resolved;
        if (isSourceLock(locked) || worlds.length === 0) return locked;
        const before = previous === undefined || isSourceLock(previous) ? [] : (previous.worlds ?? []);
        const recorded: LockedWorld[] = [];
        for (const world of worlds) {
            const known = before.find(({ member }) => member === world.member);
            if (known !== undefined) {
                recorded.push(known);
                continue;
            }
            const label = world.member === '' ? key : `${key}'s ${world.member}`;
            if (this.options.importWorld === undefined) {
                this.options.log.warn(`${label} is a world, which this server does not import`);
                continue;
            }
            let level: { readonly id: string; readonly name: string };
            try {
                level = await this.options.importWorld({ key, ...world });
            } catch (error: unknown) {
                // The worlds before it are levels already, so the lock has to record them: a
                // failure here leaves this one out, and the next install of the archive tries it
                // again.
                this.options.log.error(
                    `Could not import ${label}: ${messageOf(error)}; delete addons/${key} and run addon sync to try again`
                );
                continue;
            }
            recorded.push({ member: world.member, level: level.id });
            this.options.log.info(
                `Imported ${label} as the level ${level.name} (${level.id}); world attach ${level.name} puts it in play`
            );
        }
        return recorded.length === 0 ? locked : { ...locked, worlds: recorded };
    }

    /**
     * Whether an addon's folder holds what its lock says: the locked version's manifest, or a link
     * to the locked folder. A copy of that folder, which a backup can make of a link, is not one,
     * since edits to the folder would no longer reach it.
     */
    private async isPresent(key: string, locked: LockedAddon): Promise<boolean> {
        const target = path.join(this.addonsDirectory, key);
        if (isPathLock(locked) && locked.sha256 === undefined) {
            const link = await lstat(target).catch(() => undefined);
            if (link === undefined || !link.isSymbolicLink()) return false;
            const linked = await realpath(target).catch(() => undefined);
            const source = await realpath(path.resolve(this.options.directory, locked.path)).catch(() => undefined);
            return linked !== undefined && linked === source;
        }
        const installed = await this.packsOf(key);
        if (isSourceLock(locked) || locked.packs === undefined)
            return (
                installed.length === 1 &&
                installed[0]!.folder === '.' &&
                installed[0]!.summary.version === locked.version
            );
        if (locked.packs.length === 0) return (await stat(target).catch(() => undefined))?.isDirectory() === true;
        return (
            installed.length === locked.packs.length &&
            locked.packs.every((pack) =>
                installed.some(
                    ({ folder, summary }) =>
                        folder === pack.folder && summary.uuid === pack.uuid && summary.version === pack.version
                )
            )
        );
    }

    /** The packs an installed addon's folder holds, none when it has no readable pack. */
    private packsOf(key: string): Promise<InstalledPack[]> {
        return readInstalledPacks(key, path.join(this.addonsDirectory, key));
    }
}

/**
 * A record's own entry for a key. A key such as `constructor` is an addon name, and a plain
 * object inherits a property of that name, which must not read as an addon.
 */
const own = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
    Object.hasOwn(record, key) ? record[key] : undefined;

/** The lock's record of the packs a resolution installs. */
const lockedPacksOf = (packs: readonly ResolvedPack[]) =>
    packs.map(({ folder, summary }) => ({ folder, type: summary.kind, uuid: summary.uuid, version: summary.version }));

/**
 * Whether a lock of an archive from a URL or a path was written before locks listed an archive's
 * packs. An `.mcaddon` installed then installed its behavior pack alone, so it installs again from
 * what the lock pins, to take the rest. An index's addon is one behavior pack, and a linked folder
 * has no archive, so neither needs it.
 */
const predatesContents = (locked: LockedAddon): boolean =>
    !isSourceLock(locked) && locked.sha256 !== undefined && locked.packs === undefined;

/** Whether two key lists are the same, in the same order. */
const sameKeys = (a: readonly string[], b: readonly string[]): boolean =>
    a.length === b.length && a.every((key, index) => key === b[index]);

/** A lock without what it says about deprecation, which does not change the pack it pins. */
const pinOf = (locked: LockedAddon): LockedAddon => {
    if (!isSourceLock(locked)) return locked;
    const { deprecated: _deprecated, replacedBy: _replacedBy, ...pin } = locked;
    return pin;
};

/** Whether two locks pin the same pack from the same place. */
const sameLock = (a: LockedAddon, b: LockedAddon): boolean => JSON.stringify(pinOf(a)) === JSON.stringify(pinOf(b));

/** A record without one key. */
const without = <T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> =>
    Object.fromEntries(Object.entries(record).filter(([each]) => each !== key));

/** Whether a lock entry is still one the request allows, so a sync keeps it. */
const allows = (key: string, request: AddonRequest, locked: LockedAddon): boolean => {
    if ('source' in request)
        return (
            isSourceLock(locked) &&
            locked.source === request.source &&
            locked.name === (request.name ?? key) &&
            satisfiesAddonRange(locked.version, request.version)
        );
    if ('url' in request) return !isSourceLock(locked) && !isPathLock(locked) && locked.url === request.url;
    return isPathLock(locked) && locked.path === request.path;
};
