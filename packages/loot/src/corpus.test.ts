import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { load } from '@jsprismarine/packs';
import { readZip } from '@jsprismarine/packs/zip';
import type {
    BlockState,
    DamageSource,
    EnchantmentView,
    EntityView,
    ItemStack,
    LevelView,
    LootContextParameters
} from '@jsprismarine/predicates';
import { asList, asString, enchantmentLevelFromComponent, isJsonObject, namespaced } from '@jsprismarine/predicates';
import { describe, expect, it } from 'vitest';

import { javaLootTables } from './packs';
import { LootRegistry } from './registry';

/**
 * Parses and rolls the real Java 26.3 vanilla loot tables, loaded through
 * `@jsprismarine/packs` the way a server loads them. It needs the cache that
 * `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` populates, so
 * it only runs with JSP_VANILLA_DATAPACK set and CI without the cache skips
 * it.
 */

const enabled = !!process.env['JSP_VANILLA_DATAPACK'];

const cacheRoot = join(import.meta.dirname, '..', '..', '..', 'node_modules', '.cache', 'jsprismarine');

const isSafePath = (path: string): boolean =>
    !path.startsWith('/') && !path.includes('\\') && path.split('/').every((segment) => segment !== '..');

/** Finds the cached Java server jar, whichever of the two source names holds it. */
const findServerJar = (): { readonly version: string; readonly path: string } => {
    for (const source of ['java-server', 'java']) {
        const root = join(cacheRoot, source);
        if (!existsSync(root)) continue;
        const version = readdirSync(root).find((name) => existsSync(join(root, name, 'server.jar')));
        if (version) return { version, path: join(root, version, 'server.jar') };
    }
    throw new Error(`no server.jar under ${cacheRoot}; run the bedrock-data fetch:sources script`);
};

/** Extracts the datapack JSON out of the bundler jar's inner server jar into the cache, once. */
const extractVanillaDatapack = (): string => {
    const jar = findServerJar();
    const target = join(cacheRoot, 'vanilla-datapack', jar.version);
    const mcmetaPath = join(target, 'pack.mcmeta');
    if (existsSync(mcmetaPath)) return target;

    const outer = readZip(readFileSync(jar.path));
    const innerName = [...outer.keys()].find((name) => /^META-INF\/versions\/[^/]+\/server-.+\.jar$/.test(name));
    if (!innerName) throw new Error('the server jar has no META-INF/versions inner jar');

    for (const [name, bytes] of readZip(outer.get(innerName)!)) {
        if (!name.startsWith('data/') || !name.endsWith('.json') || !isSafePath(name)) continue;
        const absolute = join(target, ...name.split('/'));
        mkdirSync(dirname(absolute), { recursive: true });
        writeFileSync(absolute, bytes);
    }

    writeFileSync(
        mcmetaPath,
        JSON.stringify({ pack: { description: 'vanilla 26.3', min_format: [121, 0], max_format: [121, 0] } })
    );
    return target;
};

const ORIGIN = { x: 0, y: 64, z: 0 };

const PLAYER: EntityView = {
    type: 'minecraft:player',
    typeTags: [],
    position: ORIGIN,
    flags: {},
    components: new Map(),
    effects: new Map(),
    equipment: {},
    scores: new Map(),
    experienceLevel: 30,
    gameMode: 'survival',
    ticksExisted: 1200,
    movement: { x: 0, y: 0, z: 0, speed: 0, horizontalSpeed: 0, verticalSpeed: 0, fallDistance: 0 },
    typeSpecific: {}
};

const STATE: BlockState = { name: 'minecraft:stone', properties: {} };

const DAMAGE: DamageSource = {
    type: 'minecraft:player_attack',
    tags: [],
    directEntity: PLAYER,
    sourceEntity: PLAYER,
    position: ORIGIN
};

/** Silk Touch and Fortune together, so the corpus walks both branches of the block tables that check for them. */
const TOOL: ItemStack = {
    id: 'minecraft:diamond_pickaxe',
    count: 1,
    components: new Map<string, unknown>([
        ['minecraft:enchantments', { levels: { 'minecraft:silk_touch': 1, 'minecraft:fortune': 3 } }]
    ])
};

/** Every loot context parameter, so a table of any key set finds what it declares. */
const PARAMETERS: LootContextParameters = {
    this_entity: PLAYER,
    interacting_entity: PLAYER,
    target_entity: PLAYER,
    last_damage_player: PLAYER,
    damage_source: DAMAGE,
    attacking_entity: PLAYER,
    direct_attacking_entity: PLAYER,
    origin: ORIGIN,
    block_state: STATE,
    block_entity: { id: 'minecraft:chest', components: new Map() },
    tool: TOOL,
    enchantment_level: 3,
    enchantment_active: true,
    additional_cost_component_allowed: true,
    container: []
};

/** A world that answers every question, so a condition fails on its own terms rather than on a missing host. */
const LEVEL: LevelView = {
    clockTicks: () => 6000,
    isRaining: () => false,
    isThundering: () => false,
    dimension: () => 'minecraft:overworld',
    blockAt: () => STATE,
    fluidAt: () => ({ name: 'minecraft:empty', properties: {} }),
    biomeAt: () => 'minecraft:plains',
    biomeTagsAt: () => [],
    structuresAt: () => [],
    lightAt: () => 15,
    canSeeSky: () => true,
    isSmokey: () => false,
    environmentAttribute: () => 0,
    storedNumber: () => 0,
    score: () => 0
};

const ENCHANTMENTS: EnchantmentView = {
    levelOn: enchantmentLevelFromComponent,
    maxLevel: () => 5,
    applicableTo: () => ['minecraft:fortune', 'minecraft:silk_touch'],
    selectRandomEnchantments: () => new Map([['minecraft:fortune', 1]])
};

/**
 * Points the context at the subject the table is about, so a block table sees
 * its own block and a mob table its own entity. Without this most block
 * tables fail their `match_block` condition and drop nothing, which would
 * make the roll pass while exercising almost none of the grammar.
 */
const parametersFor = (id: string): LootContextParameters => {
    const blockPrefix = 'minecraft:blocks/';
    if (id.startsWith(blockPrefix)) {
        return { ...PARAMETERS, block_state: { name: `minecraft:${id.slice(blockPrefix.length)}`, properties: {} } };
    }

    const entityPrefix = 'minecraft:entities/';
    if (id.startsWith(entityPrefix)) {
        return { ...PARAMETERS, this_entity: { ...PLAYER, type: `minecraft:${id.slice(entityPrefix.length)}` } };
    }

    return PARAMETERS;
};

interface Corpus {
    readonly registry: LootRegistry;
    readonly definitions: ReturnType<typeof load>['definitions'];
    readonly tableCount: number;
}

let corpus: Corpus | undefined;

const loadCorpus = (): Corpus => {
    if (corpus !== undefined) return corpus;

    const { definitions, diagnostics } = load([{ kind: 'datapack', path: extractVanillaDatapack() }]);
    expect(diagnostics.filter((entry) => entry.severity === 'error')).toEqual([]);

    let nextMapId = 0;
    corpus = {
        definitions,
        registry: new LootRegistry(
            { ...definitions, lootTables: javaLootTables(definitions.lootTablesJava) },
            {
                worldSeed: 1234n,
                content: {
                    recipes: definitions.recipesJava,
                    itemTag: (tag) => {
                        const file = definitions.tags.get(`item/${tag}`)?.data;
                        const values = isJsonObject(file) ? file['values'] : undefined;
                        return Array.isArray(values) ? values.filter((value) => typeof value === 'string') : undefined;
                    },
                    structures: () => ({ x: 512, y: 64, z: -512 }),
                    mapIds: () => nextMapId++
                }
            }
        ),
        tableCount: definitions.lootTablesJava.size
    };
    return corpus;
};

describe.skipIf(!enabled)('the vanilla 26.3 loot corpus', () => {
    it('parses every table with no error', { timeout: 300_000 }, () => {
        const { registry, tableCount } = loadCorpus();

        const reported = registry.validate();

        expect({ tables: tableCount, cycles: registry.cycles.length }).toEqual({ tables: 1447, cycles: 0 });
        expect(reported.filter((entry) => entry.severity === 'error')).toEqual([]);
        expect(reported.filter((entry) => entry.severity === 'warning')).toEqual([]);
    });

    it('rolls every table without throwing', { timeout: 600_000 }, () => {
        const { registry } = loadCorpus();
        const rollsPerTable = 20;

        let produced = 0;
        let stacks = 0;
        const failures: string[] = [];

        for (const id of registry.ids) {
            let any = false;
            try {
                for (let roll = 0; roll < rollsPerTable; roll += 1) {
                    const drawn = registry.roll(id, {
                        parameters: parametersFor(id),
                        level: LEVEL,
                        enchantments: ENCHANTMENTS,
                        luck: 1
                    });
                    stacks += drawn.length;
                    any ||= drawn.length > 0;
                }
            } catch (error) {
                failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
            }
            if (any) produced += 1;
        }

        expect(failures).toEqual([]);
        // The 112 tables that drop nothing for this subject are the ones that
        // drop nothing in the game either: the doors, beds and tall plants whose
        // `match_block` wants a `half` or `part` the fixed state does not carry,
        // the empty tables (fire, spawner, budding amethyst, armor stand, most
        // passive mobs), and the shearing tables that want a sheep color.
        expect({ tables: registry.ids.length, produced, rollsPerTable }).toEqual({
            tables: 1447,
            produced: 1335,
            rollsPerTable: 20
        });
        expect(stacks).toBeGreaterThan(0);
    });

    it('uses six of the nine entry types, in the counts the research note measured', () => {
        const { definitions } = loadCorpus();
        const counts = new Map<string, number>();
        let pools = 0;

        const countEntry = (entry: unknown): void => {
            if (!isJsonObject(entry)) return;
            const type = namespaced(asString(entry['type']) ?? '').slice('minecraft:'.length);
            counts.set(type, (counts.get(type) ?? 0) + 1);
            for (const child of asList(entry['children'])) countEntry(child);
        };

        for (const table of definitions.lootTablesJava.values()) {
            const json = table.data;
            for (const pool of asList(isJsonObject(json) ? json['pools'] : undefined)) {
                pools += 1;
                if (!isJsonObject(pool)) continue;
                for (const entry of asList(pool['entries'])) countEntry(entry);
            }
        }

        expect(pools).toBe(1589);
        expect(Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]))).toEqual({
            item: 2556,
            alternatives: 87,
            loot_table: 57,
            empty: 39,
            dynamic: 1,
            tag: 1
        });
    });
});
