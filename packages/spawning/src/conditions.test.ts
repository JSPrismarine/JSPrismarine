import { scriptedRandom } from '@jsprismarine/predicates';
import { describe, expect, it } from 'vitest';

import { SPAWN_CONSTANTS } from './constants';
import type { SpawnConditionContext } from './conditions';
import { SpawnDelays, evaluateSpawnCondition } from './conditions';
import type { SpawnCondition } from './rules';
import { parseSpawnRule } from './rules';
import type { SpawnPosition, SpawnSiteFlag, SpawnWorld } from './world';

/** An empty world: dry stone at the surface, full daylight, no players, no mobs. */
const baseWorld = {
    site: (flag: SpawnSiteFlag) => flag === 'surface',
    block: () => 'minecraft:stone',
    surfaceY: () => 64,
    minY: () => -64,
    light: () => 15,
    biomeTags: () => ['plains', 'overworld'],
    biome: () => 'minecraft:plains',
    players: () => [],
    poolCount: () => 0,
    typeCount: () => 0,
    difficulty: () => 'normal' as const,
    weather: () => 'clear' as const,
    age: () => 0,
    mobEventActive: () => false,
    villageBorderDistance: () => undefined
} satisfies SpawnWorld;

const worldWith = (overrides: Partial<SpawnWorld>): SpawnWorld => ({ ...baseWorld, ...overrides });

const ORIGIN: SpawnPosition = { x: 0, y: 64, z: 0 };

/** Parses one condition body the way a file writes it. */
const conditionOf = (body: Record<string, unknown>): SpawnCondition => {
    const rule = parseSpawnRule(
        {
            format_version: '1.8.0',
            'minecraft:spawn_rules': { description: { identifier: 'minecraft:cow' }, conditions: [body] }
        },
        { pack: 'test' }
    );
    return rule!.conditions[0]!;
};

const contextOf = (world: SpawnWorld, overrides: Partial<SpawnConditionContext> = {}): SpawnConditionContext => ({
    world,
    identifier: 'minecraft:cow',
    random: scriptedRandom([0.5]),
    tick: 0,
    constants: SPAWN_CONSTANTS,
    ...overrides
});

const check = (
    body: Record<string, unknown>,
    world: SpawnWorld,
    at: SpawnPosition = ORIGIN,
    overrides: Partial<SpawnConditionContext> = {}
) => evaluateSpawnCondition(conditionOf(body), at, contextOf(world, overrides));

describe('the placement components', () => {
    it('passes a surface position for a surface rule', () => {
        expect(check({ 'minecraft:spawns_on_surface': {} }, baseWorld).passed).toBe(true);
    });

    it('rejects a surface position for an underground rule', () => {
        const result = check({ 'minecraft:spawns_underground': {} }, baseWorld);

        expect(result.passed).toBe(false);
        expect(result.rejectedBy).toBe('minecraft:spawns_underground');
    });

    it('takes either pass when the condition names both, as the drowned does', () => {
        const underground = worldWith({ site: (flag) => flag === 'underground' });

        expect(
            check({ 'minecraft:spawns_on_surface': {}, 'minecraft:spawns_underground': {} }, underground).passed
        ).toBe(true);
    });

    it('takes any pass when the condition names neither', () => {
        expect(check({}, worldWith({ site: (flag) => flag === 'underground' })).passed).toBe(true);
    });
});

describe('the medium components', () => {
    const water = worldWith({ site: (flag) => flag === 'surface' || flag === 'underwater' });
    const lava = worldWith({ site: (flag) => flag === 'underground' || flag === 'lava' });

    it('spawns in water only when the condition says so', () => {
        expect(check({ 'minecraft:spawns_underwater': {} }, water).passed).toBe(true);
        expect(check({}, water).rejectedBy).toBe('minecraft:spawns_underwater');
    });

    it('rejects a dry position for an underwater rule', () => {
        expect(check({ 'minecraft:spawns_underwater': {} }, baseWorld).rejectedBy).toBe('minecraft:spawns_underwater');
    });

    it('spawns in lava only when the condition says so, as the strider does', () => {
        expect(check({ 'minecraft:spawns_lava': {} }, lava).passed).toBe(true);
        expect(check({}, lava).rejectedBy).toBe('minecraft:spawns_lava');
    });

    it('refuses a bubble column when the condition disallows it, as the axolotl does', () => {
        const bubble = worldWith({ site: (flag) => flag === 'underwater' || flag === 'bubble_column' });

        expect(
            check({ 'minecraft:spawns_underwater': {}, 'minecraft:disallow_spawns_in_bubble': {} }, bubble).rejectedBy
        ).toBe('minecraft:disallow_spawns_in_bubble');
    });
});

describe('the brightness filter', () => {
    it('compares the light the world reports against the range', () => {
        expect(check({ 'minecraft:brightness_filter': { min: 0, max: 7 } }, baseWorld).rejectedBy).toBe(
            'minecraft:brightness_filter'
        );
        expect(check({ 'minecraft:brightness_filter': { min: 7, max: 15 } }, baseWorld).passed).toBe(true);
    });

    it('lowers the light under rain only when `adjust_for_weather` is set', () => {
        const raining = worldWith({ light: () => 11, weather: () => 'rain' });

        expect(check({ 'minecraft:brightness_filter': { min: 0, max: 7 } }, raining).passed).toBe(false);
        expect(
            check({ 'minecraft:brightness_filter': { min: 0, max: 7, adjust_for_weather: true } }, raining).passed
        ).toBe(true);
    });

    it('lowers the light further under a thunderstorm', () => {
        const storm = worldWith({ light: () => 15, weather: () => 'thunder' });

        expect(
            check({ 'minecraft:brightness_filter': { min: 0, max: 7, adjust_for_weather: true } }, storm).passed
        ).toBe(true);
    });
});

describe('the difficulty filter', () => {
    it('compares the difficulty against the inclusive range', () => {
        expect(check({ 'minecraft:difficulty_filter': { min: 'easy', max: 'hard' } }, baseWorld).passed).toBe(true);
        expect(
            check({ 'minecraft:difficulty_filter': { min: 'easy' } }, worldWith({ difficulty: () => 'peaceful' }))
                .rejectedBy
        ).toBe('minecraft:difficulty_filter');
    });
});

describe('the height filter', () => {
    it('compares the position against the inclusive range', () => {
        expect(check({ 'minecraft:height_filter': { min: 0, max: 64 } }, baseWorld).passed).toBe(true);
        expect(check({ 'minecraft:height_filter': { min: 0, max: 63 } }, baseWorld).rejectedBy).toBe(
            'minecraft:height_filter'
        );
    });
});

describe('the block filters', () => {
    it('reads the block below the position', () => {
        const sand = worldWith({ block: (at) => (at.y === 63 ? 'minecraft:sand' : 'minecraft:air') });

        expect(check({ 'minecraft:spawns_on_block_filter': 'minecraft:sand' }, sand).passed).toBe(true);
        expect(check({ 'minecraft:spawns_on_block_filter': 'minecraft:grass_block' }, sand).rejectedBy).toBe(
            'minecraft:spawns_on_block_filter'
        );
    });

    it('refuses a block the prevented list names', () => {
        const shroomlight = worldWith({ block: () => 'minecraft:shroomlight' });

        expect(
            check(
                {
                    'minecraft:spawns_on_block_prevented_filter': [
                        'minecraft:nether_wart_block',
                        'minecraft:shroomlight'
                    ]
                },
                shroomlight
            ).rejectedBy
        ).toBe('minecraft:spawns_on_block_prevented_filter');
    });

    it('looks down `distance` blocks for an above-block filter', () => {
        const water = worldWith({ block: (at) => (at.y === 61 ? 'minecraft:water' : 'minecraft:air') });

        expect(
            check({ 'minecraft:spawns_above_block_filter': { blocks: 'minecraft:water', distance: 3 } }, water).passed
        ).toBe(true);
        expect(
            check({ 'minecraft:spawns_above_block_filter': { blocks: 'minecraft:water', distance: 1 } }, water)
                .rejectedBy
        ).toBe('minecraft:spawns_above_block_filter');
    });

    it('stops the attempt when the chunk does not answer', () => {
        expect(
            check({ 'minecraft:spawns_on_block_filter': 'minecraft:sand' }, worldWith({ block: () => undefined }))
                .rejectedBy
        ).toBe('minecraft:spawns_on_block_filter');
    });
});

describe('the biome filter', () => {
    it('evaluates the shared filter grammar against the biome tags', () => {
        expect(check({ 'minecraft:biome_filter': { test: 'has_biome_tag', value: 'plains' } }, baseWorld).passed).toBe(
            true
        );
        expect(
            check({ 'minecraft:biome_filter': { test: 'has_biome_tag', value: 'ocean' } }, baseWorld).rejectedBy
        ).toBe('minecraft:biome_filter');
    });

    it('answers `is_snow_covered`, the one other test a vanilla biome filter writes', () => {
        const snowy = worldWith({ site: (flag) => flag === 'surface' || flag === 'snow_covered' });

        expect(check({ 'minecraft:biome_filter': { test: 'is_snow_covered' } }, snowy).passed).toBe(true);
        expect(check({ 'minecraft:biome_filter': { test: 'is_snow_covered' } }, baseWorld).passed).toBe(false);
    });

    it('evaluates a nested group with the documented aliases', () => {
        const mesa = worldWith({ biomeTags: () => ['mesa', 'overworld'] });

        expect(
            check(
                {
                    'minecraft:biome_filter': {
                        all_of: [
                            { test: 'has_biome_tag', value: 'mesa' },
                            { test: 'has_biome_tag', operator: 'not', value: 'plateau' }
                        ]
                    }
                },
                mesa
            ).passed
        ).toBe(true);
    });
});

describe('the distance and village filters', () => {
    it('needs a player inside the range', () => {
        const near = worldWith({ players: () => [{ position: { x: 20, y: 64, z: 0 } }] });
        const far = worldWith({ players: () => [{ position: { x: 200, y: 64, z: 0 } }] });

        expect(check({ 'minecraft:distance_filter': { min: 12, max: 32 } }, near).passed).toBe(true);
        expect(check({ 'minecraft:distance_filter': { min: 12, max: 32 } }, far).rejectedBy).toBe(
            'minecraft:distance_filter'
        );
        expect(check({ 'minecraft:distance_filter': { min: 12, max: 32 } }, baseWorld).rejectedBy).toBe(
            'minecraft:distance_filter'
        );
    });

    it('needs a player near a village for the village filter', () => {
        const inVillage = worldWith({
            players: () => [{ position: { x: 10, y: 64, z: 0 } }],
            villageBorderDistance: () => 8
        });
        const noVillage = worldWith({ players: () => [{ position: { x: 10, y: 64, z: 0 } }] });

        expect(
            check({ 'minecraft:player_in_village_filter': { distance: 48, village_border_tolerance: 32 } }, inVillage)
                .passed
        ).toBe(true);
        expect(
            check({ 'minecraft:player_in_village_filter': { distance: 48, village_border_tolerance: 32 } }, noVillage)
                .rejectedBy
        ).toBe('minecraft:player_in_village_filter');
    });
});

describe('the world age and mob event filters', () => {
    it('waits for the world to reach the minimum age', () => {
        expect(check({ 'minecraft:world_age_filter': { min: 6000 } }, baseWorld).rejectedBy).toBe(
            'minecraft:world_age_filter'
        );
        expect(check({ 'minecraft:world_age_filter': { min: 6000 } }, worldWith({ age: () => 6000 })).passed).toBe(
            true
        );
    });

    it('treats a maximum of -1 as no upper bound', () => {
        expect(
            check({ 'minecraft:world_age_filter': { min: 0, max: -1 } }, worldWith({ age: () => 10_000_000 })).passed
        ).toBe(true);
    });

    it('needs the named mob event to be running', () => {
        const patrols = worldWith({ mobEventActive: (event) => event === 'minecraft:pillager_patrols_event' });

        expect(
            check({ 'minecraft:mob_event_filter': { event: 'minecraft:pillager_patrols_event' } }, patrols).passed
        ).toBe(true);
        expect(
            check({ 'minecraft:mob_event_filter': { event: 'minecraft:pillager_patrols_event' } }, baseWorld).rejectedBy
        ).toBe('minecraft:mob_event_filter');
    });
});

describe('the density limit', () => {
    const body = { 'minecraft:spawns_on_surface': {}, 'minecraft:density_limit': { surface: 2 } };

    it('counts the entities of this type nearby for the pass the position is in', () => {
        expect(check(body, worldWith({ typeCount: () => 1 })).passed).toBe(true);
        expect(check(body, worldWith({ typeCount: () => 2 })).rejectedBy).toBe('minecraft:density_limit');
    });

    it('ignores the other pass and treats -1 as no limit', () => {
        const underground = worldWith({ site: (flag) => flag === 'underground', typeCount: () => 99 });

        expect(
            check({ 'minecraft:spawns_underground': {}, 'minecraft:density_limit': { surface: 2 } }, underground).passed
        ).toBe(true);
    });
});

describe('the delay filter', () => {
    const body = {
        'minecraft:delay_filter': {
            min: 600,
            max: 660,
            identifier: 'minecraft:pillager_patrol_easy',
            spawn_chance: 20
        }
    };

    it('passes the first time, before any cooldown is scheduled', () => {
        expect(check(body, baseWorld, ORIGIN, { random: scriptedRandom([0.1]) }).passed).toBe(true);
    });

    it('refuses until the cooldown has elapsed', () => {
        const delays = new SpawnDelays();
        delays.schedule('minecraft:pillager_patrol_easy', 700);

        expect(check(body, baseWorld, ORIGIN, { delays, tick: 699 }).rejectedBy).toBe('minecraft:delay_filter');
        expect(check(body, baseWorld, ORIGIN, { delays, tick: 700, random: scriptedRandom([0.1]) }).passed).toBe(true);
    });

    it('rolls the spawn chance once the cooldown has elapsed', () => {
        expect(check(body, baseWorld, ORIGIN, { random: scriptedRandom([0.5]) }).rejectedBy).toBe(
            'minecraft:delay_filter'
        );
    });

    it('draws the next cooldown inside the declared range', () => {
        const delays = new SpawnDelays();
        delays.scheduleFrom(
            { min: 600, max: 660, identifier: 'minecraft:pillager_patrol_easy', spawnChance: 20 },
            1000,
            scriptedRandom([0])
        );

        expect(delays.readyAt('minecraft:pillager_patrol_easy')).toBe(1600);
    });
});
