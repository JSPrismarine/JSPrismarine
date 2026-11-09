/**
 * Benchmarks block writes and random-tick action resolution through the content world view.
 *
 * Run with `node packages/prismarine/benchmarks/run.mjs packages/prismarine/benchmarks/blockWorldActions.bench.ts`.
 */
import os from 'node:os';

import type { ServerWorldAdapter } from '../src/content/world/adapter';
import { contentWorldViews } from '../src/content/world/views';
import { singleDimension } from '../src/content/world/adapter';

const OPERATIONS = 100_000;
const SAMPLES = 5;
const POSITION = { x: 8, y: 64, z: 8 };

const adapter = (): {
    readonly world: ServerWorldAdapter;
    readonly counts: { reads: number; writes: number; random: number };
} => {
    const counts = { reads: 0, writes: 0, random: 0 };
    const world: ServerWorldAdapter = {
        level: {
            dimension: 'minecraft:overworld',
            minY: -64,
            maxY: 320,
            hasSkyLight: true,
            seaLevel: 63,
            seed: 0n,
            gameTime: () => 0,
            dayTime: () => 0,
            difficulty: () => 'normal',
            weather: () => 'clear',
            isRainingAt: () => false,
            spawnPosition: () => ({ x: 0, y: 64, z: 0 }),
            gameRule: () => undefined
        },
        blocks: {
            get: () => {
                counts.reads++;
                return { identifier: 'minecraft:stone', states: {} };
            },
            set: () => counts.writes++,
            notifyNeighbors: () => {},
            data: () => undefined,
            setData: () => {},
            light: () => 0,
            power: () => 0,
            isLoaded: () => true,
            surfaceY: () => 64,
            biome: () => 'minecraft:plains',
            biomeTags: () => []
        },
        entities: {
            at: () => [],
            near: () => [],
            players: () => [],
            spawn: () => 0,
            remove: () => {},
            drop: () => {},
            countOfType: () => 0
        },
        effects: { playSound: () => {}, spawnParticle: () => {}, emitGameEvent: () => {} },
        ticks: { schedule: () => {}, isScheduled: () => false, runsThisTick: () => false },
        random: {
            nextFloat: () => {
                counts.random++;
                return 0.5;
            },
            nextInt: () => 0
        }
    };
    return { world, counts };
};

const content = (): never => {
    throw new Error('this benchmark only exercises actions that do not read content');
};

const sample = (kind: 'block-writes' | 'random-tick-actions') => {
    const { world, counts } = adapter();
    const views = contentWorldViews(singleDimension(world), content);
    const started = performance.now();

    for (let index = 0; index < OPERATIONS; index++) {
        // The behavior dispatch resolves its dimension for each event, then performs the action.
        const actions = views.blockWorld.at('minecraft:overworld');
        if (kind === 'block-writes') actions.setBlock(POSITION, 'minecraft:stone', {}, false);
        else {
            actions.getBlock(POSITION);
            actions.randomFloat?.();
        }
    }

    return { ms: performance.now() - started, ...counts };
};

for (const kind of ['block-writes', 'random-tick-actions'] as const) {
    const runs = Array.from({ length: SAMPLES }, () => sample(kind)).sort((left, right) => left.ms - right.ms);
    const median = runs[Math.floor(runs.length / 2)]!;
    console.log(
        JSON.stringify({
            benchmark: 'content-block-world-actions',
            kind,
            node: process.version,
            platform: `${os.platform()}-${os.arch()}`,
            operations: OPERATIONS,
            medianMs: median.ms,
            reads: median.reads,
            writes: median.writes,
            randomDraws: median.random
        })
    );
}
