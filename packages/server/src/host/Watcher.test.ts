import type { SupervisorEvent } from '@jsprismarine/console-protocol';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    let calls = 0;
    const waiters = new Map<number, Set<() => void>>();
    const generate = vi.fn(
        () =>
            new Promise<boolean>((done) => {
                calls += 1;
                for (const [target, callbacks] of waiters) {
                    if (target > calls) continue;
                    for (const callback of callbacks) callback();
                    waiters.delete(target);
                }
                finish = done;
            })
    );
    const waitForCall = (target: number): Promise<void> => {
        if (calls >= target) return Promise.resolve();
        return new Promise((resolve) => {
            const callbacks = waiters.get(target) ?? new Set();
            callbacks.add(resolve);
            waiters.set(target, callbacks);
        });
    };
    return { generate, finish: (ok: boolean) => finish?.(ok), waitForCall };
};

const DEBOUNCE_MS = 20;

const startWatcher = async (
    packagesDir: string,
    generate: () => boolean | Promise<boolean> = () => true,
    contentPackPaths: readonly string[] = [],
    built = false
) => {
    const fs = fakeWatch();
    const events: SupervisorEvent[] = [];
    const requestRestart = vi.fn<(reason: string) => void>();
    const watcher = new Watcher({
        packagesDir,
        contentPackPaths,
        built,
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

const advanceDebounce = () => vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 3);

afterEach(() => {
    for (const watcher of watchers.splice(0)) watcher.close();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
    vi.useRealTimers();
});

describe('Watcher', () => {
    beforeEach(() => {
        // Advance the watcher's own debounce clock explicitly; shared Vitest workers can inherit unrelated timers.
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });

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
        await advanceDebounce();

        expect(requestRestart).toHaveBeenCalledTimes(1);
        expect(requestRestart).toHaveBeenCalledWith(path.join('packages', 'alpha', 'src', 'a.ts'));
        expect(events.filter((event) => event.type === 'supervisor.changed')).toHaveLength(1);
    });

    it('watches built output instead of source when the server runs from it', async () => {
        const packagesDir = makePackages();
        mkdirSync(path.join(packagesDir, 'alpha', 'dist'), { recursive: true });
        const { requestRestart, fs, started } = await startWatcher(packagesDir, () => true, [], true);
        await started;

        expect(fs.watched()).toContain(path.join(packagesDir, 'alpha', 'dist'));
        expect(fs.watched()).not.toContain(path.join(packagesDir, 'alpha', 'src'));

        // A rebuild writes modules and leaves declarations and maps that nothing loads.
        fs.change(path.join(packagesDir, 'alpha', 'dist'), 'index.es.js');
        fs.change(path.join(packagesDir, 'alpha', 'dist'), 'index.d.ts');
        fs.change(path.join(packagesDir, 'alpha', 'dist'), 'index.es.js.map');
        await advanceDebounce();

        expect(requestRestart).toHaveBeenCalledOnce();
        expect(requestRestart).toHaveBeenCalledWith(path.join('packages', 'alpha', 'dist', 'index.es.js'));
    });

    it('restarts for a nested block overlay definition change', async () => {
        const packagesDir = makePackages();
        const { events, requestRestart, fs, started } = await startWatcher(packagesDir);
        await started;

        const overlayDir = path.join(packagesDir, 'blocks', 'vanilla_overlay');
        fs.change(overlayDir, path.join('blocks', 'acacia_log.block.json'));
        await advanceDebounce();

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
        await advanceDebounce();

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
        await advanceDebounce();

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
        await advanceDebounce();

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
        const { generate, finish, waitForCall } = manualGenerator();
        const { requestRestart, fs, started } = await startWatcher(packagesDir, generate);
        finish(true);
        await started;

        fs.change(path.join(packagesDir, 'bedrock-data', 'utils'), 'build.js');
        const secondRun = waitForCall(2);
        await advanceDebounce();
        await secondRun;
        fs.change(path.join(packagesDir, 'alpha', 'src'), 'a.ts');
        await advanceDebounce();
        expect(requestRestart).not.toHaveBeenCalled();

        finish(true);
        await advanceDebounce();

        expect(requestRestart).toHaveBeenCalledTimes(1);
        expect(requestRestart).toHaveBeenCalledWith(path.join('packages', 'bedrock-data', 'src', 'generated'));
    });

    it('runs the generator once more when its inputs change mid-run', async () => {
        const packagesDir = makePackages();
        const { generate, finish, waitForCall } = manualGenerator();
        const { fs, started } = await startWatcher(packagesDir, generate);
        finish(true);
        await started;

        fs.change(path.join(packagesDir, 'bedrock-data', 'utils'), 'build.js');
        const secondRun = waitForCall(2);
        await advanceDebounce();
        await secondRun;
        fs.change(path.join(packagesDir, 'bedrock-data', 'src', 'resources'), 'blocks.json');
        await advanceDebounce();
        expect(generate).toHaveBeenCalledTimes(2);

        const thirdRun = waitForCall(3);
        finish(true);
        await thirdRun;
    });

    it('closes every watch', async () => {
        const packagesDir = makePackages();
        const { watcher, fs, started } = await startWatcher(packagesDir);
        await started;

        watcher.close();

        expect(fs.closed).toEqual(fs.watched());
    });
});
