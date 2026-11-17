import type { SupervisorEvent } from '@jsprismarine/console-protocol';
import { spawn } from 'node:child_process';
import { hash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, watch } from 'node:fs';
import path from 'node:path';
import type { Timers } from './ServerChild';

/**
 * The part of `fs.watch` the watcher uses: one recursive watch per directory, closed on
 * {@link Watcher.close}. Injected so tests can fire changes without touching the file system.
 */
export type WatchDirectory = (
    dir: string,
    options: { recursive: true },
    listener: (event: string, filename: string | null) => void
) => { close(): void };

/** Options for {@link Watcher}. */
export interface WatcherOptions {
    /** The monorepo's `packages/` directory. */
    packagesDir: string;
    /** Pack directories and archives from the server's content settings and environment. */
    contentPackPaths?: readonly string[];
    /** Receives `supervisor.watching`, `supervisor.changed`, and `supervisor.generating`. */
    onEvent: (event: SupervisorEvent) => void;
    /** Called once per settled batch of changes with the first changed path, relative to the repository. */
    requestRestart: (reason: string) => void;
    /**
     * Called once per settled batch of behavior pack script changes, with the first changed
     * path, so the server reloads its scripts as `/reload` does instead of restarting. Without
     * it, a script change does nothing.
     */
    requestScriptReload?: (reason: string) => void;
    /** How long changes may settle before one restart is requested, in milliseconds; defaults to 150. */
    debounceMs?: number;
    /**
     * Regenerates the bedrock-data JSON and resolves whether it succeeded; a rejection counts
     * as a failure. Defaults to `pnpm run generate` in `packages/bedrock-data`.
     */
    generate?: () => boolean | Promise<boolean>;
    /**
     * Whether the server runs from the packages' built `dist/` rather than their `src/`. Source
     * edits then do nothing until a `build:watch` rebuilds them, so the watcher waits for the
     * rebuilt output: restarting on the source change would start the old code again. A
     * rebuild that writes the same bytes restarts nothing.
     */
    built?: boolean;
    /** Defaults to the global timers. */
    timers?: Timers;
    /** Defaults to `fs.watch`. */
    watch?: WatchDirectory;
}

/**
 * Paths (relative to a package's `src/`) that must not restart the server: tests, the
 * bedrock-data captures under `jsp/` (the generator's input, handled by the generate watcher),
 * and the generator's own output (a regeneration already requests one restart for the whole
 * batch).
 */
const shouldIgnore = (pkg: string, filename: string): boolean =>
    filename.includes('.test.') ||
    (pkg === 'bedrock-data' && (filename.startsWith('jsp') || filename.startsWith('generated')));

const SOURCE_FILE = /\.(ts|json)$/;
/** What a package build writes that the server loads; declarations and source maps are not loaded. */
const BUILT_FILE = /\.(m?js|json)$/;
const PACK_DATA_FILE = /\.(json|mcfunction|mcmeta|brarchive)$/i;
/** A behavior pack's script, which `/reload` picks up without a restart. */
const PACK_SCRIPT_FILE = /\.m?js$/i;

/** A file's content hash, or `undefined` when it cannot be read, such as after a delete. */
const hashFile = (file: string): string | undefined => {
    try {
        return hash('sha1', readFileSync(file));
    } catch {
        return undefined;
    }
};

/**
 * Restarts the server when a package source file or loaded pack data file changes, reloads its
 * behavior pack scripts when a pack's script changes, and regenerates the bedrock-data JSON when
 * the generator's inputs change.
 *
 * This is the watch half of the former `scripts/dev.mts`. It reports through
 * {@link WatcherOptions.onEvent} and asks for restarts through
 * {@link WatcherOptions.requestRestart}; it never prints and never touches the child itself.
 * Changes are debounced so a save that touches several files restarts the server once, and a
 * restart requested while the generator runs is dropped because the generator requests its
 * own once it finishes. The generator runs as a child process without blocking the host, so
 * the frontend keeps painting and reading keys while it works.
 */
export class Watcher {
    private readonly watchers: Array<{ close(): void }> = [];
    private readonly watchDirectory: WatchDirectory;
    private readonly timers: Timers;
    private readonly debounceMs: number;
    private readonly generate: () => boolean | Promise<boolean>;
    private generating = false;
    private generateQueued = false;
    private restartTimer: ReturnType<typeof setTimeout> | undefined;
    private reloadTimer: ReturnType<typeof setTimeout> | undefined;
    private pendingReload: string | undefined;
    private generateTimer: ReturnType<typeof setTimeout> | undefined;
    /** The changed paths of the batch waiting on the debounce, each with the built file to check, if any. */
    private readonly pending = new Map<string, string | undefined>();
    /** The content hash of each built file the server loads, by absolute path. */
    private readonly builtHashes = new Map<string, string>();

    public constructor(private readonly options: WatcherOptions) {
        this.timers = options.timers ?? globalThis;
        this.watchDirectory = options.watch ?? watch;
        this.debounceMs = options.debounceMs ?? 250;
        this.generate = options.generate ?? (() => runBedrockDataGenerator(this.bedrockDataDir));
    }

    private get bedrockDataDir(): string {
        return path.join(this.options.packagesDir, 'bedrock-data');
    }

    /**
     * Generates the bedrock-data JSON once, then starts watching. The generated JSON is
     * ignored by Git, so a fresh checkout has the directory but not the files the package
     * imports; the generator skips anything already up to date, so running it on every start
     * costs nothing. Start the server after this resolves so the first generation is in place.
     */
    public async start(): Promise<void> {
        // `pnpm dev` builds every package, then starts `build:watch`, whose first pass writes
        // the same files again. Hash them before that pass gets far, so it restarts nothing.
        if (this.options.built === true) this.recordBuiltFiles();

        await this.generateBedrockData({ restart: false });

        // The generator's inputs live outside the restart watchers: the Bedrock captures and
        // the generator script itself.
        for (const dir of [path.join(this.bedrockDataDir, 'src', 'jsp'), path.join(this.bedrockDataDir, 'utils')]) {
            this.watch(dir, () => this.requestGenerate());
        }

        for (const entry of readdirSync(this.options.packagesDir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const pkg = entry.name;
            const built = this.options.built === true;
            const directory = built ? 'dist' : 'src';
            this.watch(path.join(this.options.packagesDir, pkg, directory), (filename) => {
                if (!filename || !(built ? BUILT_FILE : SOURCE_FILE).test(filename)) return;
                if (!built && shouldIgnore(pkg, filename)) return;
                const builtFile = built ? path.join(this.options.packagesDir, pkg, directory, filename) : undefined;
                this.requestRestart(path.join('packages', pkg, directory, filename), builtFile);
            });
        }

        const overlayDir = path.join(this.options.packagesDir, 'blocks', 'vanilla_overlay');
        const packPaths = new Set(
            [overlayDir, ...(this.options.contentPackPaths ?? [])].map((value) => path.resolve(value))
        );
        for (const packPath of packPaths) this.watchPack(packPath);

        this.options.onEvent({ type: 'supervisor.watching', root: this.options.packagesDir });
    }

    /** Stops watching and drops any pending restart or regeneration. */
    public close(): void {
        for (const watcher of this.watchers.splice(0)) watcher.close();
        this.timers.clearTimeout(this.restartTimer);
        this.timers.clearTimeout(this.reloadTimer);
        this.timers.clearTimeout(this.generateTimer);
        this.pending.clear();
        this.pendingReload = undefined;
    }

    private recordBuiltFiles(): void {
        for (const entry of readdirSync(this.options.packagesDir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const dist = path.join(this.options.packagesDir, entry.name, 'dist');
            let files: string[];
            try {
                files = readdirSync(dist, { recursive: true, encoding: 'utf8' });
            } catch {
                continue;
            }
            for (const file of files) {
                if (!BUILT_FILE.test(file)) continue;
                const absolute = path.join(dist, file);
                const digest = hashFile(absolute);
                if (digest !== undefined) this.builtHashes.set(absolute, digest);
            }
        }
    }

    /** Whether a built file's bytes differ from the last ones seen, recording the new ones. */
    private builtFileChanged(file: string): boolean {
        const digest = hashFile(file);
        if (digest === this.builtHashes.get(file)) return false;
        if (digest === undefined) this.builtHashes.delete(file);
        else this.builtHashes.set(file, digest);
        return true;
    }

    private watch(dir: string, onChange: (filename: string | null) => void): void {
        try {
            this.watchers.push(this.watchDirectory(dir, { recursive: true }, (_event, filename) => onChange(filename)));
        } catch {
            // Not every package has a src directory, and the generator inputs are optional;
            // nothing to watch there.
        }
    }

    private watchPack(packPath: string): void {
        let directory: boolean;
        try {
            directory = statSync(packPath).isDirectory();
        } catch {
            return;
        }

        const repositoryRoot = path.resolve(this.options.packagesDir, '..');
        if (directory) {
            this.watch(packPath, (filename) => {
                if (!filename) return;
                const changed = path.relative(repositoryRoot, path.join(packPath, filename));
                if (PACK_SCRIPT_FILE.test(filename)) this.requestScriptReload(changed);
                else if (PACK_DATA_FILE.test(filename)) this.requestRestart(changed);
            });
            return;
        }

        const archiveName = path.basename(packPath);
        this.watch(path.dirname(packPath), (filename) => {
            if (filename !== archiveName) return;
            this.requestRestart(path.relative(repositoryRoot, packPath));
        });
    }

    /**
     * Queues a restart for the settled batch. A change to `builtFile` counts only when its bytes
     * differ, checked once the batch settles, after the build has finished writing it.
     */
    private requestRestart(reason: string, builtFile?: string): void {
        if (!this.pending.has(reason)) this.pending.set(reason, builtFile);
        this.timers.clearTimeout(this.restartTimer);
        this.restartTimer = this.timers.setTimeout(() => {
            // Check every built file, not only up to the first change, so each hash stays current.
            const changed = [...this.pending].filter(([, file]) => file === undefined || this.builtFileChanged(file));
            this.pending.clear();
            const first = changed[0]?.[0];
            if (first === undefined || this.generating) return;
            this.options.onEvent({ type: 'supervisor.changed', path: first });
            this.options.requestRestart(first);
        }, this.debounceMs);
    }

    private requestScriptReload(reason: string): void {
        const reload = this.options.requestScriptReload;
        if (reload === undefined) return;
        this.pendingReload ??= reason;
        this.timers.clearTimeout(this.reloadTimer);
        this.reloadTimer = this.timers.setTimeout(() => {
            const first = this.pendingReload ?? reason;
            this.pendingReload = undefined;
            this.options.onEvent({ type: 'supervisor.changed', path: first });
            reload(first);
        }, this.debounceMs);
    }

    private requestGenerate(): void {
        this.timers.clearTimeout(this.generateTimer);
        this.generateTimer = this.timers.setTimeout(
            () => void this.generateBedrockData({ restart: true }),
            this.debounceMs
        );
    }

    /**
     * Regenerates the bedrock-data JSON, then requests the one restart that picks the fresh
     * data up. Restarts are held back while the generator runs, and an input that changes
     * mid-run queues one more run so its change is not lost.
     */
    private async generateBedrockData({ restart }: { restart: boolean }): Promise<void> {
        if (this.generating) {
            this.generateQueued = true;
            return;
        }
        this.generating = true;
        this.options.onEvent({ type: 'supervisor.generating' });
        let ok: boolean;
        try {
            ok = await this.generate();
        } catch {
            ok = false;
        }
        this.generating = false;
        this.options.onEvent({ type: 'supervisor.generating', ok });
        if (this.generateQueued) {
            this.generateQueued = false;
            await this.generateBedrockData({ restart: true });
            return;
        }
        if (restart) this.requestRestart(path.join('packages', 'bedrock-data', 'src', 'generated'));
    }
}

const runBedrockDataGenerator = (bedrockDataDir: string): Promise<boolean> =>
    new Promise((done) => {
        // The generator's own output stays out of the terminal: in TUI mode it would land on
        // top of the screen, and in plain mode the `generating` events already say what is
        // happening. On Windows `pnpm` is a `.cmd` shim, which only a shell can start.
        const child = spawn('pnpm', ['run', 'generate'], {
            cwd: bedrockDataDir,
            stdio: 'ignore',
            shell: process.platform === 'win32'
        });
        child.on('error', () => done(false));
        child.on('close', (code) => done(code === 0));
    });
