/**
 * Measures terrain proto persistence on preload and teleport-return workloads.
 *
 * Run `pnpm --filter @jsprismarine/prismarine run bench:terrain-cache`. The preload is an
 * 11 by 11 start region. The return workload loads a 3 by 3 home view, visits six distant
 * positions to evict its holders, then loads the home view again. Each result uses one sample.
 *
 * This needs Mojang's world generation data, the same as the generator does. Without it the
 * run reports what is missing and stops.
 */
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DataDrivenGenerator } from '@jsprismarine/prismarine/world/generators/datadriven/DataDrivenGenerator';
import type { TerrainProtoCacheEvent } from '@jsprismarine/prismarine/world/generators/datadriven/TerrainProtoCache';
import { findJavaTemplateSource } from '@jsprismarine/prismarine/world/generators/datadriven/javaStructureTemplates';
import {
    cacheRoot,
    findJavaWorldgenSources
} from '@jsprismarine/prismarine/world/generators/datadriven/javaWorldgenSources';
import { loadJavaWorldgenRegistries } from '@jsprismarine/prismarine/world/generators/datadriven/javaWorldgenData';

const seed = 1234n;
const cacheBudgetBytes = 512 * 1024 * 1024;
const sources = findJavaWorldgenSources();
if (sources === undefined) {
    process.stderr.write(
        'No Java world generation data. Run `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` ' +
            'and `pnpm --filter @jsprismarine/bedrock-data run datagen:java` first.\n'
    );
    process.exit(1);
}

const registries = loadJavaWorldgenRegistries(sources);
const templates = findJavaTemplateSource(cacheRoot(), registries.processorLists);
const makeGenerator = (directory?: string, events?: TerrainProtoCacheEvent[]): DataDrivenGenerator =>
    new DataDrivenGenerator({
        registries,
        templates,
        ...(directory === undefined
            ? {}
            : {
                  persistentProtoCache: {
                      directory,
                      maxBytes: cacheBudgetBytes,
                      onEvent: (event: TerrainProtoCacheEvent) => events?.push(event)
                  }
              })
    });

const region = (radius: number): readonly (readonly [number, number])[] =>
    Array.from({ length: (radius * 2 + 1) ** 2 }, (_unused, index) => {
        const width = radius * 2 + 1;
        return [(index % width) - radius, Math.trunc(index / width) - radius] as const;
    });

interface GenerationResult {
    readonly digest: string;
    readonly outputBytes: number;
}

const generate = async (
    generator: DataDrivenGenerator,
    positions: readonly (readonly [number, number])[]
): Promise<GenerationResult> => {
    const digest = createHash('sha256');
    let outputBytes = 0;
    const chunks = await Promise.all(
        positions.map(async ([x, z]) => ({ x, z, chunk: await generator.generateChunk(x, z, seed) }))
    );
    for (const { x, z, chunk } of chunks) {
        const bytes = chunk.networkSerialize();
        digest.update(`${x},${z}\0`).update(bytes);
        outputBytes += bytes.byteLength;
    }
    return { digest: digest.digest('hex'), outputBytes };
};

interface TimedGeneration extends GenerationResult {
    readonly ms: number;
}

const timedGeneration = async (
    directory: string | undefined,
    events: TerrainProtoCacheEvent[] | undefined,
    positions: readonly (readonly [number, number])[]
): Promise<TimedGeneration> => {
    const started = performance.now();
    const generator = makeGenerator(directory, events);
    try {
        return { ...(await generate(generator, positions)), ms: performance.now() - started };
    } finally {
        generator.stopGenerating();
    }
};

const runPreload = async (root: string) => {
    const positions = region(5);
    const baseline = await timedGeneration(undefined, undefined, positions);
    const events: TerrainProtoCacheEvent[] = [];
    const cold = await timedGeneration(join(root, 'preload'), events, positions);
    const warmEvents: TerrainProtoCacheEvent[] = [];
    const warm = await timedGeneration(join(root, 'preload'), warmEvents, positions);
    if (baseline.digest !== cold.digest || cold.digest !== warm.digest) {
        throw new Error('Preload chunk digest changed between cache runs');
    }
    if (!warmEvents.some((event) => event.type === 'hit')) {
        throw new Error('Preload restart did not reuse a terrain proto record');
    }

    const bytesWritten = events.reduce((total, event) => total + (event.type === 'write' ? (event.bytes ?? 0) : 0), 0);
    const storageBytes = directoryBytes(join(root, 'preload'));
    return {
        chunks: positions.length,
        baselineMs: baseline.ms,
        cacheColdMs: cold.ms,
        cacheRestartMs: warm.ms,
        timeSavedMs: baseline.ms - warm.ms,
        netTimeSavedAfterOneRestartMs: baseline.ms * 2 - cold.ms - warm.ms,
        storageBytes,
        writes: events.filter((event) => event.type === 'write').length,
        bytesWritten,
        writeAmplification: bytesWritten / cold.outputBytes,
        restartHits: warmEvents.filter((event) => event.type === 'hit').length,
        digest: warm.digest
    };
};

const runTeleportReturn = async (root: string) => {
    const home = region(1);
    const distant = [
        [32, 0],
        [64, 0],
        [96, 0],
        [128, 0],
        [160, 0],
        [192, 0]
    ] as const;
    const baselineReturn = await runTrip(undefined, undefined, home, distant);
    const events: TerrainProtoCacheEvent[] = [];
    const cacheReturn = await runTrip(join(root, 'teleport'), events, home, distant);
    if (baselineReturn.digest !== cacheReturn.digest)
        throw new Error('Teleport return chunk digest changed under caching');
    if (cacheReturn.returnHits === 0) throw new Error('Teleport return did not reload an evicted terrain proto record');

    const bytesWritten = events.reduce((total, event) => total + (event.type === 'write' ? (event.bytes ?? 0) : 0), 0);
    return {
        homeChunks: home.length,
        distantPositions: distant.length,
        baselineTripMs: baselineReturn.tripMs,
        cacheTripMs: cacheReturn.tripMs,
        netTimeSavedMs: baselineReturn.tripMs - cacheReturn.tripMs,
        baselineReturnMs: baselineReturn.returnMs,
        cacheReturnMs: cacheReturn.returnMs,
        timeSavedMs: baselineReturn.returnMs - cacheReturn.returnMs,
        storageBytes: directoryBytes(join(root, 'teleport')),
        writes: events.filter((event) => event.type === 'write').length,
        bytesWritten,
        writeAmplification: bytesWritten / cacheReturn.outputBytes,
        returnHits: cacheReturn.returnHits,
        digest: cacheReturn.digest
    };
};

const runTrip = async (
    directory: string | undefined,
    events: TerrainProtoCacheEvent[] | undefined,
    home: readonly (readonly [number, number])[],
    distant: readonly (readonly [number, number])[]
) => {
    const tripStarted = performance.now();
    const generator = makeGenerator(directory, events);
    const output = createHash('sha256');
    let outputBytes = 0;
    try {
        const initial = await generate(generator, home);
        output.update(initial.digest);
        outputBytes += initial.outputBytes;
        for (const position of distant) {
            const waypoint = await generate(generator, [position]);
            output.update(waypoint.digest);
            outputBytes += waypoint.outputBytes;
        }

        const returnEventStart = events?.length ?? 0;
        const returnStarted = performance.now();
        const returned = await generate(generator, home);
        output.update(returned.digest);
        outputBytes += returned.outputBytes;
        const returnEvents = events?.slice(returnEventStart) ?? [];
        return {
            digest: output.digest('hex'),
            outputBytes,
            tripMs: performance.now() - tripStarted,
            returnMs: performance.now() - returnStarted,
            returnHits: returnEvents.filter((event) => event.type === 'hit').length
        };
    } finally {
        generator.stopGenerating();
    }
};

const directoryBytes = (directory: string): number => {
    let total = 0;
    for (const name of readdirSync(directory)) {
        const path = join(directory, name);
        const file = statSync(path);
        if (file.isFile()) total += file.size;
    }
    return total;
};

const root = mkdtempSync(join(tmpdir(), 'jsp-terrain-proto-bench-'));
try {
    const preload = await runPreload(root);
    const teleport = await runTeleportReturn(root);
    process.stdout.write(
        `${JSON.stringify({
            benchmark: 'terrain-proto-cache',
            seed: seed.toString(),
            node: process.version,
            platform: `${process.platform}-${process.arch}`,
            workload: { preload, teleportReturn: teleport }
        })}\n`
    );
} finally {
    rmSync(root, { recursive: true, force: true });
}
