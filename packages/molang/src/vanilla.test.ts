import { describe, expect, it } from 'vitest';
import { Molang } from './Molang';
import type { MolangScope } from './scope';
import type { EngineVersion } from './version';

/**
 * Vanilla server-side expressions quoted in docs/research/molang.md (the 82-expression corpus; the
 * note quotes these distinct forms with their sources). Every one must parse and compile without
 * diagnostics; where the note fixes a value for a known scope, the evaluation is asserted too.
 */
const VANILLA_EXPRESSIONS = [
    // Feature rules and features.
    'query.heightmap(variable.worldx, variable.worldz)',
    'query.above_top_solid(variable.worldx, variable.worldz)',
    'math.max(query.above_top_solid(variable.worldx, variable.worldz), query.heightmap(variable.worldx, variable.worldz) - 4)',
    'Math.Random(48, 96)',
    'Math.Random(204, 250)',
    'Math.Random(104, 157)',
    'math.random(-8, 8)',
    'variable.is_legacy ? 0.0 : 100.0',
    'variable.is_legacy == 0.0 ? 1 : 0',
    'math.ceil((query.noise(variable.originx / 80.0, variable.originz / 80.0) + 0.3) * 160.0)',
    '(query.noise((variable.originx + 8) / 200.0, (variable.originz + 8) / 200.0) < -0.8) ? 5 : 10',
    'math.clamp(math.trunc(math.ceil((query.noise(math.trunc(variable.originx / 80), math.trunc(variable.originz / 80)) + 0.3) * 160)), 15, 160)',
    "query.any_tag('minecraft:leaves')",
    "query.any_tag('dirt', 'sand', 'gravel')",
    "query.has_biome_tag('bee_habitat') ? 5.0 : (query.has_biome_tag('plains') ? 3.0 : 0.5)",
    // Entities.
    'Math.Random(1,7)',
    'query.last_hit_by_player ? Math.Random(1,3) : 0',
    'query.last_hit_by_player ? 5 + (query.equipment_count * Math.Random(1,3)) : 0',
    'query.last_hit_by_player ? (query.is_baby ? 12 : 5) + (Math.die_roll(query.equipment_count,1,3)) : 0',
    'query.last_hit_by_player ? query.variant : 0',
    'Math.Min(query.player_level * 7, 100)',
    'query.is_baby ? 0.02 : 0.001',
    "query.has_any_family('blaze', 'creeper', 'happy_ghast') ? -90 : 0",
    "query.any_tag('trapdoors')",
    "q.all_tags('minecraft:is_spear')",
    'query.anger_level(this) >= 40',
    'query.anger_level(this) >= 80',
    '2.0 - math.clamp(query.anger_level / 80 * 1.5, 0, 1.5)',
    '180.0 + Math.random(-20.0, 20.0)',
    "query.had_component_group('has_nectar')",
    '!query.is_on_ground',
    "math.clamp(query.property('minecraft:creaking_swaying_ticks') + 1, 0, 6)",
    'query.head_is_in_water',
    'query.is_using_item',
    // Items.
    'context.other->query.remaining_durability',
    'query.max_durability * 0.25',
    // Blocks.
    "query.block_state('growth') == 1 && query.block_state('minecraft:cardinal_direction') == 'east'",
    // Biomes.
    'variable.sea_level - 3',
    'variable.sea_level + 2'
] as const;

/** Layer versions vanilla ships these expressions under; all must parse under each. */
const LAYER_VERSIONS: readonly EngineVersion[] = [
    [1, 16, 0],
    [1, 18, 0],
    [1, 18, 10],
    [1, 21, 60],
    [1, 26, 50]
];

const entity = (overrides: MolangScope['entity'] = {}): MolangScope => ({
    entity: {
        angerLevel: () => 60,
        equipmentCount: () => 2,
        hadComponentGroup: (name) => name === 'has_nectar',
        hasAnyFamily: (families) => families.includes('creeper'),
        headIsInWater: () => false,
        isBaby: () => true,
        isOnGround: () => false,
        isUsingItem: () => true,
        lastHitByPlayer: () => true,
        playerLevel: () => 30,
        property: (name) => (name === 'minecraft:creaking_swaying_ticks' ? 5 : undefined),
        variant: () => 3,
        ...overrides
    }
});

describe('the vanilla server-side corpus', () => {
    const molang = new Molang();

    it.each(VANILLA_EXPRESSIONS.map((source) => [source]))('parses and compiles %s', (source) => {
        for (const version of LAYER_VERSIONS) {
            const compiled = molang.compile(source, { minEngineVersion: version });
            expect(compiled.diagnostics).toEqual([]);
            expect(compiled.ast).toBeDefined();
        }
    });

    it('evaluates the experience rewards', () => {
        const scope = entity();
        expect(molang.compile('query.last_hit_by_player ? query.variant : 0').evaluate(scope)).toBe(3);
        expect(molang.compile('Math.Min(query.player_level * 7, 100)').evaluate(scope)).toBe(100);
        const bogged = molang
            .compile('query.last_hit_by_player ? 5 + (query.equipment_count * Math.Random(1,3)) : 0')
            .evaluate(scope);
        expect(bogged).toBeGreaterThanOrEqual(7);
        expect(bogged).toBeLessThanOrEqual(11);
        const pillager = molang
            .compile(
                'query.last_hit_by_player ? (query.is_baby ? 12 : 5) + (Math.die_roll(query.equipment_count,1,3)) : 0'
            )
            .evaluate(scope);
        expect(pillager).toBeGreaterThanOrEqual(14);
        expect(pillager).toBeLessThanOrEqual(18);
        expect(
            molang
                .compile('query.last_hit_by_player ? Math.Random(1,3) : 0')
                .evaluate(entity({ lastHitByPlayer: () => false }))
        ).toBe(0);
    });

    it('evaluates the warden anger expressions', () => {
        const scope = entity();
        expect(molang.compile('query.anger_level(this) >= 40').evaluate(scope)).toBe(1);
        expect(molang.compile('query.anger_level(this) >= 80').evaluate(scope)).toBe(0);
        expect(molang.compile('2.0 - math.clamp(query.anger_level / 80 * 1.5, 0, 1.5)').evaluate(scope)).toBeCloseTo(
            2 - 1.125
        );
    });

    it('evaluates the ambient-sound and behavior conditions', () => {
        const scope = entity();
        expect(molang.compile('query.is_baby ? 0.02 : 0.001').evaluate(scope)).toBe(0.02);
        expect(molang.compile('!query.is_on_ground').evaluate(scope)).toBe(1);
        expect(molang.compile("query.had_component_group('has_nectar')").evaluate(scope)).toBe(1);
        expect(
            molang.compile("math.clamp(query.property('minecraft:creaking_swaying_ticks') + 1, 0, 6)").evaluate(scope)
        ).toBe(6);
        expect(
            molang.compile("query.has_any_family('blaze', 'creeper', 'happy_ghast') ? -90 : 0").evaluate(scope)
        ).toBe(-90);
    });

    it('evaluates the spear repair expressions', () => {
        const spear: MolangScope = { item: { maxDurability: () => 250, remainingDurability: () => 100 } };
        expect(molang.compile('query.max_durability * 0.25').evaluate(spear)).toBe(62.5);
        const scope: MolangScope = { context: new Map([['other', { kind: 'scope', scope: spear }]]) };
        expect(molang.compile('context.other->query.remaining_durability').evaluate(scope)).toBe(100);
    });

    it('evaluates the shelf mushroom permutation condition', () => {
        const scope: MolangScope = {
            block: {
                blockState: (name) =>
                    name === 'growth' ? 1 : name === 'minecraft:cardinal_direction' ? 'east' : undefined
            }
        };
        expect(
            molang
                .compile(
                    "query.block_state('growth') == 1 && query.block_state('minecraft:cardinal_direction') == 'east'"
                )
                .evaluate(scope)
        ).toBe(1);
    });

    it('evaluates the feature placement expressions', () => {
        const scope: MolangScope = {
            placement: {
                heightmap: (x, z) => 64 + x + z,
                aboveTopSolid: (x, z) => 70 + x + z,
                noise: () => 0.5,
                hasBiomeTag: (tag) => tag === 'plains'
            },
            variables: new Map([
                ['worldx', 1],
                ['worldz', 2],
                ['originx', 80],
                ['originz', 160],
                ['is_legacy', 0],
                ['sea_level', 63]
            ])
        };
        expect(molang.compile('query.heightmap(variable.worldx, variable.worldz)').evaluate(scope)).toBe(67);
        expect(
            molang
                .compile(
                    'math.max(query.above_top_solid(variable.worldx, variable.worldz), query.heightmap(variable.worldx, variable.worldz) - 4)'
                )
                .evaluate(scope)
        ).toBe(73);
        expect(molang.compile('variable.is_legacy ? 0.0 : 100.0').evaluate(scope)).toBe(100);
        expect(molang.compile('variable.is_legacy == 0.0 ? 1 : 0').evaluate(scope)).toBe(1);
        expect(
            molang
                .compile('math.ceil((query.noise(variable.originx / 80.0, variable.originz / 80.0) + 0.3) * 160.0)')
                .evaluate(scope)
        ).toBe(128);
        expect(
            molang
                .compile(
                    '(query.noise((variable.originx + 8) / 200.0, (variable.originz + 8) / 200.0) < -0.8) ? 5 : 10'
                )
                .evaluate(scope)
        ).toBe(10);
        expect(
            molang
                .compile("query.has_biome_tag('bee_habitat') ? 5.0 : (query.has_biome_tag('plains') ? 3.0 : 0.5)")
                .evaluate(scope)
        ).toBe(3);
        expect(molang.compile('variable.sea_level - 3').evaluate(scope)).toBe(60);
        expect(molang.compile('variable.sea_level + 2').evaluate(scope)).toBe(65);
    });

    it('evaluates the tag queries over item and block tags', () => {
        const dirt: MolangScope = { block: { tags: () => ['dirt'] } };
        expect(molang.compile("query.any_tag('dirt', 'sand', 'gravel')").evaluate(dirt)).toBe(1);
        expect(molang.compile("query.any_tag('minecraft:leaves')").evaluate(dirt)).toBe(0);
        const spearItem: MolangScope = { item: { tags: () => ['minecraft:is_spear'] } };
        expect(molang.compile("q.all_tags('minecraft:is_spear')").evaluate(spearItem)).toBe(1);
    });

    it('draws experience and iteration randoms inside the documented ranges', () => {
        for (const [source, low, high] of [
            ['Math.Random(1,7)', 1, 7],
            ['Math.Random(48, 96)', 48, 96],
            ['math.random(-8, 8)', -8, 8],
            ['180.0 + Math.random(-20.0, 20.0)', 160, 200]
        ] as const) {
            const value = molang.compile(source).evaluate({});
            expect(value).toBeGreaterThanOrEqual(low);
            expect(value).toBeLessThanOrEqual(high);
        }
    });
});
