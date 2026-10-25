import type { SupervisorEvent } from '@jsprismarine/console-protocol';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Watcher } from './Watcher';

const roots: string[] = [];
const watchers: Watcher[] = [];

const makePackages = () => {
    const root = mkdtempSync(path.join(tmpdir(), 'jsp-watcher-'));
    roots.push(root);
    const packagesDir = path.join(root, 'packages');
    mkdirSync(path.join(packagesDir, 'alpha', 'src'), { recursive: true });
    mkdirSync(path.join(packagesDir, 'bedrock-data', 'src', 'generated'), { recursive: true });
    return packagesDir;
};

const startWatcher = (packagesDir: string, generate = () => true) => {
    const events: SupervisorEvent[] = [];
    const requestRestart = vi.fn<(reason: string) => void>();
    const watcher = new Watcher({
        packagesDir,
        onEvent: (event) => events.push(event),
        requestRestart,
        generate,
        debounceMs: 50
    });
    watchers.push(watcher);
    watcher.start();
    return { events, requestRestart, watcher };
};

const until = async (ready: () => boolean, ms = 3000): Promise<void> => {
    const deadline = Date.now() + ms;
    while (!ready()) {
        if (Date.now() > deadline) throw new Error('timed out');
        await new Promise((done) => setTimeout(done, 20));
    }
};

afterEach(() => {
    for (const watcher of watchers.splice(0)) watcher.close();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Watcher', () => {
    it('generates once on start and reports what it watches', () => {
        const generate = vi.fn(() => true);
        const packagesDir = makePackages();

        const { events, requestRestart } = startWatcher(packagesDir, generate);

        expect(generate).toHaveBeenCalledTimes(1);
        expect(events).toEqual([
            { type: 'supervisor.generating' },
            { type: 'supervisor.generating', ok: true },
            { type: 'supervisor.watching', root: packagesDir }
        ]);
        expect(requestRestart).not.toHaveBeenCalled();
    });

    it('requests one restart for a burst of source changes', async () => {
        const packagesDir = makePackages();
        const { events, requestRestart } = startWatcher(packagesDir);

        writeFileSync(path.join(packagesDir, 'alpha', 'src', 'a.ts'), 'export const a = 1;\n');
        writeFileSync(path.join(packagesDir, 'alpha', 'src', 'b.ts'), 'export const b = 2;\n');
        await until(() => requestRestart.mock.calls.length > 0);
        await new Promise((done) => setTimeout(done, 150));

        expect(requestRestart).toHaveBeenCalledTimes(1);
        expect(requestRestart.mock.calls[0]?.[0]).toMatch(/^packages\/alpha\/src\/[ab]\.ts$/);
        expect(events.filter((event) => event.type === 'supervisor.changed')).toHaveLength(1);
    });

    it('ignores tests and the generated bedrock data', async () => {
        const packagesDir = makePackages();
        const { requestRestart } = startWatcher(packagesDir);

        writeFileSync(path.join(packagesDir, 'alpha', 'src', 'a.test.ts'), 'test\n');
        writeFileSync(path.join(packagesDir, 'bedrock-data', 'src', 'generated', 'x.json'), '{}\n');
        writeFileSync(path.join(packagesDir, 'alpha', 'src', 'notes.md'), 'prose\n');
        await new Promise((done) => setTimeout(done, 300));

        expect(requestRestart).not.toHaveBeenCalled();
    });

    it('reports a failed generation', () => {
        const packagesDir = makePackages();

        const { events } = startWatcher(packagesDir, () => false);

        expect(events).toContainEqual({ type: 'supervisor.generating', ok: false });
    });
});
