/** Compares eager light initialization with the simulation ring at view distance 32. */
import { performance } from 'node:perf_hooks';

import { createTestWorld } from '@jsprismarine/engine-systems';
import { BlockRuntimeIds } from '../src/block/state/BlockRuntimeIds';
import type { SystemBlock, WorldSystemsView } from '../src/world/WorldSystems';
import { WorldSystems } from '../src/world/WorldSystems';
import { Dimensions } from '../src/world/DimensionType';

const VIEW_DISTANCE = 32;
const SIMULATION_DISTANCE = 10;
const LIGHT_GUARD_CHUNKS = 1;
const LIGHT_RADIUS = SIMULATION_DISTANCE + LIGHT_GUARD_CHUNKS;
const LIGHT_CHUNK_COUNT = (LIGHT_RADIUS * 2 + 1) ** 2;
const coordinates = Array.from({ length: (VIEW_DISTANCE * 2 + 1) ** 2 }, (_unused, index) => {
    const width = VIEW_DISTANCE * 2 + 1;
    return { x: (index % width) - VIEW_DISTANCE, z: Math.floor(index / width) - VIEW_DISTANCE };
});
const loaded = new Set(coordinates.map(({ x, z }) => `${x},${z}`));
const AIR: SystemBlock = { name: 'minecraft:air', states: {} };
const STONE: SystemBlock = { name: 'minecraft:stone', states: {} };
const STONE_RUNTIME_ID = BlockRuntimeIds.getByName('minecraft:stone');

const measure = (deferred: boolean, paletteHints: boolean) => {
    let blockReads = 0;
    let paletteScans = 0;
    const view: WorldSystemsView = {
        dimension: Dimensions.Overworld,
        blockAt: (x, y, z) => {
            if (!loaded.has(`${x >> 4},${z >> 4}`)) return undefined;
            blockReads++;
            return y === 40 ? STONE : AIR;
        },
        topOfColumn: () => 41,
        loadedChunks: () => coordinates,
        ...(paletteHints && {
            lightSectionAt: (_x: number, sectionY: number, _z: number) => ({
                revision: 0,
                runtimeIds: (function* () {
                    paletteScans++;
                    if (sectionY === 2) yield STONE_RUNTIME_ID;
                })()
            })
        }),
        ...(deferred && {
            shouldInitializeLight: (x, z) => Math.abs(x) <= LIGHT_RADIUS && Math.abs(z) <= LIGHT_RADIUS,
            lightChunks: function* () {
                for (const { x, z } of coordinates) {
                    if (Math.abs(x) <= LIGHT_RADIUS && Math.abs(z) <= LIGHT_RADIUS) yield { x, z };
                }
            }
        })
    };
    const systems = new WorldSystems({ view, world: createTestWorld() });
    const started = performance.now();
    for (const { x, z } of coordinates) systems.onChunkLoaded(x, z);
    if (deferred) systems.prepareLighting();
    const elapsedMs = performance.now() - started;

    return {
        initializedChunks: deferred ? LIGHT_CHUNK_COUNT : coordinates.length,
        blockReads,
        paletteScans,
        initializationMs: Number(elapsedMs.toFixed(2)),
        msPerInitializedChunk: Number((elapsedMs / (deferred ? LIGHT_CHUNK_COUNT : coordinates.length)).toFixed(4))
    };
};

console.log(
    JSON.stringify({
        benchmark: 'light-chunk-load',
        viewDistance: VIEW_DISTANCE,
        simulationDistance: SIMULATION_DISTANCE,
        lightGuardChunks: LIGHT_GUARD_CHUNKS,
        loadedChunks: coordinates.length,
        eager: { withoutHints: measure(false, false), withPaletteHints: measure(false, true) },
        deferred: { withoutHints: measure(true, false), withPaletteHints: measure(true, true) }
    })
);
