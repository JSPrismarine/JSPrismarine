/**
 * A harness for the world and system members' tests: a pack declaring `@minecraft/server`
 * 2.12.0-beta whose script is a test's source, run in {@link WorldScripts} over a memory world
 * with a world system the test reads back.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ScriptHostLibrary } from '../../ScriptEngine';
import { TEST_SERVER } from '../../testing/library.test-utils';
import { MemoryWorld } from '../../testing/memoryWorld.test-utils';
import { readScriptConfig, readScriptPack } from '../pack';
import { WorldScripts } from '../WorldScripts';
import type { MemoryWorldSystem } from './memoryWorldSystem';
import { memoryWorldSystem } from './memoryWorldSystem';

/** The imports and helpers every test script starts with: `log` prints what a call returned or threw. */
const PRELUDE = `
import * as server from '@minecraft/server';
const { BiomeTypes, BlockPermutation, Difficulty, ItemStack, TimeOfDay, system, world } = server;
const show = (value) => value === undefined ? 'undefined' : JSON.stringify(value);
const log = (label, call) => {
    try { console.warn(label + ' ' + show(call())); } catch (error) { console.warn(label + ' ! ' + String(error)); }
};
`;

/** A memory world whose world system a test reads back. */
export type SystemWorld = MemoryWorld & { readonly worldSystem: MemoryWorldSystem };

/** A memory world with a memory world system over it. */
export const worldWithSystem = (): SystemWorld => {
    const world = new MemoryWorld();
    return Object.assign(world, { worldSystem: memoryWorldSystem('42', world) });
};

/** What a started pack runs over and logged. */
export interface Started<World extends MemoryWorld> {
    readonly world: World;
    readonly lines: string[];
    readonly scripts: WorldScripts;
}

/** Runs packs and cleans up after them; one per test file. */
export class SystemScripts {
    private readonly directories: string[] = [];
    private readonly running: WorldScripts[] = [];

    public constructor(private readonly library: () => ScriptHostLibrary) {}

    /** Loads `source` at a pack's top level, over a new world with a world system, and runs one flush. */
    public start(source: string): Started<SystemWorld>;
    /** Loads `source` at a pack's top level and runs `ticks` flushes. */
    public start<World extends MemoryWorld>(source: string, world: World, ticks?: number): Started<World>;
    public start(source: string, world: MemoryWorld = worldWithSystem(), ticks = 1): Started<MemoryWorld> {
        const directory = mkdtempSync(join(tmpdir(), 'jsp-world-system-'));
        this.directories.push(directory);
        mkdirSync(join(directory, 'scripts'));
        writeFileSync(
            join(directory, 'manifest.json'),
            JSON.stringify({
                header: { name: 'settings', uuid: '0e9f5d0a-61a8-4d0f-9a43-8a7c45c1d101', version: [1, 0, 0] },
                modules: [{ type: 'script', uuid: '0e9f5d0a-61a8-4d0f-9a43-8a7c45c1d102', entry: 'scripts/main.js' }],
                dependencies: [{ module_name: '@minecraft/server', version: '2.12.0-beta' }]
            })
        );
        writeFileSync(join(directory, 'scripts', 'main.js'), `${PRELUDE}\n${source}`);
        const pack = readScriptPack(directory);
        if (pack === undefined) throw new Error('the pack has a script module');
        const lines: string[] = [];
        const scripts = new WorldScripts({
            server: TEST_SERVER,
            library: this.library(),
            world,
            packs: [pack],
            config: readScriptConfig(undefined),
            log: {
                info: () => {},
                warn: (line: string) => lines.push(line.replace(/^\[Scripting\] /, '')),
                error: (line: string) => lines.push(`error ${line.replace(/^\[Scripting\] \[settings\] /, '')}`)
            },
            seed: 1n,
            betaApis: true
        });
        this.running.push(scripts);
        scripts.startEarly();
        scripts.startWorld();
        for (let tick = 0; tick < ticks; tick++) scripts.flush();
        return { world, lines, scripts };
    }

    /** Shuts down every pack this started. */
    public stopAll(): void {
        for (const scripts of this.running.splice(0)) scripts.shutdown();
    }

    /** Removes every pack directory this wrote. */
    public removeAll(): void {
        for (const directory of this.directories.splice(0)) rmSync(directory, { recursive: true, force: true });
    }
}
