import { scriptedRandom, seededRandom } from '@jsprismarine/predicates';
import { describe, expect, it } from 'vitest';

import { SPAWN_CONSTANTS } from './constants';
import type { SpawnRule } from './rules';
import { parseSpawnRule } from './rules';
import { Spawner } from './spawner';
import type { SpawnPosition, SpawnSiteFlag, SpawnWorld } from './world';

/** A flat grass world at y=64 with one player at the origin and no mobs. */
const baseWorld = {
    site: (flag: SpawnSiteFlag, at: SpawnPosition) => (at.y >= 64 ? flag === 'surface' : flag === 'underground'),
    block: (at: SpawnPosition) => (at.y <= 63 ? 'minecraft:grass_block' : 'minecraft:air'),
    light: () => 15,
    biomeTags: () => ['plains', 'overworld'],
    biome: () => 'minecraft:plains',
    players: () => [{ position: { x: 0, y: 64, z: 0 } }],
    poolCount: () => 0,
    typeCount: () => 0,
    difficulty: () => 'normal' as const,
    weather: () => 'clear' as const,
    age: () => 0,
    mobEventActive: () => false,
    villageBorderDistance: () => undefined,
    // Hollow: nothing here is about where a draw landed.
    solid: () => false,
    surfaceY: () => 64,
    minY: () => -64
} satisfies SpawnWorld;

const worldWith = (overrides: Partial<SpawnWorld>): SpawnWorld => ({ ...baseWorld, ...overrides });

/** Parses one rule the way a file writes it. */
const ruleOf = (identifier: string, pool: string, conditions: readonly Record<string, unknown>[]): SpawnRule =>
    parseSpawnRule(
        {
            format_version: '1.8.0',
            'minecraft:spawn_rules': { description: { identifier, population_control: pool }, conditions }
        },
        { pack: 'test' }
    )!;

const COW = ruleOf('minecraft:cow', 'animal', [
    {
        'minecraft:spawns_on_surface': {},
        'minecraft:brightness_filter': { min: 7, max: 15 },
        'minecraft:weight': { default: 10 },
        'minecraft:herd': { min_size: 2, max_size: 4 },
        'minecraft:spawns_on_block_filter': 'minecraft:grass_block',
        'minecraft:biome_filter': { test: 'has_biome_tag', value: 'plains' }
    }
]);

describe('one spawn cycle', () => {
    it('spawns a herd of the rule whose condition passes', () => {
        const spawner = new Spawner({ rules: [COW], world: baseWorld, random: seededRandom(7) });
        const spawned = spawner.cycle('animal', 0);

        expect(spawned.length).toBeGreaterThan(0);
        for (const request of spawned) {
            expect(request.identifier).toBe('minecraft:cow');
            expect(request.pool).toBe('animal');
        }
    });

    it('repeats exactly for the same seed and differs for another', () => {
        const run = (seed: number) =>
            new Spawner({ rules: [COW], world: baseWorld, random: seededRandom(seed) }).cycle('animal', 0);

        expect(run(7)).toEqual(run(7));
        expect(run(7)).not.toEqual(run(99));
    });

    it('spawns nothing when the one loaded rule rejects the biome', () => {
        const ocean = worldWith({ biomeTags: () => ['ocean'] });
        const spawner = new Spawner({ rules: [COW], world: ocean, random: seededRandom(7) });

        expect(spawner.cycle('animal', 0)).toEqual([]);
    });

    it('spawns nothing for a pool no loaded rule names', () => {
        const spawner = new Spawner({ rules: [COW], world: baseWorld, random: seededRandom(7) });

        expect(spawner.cycle('monster', 0)).toEqual([]);
    });
});

describe('the population caps', () => {
    it('stops at the per-player cap scaled by the players in the region', () => {
        const spawner = new Spawner({ rules: [COW], world: baseWorld, random: seededRandom(3) });

        expect(spawner.cycle('animal', 0).length).toBeLessThanOrEqual(SPAWN_CONSTANTS.pools.animal!.cap!);
    });

    it('spawns nothing when the pool already holds its cap', () => {
        const full = worldWith({ poolCount: () => 10 });
        const spawner = new Spawner({ rules: [COW], world: full, random: seededRandom(3) });

        expect(spawner.cycle('animal', 0)).toEqual([]);
    });

    it('counts two players as twice the per-player cap', () => {
        const crowded = worldWith({
            players: () => [{ position: { x: 0, y: 64, z: 0 } }, { position: { x: 40, y: 64, z: 0 } }],
            poolCount: () => 10
        });
        const spawner = new Spawner({ rules: [COW], world: crowded, random: seededRandom(3) });

        expect(spawner.cycle('animal', 0).length).toBeGreaterThan(0);
    });

    it('leaves a pool the table gives no cap to the rule components', () => {
        const patrol = ruleOf('minecraft:pillager_patrol', 'pillager', [{ 'minecraft:spawns_on_surface': {} }]);
        const spawner = new Spawner({
            rules: [patrol],
            world: worldWith({ poolCount: () => 999 }),
            random: seededRandom(3)
        });

        expect(spawner.cycle('pillager', 0).length).toBeGreaterThan(0);
    });
});

describe('herd and permutation spawning', () => {
    it('draws the herd size inside the declared range and places members near the anchor', () => {
        const spawner = new Spawner({ rules: [COW], world: baseWorld, random: seededRandom(11) });
        const spawned = spawner.cycle('animal', 0);
        const anchor = spawned[0]!.position;

        for (const request of spawned.slice(0, 2)) {
            expect(Math.abs(request.position.x - anchor.x)).toBeLessThanOrEqual(SPAWN_CONSTANTS.herdRadius);
            expect(Math.abs(request.position.z - anchor.z)).toBeLessThanOrEqual(SPAWN_CONSTANTS.herdRadius);
        }
    });

    it('runs the herd `initial_event` on the first members and `event` on the rest', () => {
        const rule = ruleOf('minecraft:drowned', 'monster', [
            {
                'minecraft:spawns_on_surface': {},
                'minecraft:herd': {
                    min_size: 3,
                    max_size: 3,
                    initial_event: 'minecraft:as_rider',
                    initial_event_count: 1,
                    event: 'minecraft:as_adult',
                    event_skip_count: 1
                }
            }
        ]);
        const spawner = new Spawner({ rules: [rule], world: baseWorld, random: seededRandom(5) });
        const herd = spawner.cycle('monster', 0).slice(0, 3);

        expect(herd[0]?.spawnEvent).toBe('minecraft:as_rider');
        expect(herd[1]?.spawnEvent).toBe('minecraft:as_adult');
        expect(herd[2]?.spawnEvent).toBe('minecraft:as_adult');
    });

    it('runs the `minecraft:spawn_event` the condition names when the herd names none', () => {
        const stray = ruleOf('minecraft:stray', 'monster', [
            { 'minecraft:spawns_on_surface': {}, 'minecraft:spawn_event': { event: 'change_to_skeleton' } }
        ]);
        const spawner = new Spawner({ rules: [stray], world: baseWorld, random: seededRandom(5) });

        expect(spawner.cycle('monster', 0)[0]?.spawnEvent).toBe('change_to_skeleton');
    });

    it('swaps a herd member for a weighted permutation', () => {
        const zombie = ruleOf('minecraft:zombie', 'monster', [
            {
                'minecraft:spawns_on_surface': {},
                'minecraft:herd': { min_size: 4, max_size: 4 },
                'minecraft:permute_type': [
                    { weight: 100 },
                    { weight: 0, entity_type: 'minecraft:zombie_villager_v2', min_guaranteed: 1 }
                ]
            }
        ]);
        const spawner = new Spawner({ rules: [zombie], world: baseWorld, random: seededRandom(5) });
        const herd = spawner.cycle('monster', 0).slice(0, 4);

        expect(herd.filter((request) => request.identifier === 'minecraft:zombie_villager_v2')).toHaveLength(1);
        expect(herd.filter((request) => request.identifier === 'minecraft:zombie')).toHaveLength(3);
    });

    it('splits the `type<event>` form a permutation writes', () => {
        const patrol = ruleOf('minecraft:pillager_patrol', 'pillager', [
            {
                'minecraft:spawns_on_surface': {},
                'minecraft:herd': { min_size: 1, max_size: 1 },
                'minecraft:permute_type': [
                    { weight: 100, entity_type: 'minecraft:pillager<minecraft:spawn_as_patrol_follower>' }
                ]
            }
        ]);
        const spawner = new Spawner({ rules: [patrol], world: baseWorld, random: seededRandom(5) });
        const first = spawner.cycle('pillager', 0)[0];

        expect(first?.identifier).toBe('minecraft:pillager');
        expect(first?.spawnEvent).toBe('minecraft:spawn_as_patrol_follower');
    });

    it('keeps structure-only permutation types inside their Java structure overrides', () => {
        const cow = ruleOf('minecraft:cow', 'animal', [
            {
                'minecraft:spawns_on_surface': {},
                'minecraft:weight': { default: 1 },
                'minecraft:herd': { min_size: 1, max_size: 1 },
                'minecraft:permute_type': [{ weight: 0, entity_type: 'minecraft:pig', min_guaranteed: 1 }]
            }
        ]);
        const world = worldWith({
            structureSpawnOverrideAt: (identifier) => (identifier === 'minecraft:pig' ? false : undefined)
        });
        const spawner = new Spawner({ rules: [cow], world, random: seededRandom(7) });

        expect(spawner.cycle('animal', 0)).toEqual([]);
    });
});

describe('the weighted draw between rules', () => {
    it('takes the heavier rule far more often', () => {
        const light = ruleOf('minecraft:a', 'animal', [
            { 'minecraft:spawns_on_surface': {}, 'minecraft:weight': { default: 1 } }
        ]);
        const heavy = ruleOf('minecraft:b', 'animal', [
            { 'minecraft:spawns_on_surface': {}, 'minecraft:weight': { default: 99 } }
        ]);
        const spawner = new Spawner({ rules: [light, heavy], world: baseWorld, random: seededRandom(1) });

        let heavyCount = 0;
        let lightCount = 0;
        for (let run = 0; run < 40; run += 1) {
            for (const request of spawner.cycle('animal', 0)) {
                if (request.identifier === 'minecraft:b') heavyCount += 1;
                else lightCount += 1;
            }
        }

        expect(heavyCount).toBeGreaterThan(lightCount * 5);
    });

    it('applies a rarity of N as a one-in-N roll on top of the weight', () => {
        const rare = ruleOf('minecraft:rare', 'animal', [
            { 'minecraft:spawns_on_surface': {}, 'minecraft:weight': { default: 6, rarity: 3 } }
        ]);
        const always = new Spawner({ rules: [rare], world: baseWorld, random: scriptedRandom([0]) });
        const never = new Spawner({ rules: [rare], world: baseWorld, random: scriptedRandom([0.99]) });

        expect(always.cycle('animal', 0).length).toBeGreaterThan(0);
        expect(never.cycle('animal', 0)).toEqual([]);
    });
});

describe('the cycle cadence', () => {
    it('runs a pool only on its own cadence', () => {
        const spawner = new Spawner({ rules: [COW], world: baseWorld, random: seededRandom(7) });

        expect(spawner.tick(1)).toEqual([]);
        expect(spawner.tick(400).length).toBeGreaterThan(0);
    });

    it('runs every pool the loaded rules name', () => {
        const zombie = ruleOf('minecraft:zombie', 'monster', [{ 'minecraft:spawns_on_surface': {} }]);
        const spawner = new Spawner({ rules: [COW, zombie], world: baseWorld, random: seededRandom(7) });
        const pools = new Set(spawner.tick(400).map((request) => request.pool));

        expect(pools).toEqual(new Set(['animal', 'monster']));
    });
});

describe('the delay filter cooldown', () => {
    it('schedules the next cooldown after a spawn so the next cycle waits', () => {
        const patrol = ruleOf('minecraft:pillager_patrol', 'pillager', [
            {
                'minecraft:spawns_on_surface': {},
                'minecraft:herd': { min_size: 1, max_size: 1 },
                'minecraft:delay_filter': { min: 600, max: 660, identifier: 'patrol', spawn_chance: 100 }
            }
        ]);
        const spawner = new Spawner({ rules: [patrol], world: baseWorld, random: seededRandom(2) });

        expect(spawner.cycle('pillager', 0).length).toBe(1);
        expect(spawner.cycle('pillager', 10)).toEqual([]);
        expect(spawner.cycle('pillager', 1300).length).toBe(1);
    });
});

describe('where the underground pass puts a mob', () => {
    const ZOMBIE = ruleOf('minecraft:zombie', 'monster', [
        {
            'minecraft:spawns_underground': {},
            'minecraft:brightness_filter': { min: 0, max: 7 },
            'minecraft:weight': { default: 100 }
        }
    ]);
    const dark = { ...baseWorld, light: () => 0 };

    it('refuses a draw that landed inside rock', () => {
        // The draw is uniform over the column, so in a world with few caves most of it is
        // solid. A zombie put inside a stone block paths nowhere, never despawns, and fills
        // the monster pool so that nothing else can spawn either.
        const spawner = new Spawner({
            rules: [ZOMBIE],
            world: { ...dark, solid: () => true },
            random: seededRandom(7)
        });

        expect(spawner.cycle('monster', 0)).toEqual([]);
    });

    it('leaves the mob room for its head', () => {
        // Everything from y 0 up is rock, so the only legal draw is one whose own block and
        // the one over it are both below that, which rules out y -1 as well as y 0.
        const spawner = new Spawner({
            rules: [ZOMBIE],
            world: { ...dark, solid: (at: SpawnPosition) => at.y >= 0 },
            random: seededRandom(7)
        });

        const spawned = spawner.cycle('monster', 0);
        expect(spawned.length).toBeGreaterThan(0);
        for (const request of spawned) expect(request.position.y).toBeLessThanOrEqual(-2);
    });

    it('takes a draw that landed in a cave', () => {
        const spawner = new Spawner({
            rules: [ZOMBIE],
            world: { ...dark, solid: () => false },
            random: seededRandom(7)
        });

        expect(spawner.cycle('monster', 0).length).toBeGreaterThan(0);
    });
});
