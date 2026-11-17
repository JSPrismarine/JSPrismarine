import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { locateLibrary } from '@jsprismarine/script-host/library';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fakeLevel } from '../testing/level';
import { LevelScripts } from './LevelScripts';
import type { LevelScriptsOptions } from './LevelScripts';

/** Whether the script host library is built here, or CI asks for the test anyway. */
const scriptHostAvailable = (): boolean => {
    if (process.env.JSP_SCRIPT_HOST_REQUIRE === '1') return true;
    try {
        locateLibrary();
        return true;
    } catch {
        return false;
    }
};

const directories: string[] = [];
afterEach(() => {
    vi.doUnmock('@jsprismarine/script-host');
    vi.resetModules();
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/** Writes a behavior pack, with a script module running `source` when there is one. */
const writePack = (source: string | undefined): string => {
    const directory = mkdtempSync(path.join(tmpdir(), 'jsp-level-scripts-'));
    directories.push(directory);
    mkdirSync(path.join(directory, 'scripts'));
    writeFileSync(
        path.join(directory, 'manifest.json'),
        JSON.stringify({
            format_version: 2,
            header: { name: 'probe', uuid: 'aac52733-889b-4c87-abcb-f064ea7735a2', version: [1, 0, 0] },
            modules:
                source === undefined
                    ? [{ type: 'data', uuid: '5e4a2b1c-0000-4000-8000-000000000001', version: [1, 0, 0] }]
                    : [{ type: 'script', uuid: '13f251b3-41c9-4271-b2d1-d4abde28890b', entry: 'scripts/main.js' }],
            dependencies: [{ module_name: '@minecraft/server', version: '2.0.0' }]
        })
    );
    if (source !== undefined) writeFileSync(path.join(directory, 'scripts', 'main.js'), source);
    return directory;
};

/** A level's script options over a test level, writing the log into `lines`. */
const options = (packDirectories: string[], lines: string[], onShutdown = () => {}): LevelScriptsOptions => ({
    packDirectories,
    configDirectory: undefined,
    sources: {
        dimensions: () => ['minecraft:overworld'],
        players: () => [],
        weather: fakeLevel().getWeather(),
        chat: { addGuard: () => () => {} },
        clock: () => 0
    },
    seed: 1n,
    watchdog: { enableShutdown: true, hangThreshold: 4, memoryLimit: 0 },
    log: {
        info: (message) => lines.push(`info ${message}`),
        warn: (message) => lines.push(`warn ${message}`),
        error: (message) => lines.push(`error ${message}`)
    },
    onShutdown
});

describe('LevelScripts', () => {
    it('warns once, naming the package and the issue, when the script host is not installed', async () => {
        vi.doMock('@jsprismarine/script-host', () => {
            throw new Error("Cannot find package '@jsprismarine/script-host'");
        });
        const scripted: string[] = [];
        const plain: string[] = [];

        await expect(
            LevelScripts.load(options([writePack('// a script'), writePack(undefined)], scripted))
        ).resolves.toBeUndefined();
        await expect(LevelScripts.load(options([writePack(undefined)], plain))).resolves.toBeUndefined();

        expect(scripted).toHaveLength(1);
        expect(scripted[0]).toMatch(
            /^warn 1 behavior pack\(s\) have scripts, but @jsprismarine\/script-host is not installed/
        );
        expect(scripted[0]).toContain('https://github.com/JSPrismarine/JSPrismarine/issues/3215');
        expect(plain).toEqual([]);
    });

    it('warns once, naming the platform and the issue, when the script host has no library for it', async () => {
        vi.doMock('@jsprismarine/script-host', async (importOriginal) => {
            const original = await importOriginal<typeof import('@jsprismarine/script-host')>();
            const ScriptHostLibrary = {
                load: (): never => {
                    throw new Error('no build for this platform');
                }
            };
            return { ...original, ScriptHostLibrary };
        });
        const lines: string[] = [];

        await expect(LevelScripts.load(options([writePack('// a script')], lines))).resolves.toBeUndefined();

        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain(`@jsprismarine/script-host has no library for ${process.platform}-${process.arch}`);
        expect(lines[0]).toContain('no build for this platform');
        expect(lines[0]).toContain('https://github.com/JSPrismarine/JSPrismarine/issues/3215');
    });

    it.skipIf(!scriptHostAvailable())(
        'does not ask for a second shutdown when a shutdown callback hangs while it closes',
        async () => {
            const lines: string[] = [];
            const onShutdown = vi.fn();
            const scripts = await LevelScripts.load(
                options(
                    [
                        writePack(`import { system } from '@minecraft/server';
                        system.beforeEvents.shutdown.subscribe(() => { while (true) {} });`)
                    ],
                    lines,
                    onShutdown
                )
            );
            if (scripts === undefined) throw new Error('the pack has a script module');
            scripts.start({ setScriptPhase: () => {} });

            scripts.close();

            expect(lines).toContain(
                "error [Scripting] [Watchdog] Unhandled critical exception of type 'Hang' in behavior pack 'probe'"
            );
            expect(onShutdown).not.toHaveBeenCalled();
        }
    );
});
