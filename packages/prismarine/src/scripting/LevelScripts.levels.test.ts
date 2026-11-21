/**
 * Every level runs the behavior pack scripts in a runtime of its own (ADR 0020, #3235).
 *
 * A server with two levels loads a pack whose script makes it thunder. Each level has its own
 * weather, so thunder in both says the script ran in both, and each level's runtime is its own.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Logger } from '@jsprismarine/logger';
import { locateLibrary } from '@jsprismarine/script-host/library';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { Config } from '../config/Config';
import Server from '../Server';
import { stubRakNetListener } from '../testing/rakNetListener.test.helper';

stubRakNetListener();

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

const SCRIPT = `
import { system, world, WeatherType } from '@minecraft/server';

system.run(() => world.getDimension('overworld').setWeather(WeatherType.Thunder, 100000));
`;

describe.skipIf(!scriptHostAvailable())('the scripts of several levels', { tags: ['real-data'] }, () => {
    let server: Server;
    let root: string;

    // Booting a server, whose content build is the slow part, is setup the hook's timeout covers.
    beforeAll(async () => {
        root = mkdtempSync(path.join(tmpdir(), 'jsprismarine-level-scripts-'));
        const pack = path.join(root, 'pack');
        mkdirSync(path.join(pack, 'scripts'), { recursive: true });
        writeFileSync(
            path.join(pack, 'manifest.json'),
            JSON.stringify({
                format_version: 2,
                header: { name: 'thunder', uuid: '3b0f1c0e-6a51-4c1e-9b7e-0f6d2a4c8e11', version: [1, 0, 0] },
                modules: [
                    {
                        type: 'script',
                        uuid: '4c1a2d1f-7b62-4d2f-8c8f-1a7e3b5d9f22',
                        version: [1, 0, 0],
                        entry: 'scripts/main.js'
                    }
                ],
                dependencies: [{ module_name: '@minecraft/server', version: '2.0.0' }]
            })
        );
        writeFileSync(path.join(pack, 'scripts', 'main.js'), SCRIPT);
        vi.stubEnv('JSP_DIR', root);
        writeFileSync(
            path.join(root, 'config.json'),
            JSON.stringify({
                'online-mode': false,
                'preload-radius': 0,
                'view-distance': 1,
                'enable-ticking': false,
                'chunk-workers': 0,
                'enable-query': false,
                'content-world-packs': [pack],
                'level-name': 'world',
                worlds: {
                    world: { preset: 'minecraft:flat', provider: 'LevelDB', seed: '1' },
                    other: { preset: 'minecraft:flat', provider: 'LevelDB', seed: '2' }
                }
            })
        );

        server = new Server({ logger: new Logger('error'), config: new Config(), headless: true });
        await server.bootstrap('127.0.0.1', 0);
    }, 180_000);

    afterAll(async () => {
        await server.shutdown({ stayAlive: true });
        vi.unstubAllEnvs();
        rmSync(root, { recursive: true, force: true });
    });

    it('runs the packs in every level, each level in a runtime of its own', () => {
        const worlds = server.getWorldManager();
        const levels = worlds.getLevels();
        expect(levels.map((level) => level.name).sort()).toEqual(['other', 'world']);
        const runtimes = levels.map((level) => server.getScripts(level));
        expect(runtimes.every((scripts) => scripts !== undefined)).toBe(true);
        expect(new Set(runtimes).size).toBe(2);
        expect(server.getScripts()).toBe(server.getScripts(worlds.getEntryLevel()));

        for (let tick = 0; tick < 5; tick++) server.advanceTick();

        expect(levels.map((level) => level.getWeather().current())).toEqual(['thunder', 'thunder']);
    });
});
