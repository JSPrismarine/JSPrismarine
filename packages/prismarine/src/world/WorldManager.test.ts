/**
 * `WorldManager` over real `Level`s and a real LevelDB in a scratch folder: every `worlds.*`
 * entry loads, the `level-name` one is the default, a lazy dimension waits for `worldFor`, a
 * level unloads on its own, and a save's stems outrank a changed config.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Logger } from '@jsprismarine/logger';
import { load } from '@jsprismarine/packs';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Config } from '../config/Config';
import type { WorldData } from '../config/JsonConfigTypes';
import type { LegacyWorldData } from '../config/normalizeWorldData';
import { definitionsOf } from '../content/ContentOptions';
import type { ServerContent } from '../content/ServerContent';
import { buildServerContent } from '../content/ServerContent';
import { fixtureContentOptions, fixtureDefinitions } from '../content/testing';
import type { NetworkWorldReplicator, WorldReplicators } from '../network/NetworkWorldReplicator';
import type PlayerSession from '../network/PlayerSession';
import type SessionManager from '../SessionManager';
import type Server from '../Server';
import { inertEntityRuntime, testContent } from '../testing/entityServer';
import { stub } from '../testing/stub.test.helper';
import { testKernel } from '../testing/kernel.test.helper';
import { withCwd } from '../utils/cwd';
import Chunk from './chunk/Chunk';
import { Dimensions, FIRST_CUSTOM_DIMENSION_ID } from './DimensionType';
import type { DimensionType } from './DimensionType';
import type { Generator } from './Generator';
import type { TerrainCacheSettings } from './GeneratorFactories';
import { findJavaWorldgenSources } from './generators/datadriven/javaWorldgenSources';
import type { transferToLevel } from './levelTransfer';
import WorldManager from './WorldManager';
import { ChunkCompletionQueue } from './ChunkCompletionQueue';

/** The kinds the tests register, so no level here needs the Java data to build a world. */
const TEST_KIND = 'jsprismarine:test';
const OTHER_KIND = 'jsprismarine:other';

/**
 * The Java data cache, when it is warm. The manager reads the biome parameter reports from it,
 * and a test that wants the vanilla datapack's presets stacks its datapack on the fixture content.
 */
const JAVA_SOURCES = findJavaWorldgenSources();
const JAVA_DATA = JAVA_SOURCES !== undefined;

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

/**
 * The fixture content with one datapack stacked on it, the way a world's own datapack joins
 * the server's pack stack. Only the registries the terrain reads are taken from it.
 */
const contentWithDatapack = (datapack: string): ServerContent => {
    const pack = load([{ kind: 'datapack', path: datapack }]).definitions;
    return buildServerContent(
        fixtureContentOptions({
            load: () => ({
                definitions: definitionsOf({
                    ...fixtureDefinitions(),
                    dimensionTypes: pack.dimensionTypes,
                    worldgen: pack.worldgen
                }),
                diagnostics: []
            })
        })
    );
};

/** Writes a datapack of a few JSON files under the scratch folder and returns its root. */
const writeDatapack = (files: Readonly<Record<string, unknown>>): string => {
    const root = path.join(scratch, 'datapack');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(
        path.join(root, 'pack.mcmeta'),
        JSON.stringify({ pack: { pack_format: 121, description: 'test' } })
    );
    for (const [file, document] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), JSON.stringify(document));
    }
    return root;
};

/** A `dimension_type` document with every field Java requires: a 256-block sky with daylight. */
const SKY_DIMENSION_TYPE = {
    min_y: 0,
    height: 256,
    logical_height: 256,
    coordinate_scale: 1,
    has_skylight: true,
    has_ceiling: false,
    ambient_light: 0,
    monster_spawn_light_level: 0,
    monster_spawn_block_light_limit: 0,
    infiniburn: '#minecraft:infiniburn_overworld'
};

/** A manager over a server double whose config names the given entries and worker count. */
const buildManager = (
    levelName: string,
    worlds: Record<string, LegacyWorldData>,
    content: ServerContent = testContent(),
    chunkWorkers = 4,
    terrainCacheSizeMb = 0
) => {
    const logged: string[] = [];
    const setWorld = vi.fn<Config['setWorld']>();
    const logger = stub<Logger>({
        info: (message) => void logged.push(String(message)),
        warn: (message) => void logged.push(String(message)),
        error: (message) => void logged.push(String(message)),
        debug: () => {},
        verbose: (message) => void logged.push(String(message))
    });
    const kernel = testKernel();
    /** The players online, which a detach moves out of its level. */
    const sessions: PlayerSession[] = [];
    const server = stub<Server>({
        getKernel: () => kernel,
        getSessionManager: () => stub<SessionManager>({ getSessions: () => sessions }),
        getLogger: () => logger,
        getConfig: () =>
            stub<Config>({
                getLevelName: () => levelName,
                getWorlds: () => worlds,
                getPlayerDataGroupProblems: () => [],
                setWorld,
                // Nothing preloads: the start region is covered by the world tests.
                getPreloadRadius: () => 0,
                getChunkWorkers: () => chunkWorkers,
                getChunkHost: () => 'in-process',
                getInvalidChunkHost: () => undefined,
                getTerrainCacheSizeMb: () => terrainCacheSizeMb,
                getEntityTrackingInterval: () => 20
            }),
        getChunkCompletionQueue: () => new ChunkCompletionQueue(),
        getContent: () => content,
        getVersion: () => '9.9.9',
        getEntityRuntime: () => inertEntityRuntime(),
        // No pack stack, so no content world for an unload to release.
        hasEntityRuntime: () => false,
        getWorldReplicators: () =>
            stub<WorldReplicators>({ for: () => stub<NetworkWorldReplicator>({ chunkEntered: () => {} }) }),
        releaseOnShutdown: () => {}
    });

    /**
     * Each move a detach asked for, by player and level. The move itself is the session's, which
     * these tests have no network for: it lands at once, in the level's Overworld.
     */
    const transfers: Array<{ readonly session: PlayerSession; readonly level: string }> = [];
    const transfer: typeof transferToLevel = async (_server, session, level) => {
        transfers.push({ session, level: level.name });
        const arrival = level.loadedWorld(OVERWORLD_STEM_ID);
        if (arrival !== undefined) session.setWorld(arrival);
        return true;
    };
    const manager = new WorldManager(server, { transfer });
    /** How many generators each kind built, by dimension type id. */
    const builds = new Map<string, number>();
    /** The noise settings ids the registries carried when each dimension type's generator was built. */
    const noiseSettingsSeen = new Map<string, readonly string[]>();
    /** Worker limits forwarded from the server config, by kind and dimension. */
    const workersSeen = new Map<string, number | undefined>();
    /** The terrain cache forwarded from the server config, by kind and dimension. */
    const terrainCacheSeen = new Map<string, TerrainCacheSettings | undefined>();
    for (const kind of [TEST_KIND, OTHER_KIND]) {
        manager.getGeneratorFactories().register({
            kind,
            build: (context) => {
                const key = `${kind} ${context.dimension.id}`;
                builds.set(key, (builds.get(key) ?? 0) + 1);
                workersSeen.set(key, context.workers);
                terrainCacheSeen.set(key, context.terrainCache);
                if (context.dimension.custom) {
                    noiseSettingsSeen.set(context.dimension.id, [...context.worldgen().noiseSettings.keys()]);
                }
                return emptyGenerator(context.dimension);
            }
        });
    }

    return {
        manager,
        kernel,
        sessions,
        transfers,
        logged,
        setWorld,
        builds,
        noiseSettingsSeen,
        workersSeen,
        terrainCacheSeen
    };
};

describe('WorldManager', () => {
    it('forwards configured chunk workers to generator factories', async () => {
        const { manager, workersSeen } = buildManager('main', { main: entryOf() }, testContent(), 2);
        await manager.enable();

        expect(workersSeen.get(`${TEST_KIND} ${Dimensions.Overworld.id}`)).toBe(2);

        await manager.disable();
    });

    it('forwards the configured terrain cache, keyed by the server version', async () => {
        const { manager, terrainCacheSeen } = buildManager('main', { main: entryOf() }, testContent(), 2, 64);
        await manager.enable();

        const cache = terrainCacheSeen.get(`${TEST_KIND} ${Dimensions.Overworld.id}`);
        expect(cache?.maxBytes).toBe(64 * 1024 * 1024);
        expect(cache?.codeVersion).toBe('9.9.9');
        expect(cache?.directory).toBe(withCwd('cache', 'terrain'));

        await manager.disable();
    });

    it('leaves the terrain cache out when its size is zero', async () => {
        const { manager, terrainCacheSeen } = buildManager('main', { main: entryOf() });
        await manager.enable();

        expect(terrainCacheSeen.get(`${TEST_KIND} ${Dimensions.Overworld.id}`)).toBeUndefined();

        await manager.disable();
    });

    it('loads every `worlds` entry as a level, the `level-name` one as the default', async () => {
        const { manager, logged } = buildManager('main', { other: entryOf(), main: entryOf() });
        await manager.enable();

        expect(manager.getLevels().map((level) => level.name)).toEqual(['main', 'other']);
        expect(manager.getEntryLevel().name).toBe('main');
        expect(manager.getEntryWorld()).toBe(manager.getEntryLevel().loadedWorld(OVERWORLD_STEM_ID));
        expect(manager.getWorldByName('other')).toBe(manager.getLevel('other')?.loadedWorld(OVERWORLD_STEM_ID));
        expect(manager.getLevels().flatMap((level) => [...level.worlds()])).toHaveLength(2);
        expect(logged).toContain("Loading §b'main'/minecraft:overworld§r as the entry world!");

        await manager.disable();
        expect(manager.getLevels()).toEqual([]);
    });

    it('builds a lazy dimension on `worldFor` and not before', async () => {
        const { manager, builds } = buildManager('main', {
            main: entryOf({ [Dimensions.Nether.id]: { type: Dimensions.Nether.id, generator: { type: TEST_KIND } } })
        });
        await manager.enable();

        expect([...manager.getEntryLevel().getStems().keys()]).toContain(Dimensions.Nether.id);
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

    it('answers no stem before the default level is loaded, rather than throwing', () => {
        const { manager } = buildManager('main', {
            main: entryOf({ [Dimensions.Nether.id]: { type: Dimensions.Nether.id, generator: { type: TEST_KIND } } })
        });

        expect(manager.stemFor(Dimensions.Nether.id)).toBeUndefined();
        expect(manager.startWorld(Dimensions.Nether.id)).toBeUndefined();
    });

    it('starts a lazy dimension for a caller that cannot wait, and never answers another world for it', async () => {
        const { manager, builds } = buildManager('main', {
            main: entryOf({ [Dimensions.Nether.id]: { type: Dimensions.Nether.id, generator: { type: TEST_KIND } } })
        });
        await manager.enable();

        // Answered at once, while it is still enabling: the Nether, not the Overworld it used to fall
        // back to, which is how `execute in minecraft:nether run fill` wrote into the Overworld.
        const started = manager.startWorld('minecraft:nether');
        expect(started?.getDimension().id).toBe(Dimensions.Nether.id);
        expect(started).not.toBe(manager.getEntryWorld());

        const nether = await manager.worldFor(Dimensions.Nether.id);
        expect(nether).toBe(started);
        expect(manager.startWorld(Dimensions.Nether.id)).toBe(nether);
        expect(builds.get(`${TEST_KIND} ${Dimensions.Nether.id}`)).toBe(1);

        // A dimension no stem names is not invented.
        expect(manager.startWorld('mypack:sky')).toBeUndefined();
        await manager.disable();
    });

    it.skipIf(!JAVA_DATA)(
        'boots the default entry with three stems, the Overworld eager and the rest lazy',
        async () => {
            // No `preset`, so `minecraft:normal`; the Overworld alone is overridden so the test
            // never builds the noise generator. The preset's three stems come from the vanilla
            // datapack, which reaches the manager through the server's pack stack.
            if (JAVA_SOURCES === undefined) throw new Error('skipped above');
            const { manager } = buildManager(
                'main',
                { main: { seed: 1, dimensions: { [OVERWORLD_STEM_ID]: { generator: { type: TEST_KIND } } } } },
                contentWithDatapack(JAVA_SOURCES.datapack)
            );
            await manager.enable();

            const level = manager.getEntryLevel();
            expect([...level.getStems().keys()].sort()).toEqual(
                [OVERWORLD_STEM_ID, Dimensions.Nether.id, Dimensions.TheEnd.id].sort()
            );
            expect(level.getStems().get(Dimensions.Nether.id)?.generator.type).toBe('minecraft:noise');
            expect([...level.worlds()].map((world) => world.getDimension().id)).toEqual([OVERWORLD_STEM_ID]);

            await manager.disable();
        }
    );

    it.skipIf(!JAVA_DATA)('keeps a custom dimension’s number when the config drops the one before it', async () => {
        const datapack = writeDatapack({
            'data/test/dimension_type/sky.json': SKY_DIMENSION_TYPE,
            'data/test/dimension_type/deep.json': SKY_DIMENSION_TYPE
        });
        const both = entryOf({
            'test:sky': { type: 'test:sky', generator: { type: TEST_KIND } },
            'test:deep': { type: 'test:deep', generator: { type: TEST_KIND } }
        });
        const first = buildManager('main', { main: both }, contentWithDatapack(datapack));
        await first.manager.enable();
        const deep = first.manager.getEntryLevel().getDimensionTypes().get('test:deep')?.bedrockId;
        await first.manager.disable();

        const second = buildManager(
            'main',
            { main: entryOf({ 'test:deep': { type: 'test:deep', generator: { type: TEST_KIND } } }) },
            contentWithDatapack(datapack)
        );
        await second.manager.enable();

        expect(deep).toBe(FIRST_CUSTOM_DIMENSION_ID + 1);
        expect(second.manager.getEntryLevel().getDimensionTypes().get('test:deep')?.bedrockId).toBe(deep);

        await second.manager.disable();
    });

    it.skipIf(!JAVA_DATA)('reads a dimension type and a noise setting a stacked datapack adds', async () => {
        const datapack = writeDatapack({
            'data/test/dimension_type/sky.json': SKY_DIMENSION_TYPE,
            'data/test/worldgen/noise_settings/sky.json': { sea_level: 0 }
        });
        const { manager, noiseSettingsSeen } = buildManager(
            'main',
            { main: entryOf({ 'test:sky': { type: 'test:sky', generator: { type: TEST_KIND } } }) },
            contentWithDatapack(datapack)
        );
        await manager.enable();

        const sky = manager.getEntryLevel().getDimensionTypes().get('test:sky');
        expect(sky).toMatchObject({ id: 'test:sky', minY: 0, height: 256, custom: true });

        const world = await manager.worldFor('test:sky');
        expect(world.getDimension()).toBe(sky);
        expect(noiseSettingsSeen.get('test:sky')).toContain('test:sky');

        await manager.disable();
    });

    it('unloads one level and leaves the others running', async () => {
        const { manager } = buildManager('main', { main: entryOf(), other: entryOf() });
        await manager.enable();
        const other = manager.getLevel('other');

        await manager.unloadWorld('other');

        expect(other?.isClosed()).toBe(true);
        expect(manager.getLevels().map((level) => level.name)).toEqual(['main']);
        expect(manager.getLevel('other')).toBeUndefined();
        expect(manager.getEntryLevel().isClosed()).toBe(false);

        await manager.disable();
    });

    it('gives each level a UUID that its save keeps from one start to the next', async () => {
        const first = buildManager('main', { main: entryOf(), other: entryOf() });
        await first.manager.enable();
        const ids = first.manager.getLevels().map((level) => level.id);
        await first.manager.disable();

        const second = buildManager('main', { main: entryOf(), other: entryOf() });
        await second.manager.enable();

        expect(new Set(ids).size).toBe(2);
        expect(second.manager.getLevels().map((level) => level.id)).toEqual(ids);
        const [main, other] = ids;
        expect(second.manager.getLevelById(main ?? '')).toBe(second.manager.getEntryLevel());
        expect(second.manager.getLevelById((other ?? '').toUpperCase())).toBe(second.manager.getLevel('OTHER'));

        await second.manager.disable();
    });

    it('announces each level attached, and a detach as detaching then detached, keeping its save', async () => {
        const { manager, kernel } = buildManager('main', { main: entryOf() });
        const seen: string[] = [];
        kernel.events.on('levelAttached', (event) => void seen.push(`attached ${event.getLevel().name}`));
        kernel.events.on('levelDetaching', (event) => {
            seen.push(`detaching ${event.getLevel().name} ${manager.getLevelState(event.getLevel())}`);
        });
        kernel.events.on('levelDetached', (event) => {
            seen.push(`detached ${event.getLevel().name} ${event.getLevel().isClosed()}`);
        });
        await manager.enable();
        const arena = await manager.createLevel('arena', entryOf());

        await manager.detachLevel('arena');
        expect(manager.getLevel('arena')).toBeUndefined();
        const again = await manager.attachLevel('arena');

        expect(seen).toEqual([
            'attached main',
            'attached arena',
            'detaching arena detaching',
            'detached arena true',
            'attached arena'
        ]);
        expect(again.id).toBe(arena.id);
        expect(manager.getLevelState(again)).toBe('attached');

        await manager.disable();
    });

    it('refuses to detach the entry level, a configured level, or a level that is not attached', async () => {
        const { manager } = buildManager('main', { main: entryOf(), other: entryOf() });
        await manager.enable();

        await expect(manager.detachLevel('main')).rejects.toThrow(/players join first/);
        await expect(manager.detachLevel('other')).rejects.toThrow(/declared in config.json/);
        await expect(manager.detachLevel('nowhere')).rejects.toThrow(/No attached level is named nowhere/);

        await manager.disable();
    });

    it('records created levels in levels.json, and attaches the attached ones at the next start', async () => {
        const first = buildManager('main', { main: entryOf() });
        await first.manager.enable();
        const arena = await first.manager.createLevel('arena', entryOf());
        const lobby = await first.manager.createLevel('lobby', entryOf());
        await first.manager.detachLevel('lobby');
        await first.manager.disable();

        const second = buildManager('main', { main: entryOf() });
        await second.manager.enable();

        expect(second.manager.getLevels().map((level) => [level.name, level.id])).toEqual([
            ['main', second.manager.getEntryLevel().id],
            ['arena', arena.id]
        ]);
        expect(second.manager.getLevelOrigin(second.manager.getLevel('arena') ?? arena)).toBe('registry');
        expect(second.manager.getRegisteredLevels().map(({ name, state, id }) => [name, state, id])).toEqual([
            ['arena', 'attached', arena.id],
            ['lobby', 'detached', lobby.id]
        ]);
        expect(JSON.parse(fs.readFileSync(path.join(scratch, 'levels.json'), 'utf8')).schemaVersion).toBe(1);

        await second.manager.disable();
    });

    it('refuses a name that is not one or that a level has, and tells detached levels of one name apart', async () => {
        const { manager } = buildManager('main', { main: entryOf(), other: entryOf() });
        await manager.enable();

        await expect(manager.createLevel('an arena', entryOf())).rejects.toThrow(/is not a level name/);
        await expect(manager.createLevel('OTHER', entryOf())).rejects.toThrow(/declared in config.json already/);
        const first = await manager.createLevel('arena', entryOf());
        await expect(manager.createLevel('arena', entryOf())).rejects.toThrow(/attached or declared/);
        await manager.detachLevel('arena');
        const second = await manager.createLevel('arena', entryOf());
        await manager.detachLevel('arena');

        await expect(manager.attachLevel('arena')).rejects.toThrow(/More than one detached level is named arena/);
        expect((await manager.attachLevel(first.id)).id).toBe(first.id);
        await expect(manager.attachLevel(second.id)).rejects.toThrow(/attached or declared/);
        expect(new Set(manager.getRegisteredLevels().map((record) => record.folder)).size).toBe(2);

        await manager.disable();
    });

    it('loads one name once, however many loads of it start together', async () => {
        const { manager } = buildManager('main', { main: entryOf() });
        await manager.enable();

        const loads = await Promise.allSettled([
            manager.loadLevel(entryOf(), 'other'),
            manager.loadLevel(entryOf(), 'other')
        ]);

        expect(loads.map((load) => load.status)).toEqual(['fulfilled', 'rejected']);
        expect(manager.getLevels().map((level) => level.name)).toEqual(['main', 'other']);

        await manager.disable();
    });

    it('sends a returning player to the attached level they left from, and to the entry level otherwise', async () => {
        const { manager } = buildManager('main', { main: entryOf() });
        await manager.enable();
        const arena = await manager.createLevel('arena', entryOf());
        await manager.getPlayerLevels().set('Steve', arena.id);
        await manager.getPlayerLevels().set('Alex', '13f251b3-41c9-4271-b2d1-d4abde28890b');

        expect(manager.returningLevelOf('Steve')).toBe(arena);
        expect(manager.returningLevelOf('Alex')).toBeUndefined();
        expect(manager.returningLevelOf('Notch')).toBeUndefined();
        await manager.detachLevel('arena');
        expect(manager.returningLevelOf('Steve')).toBeUndefined();

        await manager.disable();
    });

    it('moves the players of a detaching level to the entry level first', async () => {
        const { manager, sessions, transfers } = buildManager('main', { main: entryOf() });
        await manager.enable();
        const other = await manager.createLevel('other', entryOf());
        const otherWorld = other.loadedWorld(OVERWORLD_STEM_ID);
        if (otherWorld === undefined) throw new Error('the other level has an Overworld');
        let world = otherWorld;
        const session = stub<PlayerSession>({
            getWorld: () => world,
            setWorld: (to) => {
                world = to;
            }
        });
        sessions.push(session);

        await manager.detachLevel('other');

        expect(transfers).toEqual([{ session, level: 'main' }]);
        expect(world.getLevel()).toBe(manager.getEntryLevel());
        expect(other.isClosed()).toBe(true);

        await manager.disable();
    });

    it('says each old key once and writes the entry back in the new spelling', async () => {
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
