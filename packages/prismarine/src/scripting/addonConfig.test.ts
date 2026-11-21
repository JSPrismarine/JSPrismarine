import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { ScriptPack } from '@jsprismarine/script-host/host/pack';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WatchFolder } from './addonConfig';
import { AddonConfigFiles, configPathOf } from './addonConfig';

const directories: string[] = [];
afterAll(() => {
    for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

/** A server folder with an `addons/` folder, and a pack installed as `addons/<name>/`. */
const serverWith = (...names: string[]) => {
    const directory = mkdtempSync(path.join(tmpdir(), 'jsp-addon-config-'));
    directories.push(directory);
    const addons = path.join(directory, 'addons');
    mkdirSync(addons);
    const packs = names.map((name): ScriptPack => {
        mkdirSync(path.join(addons, name));
        return {
            directory: path.join(addons, name),
            name,
            version: '1.0.0',
            uuid: 'aac52733-889b-4c87-abcb-f064ea7735a2',
            moduleUuid: '13f251b3-41c9-4271-b2d1-d4abde28890b',
            entry: 'scripts/main.js',
            dependencies: []
        };
    });
    return { directory, addons, packs };
};

/** A watch the test fires by hand, recording the folders watched and closed, and failing when told to. */
const manualWatch = () => {
    const listeners = new Map<string, (event: string, filename: string | null) => void>();
    const errorListeners = new Map<string, (error: Error) => void>();
    const closed: string[] = [];
    const opened: string[] = [];
    let failNext = false;
    const watch: WatchFolder = (folder, listener) => {
        if (failNext) {
            failNext = false;
            throw new Error('EMFILE: too many open files');
        }
        opened.push(folder);
        listeners.set(folder, listener);
        return {
            close: () => closed.push(folder),
            on: (_event, errorListener) => errorListeners.set(folder, errorListener)
        };
    };
    return {
        watch,
        listeners,
        closed,
        opened,
        fire: (folder: string, filename: string | null) => listeners.get(folder)?.('change', filename),
        fail: (folder: string, message: string) => errorListeners.get(folder)?.(new Error(message)),
        failNextWatch: () => {
            failNext = true;
        }
    };
};

describe('AddonConfigFiles', () => {
    const warnings: string[] = [];
    const log = { warn: (message: string) => warnings.push(message) };
    beforeEach(() => {
        warnings.length = 0;
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("names the file after the pack's folder, beside it", () => {
        const { addons, packs } = serverWith('tab-list');
        expect(configPathOf(packs[0]!)).toBe(path.join(addons, 'tab-list.config.json'));
        expect(configPathOf({ directory: `${packs[0]!.directory}${path.sep}` })).toBe(
            path.join(addons, 'tab-list.config.json')
        );
    });

    it('reads the file as JSON, and undefined while there is none', () => {
        const { packs } = serverWith('tab-list');
        const [pack] = packs;
        const files = new AddonConfigFiles({ log });

        expect(files.read(pack!)).toBeUndefined();
        writeFileSync(configPathOf(pack!), '{ "interval": 40, "templates": { "global": "{player:name}" } }');
        expect(files.read(pack!)).toEqual({ interval: 40, templates: { global: '{player:name}' } });
        expect(warnings).toEqual([]);
    });

    it('keeps the last value of a file that fails to parse, and warns once until it parses again', () => {
        const { packs } = serverWith('tab-list');
        const [pack] = packs;
        const file = configPathOf(pack!);
        const files = new AddonConfigFiles({ log });
        writeFileSync(file, '{ "interval": 40 }');
        expect(files.read(pack!)).toEqual({ interval: 40 });

        writeFileSync(file, '{ "interval": ');
        expect(files.read(pack!)).toEqual({ interval: 40 });
        expect(files.read(pack!)).toEqual({ interval: 40 });
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain(
            `[Scripting] [tab-list] ${file} does not parse, so the pack keeps the config it had: `
        );

        writeFileSync(file, '{ "interval": 50 }');
        expect(files.read(pack!)).toEqual({ interval: 50 });
        writeFileSync(file, 'nope');
        expect(files.read(pack!)).toEqual({ interval: 50 });
        expect(warnings).toHaveLength(2);

        // A file that never parsed gives nothing, and a removed file forgets the last value.
        const fresh = new AddonConfigFiles({ log });
        expect(fresh.read(pack!)).toBeUndefined();
        rmSync(file);
        expect(files.read(pack!)).toBeUndefined();
        writeFileSync(file, 'nope');
        expect(files.read(pack!)).toBeUndefined();
    });

    it('writes the value as indented JSON, which it reads back', () => {
        const { packs } = serverWith('tab-list');
        const [pack] = packs;
        const files = new AddonConfigFiles({ log });

        files.write(pack!, { interval: 20, templates: { groups: { vip: 'x' } } });

        expect(readFileSync(configPathOf(pack!), 'utf8')).toBe(
            '{\n    "interval": 20,\n    "templates": {\n        "groups": {\n            "vip": "x"\n        }\n    }\n}\n'
        );
        expect(files.read(pack!)).toEqual({ interval: 20, templates: { groups: { vip: 'x' } } });
    });

    it('writes beside the file and renames over it, so a failed write leaves the file as it was', () => {
        const { addons, packs } = serverWith('tab-list');
        const [pack] = packs;
        const file = configPathOf(pack!);
        const files = new AddonConfigFiles({ log });
        files.write(pack!, { interval: 20 });
        expect(readdirSync(addons).sort()).toEqual(['tab-list', 'tab-list.config.json']);

        // A folder where the file should be makes the rename fail; the file's folder keeps no temp file.
        rmSync(file);
        mkdirSync(file);
        expect(() => files.write(pack!, { interval: 30 })).toThrow();
        expect(readdirSync(addons).sort()).toEqual(['tab-list', 'tab-list.config.json']);
        expect(readdirSync(file)).toEqual([]);
    });

    it.skipIf(process.platform === 'win32')(
        'keeps the mode of a file it replaces, and gives a new one the usual mode',
        () => {
            const { packs } = serverWith('tab-list');
            const [pack] = packs;
            const file = configPathOf(pack!);
            const files = new AddonConfigFiles({ log });

            files.write(pack!, { interval: 20 });
            expect(statSync(file).mode & 0o777).toBe(0o644);
            chmodSync(file, 0o600);
            files.write(pack!, { interval: 30 });
            expect(statSync(file).mode & 0o777).toBe(0o600);
            expect(files.read(pack!)).toEqual({ interval: 30 });
        }
    );

    it('closes the watch that replaced a failed one when the last stop function runs', () => {
        const { addons, packs } = serverWith('tab-list');
        const [pack] = packs;
        const watching = manualWatch();
        const files = new AddonConfigFiles({ log, watch: watching.watch, settleMs: 10 });
        const stop = files.watch(pack!, () => {});

        watching.fail(addons, 'EPERM: operation not permitted');
        expect(watching.opened).toEqual([addons, addons]);
        expect(watching.closed).toEqual([addons]);
        stop();
        expect(watching.closed).toEqual([addons, addons]);
        // A new watch starts from nothing, so no stale record is left behind.
        files.watch(pack!, () => {});
        expect(watching.opened).toEqual([addons, addons, addons]);
    });

    it('starts a failed watch again with the same files, and says so when it cannot', () => {
        const { addons, packs } = serverWith('tab-list');
        const [pack] = packs;
        const watching = manualWatch();
        const files = new AddonConfigFiles({ log, watch: watching.watch, settleMs: 10 });
        const changes: string[] = [];
        files.watch(pack!, () => changes.push('changed'));

        watching.fail(addons, 'EPERM: operation not permitted');
        expect(watching.closed).toEqual([addons]);
        expect(watching.opened).toEqual([addons, addons]);
        expect(warnings).toEqual([
            `[Scripting] The watch on ${addons} failed and was started again: EPERM: operation not permitted`
        ]);
        watching.fire(addons, 'tab-list.config.json');
        vi.runAllTimers();
        expect(changes).toEqual(['changed']);

        watching.failNextWatch();
        watching.fail(addons, 'EPERM: operation not permitted');
        expect(warnings).toHaveLength(2);
        expect(warnings[1]).toContain('could not be started again, so changes to its config files are not followed');
        // A later watch of a file in the folder starts it over.
        files.watch(pack!, () => changes.push('again'));
        expect(watching.opened).toEqual([addons, addons, addons]);
        watching.fire(addons, 'tab-list.config.json');
        vi.runAllTimers();
        expect(changes).toEqual(['changed', 'changed', 'again']);
    });

    it('tells a watcher once a change to its file has settled, and not of other files', () => {
        const { addons, packs } = serverWith('tab-list', 'placeholders');
        const [tabList, placeholders] = packs;
        const watching = manualWatch();
        const files = new AddonConfigFiles({ log, watch: watching.watch, settleMs: 100 });
        const changes: string[] = [];
        const stopTabList = files.watch(tabList!, () => changes.push('tab-list'));
        files.watch(tabList!, () => changes.push('tab-list again'));
        const stopPlaceholders = files.watch(placeholders!, () => changes.push('placeholders'));
        expect([...watching.listeners.keys()]).toEqual([addons]);

        watching.fire(addons, 'tab-list.config.json');
        watching.fire(addons, 'tab-list.config.json');
        watching.fire(addons, 'other.json');
        vi.advanceTimersByTime(99);
        expect(changes).toEqual([]);
        vi.advanceTimersByTime(1);
        expect(changes).toEqual(['tab-list', 'tab-list again']);

        // A platform that names no file tells every watcher.
        watching.fire(addons, null);
        vi.runAllTimers();
        expect(changes).toEqual(['tab-list', 'tab-list again', 'tab-list', 'tab-list again', 'placeholders']);

        stopTabList();
        watching.fire(addons, 'tab-list.config.json');
        vi.runAllTimers();
        expect(changes.at(-1)).toBe('tab-list again');
        expect(watching.closed).toEqual([]);
        files.watch(tabList!, () => {})();
        stopPlaceholders();
        expect(watching.closed).toEqual([]);
        // The folder's watch closes with the last watcher of a file in it.
        const stopLast = files.watch(placeholders!, () => changes.push('late'));
        watching.fire(addons, 'placeholders.config.json');
        stopLast();
        vi.runAllTimers();
        expect(changes.at(-1)).toBe('tab-list again');
        expect(watching.closed).toEqual([]);
    });
});
