/**
 * `WorldManager` over real `Level`s and a real LevelDB in a scratch folder: every `worlds.*`
 * entry loads, the `level-name` one is the default, a lazy dimension waits for `worldFor`, a
 * level unloads on its own, and a save's stems outrank a changed config.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Logger } from '@jsprismarine/logger';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Config } from '../config/Config';
import type { WorldData } from '../config/JsonConfigTypes';
import type { NetworkWorldReplicator, WorldReplicators } from '../network/NetworkWorldReplicator';
import type Server from '../Server';
import { inertEntityRuntime, testContent } from '../testing/entityServer';
import { stub } from '../testing/stub.test.helper';
import Chunk from './chunk/Chunk';
import { Dimensions } from './Dimension';
import type { DimensionType } from './Dimension';
import type { Generator } from './Generator';
import { findJavaWorldgenSources } from './generators/datadriven/javaWorldgenData';
import WorldManager from './WorldManager';

/** The kinds the tests register, so no level here needs the Java data to build a world. */
const TEST_KIND = 'jsprismarine:test';
const OTHER_KIND = 'jsprismarine:other';

/** Whether the Java data cache is warm, which is what reading the datapack's presets needs. */
const JAVA_DATA = findJavaWorldgenSources() !== undefined;

/** An entry whose Overworld builds through {@link TEST_KIND}, on the flat preset. */
const entryOf = (dimensions: WorldData['dimensions'] = {}): WorldData => ({
    preset: 'minecraft:flat',
    provider: 'LevelDB',
    seed: 1,
    dimensions: { [OVERWORLD_STEM_ID]: { generator: { type: TEST_KIND } }, ...dimensions }
});

/**
 * Empty chunks in the dimension asked for, and dry land at every column so the spawn search
 * settles on its first candidate without generating anything.
 */
const emptyGenerator = (dimension: DimensionType): Generator => ({
    generateChunk: async (cx, cz) => new Chunk(cx, cz, new Map(), dimension),
    surfaceAt: () => ({ y: 64, name: 'minecraft:stone' })
});

let scratch: string;
let previousDir: string | undefined;

beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-world-manager-'));
    // `WorldManager` keeps its levels under `<JSP_DIR>/worlds`.
    previousDir = process.env.JSP_DIR;
    process.env.JSP_DIR = scratch;
});

afterEach(() => {
    if (previousDir === undefined) delete process.env.JSP_DIR;
    else process.env.JSP_DIR = previousDir;
    fs.rmSync(scratch, { recursive: true, force: true });
});

/** A manager over a server double whose config names the given entries. */
const buildManager = (levelName: string, worlds: Record<string, WorldData>) => {
    const logged: string[] = [];
    const setWorld = vi.fn<Config['setWorld']>();
    const logger = stub<Logger>({
        info: (message) => void logged.push(String(message)),
        warn: (message) => void logged.push(String(message)),
        error: (message) => void logged.push(String(message)),
        debug: () => {},
        verbose: (message) => void logged.push(String(message))
    });
    const server = stub<Server>({
        getLogger: () => logger,
        getConfig: () =>
            stub<Config>({
                getLevelName: () => levelName,
                getWorlds: () => worlds,
                setWorld,
                // Nothing preloads: the start region is covered by the world tests.
                getPreloadRadius: () => 0,
                getEntityTrackingInterval: () => 20
            }),
        getContent: () => testContent(),
        getEntityRuntime: () => inertEntityRuntime(),
        getWorldReplicators: () =>
            stub<WorldReplicators>({ for: () => stub<NetworkWorldReplicator>({ worldChanged: () => {} }) }),
        releaseOnShutdown: () => {}
    });

    const manager = new WorldManager(server);
    /** How many generators each kind built, by dimension type id. */
    const builds = new Map<string, number>();
    for (const kind of [TEST_KIND, OTHER_KIND]) {
        manager.getGeneratorFactories().register({
            kind,
            build: (context) => {
                const key = `${kind} ${context.dimension.id}`;
                builds.set(key, (builds.get(key) ?? 0) + 1);
                return emptyGenerator(context.dimension);
            }
        });
    }

    return { manager, logged, setWorld, builds };
};

describe('WorldManager', () => {
    it('loads every `worlds` entry as a level, the `level-name` one as the default', async () => {
        const { manager } = buildManager('main', { other: entryOf(), main: entryOf() });
        await manager.enable();

        expect(manager.getLevels().map((level) => level.name)).toEqual(['main', 'other']);
        expect(manager.getDefaultLevel().name).toBe('main');
        expect(manager.getDefaultWorld()).toBe(manager.getDefaultLevel().loadedWorld(OVERWORLD_STEM_ID));
        expect(manager.getWorldByName('other')).toBe(manager.getLevel('other')?.loadedWorld(OVERWORLD_STEM_ID));
        expect(manager.getWorlds()).toHaveLength(2);

        await manager.disable();
        expect(manager.getLevels()).toEqual([]);
    });

    it('builds a lazy dimension on `worldFor` and not before', async () => {
        const { manager, builds } = buildManager('main', {
            main: entryOf({ [Dimensions.Nether.id]: { type: Dimensions.Nether.id, generator: { type: TEST_KIND } } })
        });
        await manager.enable();

        expect([...manager.getDefaultLevel().getStems().keys()]).toContain(Dimensions.Nether.id);
        expect(manager.getWorldByDimension(Dimensions.Nether.id)).toBeUndefined();
        expect(builds.has(`${TEST_KIND} ${Dimensions.Nether.id}`)).toBe(false);

        const nether = await manager.worldFor('minecraft:nether');
        expect(nether.getDimension().id).toBe(Dimensions.Nether.id);
        expect(await manager.worldFor(Dimensions.Nether.id)).toBe(nether);
        expect(manager.getWorldByDimension('minecraft:nether')).toBe(nether);
        expect(builds.get(`${TEST_KIND} ${Dimensions.Nether.id}`)).toBe(1);

        await expect(manager.worldFor('mypack:sky')).rejects.toThrowError('has no mypack:sky dimension');
        await manager.disable();
    });

    it.skipIf(!JAVA_DATA)(
        'boots the default entry with three stems, the Overworld eager and the rest lazy',
        async () => {
            // No `preset`, so `minecraft:normal`; the Overworld alone is overridden so the test
            // never builds the noise generator.
            const { manager } = buildManager('main', {
                main: { seed: 1, dimensions: { [OVERWORLD_STEM_ID]: { generator: { type: TEST_KIND } } } }
            });
            await manager.enable();

            const level = manager.getDefaultLevel();
            expect([...level.getStems().keys()].sort()).toEqual(
                [OVERWORLD_STEM_ID, Dimensions.Nether.id, Dimensions.TheEnd.id].sort()
            );
            expect(level.getStems().get(Dimensions.Nether.id)?.generator.type).toBe('minecraft:noise');
            expect([...level.worlds()].map((world) => world.getDimension().id)).toEqual([OVERWORLD_STEM_ID]);

            await manager.disable();
        }
    );

    it('unloads one level and leaves the others running', async () => {
        const { manager } = buildManager('main', { main: entryOf(), other: entryOf() });
        await manager.enable();
        const other = manager.getLevel('other');

        await manager.unloadWorld('other');

        expect(other?.isClosed()).toBe(true);
        expect(manager.getLevels().map((level) => level.name)).toEqual(['main']);
        expect(manager.getLevel('other')).toBeUndefined();
        expect(manager.getDefaultLevel().isClosed()).toBe(false);

        await manager.disable();
    });

    it('says each deprecated key once and writes the entry back in the new spelling', async () => {
        const { manager, logged, setWorld } = buildManager('main', {
            main: { ...entryOf(), generator: 'Flat', layers: [{ block: 'minecraft:stone', size: 3 }] }
        });
        await manager.enable();

        expect(logged.filter((line) => line.includes('is deprecated'))).toEqual([
            "World 'main': `generator: 'Flat'` is deprecated; write `preset: 'minecraft:flat'`.",
            "World 'main': `layers` is deprecated; write the layers as `{ block, height }` under `dimensions['minecraft:overworld'].generator.settings.layers`."
        ]);
        expect(setWorld).toHaveBeenCalledTimes(1);
        expect(setWorld).toHaveBeenCalledWith('main', entryOf(), true);

        await manager.disable();
    });

    it('keeps the stems a save was generated with over a changed config, and says so', async () => {
        const first = buildManager('main', { main: entryOf() });
        await first.manager.enable();
        await first.manager.disable();

        const second = buildManager('main', {
            main: entryOf({ [OVERWORLD_STEM_ID]: { generator: { type: OTHER_KIND } } })
        });
        await second.manager.enable();

        expect(second.logged).toContain(
            `World 'main': ${OVERWORLD_STEM_ID} was generated with ${TEST_KIND} but the config says ${OTHER_KIND}; keeping the saved stem`
        );
        expect(second.builds.get(`${TEST_KIND} ${Dimensions.Overworld.id}`)).toBe(1);
        expect(second.builds.has(`${OTHER_KIND} ${Dimensions.Overworld.id}`)).toBe(false);
        // The second start said nothing new about the config, so nothing was rewritten.
        expect(second.setWorld).not.toHaveBeenCalled();

        await second.manager.disable();
    });
});
