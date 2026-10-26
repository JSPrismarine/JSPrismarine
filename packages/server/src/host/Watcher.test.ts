import type { SupervisorEvent } from '@jsprismarine/console-protocol';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WatchDirectory } from './Watcher';
import { Watcher } from './Watcher';

const roots: string[] = [];
const watchers: Watcher[] = [];

const makePackages = () => {
    const root = mkdtempSync(path.join(tmpdir(), 'jsp-watcher-'));
    roots.push(root);
    const packagesDir = path.join(root, 'packages');
    mkdirSync(path.join(packagesDir, 'alpha', 'src'), { recursive: true });
    mkdirSync(path.join(packagesDir, 'bedrock-data', 'src', 'generated'), { recursive: true });
    mkdirSync(path.join(packagesDir, 'bedrock-data', 'utils'), { recursive: true });
    mkdirSync(path.join(packagesDir, 'blocks', 'src'), { recursive: true });
    mkdirSync(path.join(packagesDir, 'blocks', 'vanilla_overlay', 'blocks'), { recursive: true });
    return packagesDir;
};

/**
 * Stands in for `fs.watch`, whose delivery on macOS is too uneven to test against: it records
 * the listener per directory and lets the test fire a change under one of them.
 */
const fakeWatch = () => {
    const listeners = new Map<string, (event: string, filename: string | null) => void>();
    const closed: string[] = [];
    const watch: WatchDirectory = (dir, _options, listener) => {
        listeners.set(dir, listener);
        return {
            close() {
                closed.push(dir);
            }
        };
    };
    const change = (dir: string, filename: string | null): void => {
        const listener = listeners.get(dir);
        if (!listener) throw new Error(`nothing watches ${dir}`);
        listener('change', filename);
    };
    return { watch, change, closed, watched: () => [...listeners.keys()] };
};

/** A generator the test finishes by hand, so a change can arrive while it runs. */
const manualGenerator = () => {
    let finish: ((ok: boolean) => void) | undefined;
    const generate = vi.fn(
        () =>
            new Promise<boolean>((done) => {
                finish = done;
            })
    );
    return { generate, finish: (ok: boolean) => finish?.(ok) };
};

const DEBOUNCE_MS = 20;

const startWatcher = async (
    packagesDir: string,
    generate: () => boolean | Promise<boolean> = () => true,
    contentPackPaths: readonly string[] = []
) => {
    const fs = fakeWatch();
    const events: SupervisorEvent[] = [];
    const requestRestart = vi.fn<(reason: string) => void>();
    const watcher = new Watcher({
        packagesDir,
        contentPackPaths,
        onEvent: (event) => events.push(event),
        requestRestart,
        generate,
        watch: fs.watch,
        debounceMs: DEBOUNCE_MS
    });
    watchers.push(watcher);
    const started = watcher.start();
    return { events, requestRestart, watcher, fs, started };
};

const debounced = () => new Promise((done) => setTimeout(done, DEBOUNCE_MS * 3));

const until = async (ready: () => boolean, ms = 3000): Promise<void> => {
    const deadline = Date.now() + ms;
    while (!ready()) {
        if (Date.now() > deadline) throw new Error('timed out');
        await new Promise((done) => setTimeout(done, 5));
    }
};

afterEach(() => {
    for (const watcher of watchers.splice(0)) watcher.close();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Watcher', () => {
    it('generates once on start and reports what it watches', async () => {
        const generate = vi.fn(async () => true);
        const packagesDir = makePackages();

        const { events, requestRestart, fs, started } = await startWatcher(packagesDir, generate);
        await started;

        expect(generate).toHaveBeenCalledTimes(1);
        expect(events).toEqual([
            { type: 'supervisor.generating' },
            { type: 'supervisor.generating', ok: true },
            { type: 'supervisor.watching', root: packagesDir }
        ]);
        expect(fs.watched()).toEqual([
            path.join(packagesDir, 'bedrock-data', 'src', 'resources'),
            path.join(packagesDir, 'bedrock-data', 'utils'),
            path.join(packagesDir, 'alpha', 'src'),
            path.join(packagesDir, 'bedrock-data', 'src'),
            path.join(packagesDir, 'blocks', 'src'),
            path.join(packagesDir, 'blocks', 'vanilla_overlay')
        ]);
        expect(requestRestart).not.toHaveBeenCalled();
    });

    it('requests one restart for a burst of source changes', async () => {
        const packagesDir = makePackages();
        const { events, requestRestart, fs, started } = await startWatcher(packagesDir);
        await started;

        fs.change(path.join(packagesDir, 'alpha', 'src'), 'a.ts');
        fs.change(path.join(packagesDir, 'alpha', 'src'), 'b.ts');
        await debounced();

        expect(requestRestart).toHaveBeenCalledTimes(1);
        expect(requestRestart).toHaveBeenCalledWith(path.join('packages', 'alpha', 'src', 'a.ts'));
        expect(events.filter((event) => event.type === 'supervisor.changed')).toHaveLength(1);
    });

    it('restarts for a nested block overlay definition change', async () => {
        const packagesDir = makePackages();
        const { events, requestRestart, fs, started } = await startWatcher(packagesDir);
        await started;

        const overlayDir = path.join(packagesDir, 'blocks', 'vanilla_overlay');
        fs.change(overlayDir, path.join('blocks', 'acacia_log.block.json'));
        await debounced();

        const reason = path.join('packages', 'blocks', 'vanilla_overlay', 'blocks', 'acacia_log.block.json');
        expect(requestRestart).toHaveBeenCalledOnce();
        expect(requestRestart).toHaveBeenCalledWith(reason);
        expect(events).toContainEqual({ type: 'supervisor.changed', path: reason });
    });

    it('restarts for definition changes in content pack directories', async () => {
        const packagesDir = makePackages();
        const packDir = path.join(path.dirname(packagesDir), 'world-packs', 'custom');
        mkdirSync(path.join(packDir, 'blocks'), { recursive: true });
        const { events, requestRestart, fs, started } = await startWatcher(packagesDir, undefined, [packDir]);
        await started;

        fs.change(packDir, path.join('blocks', 'marble.block.json'));
        fs.change(path.join(packagesDir, 'blocks', 'vanilla_overlay'), path.join('blocks', 'acacia_log.block.json'));
        fs.change(packDir, path.join('data', 'custom', 'function', 'setup.mcfunction'));
        fs.change(packDir, 'README.md');
        await debounced();

        const reason = path.relative(path.dirname(packagesDir), path.join(packDir, 'blocks', 'marble.block.json'));
        expect(requestRestart).toHaveBeenCalledOnce();
        expect(requestRestart).toHaveBeenCalledWith(reason);
        expect(events).toContainEqual({ type: 'supervisor.changed', path: reason });
    });

    it('restarts when a configured datapack archive changes', async () => {
        const packagesDir = makePackages();
        const archive = path.join(path.dirname(packagesDir), 'world-packs', 'custom.zip');
        mkdirSync(path.dirname(archive), { recursive: true });
        writeFileSync(archive, '');
        const { requestRestart, fs, started } = await startWatcher(packagesDir, undefined, [archive]);
        await started;

        fs.change(path.dirname(archive), path.basename(archive));
        await debounced();

        expect(requestRestart).toHaveBeenCalledWith(path.relative(path.dirname(packagesDir), archive));
    });

    it('ignores tests, prose, and the generated bedrock data', async () => {
        const packagesDir = makePackages();
        const { requestRestart, fs, started } = await startWatcher(packagesDir);
        await started;

        fs.change(path.join(packagesDir, 'alpha', 'src'), 'a.test.ts');
        fs.change(path.join(packagesDir, 'bedrock-data', 'src'), path.join('generated', 'x.json'));
        fs.change(path.join(packagesDir, 'alpha', 'src'), 'notes.md');
        fs.change(path.join(packagesDir, 'alpha', 'src'), null);
        await debounced();

        expect(requestRestart).not.toHaveBeenCalled();
    });

    it('reports a failed generation', async () => {
        const packagesDir = makePackages();

        const { events, started } = await startWatcher(packagesDir, async () => false);
        await started;

        expect(events).toContainEqual({ type: 'supervisor.generating', ok: false });
    });

    it('reports a generator that throws as a failed generation', async () => {
        const packagesDir = makePackages();

        const { events, started } = await startWatcher(packagesDir, async () => {
            throw new Error('pnpm is not installed');
        });
        await started;

        expect(events).toContainEqual({ type: 'supervisor.generating', ok: false });
    });

    it('does not block the caller while the generator runs', async () => {
        const packagesDir = makePackages();
        const { generate, finish } = manualGenerator();
        const { events, started } = await startWatcher(packagesDir, generate);

        expect(events).toEqual([{ type: 'supervisor.generating' }]);
        finish(true);
        await started;

        expect(events.at(-1)).toEqual({ type: 'supervisor.watching', root: packagesDir });
    });

    it('holds restarts while the generator runs and requests one when it finishes', async () => {
        const packagesDir = makePackages();
        const { generate, finish } = manualGenerator();
        const { requestRestart, fs, started } = await startWatcher(packagesDir, generate);
        finish(true);
        await started;

        fs.change(path.join(packagesDir, 'bedrock-data', 'utils'), 'build.js');
        await until(() => generate.mock.calls.length === 2);
        fs.change(path.join(packagesDir, 'alpha', 'src'), 'a.ts');
        await debounced();
        expect(requestRestart).not.toHaveBeenCalled();

        finish(true);
        await debounced();

        expect(requestRestart).toHaveBeenCalledTimes(1);
        expect(requestRestart).toHaveBeenCalledWith(path.join('packages', 'bedrock-data', 'src', 'generated'));
    });

    it('runs the generator once more when its inputs change mid-run', async () => {
        const packagesDir = makePackages();
        const { generate, finish } = manualGenerator();
        const { fs, started } = await startWatcher(packagesDir, generate);
        finish(true);
        await started;

        fs.change(path.join(packagesDir, 'bedrock-data', 'utils'), 'build.js');
        await until(() => generate.mock.calls.length === 2);
        fs.change(path.join(packagesDir, 'bedrock-data', 'src', 'resources'), 'blocks.json');
        await debounced();
        expect(generate).toHaveBeenCalledTimes(2);

        finish(true);
        await until(() => generate.mock.calls.length === 3);
    });

    it('closes every watch', async () => {
        const packagesDir = makePackages();
        const { watcher, fs, started } = await startWatcher(packagesDir);
        await started;

        watcher.close();

        expect(fs.closed).toEqual(fs.watched());
    });
});
