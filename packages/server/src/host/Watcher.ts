import type { SupervisorEvent } from '@jsprismarine/console-protocol';
import { spawnSync } from 'node:child_process';
import type { FSWatcher } from 'node:fs';
import { readdirSync, watch } from 'node:fs';
import path from 'node:path';
import type { Timers } from './ServerChild';

/** Options for {@link Watcher}. */
export interface WatcherOptions {
    /** The monorepo's `packages/` directory; every package's `src/` under it is watched. */
    packagesDir: string;
    /** Receives `supervisor.watching`, `supervisor.changed`, and `supervisor.generating`. */
    onEvent: (event: SupervisorEvent) => void;
    /** Called once per settled batch of changes with the first changed path, relative to the repository. */
    requestRestart: (reason: string) => void;
    /** How long changes may settle before one restart is requested, in milliseconds; defaults to 150. */
    debounceMs?: number;
    /**
     * Regenerates the bedrock-data JSON and returns whether it succeeded. Defaults to
     * `pnpm run generate` in `packages/bedrock-data`, which also fetches the resources
     * submodule when a fresh clone left it empty.
     */
    generate?: () => boolean;
    /** Defaults to the global timers. */
    timers?: Timers;
}

/**
 * Paths (relative to a package's `src/`) that must not restart the server: tests, the
 * resources submodule (a generator input, handled by the generate watcher), and the
 * generator's own output (a regeneration already requests one restart for the whole batch).
 */
const shouldIgnore = (pkg: string, filename: string): boolean =>
    filename.includes('.test.') ||
    (pkg === 'bedrock-data' && (filename.startsWith('resources') || filename.startsWith('generated')));

const SOURCE_FILE = /\.(ts|json)$/;

/**
 * Restarts the server when a package source file changes, and regenerates the bedrock-data
 * JSON when the generator's inputs change.
 *
 * This is the watch half of the former `scripts/dev.mts`. It reports through
 * {@link WatcherOptions.onEvent} and asks for restarts through
 * {@link WatcherOptions.requestRestart}; it never prints and never touches the child itself.
 * Changes are debounced so a save that touches several files restarts the server once, and a
 * restart requested while the generator runs is dropped because the generator requests its
 * own once it finishes.
 */
export class Watcher {
    private readonly watchers: FSWatcher[] = [];
    private readonly timers: Timers;
    private readonly debounceMs: number;
    private readonly generate: () => boolean;
    private generating = false;
    private restartTimer: ReturnType<typeof setTimeout> | undefined;
    private generateTimer: ReturnType<typeof setTimeout> | undefined;
    private pendingReason: string | undefined;

    public constructor(private readonly options: WatcherOptions) {
        this.timers = options.timers ?? globalThis;
        this.debounceMs = options.debounceMs ?? 150;
        this.generate = options.generate ?? (() => runBedrockDataGenerator(this.bedrockDataDir));
    }

    private get bedrockDataDir(): string {
        return path.join(this.options.packagesDir, 'bedrock-data');
    }

    /**
     * Generates the bedrock-data JSON once, then starts watching. The generated JSON is
     * ignored by Git, so a fresh checkout has the directory but not the files the package
     * imports; the generator skips anything already up to date, so running it on every start
     * costs nothing. Start the server after this returns so the first generation is in place.
     */
    public start(): void {
        this.generateBedrockData({ restart: false });

        // The generator's inputs live outside the restart watchers: the resources submodule
        // and the generator script itself.
        for (const dir of [
            path.join(this.bedrockDataDir, 'src', 'resources'),
            path.join(this.bedrockDataDir, 'utils')
        ]) {
            this.watch(dir, () => this.requestGenerate());
        }

        for (const entry of readdirSync(this.options.packagesDir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const pkg = entry.name;
            this.watch(path.join(this.options.packagesDir, pkg, 'src'), (filename) => {
                if (!filename || !SOURCE_FILE.test(filename) || shouldIgnore(pkg, filename)) return;
                this.requestRestart(path.join('packages', pkg, 'src', filename));
            });
        }

        this.options.onEvent({ type: 'supervisor.watching', root: this.options.packagesDir });
    }

    /** Stops watching and drops any pending restart or regeneration. */
    public close(): void {
        for (const watcher of this.watchers.splice(0)) watcher.close();
        this.timers.clearTimeout(this.restartTimer);
        this.timers.clearTimeout(this.generateTimer);
        this.pendingReason = undefined;
    }

    private watch(dir: string, onChange: (filename: string | null) => void): void {
        try {
            this.watchers.push(watch(dir, { recursive: true }, (_event, filename) => onChange(filename)));
        } catch {
            // Not every package has a src directory, and the generator inputs are optional;
            // nothing to watch there.
        }
    }

    private requestRestart(reason: string): void {
        this.pendingReason ??= reason;
        this.timers.clearTimeout(this.restartTimer);
        this.restartTimer = this.timers.setTimeout(() => {
            const first = this.pendingReason ?? reason;
            this.pendingReason = undefined;
            if (this.generating) return;
            this.options.onEvent({ type: 'supervisor.changed', path: first });
            this.options.requestRestart(first);
        }, this.debounceMs);
    }

    private requestGenerate(): void {
        this.timers.clearTimeout(this.generateTimer);
        this.generateTimer = this.timers.setTimeout(() => this.generateBedrockData({ restart: true }), this.debounceMs);
    }

    /**
     * Regenerates the bedrock-data JSON, then requests the one restart that picks the fresh
     * data up. Restarts are held back while the generator runs.
     */
    private generateBedrockData({ restart }: { restart: boolean }): void {
        this.generating = true;
        this.options.onEvent({ type: 'supervisor.generating' });
        const ok = this.generate();
        this.generating = false;
        this.options.onEvent({ type: 'supervisor.generating', ok });
        if (restart) this.requestRestart(path.join('packages', 'bedrock-data', 'src', 'generated'));
    }
}

const runBedrockDataGenerator = (bedrockDataDir: string): boolean => {
    // The generator's own output stays out of the terminal: in TUI mode it would land on top
    // of the screen, and in plain mode the `generating` events already say what is happening.
    const result = spawnSync('pnpm', ['run', 'generate'], { cwd: bedrockDataDir, stdio: 'ignore' });
    return result.status === 0;
};
