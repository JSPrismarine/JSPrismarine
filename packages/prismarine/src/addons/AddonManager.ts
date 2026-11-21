import { lstat, mkdir, readFile, realpath, stat, symlink } from 'node:fs/promises';
import path from 'node:path';

import { addonVersionsInRange, isAddonName, satisfiesAddonRange } from '@jsprismarine/addon-tools/addonIndex';
import { fetchPublishedIndex, releaseDownloadUrl } from '@jsprismarine/addon-tools/build';
import { PrismarineAddonErrors } from '@jsprismarine/errors/prismarine/addon';

import type { AddonRequest, AddonsFile, AddonsLockFile, LockedAddon } from './addonFiles';
import {
    ADDONS_DIRECTORY,
    ADDONS_FILE,
    ADDONS_LOCK_FILE,
    isPathLock,
    isSourceLock,
    readAddonFiles,
    writeAddonFiles
} from './addonFiles';
import type { PackSummary } from './addonPack';
import {
    downloadPack,
    httpsFetch,
    messageOf,
    releaseOf,
    removeAddonFolder,
    serverMeets,
    sha256Of,
    summarizeFiles,
    summarizeFolder,
    unpackPack,
    writePackFolder
} from './addonPack';
import { parseAddonSpec } from './addonSpec';
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
    /** Loads the pack list again after an install, an update or a removal changed it. */
    readonly reload?: () => Promise<void>;
}

/** One installed addon, as `addon list` shows it. */
export interface InstalledAddon {
    readonly key: string;
    readonly request?: AddonRequest;
    readonly locked?: LockedAddon;
}

/** What a resolution produced: the lock entry and the pack's files, or a folder to link. */
interface Resolved {
    readonly locked: LockedAddon;
    readonly summary: PackSummary;
    readonly files?: ReadonlyMap<string, Uint8Array>;
    readonly folder?: string;
}

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
        return this.installed.map((key) => path.join(this.addonsDirectory, key));
    }

    /** Every key either file names, with what each says about it. */
    public list(): Promise<readonly InstalledAddon[]> {
        return this.queue.run(async () => {
            const { requested, lock } = await readAddonFiles(this.options.directory);
            const keys = [...new Set([...Object.keys(requested.addons), ...Object.keys(lock.addons)])].sort();
            return keys.map((key) => {
                const request = own(requested.addons, key);
                const locked = own(lock.addons, key);
                return {
                    key,
                    ...(request === undefined ? {} : { request }),
                    ...(locked === undefined ? {} : { locked })
                };
            });
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
            await this.place(key, resolved);
            await this.write(
                { addons: { ...requested.addons, [key]: request } },
                { ...lock, addons: { ...lock.addons, [key]: resolved.locked } }
            );
            this.report('Installed', key, resolved);
            await this.reload();
            return resolved.locked;
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
                    const outgoing = await this.summaryOf(each);
                    await this.place(each, resolved);
                    locks[each] = resolved.locked;
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
     * `addon remove`: deletes the addon's folder, takes it out of both files and unloads it. The
     * folder goes first, so a deletion that fails leaves both files naming the addon, and the
     * removal can run again.
     */
    public remove(key: string): Promise<void> {
        return this.queue.run(async () => {
            const { requested, lock } = await readAddonFiles(this.options.directory);
            const locked = own(lock.addons, key);
            if (own(requested.addons, key) === undefined && locked === undefined)
                throw new PrismarineAddonErrors.AddonNotInstalled({ key });
            const summary = await this.summaryOf(key);
            await removeAddonFolder(path.join(this.addonsDirectory, key));
            await this.write(
                { addons: without(requested.addons, key) },
                { ...lock, addons: without(lock.addons, key) }
            );
            this.options.log.info(`Removed ${key}${locked === undefined ? '' : ` ${locked.version}`}`);
            if (summary !== undefined && summary.needsRestart.length > 0)
                this.options.log.warn(
                    `${key} also had ${summary.needsRestart.join(', ')}, which stay loaded until the server restarts`
                );
            await this.reload();
        });
    }

    /**
     * `addon sync`, which the server also runs at startup: brings `addons/` in line with the two
     * files. A locked addon whose folder is missing, or holds another version, installs again from
     * its locked URL, and one whose download no longer matches its hash is refused. An entry of
     * `addons.json` with no lock, or whose lock it no longer allows, resolves and locks. A locked
     * addon `addons.json` no longer names is removed.
     *
     * One addon that cannot install or be removed does not stop the others, or the startup: it is
     * logged and listed, and left out of the pack list. One that could not be removed keeps its
     * lock, so the next sync tries again. A reload that failed, here or in another operation, runs
     * again on the next sync that reloads.
     *
     * @param options - `reload: false` at startup, where the content build loads the packs.
     * @returns The keys that could not be installed or removed.
     */
    public sync(options: { readonly reload?: boolean } = {}): Promise<readonly string[]> {
        return this.queue.run(async () => {
            const { requested, lock } = await readAddonFiles(this.options.directory);
            // A Map rather than a copy of the record: deleting a key from an object changes its
            // shape, which leaves Bun's AOT compiler unable to type objects that share it.
            const locks = new Map(Object.entries(lock.addons));
            const failed: string[] = [];
            const active = this.installed;
            let changed = false;

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
                    if (locked !== undefined && allows(key, request, locked)) {
                        if (await this.isPresent(key, locked)) continue;
                        const resolved = await this.fromLock(key, locked);
                        await this.place(key, resolved);
                        this.report('Restored', key, resolved);
                    } else {
                        const outgoing = await this.summaryOf(key);
                        const resolved = await this.resolve(key, request);
                        await this.place(key, resolved);
                        locks.set(key, resolved.locked);
                        this.report('Installed', key, resolved);
                        this.reportOutgoing(key, outgoing);
                    }
                    changed = true;
                } catch (error: unknown) {
                    failed.push(key);
                    this.options.log.error(`Could not install ${key}: ${messageOf(error)}`);
                }
            }

            const addons = Object.fromEntries(locks);
            if (changed) await this.write(requested, { ...lock, addons }, failed);
            else this.installed = await this.presentKeys(addons, failed);
            // A folder that vanished and could not come back leaves the pack list, so the scripts
            // reload even when the folder holds nothing new.
            const listChanged = !sameKeys(active, this.installed);
            if ((changed || listChanged || this.reloadPending) && options.reload !== false) await this.reload();
            return failed;
        });
    }

    /**
     * Writes both files and records which keys are installed.
     * @param failed - Keys left out of the pack list whatever their folders hold, as a sync's failures are.
     */
    private async write(requested: AddonsFile, lock: AddonsLockFile, failed: readonly string[] = []): Promise<void> {
        await writeAddonFiles(this.options.directory, requested, lock);
        this.installed = await this.presentKeys(lock.addons, failed);
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

    private async reload(): Promise<void> {
        if (this.options.reload === undefined) return;
        this.reloadPending = true;
        await this.options.reload();
        this.reloadPending = false;
    }

    /** Warns when an addon's author has deprecated the version it locks. */
    private warnDeprecated(key: string, locked: LockedAddon): void {
        const warning = deprecationWarning(key, locked);
        if (warning !== undefined) this.options.log.warn(warning);
    }

    /** Logs an install, where it came from, whether it is deprecated and what in it waits for a restart. */
    private report(verb: string, key: string, { locked, summary }: Resolved): void {
        this.options.log.info(`${verb} ${key} ${locked.version} from ${originOf(locked)}`);
        this.warnDeprecated(key, locked);
        if (summary.needsRestart.length > 0)
            this.options.log.warn(
                `${key} also has ${summary.needsRestart.join(', ')}, which load when the server restarts`
            );
    }

    /** Warns that an addon's old version had content that stays loaded until a restart. */
    private reportOutgoing(key: string, outgoing: PackSummary | undefined): void {
        if (outgoing !== undefined && outgoing.needsRestart.length > 0)
            this.options.log.warn(
                `${key}'s old version had ${outgoing.needsRestart.join(', ')}, which stay loaded until the server restarts`
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
            const bytes = await downloadPack(this.fetcher, request.url);
            const files = unpackPack(key, bytes);
            const summary = this.checked(key, summarizeFiles(key, files));
            return {
                locked: { url: request.url, name: key, version: summary.version, sha256: sha256Of(bytes) },
                summary,
                files
            };
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
        const files = unpackPack(key, bytes);
        const summary = this.checked(key, summarizeFiles(key, files));
        // A matching hash says these are the bytes the index or the lock vouched for, not that
        // they are the version it lists, and a folder whose version differs would never count
        // as installed.
        if (summary.version !== locked.version)
            throw new PrismarineAddonErrors.AddonVersionDiffers({
                key,
                actual: summary.version,
                expected: locked.version,
                recordedBy
            });
        return { locked, summary, files };
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
            return { locked: { path: stored, name: key, version: summary.version }, summary, folder: absolute };
        }
        const bytes = new Uint8Array(await readFile(absolute));
        const sha256 = sha256Of(bytes);
        if (expected !== undefined && sha256 !== expected)
            throw new PrismarineAddonErrors.AddonHashMismatch({
                url: stored,
                actual: sha256,
                expected,
                recordedBy: ADDONS_LOCK_FILE
            });
        const files = unpackPack(key, bytes);
        const summary = this.checked(key, summarizeFiles(key, files));
        return { locked: { path: stored, name: key, version: summary.version, sha256 }, summary, files };
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

    /** Puts a resolved addon into its folder: its files, or a link to the folder it came from. */
    private async place(key: string, resolved: Resolved): Promise<void> {
        await mkdir(this.addonsDirectory, { recursive: true });
        const target = path.join(this.addonsDirectory, key);
        if (resolved.files !== undefined) {
            const leftover = await writePackFolder(target, resolved.files);
            if (leftover !== undefined)
                this.options.log.warn(
                    `${key}'s old version stays in ${leftover.path}, since deleting it failed: ${leftover.reason}`
                );
            return;
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
        const summary = await this.summaryOf(key);
        return summary?.version === locked.version;
    }

    /** What an installed addon's folder holds, or undefined when it has no readable pack. */
    private async summaryOf(key: string): Promise<PackSummary | undefined> {
        try {
            return await summarizeFolder(key, path.join(this.addonsDirectory, key));
        } catch {
            return undefined;
        }
    }
}

/**
 * A record's own entry for a key. A key such as `constructor` is an addon name, and a plain
 * object inherits a property of that name, which must not read as an addon.
 */
const own = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
    Object.hasOwn(record, key) ? record[key] : undefined;

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
