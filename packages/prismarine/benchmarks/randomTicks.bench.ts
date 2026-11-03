/**
 * Measures random tick reads over 441 chunk sections and checks the dispatch digest.
 *
 * Run with `pnpm --filter @jsprismarine/prismarine run bench:random-ticks`.
 */
import os from 'node:os';

import { redstoneConductivity } from '@jsprismarine/blocks';
import { BlockRandomPositions, createEngine } from '@jsprismarine/engine-systems';
import type { BlockPosition, BlockRef, WorldAccess } from '@jsprismarine/engine-systems';
import { bedrockBlockPropertiesOf, javaBlockStates } from '@jsprismarine/mapping';

import { BlockRuntimeIds } from '../src/block/state/BlockRuntimeIds';
import { BlockStateSchemas } from '../src/block/state/BlockStateSchema';
import { testContent } from '../src/testing/entityServer';
import { createEngineBlockCache } from '../src/world/EngineBlockCache';

const CHUNK_EDGE = 21;
const CHUNK_RADIUS = Math.floor(CHUNK_EDGE / 2);
const SECTIONS_PER_CHUNK = 1;
const TICKS = 1000;
const SAMPLES = 5;
const SECTIONS = Array.from({ length: CHUNK_EDGE * CHUNK_EDGE * SECTIONS_PER_CHUNK }, (_, index) => ({
    x: ((index % CHUNK_EDGE) - CHUNK_RADIUS) * 16,
    y: 64,
    z: (Math.floor(index / CHUNK_EDGE) - CHUNK_RADIUS) * 16
}));

const content = testContent();
const wheatState = BlockStateSchemas.get('minecraft:wheat')!.createState({ growth: 3 });
const stoneState = BlockStateSchemas.get('minecraft:stone')!.getDefaultState();
const wheatRuntimeId = BlockRuntimeIds.get(wheatState);
const stoneRuntimeId = BlockRuntimeIds.get(stoneState);
const sectionRuntimeIds = SECTIONS.map((_, index) => (index % 5 === 0 ? wheatRuntimeId : stoneRuntimeId));

const runtimeIdAt = (at: BlockPosition): number => {
    const chunkX = at.x >> 4;
    const chunkZ = at.z >> 4;
    const sectionIndex = (chunkZ + CHUNK_RADIUS) * CHUNK_EDGE + chunkX + CHUNK_RADIUS;
    const runtimeId = sectionRuntimeIds[sectionIndex];
    if (runtimeId === undefined) throw new Error(`Random tick position is outside the fixture: ${at.x},${at.z}`);
    return runtimeId;
};

const uncachedBlockAt = (at: BlockPosition): BlockRef => {
    const runtimeId = runtimeIdAt(at);
    const state = BlockRuntimeIds.getState(runtimeId);
    if (state === null) throw new Error(`No state for runtime id ${runtimeId}`);
    const contentState = content.blocks.types.get(state.name)?.state(state.properties);
    const conductivity = contentState?.content.params(redstoneConductivity);
    return {
        name: state.name,
        states: javaBlockStates(state.name, state.properties),
        ...(conductivity === undefined ? {} : { redstoneConductor: conductivity.redstoneConductor })
    };
};

const uncachedWorld: WorldAccess = {
    getBlock: uncachedBlockAt,
    setBlock: () => undefined,
    getBlockEntityData: () => undefined
};

const cache = createEngineBlockCache(() => content);
const cachedWorld: WorldAccess = {
    getBlock: (at) => cache.get(runtimeIdAt(at)).block,
    getBlockRuntimeId: runtimeIdAt,
    getBlockByRuntimeId: (runtimeId) => cache.get(runtimeId).block,
    isRandomlyTickingRuntimeId: (runtimeId) => cache.get(runtimeId).randomTicking,
    setBlock: () => undefined,
    getBlockEntityData: () => undefined
};

interface Measurement {
    readonly milliseconds: number;
    readonly digest: string;
    readonly dispatches: number;
}

const runTicks = (world: WorldAccess): Measurement => {
    let digest = 2166136261;
    let dispatches = 0;
    const engine = createEngine(world, {
        randomTickHandlers: {
            'minecraft:wheat': (at, block) => {
                digest = Math.imul(digest ^ at.x, 16777619) >>> 0;
                digest = Math.imul(digest ^ at.y, 16777619) >>> 0;
                digest = Math.imul(digest ^ at.z, 16777619) >>> 0;
                digest = Math.imul(digest ^ block.name.length, 16777619) >>> 0;
                dispatches += 1;
            }
        }
    });
    const positions = new BlockRandomPositions();
    const started = performance.now();
    for (let tick = 0; tick < TICKS; tick += 1) engine.runRandomTicks(positions, SECTIONS);

    return {
        milliseconds: performance.now() - started,
        digest: digest.toString(16).padStart(8, '0'),
        dispatches
    };
};

const measure = (world: WorldAccess) => {
    runTicks(world);
    const samples = Array.from({ length: SAMPLES }, () => runTicks(world));
    const digests = new Set(samples.map(({ digest }) => digest));
    const dispatches = new Set(samples.map(({ dispatches }) => dispatches));
    if (digests.size !== 1 || dispatches.size !== 1) throw new Error('Random tick output changed between samples');

    const times = samples.map(({ milliseconds }) => milliseconds).sort((left, right) => left - right);
    return {
        p50Milliseconds: times[Math.floor(times.length / 2)],
        digest: samples[0]?.digest,
        dispatches: samples[0]?.dispatches
    };
};

const uncached = measure(uncachedWorld);
const cached = measure(cachedWorld);
if (uncached.digest !== cached.digest || uncached.dispatches !== cached.dispatches) {
    throw new Error('Cached and uncached random tick passes dispatched different positions');
}

console.log(
    JSON.stringify({
        benchmark: 'random-ticks',
        node: process.version,
        platform: `${os.platform()}-${os.arch()}`,
        cpu: os.cpus()[0]?.model ?? 'unknown',
        chunks: SECTIONS.length,
        sectionsPerChunk: SECTIONS_PER_CHUNK,
        drawsPerTick: SECTIONS.length * 3,
        ticksPerSample: TICKS,
        uncached,
        cached
    })
);
