import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { load } from '@jsprismarine/packs';
import { VANILLA_BEHAVIOR_PACK_UUID } from '@jsprismarine/packs/sources';
import { describe, expect, it } from 'vitest';

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
        expect(tables.length).toBe(18);
        expect(produced).toEqual(tables);
    });

    it('parses every equipment table and the sets they chain into with no error', { timeout: 120_000 }, () => {
        const registry = registryOf('bedrock');
        for (const table of equipmentTables()) registry.table(table);

        expect(registry.diagnostics.errors).toEqual([]);

        // Three functions, and they are the whole of what the gear this server
        // rolls goes without: a skeleton's bow is unenchanted, a looting kill
        // adds nothing to a drop, and a raid captain's banner is plain.
        const kinds = new Set(registry.diagnostics.entries.map((entry) => entry.message));
        expect([...kinds].sort()).toEqual([
            "this package does not apply the bedrock loot function enchant_random_gear, so a mob's gear arrives unenchanted",
            "this package does not apply the bedrock loot function looting_enchant, so a killer's looting level adds nothing",
            "this package does not apply the bedrock loot function set_banner_details, so a raid captain's banner is a plain one"
        ]);
    });

    it('states its own gap over all 309 tables rather than rolling past it', { timeout: 300_000 }, () => {
        const registry = registryOf('bedrock');
        const reported = registry.validate();

        const counted = new Map<string, number>();
        for (const entry of reported) {
            const kind = `${entry.severity}: ${entry.message}`;
            counted.set(kind, (counted.get(kind) ?? 0) + 1);
        }

        console.debug(
            `the whole ${registry.ids.length}-table bedrock registry reports:\n` +
                [...counted]
                    .sort((left, right) => right[1] - left[1])
                    .map(([kind, count]) => `  ${count} x ${kind}`)
                    .join('\n')
        );

        expect(registry.ids.length).toBe(309);

        // Nothing is an error any more, which is the point: every remaining
        // gap is in `BEDROCK_REVIEWED_CONDITIONS` or `BEDROCK_REVIEWED_FUNCTIONS`
        // with a reason, so `content-strict` can refuse the unreviewed ones
        // without refusing a stock Bedrock server. Counted here so a gap cannot
        // grow, shrink or change kind unnoticed.
        expect(reported.filter((entry) => entry.severity === 'error')).toEqual([]);
        expect(reported.length).toBe(778);
        expect(Object.fromEntries(counted)).toEqual({
            "warning: this package does not apply the bedrock loot function enchant_random_gear, so a mob's gear arrives unenchanted": 143,
            "warning: this package does not apply the bedrock loot function looting_enchant, so a killer's looting level adds nothing": 114,
            'warning: this package does not apply the bedrock loot function explosion_decay, so a nearby explosion destroys none of the drop': 96,
            'warning: this package does not apply the bedrock loot function set_damage, so a rolled tool arrives undamaged': 63,
            'warning: this package does not apply the bedrock loot function enchant_with_levels, so the result arrives unenchanted': 52,
            'warning: this package does not apply the bedrock loot function enchant_randomly, so the result arrives unenchanted': 44,
            'warning: this package does not apply the bedrock loot function set_potion, so a rolled bottle holds water': 42,
            'warning: this package does not apply the bedrock loot function specific_enchants, so the named enchantments are missing': 33,
            'warning: this package does not apply the bedrock loot function set_data, so a variant such as a dye color comes out as the default': 30,
            'warning: this package does not apply the bedrock loot function set_armor_trim, so a rolled piece arrives untrimmed': 24,
            'warning: this package does not apply the bedrock loot function exploration_map, so a rolled map points nowhere': 18,
            'warning: this package does not evaluate the bedrock loot condition killed_by_player, which reads whether a player landed the killing blow, so its gate never opens': 16,
            'warning: this package does not apply the bedrock loot function furnace_smelt, so a burning mob drops its loot raw': 15,
            "warning: this package does not evaluate the bedrock loot condition random_chance_with_looting, which reads a chance scaled by the killer's looting level, so its gate never opens": 15,
            "warning: this package does not evaluate the bedrock loot condition has_mark_variant, which reads the entity's minecraft:mark_variant, so its gate never opens": 14,
            'warning: this package does not evaluate the bedrock loot condition killed_by_player_or_pets, which reads whether a player or a tamed pet of one landed the killing blow, so its gate never opens': 10,
            "warning: this package does not apply the bedrock loot function enchant_book_for_trading, so a villager's trade book arrives blank": 10,
            'warning: this package does not evaluate the bedrock loot condition biome_has_tag, which reads a tag on the biome the roll happens in, so its gate never opens': 9,
            'warning: this package does not apply the bedrock loot function set_ominous_bottle_amplifier, so the bottle carries the lowest bad omen': 7,
            'warning: this package does not evaluate the bedrock loot condition killed_by_entity, which reads which entity type landed the killing blow, so its gate never opens': 5,
            'warning: this package does not evaluate the bedrock loot condition entity_killed, which reads a predicate over the entity that was killed, so its gate never opens': 4,
            "warning: this package does not evaluate the bedrock loot condition has_variant, which reads the entity's minecraft:variant, so its gate never opens": 3,
            'warning: this package does not apply the bedrock loot function random_aux_value, so the aux value stays at zero': 2,
            "warning: this package does not apply the bedrock loot function set_banner_details, so a raid captain's banner is a plain one": 2,
            'warning: this package does not evaluate the bedrock loot condition passenger_of_entity, which reads what the entity is riding, so its gate never opens': 2,
            "warning: this package does not evaluate the bedrock loot condition is_baby, which reads the entity's age, so its gate never opens": 2,
            'warning: this package does not evaluate the bedrock loot condition damaged_by_entity, which reads which entity type dealt the last damage, so its gate never opens': 1,
            'warning: this package does not apply the bedrock loot function set_stew_effect, so a suspicious stew carries no effect': 1,
            'warning: this package does not evaluate the bedrock loot condition bool_property, which reads an entity property a behavior pack declared, so its gate never opens': 1
        });
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
