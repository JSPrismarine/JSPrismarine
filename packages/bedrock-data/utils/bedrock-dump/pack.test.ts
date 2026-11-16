import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    PACK_DIRECTORY,
    PACK_UUID,
    passScriptSource,
    renderManifest,
    stageBehaviorPacks,
    writeDumpPack
} from './pack.ts';
import { assertComplete, collectDumpTables } from './protocol.ts';
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
        const manifest = JSON.parse(renderManifest('dump')) as {
            header: { uuid: string };
            modules: { entry: string; type: string }[];
            dependencies: { module_name: string }[];
        };
        expect(manifest.header.uuid).toBe(PACK_UUID);
        expect(manifest.modules[0]).toMatchObject({ type: 'script', entry: 'scripts/dump.js' });
        expect(manifest.dependencies.map((dependency) => dependency.module_name)).toEqual(['@minecraft/server']);
    });
});

describe('writeDumpPack', () => {
    it('stages the dump pass with its script beside the manifest', async () => {
        const packDirectory = await writeDumpPack(workspace, join(workspace, 'worlds', 'w'), 'dump');
        expect(packDirectory).toBe(join(workspace, 'development_behavior_packs', PACK_DIRECTORY));
        expect((await stat(join(packDirectory, 'scripts', 'dump.js'))).isFile()).toBe(true);
    });

    it.each(['place', 'domains'] as const)(
        'stages the %s palette pass from the datagen pack, with no hand-edited manifest',
        async (pass) => {
            const packDirectory = await writeDumpPack(workspace, join(workspace, 'worlds', 'w'), pass);
            expect((await stat(join(packDirectory, 'scripts', `${pass}.js`))).isFile()).toBe(true);
            // The manifest is this module's own output, so parsing it back is reading a known shape.
            const manifest = JSON.parse(await readFile(join(packDirectory, 'manifest.json'), 'utf8')) as {
                modules: { entry: string }[];
            };
            expect(manifest.modules[0]?.entry).toBe(`scripts/${pass}.js`);
        }
    );

    it('takes the palette scripts from packages/minecraft, which owns the snapshot', () => {
        expect(passScriptSource('place')).toContain(join('minecraft', 'datagen', 'palette-pack'));
        expect(passScriptSource('dump')).toContain(join('bedrock-dump', 'pack', 'scripts'));
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

describe('stageBehaviorPacks', () => {
    it('copies each pack and enables all of them, in order, for the world', async () => {
        const sources = join(workspace, 'sources');
        for (const name of ['first', 'second']) {
            await mkdir(join(sources, name, 'scripts'), { recursive: true });
            await writeFile(join(sources, name, 'manifest.json'), '{}');
            await writeFile(join(sources, name, 'scripts', 'main.js'), `// ${name}`);
        }
        const world = join(workspace, 'worlds', 'w');

        const directories = await stageBehaviorPacks(workspace, world, [
            { source: join(sources, 'first'), directory: 'jsp-first', uuid: 'a', version: [1, 0, 0] },
            { source: join(sources, 'second'), directory: 'jsp-second', uuid: 'b', version: [2, 0, 0] }
        ]);

        expect(directories).toEqual([
            join(workspace, 'development_behavior_packs', 'jsp-first'),
            join(workspace, 'development_behavior_packs', 'jsp-second')
        ]);
        expect(
            await readFile(join(workspace, 'development_behavior_packs', 'jsp-second', 'scripts', 'main.js'), 'utf8')
        ).toBe('// second');
        expect(JSON.parse(await readFile(join(world, 'world_behavior_packs.json'), 'utf8'))).toEqual([
            { pack_id: 'a', version: [1, 0, 0] },
            { pack_id: 'b', version: [2, 0, 0] }
        ]);
    });

    it('drops a file an earlier copy left behind', async () => {
        const source = join(workspace, 'source');
        await mkdir(source, { recursive: true });
        await writeFile(join(source, 'manifest.json'), '{}');
        const stale = join(workspace, 'development_behavior_packs', 'jsp-pack', 'old.js');
        await mkdir(join(stale, '..'), { recursive: true });
        await writeFile(stale, '');

        await stageBehaviorPacks(workspace, join(workspace, 'worlds', 'w'), [
            { source, directory: 'jsp-pack', uuid: 'a', version: [1, 0, 0] }
        ]);

        await expect(stat(stale)).rejects.toThrow();
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
