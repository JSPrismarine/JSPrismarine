/**
 * The packs' config files, which `config` in `@jsprismarine/server` reaches: `<folder>.config.json`
 * beside a pack's folder, so an addon installed as `addons/tab-list/` reads
 * `addons/tab-list.config.json`. The server reads, writes and watches them, since a script has
 * no file system, and parses them, so a file that fails to parse keeps its last value.
 */
import { existsSync, readFileSync, watch as watchDirectory, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { AddonConfigStore } from '@jsprismarine/script-host/host/addonConfig';
import type { ScriptPack } from '@jsprismarine/script-host/host/pack';

/**
 * The part of `fs.watch` the store uses: one watch per folder, closed when its last file is
 * no longer watched. Injected so tests fire changes without the file system's timing.
 */
export type WatchFolder = (
    folder: string,
    listener: (event: string, filename: string | Buffer | null) => void
) => { close(): void };

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
const DEFAULT_SETTLE_MS = 150;

/** The config file of a pack: its folder's name with `.config.json`, beside the folder. */
export const configPathOf = (pack: Pick<ScriptPack, 'directory'>): string =>
    `${path.resolve(pack.directory)}.config.json`;

/** One folder's watch, shared by the files in it. */
interface FolderWatch {
    readonly handle: { close(): void };
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
        writeFileSync(file, `${JSON.stringify(value, null, 4)}\n`);
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
        let watched = this.folders.get(folder);
        if (watched === undefined) {
            const files = new Map<string, Set<() => void>>();
            const watchFolder = this.options.watch ?? watchDirectory;
            // The folder rather than the file: a file that does not exist yet cannot be watched,
            // and an editor that saves by replacing the file would leave a file watch behind.
            const handle = watchFolder(folder, (_event, filename) => {
                const changedName = filename === null ? undefined : filename.toString();
                for (const [each, listeners] of files) {
                    if (changedName !== undefined && changedName !== each) continue;
                    this.settle(path.join(folder, each), listeners);
                }
            });
            watched = { handle, files };
            this.folders.set(folder, watched);
        }
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
