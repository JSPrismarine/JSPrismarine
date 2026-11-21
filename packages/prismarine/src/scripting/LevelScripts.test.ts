import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { LIBRARY_ENV, locateLibrary } from '@jsprismarine/script-host/library';
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
    vi.unstubAllEnvs();
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
    maxPlayers: 10,
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
    it('warns once, naming the package and how to install it, when the script host is not installed', async () => {
        // What Node.js rejects the import with when an install left the optional package out.
        const uninstalled = () => Promise.reject(new Error("Cannot find package '@jsprismarine/script-host'"));
        const scripted: string[] = [];
        const plain: string[] = [];

        await expect(
            LevelScripts.load(options([writePack('// a script'), writePack(undefined)], scripted), uninstalled)
        ).resolves.toBeUndefined();
        await expect(LevelScripts.load(options([writePack(undefined)], plain), uninstalled)).resolves.toBeUndefined();

        expect(scripted).toHaveLength(1);
        expect(scripted[0]).toMatch(
            /^warn 1 behavior pack\(s\) have scripts, but @jsprismarine\/script-host is not installed/
        );
        expect(scripted[0]).toContain('optional dependency');
        expect(plain).toEqual([]);
    });

    it('warns once, naming the platform and the reason, when the script host has no library for it', async () => {
        // The override names a file that is not there, so locating the library fails as it does
        // on a platform with no build, wherever the tests run.
        const missing = path.join(tmpdir(), 'jsp-level-scripts-no-library', 'libjsp_script_host.so');
        vi.stubEnv(LIBRARY_ENV, missing);
        const lines: string[] = [];

        await expect(LevelScripts.load(options([writePack('// a script')], lines))).resolves.toBeUndefined();

        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain(`@jsprismarine/script-host has no library for ${process.platform}-${process.arch}`);
        expect(lines[0]).toContain(`${LIBRARY_ENV} names ${missing}, which does not exist`);
    });

    it.skipIf(!scriptHostAvailable())('leaves the world a phase other scripts set when it closes', async () => {
        const scripts = await LevelScripts.load(options([writePack('')], []));
        if (scripts === undefined) throw new Error('the pack has a script module');
        let phase: (() => void) | undefined;
        // Changes the phase as World.setScriptPhase does.
        const world = {
            setScriptPhase: (next: (() => void) | undefined, replacing?: () => void) => {
                if (replacing === undefined || phase === replacing) phase = next;
            }
        };
        scripts.start(world);
        const other = () => {};
        world.setScriptPhase(other);

        scripts.close();

        expect(phase).toBe(other);
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
