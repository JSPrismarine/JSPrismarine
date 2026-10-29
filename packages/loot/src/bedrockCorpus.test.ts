import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { load } from '@jsprismarine/packs';
import { VANILLA_BEHAVIOR_PACK_UUID } from '@jsprismarine/packs/sources';
import { describe, expect, it } from 'vitest';

import { reportProgress } from '../../../.test/reportProgress';

import type { LootTableSource } from './packs';
import { bedrockLootTables, javaLootTables } from './packs';
import { LootRegistry } from './registry';

/**
 * Parses and rolls the real Bedrock equipment tables out of the shipped BDS
 * vanilla layers, which is the corpus the Bedrock dialect exists for.
 *
 * The number this fixes is here: handed `zombie_equipment.json` whole, the
 * Java grammar armed 2000 zombies of 2000, because nothing read the
 * `random_regional_difficulty_chance` sitting in a plural `conditions` array.
 * The table says `max_chance: 0.05`.
 *
 * It needs the cache that `pnpm --filter @jsprismarine/bedrock-data run
 * fetch:sources` populates, so it only runs with JSP_VANILLA_BEHAVIOR_PACK set
 * and CI without the cache skips it.
 */

const enabled = !!process.env['JSP_VANILLA_BEHAVIOR_PACK'];

const cacheRoot = join(import.meta.dirname, '..', '..', '..', 'node_modules', '.cache', 'jsprismarine');

/** The BDS `behavior_packs` folder, whose vanilla layers compose the shipped pack. */
const bdsBehaviorPacks = (): string => {
    const root = join(cacheRoot, 'bds');
    const version = readdirSync(root).find((name) => existsSync(join(root, name, 'unpacked', 'behavior_packs')));
    if (!version) throw new Error(`no unpacked BDS under ${root}; run the bedrock-data fetch:sources script`);

    return join(root, version, 'unpacked', 'behavior_packs');
};

type Definitions = ReturnType<typeof load>['definitions'];

let loaded: Definitions | undefined;

const definitions = (): Definitions =>
    (loaded ??= load([
        { kind: 'brarchiveLayers', path: bdsBehaviorPacks(), uuids: [VANILLA_BEHAVIOR_PACK_UUID] }
    ]).definitions);

/**
 * A registry over the Bedrock table registry, read through whichever dialect
 * is being measured.
 *
 * `javaLootTables` over the Bedrock map is the defect written down: it is the
 * only way left to say it, and saying it needs the word `java` in the source.
 */
const sourceOf = (dialect: 'java' | 'bedrock'): LootTableSource =>
    dialect === 'bedrock' ? bedrockLootTables(definitions().lootTables) : javaLootTables(definitions().lootTables);

const registryOf = (dialect: 'java' | 'bedrock'): LootRegistry =>
    new LootRegistry({ ...definitions(), lootTables: sourceOf(dialect) }, { worldSeed: 1234n });

const ZOMBIE = 'loot_tables/entities/zombie_equipment.json';
const TRIALS = 2000;

/** What `TRIALS` rolls of one table produced, split the way a mob wears it. */
const rollMany = (registry: LootRegistry, table: string, trials = TRIALS) => {
    let armed = 0;
    let wearing = 0;
    let anything = 0;

    for (let trial = 0; trial < trials; trial += 1) {
        const rolled = registry.roll(table);
        if (rolled.length > 0) anything += 1;
        const armor = rolled.filter((stack) => /_(helmet|chestplate|leggings|boots)$/.test(stack.id));
        if (armor.length > 0) wearing += 1;
        if (armor.length < rolled.length) armed += 1;
    }

    return { armed, wearing, anything, trials };
};

/**
 * The tables a `minecraft:equipment` component names, which is the population
 * the server rolls. The component appears in the base definition and in each
 * component group, so the whole definition is walked rather than one branch of
 * it.
 */
const equipmentTables = (): readonly string[] => {
    const named = new Set<string>();

    const visit = (value: unknown): void => {
        if (Array.isArray(value)) {
            for (const member of value) visit(member);
            return;
        }
        if (value === null || typeof value !== 'object') return;

        for (const [key, member] of Object.entries(value)) {
            if (key === 'minecraft:equipment' && member !== null && typeof member === 'object') {
                const table = (member as Record<string, unknown>)['table'];
                if (typeof table === 'string') named.add(table);
            }
            visit(member);
        }
    };

    for (const entity of definitions().entities.values()) visit(entity.data);

    return [...named].sort();
};

describe.skipIf(!enabled)('the vanilla Bedrock equipment tables', { tags: ['real-data'] }, () => {
    it('reads the whole zombie table at the rate it states', { timeout: 120_000 }, () => {
        const asJava = rollMany(registryOf('java'), ZOMBIE);
        const asBedrock = rollMany(registryOf('bedrock'), ZOMBIE);

        console.debug(
            `zombie_equipment.json over ${TRIALS} rolls:\n` +
                `  java grammar:    armed ${asJava.armed}, wearing ${asJava.wearing}\n` +
                `  bedrock dialect: armed ${asBedrock.armed}, wearing ${asBedrock.wearing}`
        );

        // The defect, stated as a test so it cannot come back: every gate in
        // the file is a plural `conditions` array, so the Java grammar read
        // none of them and armed every zombie.
        expect(asJava.armed).toBe(TRIALS);

        // `max_chance: 0.05` at a fully ramped region, which is one in twenty.
        expect(asBedrock.armed / TRIALS).toBeGreaterThan(0.03);
        expect(asBedrock.armed / TRIALS).toBeLessThan(0.07);

        // The armor pool states 1.0 at normal difficulty and then 0.15.
        expect(asBedrock.wearing / TRIALS).toBeGreaterThan(0.11);
        expect(asBedrock.wearing / TRIALS).toBeLessThan(0.19);
    });

    it('arms every vanilla type that carries the component', { timeout: 120_000 }, () => {
        const registry = registryOf('bedrock');
        const tables = equipmentTables();
        const produced = tables.filter((table) => rollMany(registry, table, 200).anything > 0);

        console.debug(
            `${produced.length} of ${tables.length} equipment tables produced something:\n` +
                tables.map((table) => `  ${table}`).join('\n')
        );

        // Every table a component names rolls something at least once in 200
        // bodies. Before the dialect, the five whose only pools are gated ones
        // produced nothing at all, whatever the sample size.
        expect(produced).toEqual(tables);
        reportProgress(`${produced.length} data-driven equipment tables produced drops in the sampled rolls.`);
    });

    it('parses every equipment table and the sets they chain into with no error', { timeout: 120_000 }, () => {
        const registry = registryOf('bedrock');
        for (const table of equipmentTables()) registry.table(table);

        expect(registry.diagnostics.errors).toEqual([]);

        reportProgress(
            `${registry.diagnostics.entries.length} review notes were emitted while parsing ${equipmentTables().length} equipment tables.`
        );
    });

    it('reports review notes across the Bedrock loot tables', { timeout: 300_000 }, () => {
        const registry = registryOf('bedrock');
        const reported = registry.validate();

        const counted = new Map<string, number>();
        for (const entry of reported) {
            const kind = `${entry.severity}: ${entry.message}`;
            counted.set(kind, (counted.get(kind) ?? 0) + 1);
        }

        // Nothing is an error any more, which is the point: every remaining
        // gap is in `BEDROCK_REVIEWED_CONDITIONS` or `BEDROCK_REVIEWED_FUNCTIONS`
        // with a reason, so `content-strict` can refuse the unreviewed ones
        // without refusing a stock Bedrock server.
        expect(reported.filter((entry) => entry.severity === 'error')).toEqual([]);
        reportProgress(
            `${registry.ids.length} Bedrock loot tables produced ${reported.length} review notes across ${counted.size} distinct kinds.`
        );
    });

    it('refuses the whole registry in strict mode only when something is unreviewed', { timeout: 300_000 }, () => {
        // Strict over the stock vanilla stack has to pass, or `content-strict`
        // would be a setting nobody could turn on.
        expect(() =>
            new LootRegistry(
                { ...definitions(), lootTables: bedrockLootTables(definitions().lootTables) },
                { worldSeed: 1234n, strict: true }
            ).validate()
        ).not.toThrow();

        const unreviewed = new Map<string, unknown>(definitions().lootTables);
        unreviewed.set('loot_tables/made_up.json', {
            data: {
                pools: [
                    {
                        rolls: 1,
                        entries: [{ type: 'item', name: 'minecraft:stone', functions: [{ function: 'set_mood' }] }]
                    }
                ]
            }
        });

        expect(() =>
            new LootRegistry(
                { ...definitions(), lootTables: bedrockLootTables(unreviewed) },
                { worldSeed: 1234n, strict: true }
            ).validate()
        ).toThrow(/set_mood/);
    });
});
