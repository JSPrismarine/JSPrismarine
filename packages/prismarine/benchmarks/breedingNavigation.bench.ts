/**
 * Profiles repeated navigation requests from many simultaneously courting breeding pairs.
 *
 * The route is the same five-block approach the breed goal asks for, with a flat world and
 * stationary entities so each sample isolates path planning from body movement. Run with
 * `pnpm --filter @jsprismarine/prismarine run bench:breeding-navigation -- [pairs] [ticks] [samples]`.
 */
import { createHash } from 'node:crypto';
import os from 'node:os';

import type { EntityActuator, EntityPosition } from '@jsprismarine/entities';
import { Navigator, defaultNavigationProfile } from '@jsprismarine/entity-goals';
import type { NavigationView } from '@jsprismarine/entity-goals';
import { percentile } from './percentile';

const argumentsAfterScript = process.argv.slice(2).filter((argument) => argument !== '--');
const PAIRS = Number.parseInt(argumentsAfterScript[0] ?? '100', 10);
const TICKS = Number.parseInt(argumentsAfterScript[1] ?? '60', 10);
const SAMPLES = Number.parseInt(argumentsAfterScript[2] ?? '7', 10);
const WARMUPS = 2;
const SEED = 1234;
const BREED_GOAL_RADIUS = 3;

if (![PAIRS, TICKS, SAMPLES].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new RangeError('Pairs, ticks, and samples must be positive integers');
}

interface Run {
    readonly ms: number;
    readonly pathBlockQueries: number;
    readonly outputDigest: string;
}

/** A typed actuator that records requests without moving the simulated animal. */
const actuatorOf = (start: EntityPosition, commands: string[]): EntityActuator => ({
    position: () => start,
    moveTo: (at, speed) => commands.push(`${at.x},${at.y},${at.z}@${speed}`),
    stopMoving: () => commands.push('stop'),
    lookAt: () => undefined,
    jump: () => undefined,
    randomTarget: () => undefined,
    nearestPlayer: () => undefined
});

/** One passability query for each block fact the path finder reads. */
const viewOf = (count: { value: number }): NavigationView => ({
    blockAt: (at) => {
        count.value++;
        return at.y <= 0 ? 'minecraft:stone' : 'minecraft:air';
    },
    isPassable: (at) => {
        count.value++;
        return at.y > 0;
    },
    isSolid: (at) => {
        count.value++;
        return at.y === 0;
    },
    isWater: () => {
        count.value++;
        return false;
    },
    isLava: () => {
        count.value++;
        return false;
    }
});

/** One deterministic sample of `pairs` breed goals repeatedly requesting their mate's route. */
const run = (): Run => {
    const pathBlockQueries = { value: 0 };
    const view = viewOf(pathBlockQueries);
    const commands: string[] = [];
    const navigators = Array.from({ length: PAIRS }, (_unused, index) => {
        const start = { x: index * 20 + 0.5, y: 1, z: 0.5 };
        const mate = { x: index * 20 + 8.5, y: 1, z: 0.5 };
        const actuator = actuatorOf(start, commands);
        const navigator = new Navigator({ actuator, navigation: () => view, profile: () => defaultNavigationProfile });
        return { navigator, mate };
    });

    const started = performance.now();
    for (let tick = 0; tick < TICKS; tick++) {
        for (const { navigator, mate } of navigators) {
            navigator.moveTo(mate, 1, BREED_GOAL_RADIUS);
            navigator.tick();
        }
    }
    const ms = performance.now() - started;
    const outputDigest = createHash('sha256').update(commands.join('\n')).digest('hex');
    return { ms, pathBlockQueries: pathBlockQueries.value, outputDigest };
};

for (let warmup = 0; warmup < WARMUPS; warmup++) run();
const runs = Array.from({ length: SAMPLES }, run);
const times = runs.map(({ ms }) => ms).sort((left, right) => left - right);
const queries = runs.map(({ pathBlockQueries }) => pathBlockQueries).sort((left, right) => left - right);
const digests = new Set(runs.map(({ outputDigest }) => outputDigest));
if (digests.size !== 1) throw new Error('Breeding navigation output digest changed between samples');

process.stdout.write(
    `${JSON.stringify({
        benchmark: 'breeding-navigation-replanning',
        seed: SEED,
        node: process.version,
        platform: `${os.platform()}-${os.arch()}`,
        cpu: os.cpus()[0]?.model ?? 'unknown',
        workerCount: 0,
        pairs: PAIRS,
        ticks: TICKS,
        warmups: WARMUPS,
        samples: SAMPLES,
        distributionMs: {
            min: times[0] ?? 0,
            p50: percentile(times, 0.5),
            p95: percentile(times, 0.95),
            max: times.at(-1) ?? 0
        },
        pathBlockQueriesP50: percentile(queries, 0.5),
        outputDigest: runs[0]?.outputDigest
    })}\n`
);
