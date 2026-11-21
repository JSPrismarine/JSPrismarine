/**
 * The packs' config files, which `config` in `@jsprismarine/server` reaches: `<folder>.config.json`
 * beside a pack's folder, so an addon installed as `addons/tab-list/` reads
 * `addons/tab-list.config.json`. The server reads, writes and watches them, since a script has
 * no file system, and parses them, so a file that fails to parse keeps its last value.
 */
import {
    chmodSync,
    existsSync,
    readFileSync,
    renameSync,
    rmSync,
    statSync,
    watch as watchDirectory,
    writeFileSync
} from 'node:fs';
import path from 'node:path';

import type { AddonConfigStore } from '@jsprismarine/script-host/host/addonConfig';
import type { ScriptPack } from '@jsprismarine/script-host/host/pack';

import { NEW_FILE_MODE } from '../config/JsonFile';

/**
 * The part of `fs.watch` the store uses: one watch per folder, closed when its last file is
 * no longer watched. Injected so tests fire changes without the file system's timing.
 */
export type WatchFolder = (
    folder: string,
    listener: (event: string, filename: string | Buffer | null) => void
) => FolderWatchHandle;

/** What a folder watch gives back: `fs.watch`'s watcher, or a test's stand-in for it. */
export interface FolderWatchHandle {
    close(): void;
    /** Tells `listener` of an error that ended the watch, as `fs.watch`'s watcher does. */
    on?(event: 'error', listener: (error: Error) => void): unknown;
}

/** What the store logs with and watches with. */
export interface AddonConfigFilesOptions {
    /** Told of a file that fails to parse, once per failure. */
    readonly log: { warn(message: string): void };
    /** Defaults to `fs.watch`. */
    readonly watch?: WatchFolder;
    /** How long a file's changes may settle before one `changed` runs, in milliseconds. */
    readonly settleMs?: number;
}

/** How long a file's changes settle by default: an editor's save writes several events. */
export const DEFAULT_SETTLE_MS = 150;

/** The config file of a pack: its folder's name with `.config.json`, beside the folder. */
export const configPathOf = (pack: Pick<ScriptPack, 'directory'>): string =>
    `${path.resolve(pack.directory)}.config.json`;

/** One folder's watch, shared by the files in it. The record outlives a watch that fails and is started again. */
interface FolderWatch {
    /** The watch now in place, which a recovery replaces. */
    handle: FolderWatchHandle;
    /** The listeners of each file in the folder, by file name. */
    readonly files: Map<string, Set<() => void>>;
}

/** The config files of the packs, read, written and watched on disk. */
export class AddonConfigFiles implements AddonConfigStore {
    private readonly options: AddonConfigFilesOptions;
    /** The last value each file parsed to, by path, which a file that fails to parse keeps. */
    private readonly last = new Map<string, unknown>();
    /** The files whose last parse failure the log has, so a failure is logged once until a parse succeeds. */
    private readonly reported = new Set<string>();
    private readonly folders = new Map<string, FolderWatch>();
    /** The files of a folder whose watch failed and could not start again, until a pack watches one. */
    private readonly dormant = new Map<string, Map<string, Set<() => void>>>();
    /** The settle timer of each file with changes pending, by path. */
    private readonly settling = new Map<string, ReturnType<typeof setTimeout>>();

    public constructor(options: AddonConfigFilesOptions) {
        this.options = options;
    }

    /** The parsed JSON of the pack's file, the last good value when it fails to parse, or undefined without a file. */
    public read(pack: ScriptPack): unknown {
        const file = configPathOf(pack);
        if (!existsSync(file)) {
            this.last.delete(file);
            this.reported.delete(file);
            return undefined;
        }
        try {
            const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
            this.last.set(file, value);
            this.reported.delete(file);
            return value;
        } catch (error: unknown) {
            if (!this.reported.has(file)) {
                this.reported.add(file);
                this.options.log.warn(
                    `[Scripting] [${pack.name}] ${file} does not parse, so the pack keeps the config it had: ${error instanceof Error ? error.message : String(error)}`
                );
            }
            return this.last.get(file);
        }
    }

    /** Writes the value to the pack's file as indented JSON. */
    public write(pack: ScriptPack, value: unknown): void {
        const file = configPathOf(pack);
        // Written beside the file and renamed over it, so a crash or a full disk mid-write leaves
        // the file the owner had rather than half of the new one. The temp file starts readable
        // by the server's user alone and takes the file's own mode before the rename, so a config
        // the owner made private stays private.
        const temporary = `${file}.${process.pid}.tmp`;
        try {
            writeFileSync(temporary, `${JSON.stringify(value, null, 4)}\n`, { mode: 0o600 });
            chmodSync(temporary, existsSync(file) ? statSync(file).mode & 0o777 : NEW_FILE_MODE);
            renameSync(temporary, file);
        } catch (error: unknown) {
            rmSync(temporary, { force: true });
            throw error;
        }
        this.last.set(file, value);
        this.reported.delete(file);
    }

    /**
     * Tells `changed` once a burst of changes to the pack's file has settled. Returns a function
     * that stops it, and closes the folder's watch with the last watcher of a file in it.
     */
    public watch(pack: ScriptPack, changed: () => void): () => void {
        const file = configPathOf(pack);
        const folder = path.dirname(file);
        const name = path.basename(file);
        const watched = this.folders.get(folder) ?? this.watchFolder(folder, this.dormant.get(folder) ?? new Map());
        this.dormant.delete(folder);
        const listeners = watched.files.get(name) ?? new Set();
        watched.files.set(name, listeners);
        listeners.add(changed);
        return () => {
            listeners.delete(changed);
            if (listeners.size > 0) return;
            watched.files.delete(name);
            const timer = this.settling.get(file);
            if (timer !== undefined) clearTimeout(timer);
            this.settling.delete(file);
            if (watched.files.size > 0) return;
            watched.handle.close();
            this.folders.delete(folder);
        };
    }

    /**
     * Starts the one watch of a folder, for the files in it. The folder rather than the file: a
     * file that does not exist yet cannot be watched, and an editor that saves by replacing the
     * file would leave a file watch behind. A watch that fails is closed and started once more
     * with the same files; when that fails too, the folder's files are no longer followed until a
     * pack watches one of them again, which starts the watch for all of them, and the log says so.
     */
    private watchFolder(folder: string, files: Map<string, Set<() => void>>): FolderWatch {
        const watched: FolderWatch = { handle: this.startWatch(folder, files), files };
        this.folders.set(folder, watched);
        this.followErrors(folder, watched);
        return watched;
    }

    /** Opens the watch of a folder, telling the settle timer of each file in it that changes. */
    private startWatch(folder: string, files: Map<string, Set<() => void>>): FolderWatchHandle {
        const watchFolder: WatchFolder = this.options.watch ?? watchDirectory;
        return watchFolder(folder, (_event, filename) => {
            const changedName = filename === null ? undefined : filename.toString();
            for (const [each, listeners] of files) {
                if (changedName !== undefined && changedName !== each) continue;
                this.settle(path.join(folder, each), listeners);
            }
        });
    }

    /**
     * Starts a folder's watch again when it fails, in the same record, so the stop functions the
     * packs hold close whichever watch is in place. When the new watch fails to start, the folder's
     * files stay dormant until a pack watches one of them again, and the log says so.
     */
    private followErrors(folder: string, watched: FolderWatch): void {
        const failed = watched.handle;
        failed.on?.('error', (error) => {
            if (this.folders.get(folder) !== watched || watched.handle !== failed) return;
            failed.close();
            try {
                watched.handle = this.startWatch(folder, watched.files);
                this.followErrors(folder, watched);
                this.options.log.warn(
                    `[Scripting] The watch on ${folder} failed and was started again: ${error.message}`
                );
            } catch (again: unknown) {
                this.folders.delete(folder);
                this.dormant.set(folder, watched.files);
                this.options.log.warn(
                    `[Scripting] The watch on ${folder} failed, and could not be started again, so changes to its config files are not followed until a pack watches one again: ${again instanceof Error ? again.message : String(again)}`
                );
            }
        });
    }

    /** Runs a file's listeners once its changes have settled. */
    private settle(file: string, listeners: ReadonlySet<() => void>): void {
        const pending = this.settling.get(file);
        if (pending !== undefined) clearTimeout(pending);
        this.settling.set(
            file,
            setTimeout(() => {
                this.settling.delete(file);
                for (const listener of listeners) listener();
            }, this.options.settleMs ?? DEFAULT_SETTLE_MS)
        );
    }
}
