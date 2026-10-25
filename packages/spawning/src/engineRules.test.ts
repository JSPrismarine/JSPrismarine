import { constantRandom, scriptedRandom, seededRandom } from '@jsprismarine/predicates';
import { describe, expect, it } from 'vitest';

import { MOON_BRIGHTNESS, isSlimeChunk, moonPhase, slimeSpawnRule } from './engineRules';
import type { SpawnRule } from './rules';
import { parseSpawnRule } from './rules';
import { Spawner } from './spawner';
import type { SpawnPosition, SpawnSiteFlag, SpawnWorld } from './world';

/**
 * The slime chunks of the square from chunk -8 to chunk 8, computed by a
 * separate Mersenne twister written from Matsumoto and Nishimura's reference
 * code rather than from `engineRules.ts`. They pin the hash itself: if the
 * twister or the seed drifts, this list stops matching.
 */
const SLIME_CHUNKS_NEAR_ORIGIN = [
    [-8, -4],
    [-8, -1],
    [-8, 4],
    [-7, 3],
    [-7, 6],
    [-6, -7],
    [-6, 0],
    [-6, 8],
    [-4, -1],
    [-4, 2],
    [-3, -2],
    [-3, -1],
    [-1, 0],
    [0, -5],
    [0, -2],
    [0, 4],
    [0, 6],
    [1, -2],
    [3, 0],
    [3, 1]
] as const;

describe('the Bedrock slime chunk hash', () => {
    it('matches a reference twister over the chunks around the origin', () => {
        const found: number[][] = [];
        for (let chunkX = -8; chunkX <= 8; chunkX += 1) {
            for (let chunkZ = -8; chunkZ <= 8; chunkZ += 1) {
                if (isSlimeChunk(chunkX, chunkZ)) found.push([chunkX, chunkZ]);
            }
        }

        expect(found.slice(0, SLIME_CHUNKS_NEAR_ORIGIN.length)).toEqual(
            SLIME_CHUNKS_NEAR_ORIGIN.map((chunk) => [...chunk])
        );
    });

    it('picks about one chunk in ten', () => {
        let slime = 0;
        for (let chunkX = -50; chunkX < 50; chunkX += 1) {
            for (let chunkZ = -50; chunkZ < 50; chunkZ += 1) {
                if (isSlimeChunk(chunkX, chunkZ)) slime += 1;
            }
        }

        expect(slime / 10000).toBeGreaterThan(0.08);
        expect(slime / 10000).toBeLessThan(0.12);
    });

    it('answers the same chunk the same way whichever order it is asked in', () => {
        const first = isSlimeChunk(-6, 0);
        for (let repeat = 0; repeat < 10000; repeat += 1) isSlimeChunk(repeat, -repeat);
        expect(isSlimeChunk(-6, 0)).toBe(first);
    });

    it('does not read the world seed, which is why a Bedrock farm moves worlds', () => {
        // Nothing to inject: the signature takes the two chunk coordinates and
        // nothing else, which is the whole difference from Java's formula.
        expect(isSlimeChunk.length).toBe(2);
    });
});

describe('the moon phase', () => {
    it('runs through its eight phases over eight days', () => {
        const phases = Array.from({ length: 8 }, (_unused, day) => moonPhase(day * 24000 + 13000));
        expect(phases).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });

    it('starts over on the ninth day', () => {
        expect(moonPhase(8 * 24000)).toBe(0);
    });

    it('is darkest at the new moon', () => {
        expect(MOON_BRIGHTNESS[moonPhase(4 * 24000)]).toBe(0);
        expect(MOON_BRIGHTNESS[moonPhase(0)]).toBe(1);
    });
});

/** A dark swamp at full moon, inside the band and outside every slime chunk. */
const swampWorld = {
    site: (flag: SpawnSiteFlag) => flag === 'surface',
    block: () => 'minecraft:grass_block',
    light: () => 0,
    biomeTags: () => ['monster', 'overworld', 'swamp', 'spawns_slimes_on_surface'],
    biome: () => 'minecraft:swampland',
    players: () => [{ position: { x: 0, y: 64, z: 0 } }],
    poolCount: () => 0,
    typeCount: () => 0,
    difficulty: () => 'normal' as const,
    weather: () => 'clear' as const,
    age: () => 0,
    mobEventActive: () => false,
    solid: () => false,
    surfaceY: () => 64,
    minY: () => -64
} satisfies SpawnWorld;

const worldWith = (overrides: Partial<SpawnWorld>): SpawnWorld => ({ ...swampWorld, ...overrides });

/** A position in a chunk the hash rejects, so only the swamp branch can pass. */
const inPlainChunk = (y: number): SpawnPosition => ({ x: 8, y, z: 8 });

/** A position in a chunk the hash accepts. */
const inSlimeChunk = (y: number): SpawnPosition => ({ x: -6 * 16 + 8, y, z: 8 });

const alwaysLucky = () => constantRandom(0);

describe('where a slime may spawn', () => {
    it('allows a slime chunk at or below Y 38 with no other condition', () => {
        const lit = worldWith({ light: () => 15 });
        expect(slimeSpawnRule(inSlimeChunk(38), { world: lit, random: alwaysLucky() })).toBe(true);
        expect(slimeSpawnRule(inSlimeChunk(-50), { world: lit, random: alwaysLucky() })).toBe(true);
    });

    it('refuses the same depth outside a slime chunk', () => {
        expect(slimeSpawnRule(inPlainChunk(38), { world: swampWorld, random: alwaysLucky() })).toBe(false);
        expect(slimeSpawnRule(inPlainChunk(-50), { world: swampWorld, random: alwaysLucky() })).toBe(false);
    });

    it('refuses everything between the chunk ceiling and the swamp band', () => {
        for (const y of [39, 45, 49]) {
            expect(slimeSpawnRule(inSlimeChunk(y), { world: swampWorld, random: alwaysLucky() })).toBe(false);
        }
    });

    it('allows a dark swamp inside the band at full moon', () => {
        expect(slimeSpawnRule(inPlainChunk(60), { world: swampWorld, random: alwaysLucky() })).toBe(true);
    });

    it('refuses a swamp above or below the band', () => {
        expect(slimeSpawnRule(inPlainChunk(49), { world: swampWorld, random: alwaysLucky() })).toBe(false);
        expect(slimeSpawnRule(inPlainChunk(69), { world: swampWorld, random: alwaysLucky() })).toBe(false);
    });

    it('refuses a lit swamp, which is what keeps slimes out of daylight', () => {
        const daylight = worldWith({ light: () => 15 });
        expect(slimeSpawnRule(inPlainChunk(60), { world: daylight, random: alwaysLucky() })).toBe(false);
    });

    it('refuses a biome without the slime tag', () => {
        const plains = worldWith({ biomeTags: () => ['monster', 'overworld', 'plains'] });
        expect(slimeSpawnRule(inPlainChunk(60), { world: plains, random: alwaysLucky() })).toBe(false);
    });

    it('refuses the swamp band on a new moon however lucky the draw', () => {
        const newMoon = worldWith({ age: () => 4 * 24000 });
        expect(slimeSpawnRule(inPlainChunk(60), { world: newMoon, random: alwaysLucky() })).toBe(false);
    });

    it('compares the light against a draw, so a dim swamp is luck rather than a yes', () => {
        const dim = worldWith({ light: () => 6 });
        // The first draw answers `nextInt(8)`, the second the moon.
        const unlucky = scriptedRandom([0, 0]);
        const lucky = scriptedRandom([0.99, 0]);

        expect(slimeSpawnRule(inPlainChunk(60), { world: dim, random: unlucky })).toBe(false);
        expect(slimeSpawnRule(inPlainChunk(60), { world: dim, random: lucky })).toBe(true);
    });
});

const slimeRule: SpawnRule = parseSpawnRule(
    {
        format_version: '1.8.0',
        'minecraft:spawn_rules': {
            description: { identifier: 'minecraft:slime', population_control: 'monster' },
            conditions: [
                {
                    'minecraft:spawns_on_surface': {},
                    'minecraft:spawns_underground': {},
                    'minecraft:difficulty_filter': { min: 'easy', max: 'hard' },
                    'minecraft:weight': { default: 100 },
                    'minecraft:biome_filter': { test: 'has_biome_tag', operator: '==', value: 'monster' }
                }
            ]
        }
    },
    { pack: 'test' }
)!;

describe('the spawner with the engine rules on', () => {
    /**
     * A lit plains surface at Y 64 over a floor at Y 40, which the slime file
     * alone would allow. The floor is above the slime chunk ceiling, so the
     * underground pass cannot reach the hash branch and the surface is the
     * only thing under test.
     */
    const daylitPlains = worldWith({
        light: () => 15,
        biomeTags: () => ['monster', 'overworld', 'plains'],
        biome: () => 'minecraft:plains',
        minY: () => 40
    });

    it('spawns no slimes on a lit plains surface', () => {
        const spawner = new Spawner({ rules: [slimeRule], world: daylitPlains, random: seededRandom(7) });
        expect(spawner.cycle('monster', 0)).toEqual([]);
    });

    it('still spawns them there when the host turns the engine rules off', () => {
        const spawner = new Spawner({
            rules: [slimeRule],
            world: daylitPlains,
            random: seededRandom(7),
            engineRules: new Map()
        });
        expect(spawner.cycle('monster', 0).length).toBeGreaterThan(0);
    });

    it('spawns them underground in a slime chunk', () => {
        const deep = worldWith({
            light: () => 0,
            biomeTags: () => ['monster', 'overworld', 'plains'],
            site: (flag: SpawnSiteFlag) => flag === 'underground',
            // One slime chunk's worth of column, so every draw lands in it.
            surfaceY: () => 30,
            minY: () => 0,
            players: () => [{ position: { x: -6 * 16 + 8, y: 20, z: 8 } }]
        });

        const spawner = new Spawner({ rules: [slimeRule], world: deep, random: seededRandom(7) });
        const spawned = spawner.cycle('monster', 0);

        expect(spawned.length).toBeGreaterThan(0);
        for (const request of spawned) {
            expect(request.identifier).toBe('minecraft:slime');
            expect(isSlimeChunk(request.position.x >> 4, request.position.z >> 4)).toBe(true);
            expect(request.position.y).toBeLessThanOrEqual(38);
        }
    });
});
