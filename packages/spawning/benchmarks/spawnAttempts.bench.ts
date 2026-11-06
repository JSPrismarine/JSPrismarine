/**
 * A seeded monster-pool run against a counting world: `pnpm bench`.
 *
 * Reports how many reads reached the world, the time per cycle, and a digest of every request
 * produced, so a change to the attempt path can show it read less and spawned the same.
 */
import { createHash } from 'node:crypto';

import type { RandomSource } from '@jsprismarine/predicates';
import { seededRandom } from '@jsprismarine/predicates';

import { parseSpawnRule } from '../src/rules';
import { Spawner } from '../src/spawner';
import type { SpawnPosition, SpawnSiteFlag, SpawnWorld } from '../src/world';

const CYCLES = 400;
const RULES = 24;

/**
 * What a real world read costs, in miniature: the server resolves a position through a chunk map
 * keyed by chunk coordinates before it touches a block, a light value or a biome. A bench world
 * that answers from a constant would make any cache look like pure overhead.
 */
const chunks = new Map<string, Uint8Array>();
for (let chunkX = -4; chunkX <= 4; chunkX++) {
    for (let chunkZ = -4; chunkZ <= 4; chunkZ++) {
        chunks.set(
            `${chunkX},${chunkZ}`,
            Uint8Array.from({ length: 256 }, (_, index) => (index * 7) & 15)
        );
    }
}
const chunkAt = (at: SpawnPosition): Uint8Array => chunks.get(`${at.x >> 4},${at.z >> 4}`) ?? new Uint8Array(256);

const reads: Record<string, number> = {};
const counted = <A extends unknown[], R>(name: string, read: (...args: A) => R) => {
    reads[name] = 0;
    return (...args: A): R => {
        reads[name] = (reads[name] ?? 0) + 1;
        return read(...args);
    };
};

const world: SpawnWorld = {
    site: counted('site', (flag: SpawnSiteFlag, at: SpawnPosition) =>
        at.y >= 64 ? flag === 'surface' : flag === 'underground'
    ),
    block: counted('block', (at: SpawnPosition) => {
        chunkAt(at);
        return at.y <= 63 ? 'minecraft:grass_block' : 'minecraft:air';
    }),
    light: counted('light', (at: SpawnPosition) => chunkAt(at)[((at.x & 15) << 4) | (at.z & 15)]!),
    biomeTags: counted('biomeTags', (at: SpawnPosition) => {
        chunkAt(at);
        return ['plains', 'overworld'];
    }),
    biome: counted('biome', () => 'minecraft:plains'),
    players: () => [{ position: { x: 0, y: 64, z: 0 } }],
    poolCount: () => 0,
    typeCount: counted('typeCount', () => 1),
    difficulty: () => 'normal',
    weather: () => 'clear',
    age: () => 0,
    mobEventActive: () => false,
    villageBorderDistance: () => undefined,
    solid: counted('solid', (at: SpawnPosition) => {
        chunkAt(at);
        return at.y === 63;
    }),
    surfaceY: () => 64,
    minY: () => -64
};

const rules = Array.from({ length: RULES }, (_, index) =>
    parseSpawnRule(
        {
            format_version: '1.8.0',
            'minecraft:spawn_rules': {
                description: { identifier: `test:mob_${index}`, population_control: 'monster' },
                conditions: [
                    {
                        'minecraft:spawns_on_surface': {},
                        'minecraft:brightness_filter': { min: 0, max: 15, adjust_for_weather: false },
                        'minecraft:weight': { default: 1 + (index % 5) },
                        'minecraft:density_limit': { surface: 8, underground: 8 },
                        'minecraft:spawns_on_block_filter': 'minecraft:grass_block',
                        'minecraft:biome_filter': { test: 'has_biome_tag', value: 'plains' }
                    }
                ]
            }
        },
        { pack: 'bench' }
    )!
);

const digest = createHash('sha256');
const source = seededRandom(2797);
let draws = 0;
const random: RandomSource = {
    nextFloat: () => {
        draws += 1;
        return source.nextFloat();
    },
    nextInt: (bound) => {
        draws += 1;
        return source.nextInt(bound);
    }
};
const spawner = new Spawner({ rules, world, random });
const started = performance.now();
for (let cycle = 0; cycle < CYCLES; cycle++) {
    for (const request of spawner.cycle('monster', cycle * 20)) {
        digest.update(`${request.identifier}@${request.position.x},${request.position.y},${request.position.z};`);
    }
}
const elapsed = performance.now() - started;

console.log(`cycles: ${CYCLES}, rules: ${RULES}`);
console.log(
    `world reads: ${Object.entries(reads)
        .map(([name, count]) => `${name}=${count}`)
        .join(' ')}`
);
console.log(`total reads: ${Object.values(reads).reduce((total, count) => total + count, 0)}`);
console.log(`time per cycle: ${((elapsed * 1000) / CYCLES).toFixed(1)} us`);
console.log(`random draws: ${draws}`);
console.log(`digest: ${digest.digest('hex').slice(0, 16)}`);
