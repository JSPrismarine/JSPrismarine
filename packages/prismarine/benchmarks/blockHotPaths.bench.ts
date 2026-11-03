import { performance } from 'node:perf_hooks';

import { bedrockBlockPropertiesOf } from '@jsprismarine/mapping';
import { bareName } from '@jsprismarine/block-behaviors';

import { profileSpanStarter, startProfileSpan } from '../src/profiling/ServerProfiler';
import { GameEventListenerRegistry } from '../src/world/GameEventListenerRegistry';
import { BlockRuntimeIds } from '../src/block/state/BlockRuntimeIds';

let checksum = 0;

const measure = (name: string, iterations: number, run: () => void): void => {
    for (let warmup = 0; warmup < 4; warmup++) run();
    const startedAt = performance.now();
    for (let iteration = 0; iteration < iterations; iteration++) run();
    const elapsedMs = performance.now() - startedAt;
    console.log(`${name}: ${elapsedMs.toFixed(2)} ms (${iterations} runs)`);
};

const names = [
    'minecraft:oak_door',
    'minecraft:scaffolding',
    'minecraft:redstone_wire',
    'example:custom_block',
    'unqualified_block'
];
const identifierRuns = 100_000;
measure('identifier regex', identifierRuns, () => {
    for (const name of names) checksum += name.replace(/^[^:]*:/, '').length;
});
measure('identifier cached bare name', identifierRuns, () => {
    for (const name of names) checksum += bareName(name).length;
});

const emptyEvent: {
    readonly event: string;
    readonly at: { readonly x: number; readonly y: number; readonly z: number };
} = {
    event: 'minecraft:block_open',
    at: { x: 8, y: 8, z: 8 }
};
let loadedColumnsVisited = 0;
const emptyRegistry = new GameEventListenerRegistry({ getLoadedChunk: () => (loadedColumnsVisited++, {}) });
measure('empty event post before early return', 20_000, () => {
    // This reproduces the former empty-registry walk, including its column and section keys.
    const radius = 16;
    const minX = Math.floor((emptyEvent.at.x - radius) / 16);
    const maxX = Math.floor((emptyEvent.at.x + radius) / 16);
    const minY = Math.floor((emptyEvent.at.y - radius) / 16);
    const maxY = Math.floor((emptyEvent.at.y + radius) / 16);
    const minZ = Math.floor((emptyEvent.at.z - radius) / 16);
    const maxZ = Math.floor((emptyEvent.at.z + radius) / 16);
    const columns = new Set<string>();
    for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
            const column = `${x},${z}`;
            if (!columns.has(column)) {
                columns.add(column);
                loadedColumnsVisited++;
            }
            for (let y = minY; y <= maxY; y++) checksum += `${x},${y},${z}`.length;
        }
    }
});
measure('empty event post with early return', 20_000, () => emptyRegistry.post(emptyEvent));

const glowstoneId = BlockRuntimeIds.getByName('minecraft:glowstone');
const airId = BlockRuntimeIds.getByName('minecraft:air');
const lightBlocks = [
    { id: glowstoneId, name: 'minecraft:glowstone', states: {} },
    { id: airId, name: 'minecraft:air', states: {} }
];
const lightByRuntimeId = new Map(
    lightBlocks.map(({ id, name, states }) => {
        const properties = bedrockBlockPropertiesOf(name, states);
        if (properties === undefined) throw new Error(`missing light properties for ${name}`);
        return [id, { lightEmission: properties.lightEmission, lightDampening: properties.lightDampening }] as const;
    })
);
measure('block-change light properties by state', 100_000, () => {
    for (const block of lightBlocks) {
        const properties = bedrockBlockPropertiesOf(block.name, block.states);
        if (properties !== undefined) checksum += properties.lightEmission + properties.lightDampening;
    }
});
measure('block-change light properties by runtime id', 100_000, () => {
    for (const block of lightBlocks) {
        const properties = lightByRuntimeId.get(block.id);
        if (properties !== undefined) checksum += properties.lightEmission + properties.lightDampening;
    }
});

const profileOwner = {};
const startProfile = profileSpanStarter(profileOwner);
measure('profiling-off span names before guard', 100_000, () => {
    const finish = startProfileSpan(profileOwner, `World.systems:${checksum}`);
    finish();
});
measure('profiling-off span names after guard', 100_000, () => {
    const finish = startProfile?.(`World.systems:${checksum}`);
    finish?.();
});

const updatesPerRun = 4096;
const repetitions = 100;
const syncUpdate = (): void => {};
const runAwaitedUpdates = async (): Promise<void> => {
    for (let index = 0; index < updatesPerRun; index++) await syncUpdate();
};
const runSynchronousUpdates = async (): Promise<void> => {
    for (let index = 0; index < updatesPerRun; index++) {
        const update = syncUpdate();
        if (update !== undefined) await update;
    }
};
const measureAsync = async (name: string, run: () => Promise<void>): Promise<void> => {
    await run();
    await run();
    const startedAt = performance.now();
    for (let iteration = 0; iteration < repetitions; iteration++) await run();
    const elapsedMs = performance.now() - startedAt;
    console.log(`${name}: ${elapsedMs.toFixed(2)} ms (${repetitions * updatesPerRun} updates)`);
};

await measureAsync('block-update loop awaiting every no-op', runAwaitedUpdates);
await measureAsync('block-update loop synchronous fast path', runSynchronousUpdates);

console.log(`checksum: ${checksum}; baseline loaded-column visits: ${loadedColumnsVisited}`);
