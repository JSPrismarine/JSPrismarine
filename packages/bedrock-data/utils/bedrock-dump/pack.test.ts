import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PACK_DIRECTORY, PACK_UUID, renderManifest, renderRegionModule, writeDumpPack } from './pack.ts';
import { assertComplete, collectDumpTables } from './protocol.ts';
import { blockBounds, REFERENCE_DIMENSION, REFERENCE_REGION, tileRegion } from './region.ts';
import { READY_LINE, startServer } from './server.ts';

let workspace: string;

beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'jsp-dump-pack-'));
});

afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
});

describe('renderManifest', () => {
    it('points the script module at the pass it is asked for', () => {
        // The manifest is this module's own output, so parsing it back is reading a known shape.
        const manifest = JSON.parse(renderManifest('refworld')) as {
            header: { uuid: string };
            modules: { entry: string; type: string }[];
            dependencies: { module_name: string }[];
        };
        expect(manifest.header.uuid).toBe(PACK_UUID);
        expect(manifest.modules[0]).toMatchObject({ type: 'script', entry: 'scripts/refworld.js' });
        expect(manifest.dependencies.map((dependency) => dependency.module_name)).toEqual(['@minecraft/server']);
    });
});

describe('renderRegionModule', () => {
    it('is a module the pack script can import, carrying one tile per ticking area', async () => {
        const file = join(workspace, 'region.js');
        await writeFile(file, renderRegionModule());
        const module: { DIMENSION: string; TILES: { id: string; chunks: number; from: number[]; to: number[] }[] } =
            await import(pathToFileURL(file).href);

        const tiles = tileRegion(REFERENCE_REGION);
        expect(module.DIMENSION).toBe(REFERENCE_DIMENSION);
        expect(module.TILES).toHaveLength(tiles.length);
        expect(new Set(module.TILES.map((tile) => tile.id)).size).toBe(tiles.length);
        expect(module.TILES[0]).toMatchObject(blockBounds(tiles[0]!));
        expect(module.TILES.reduce((total, tile) => total + tile.chunks, 0)).toBe(
            REFERENCE_REGION.chunksX * REFERENCE_REGION.chunksZ
        );
    });
});

describe('writeDumpPack', () => {
    it('stages the dump pass with no region module, which it does not import', async () => {
        const packDirectory = await writeDumpPack(workspace, join(workspace, 'worlds', 'w'), 'dump');
        expect(packDirectory).toBe(join(workspace, 'development_behavior_packs', PACK_DIRECTORY));
        expect((await stat(join(packDirectory, 'scripts', 'dump.js'))).isFile()).toBe(true);
        await expect(stat(join(packDirectory, 'scripts', 'region.js'))).rejects.toThrow();
    });

    it('stages the reference pass with the region module beside its script', async () => {
        const packDirectory = await writeDumpPack(workspace, join(workspace, 'worlds', 'w'), 'refworld');
        expect((await stat(join(packDirectory, 'scripts', 'refworld.js'))).isFile()).toBe(true);
        expect(await readFile(join(packDirectory, 'scripts', 'region.js'), 'utf8')).toContain('export const TILES');
    });

    it('enables the pack for the world by uuid', async () => {
        const world = join(workspace, 'worlds', 'jsp-capture');
        await writeDumpPack(workspace, world, 'dump');
        // Written by renderWorldBehaviorPacks, so its shape is this module's own.
        const enabled = JSON.parse(await readFile(join(world, 'world_behavior_packs.json'), 'utf8')) as {
            pack_id: string;
        }[];
        expect(enabled).toEqual([{ pack_id: PACK_UUID, version: [1, 0, 0] }]);
    });
});

describe('a capture pass', () => {
    /** A server that logs a dump table the way the engine decorates the content log. */
    const FAKE = `
const say = (text) => process.stdout.write('[2026-10-25 09:14:02:113 INFO] ' + text + '\\n');
say('${READY_LINE}.');
say('[Scripting] DUMP begin {"blockTypes":2}');
say('[Scripting] DUMP block-types {"id":"minecraft:stone"}');
say('[Scripting] DUMP block-types {"id":"minecraft:dirt"}');
say('[Scripting] DUMP end {"rows":2,"errors":0}');
process.stdin.on('data', () => process.exit(0));
`;

    it('reads the tables off a run that boots, logs and stops', async () => {
        const script = join(workspace, 'fake-server.mjs');
        await writeFile(script, FAKE);
        const server = startServer({ command: process.execPath, args: [script], cwd: workspace });

        await server.waitForLine((line) => line.includes(READY_LINE), 'the ready line', 5000);
        await server.waitForLine((line) => line.includes('DUMP end '), 'the pack to finish', 5000);
        expect(await server.stop(5000)).toBe(0);

        const dumped = collectDumpTables(server.lines);
        expect(assertComplete(dumped)).toEqual({ rows: 2, errors: 0 });
        expect(dumped.tables.get('block-types')).toEqual([{ id: 'minecraft:stone' }, { id: 'minecraft:dirt' }]);
    });
});
