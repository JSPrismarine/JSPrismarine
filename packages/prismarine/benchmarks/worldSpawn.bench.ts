/**
 * Measures the cold world-spawn search with the pinned Java worldgen data.
 *
 * Run `pnpm --filter @jsprismarine/prismarine run bench:world-spawn [workers] [climate|surface]`.
 */
import os from 'node:os';

import type { Logger } from '@jsprismarine/logger';
import type { Vector3 } from '@jsprismarine/math';

import { DataDrivenGenerator, defaultChunkPipeline } from '../src/world/generators/datadriven/DataDrivenGenerator';
import type { Generator } from '../src/world/Generator';
import { Dimensions } from '../src/world/Dimension';
import { World } from '../src/world/World';
import type { Config } from '../src/config/Config';
import type Server from '../src/Server';
import { inertEntityRuntime, testContent } from '../src/testing/entityServer';
import { stub } from '../src/testing/stub.test.helper';
import type BaseProvider from '../src/world/providers/BaseProvider';
import type Provider from '../src/world/providers/Provider';
import { fakeLevel, TEST_OVERWORLD_STEM } from '../src/testing/level';
import {
    findJavaWorldgenSources,
    loadJavaWorldgenRegistries
} from '../src/world/generators/datadriven/javaWorldgenData';

const workers = Number.parseInt(process.argv[2] ?? '6', 10);
const mode = process.argv[3] ?? 'climate';
if (!Number.isSafeInteger(workers) || workers < 1) {
    throw new RangeError('The worker count must be a positive integer');
}
if (mode !== 'climate' && mode !== 'surface') throw new RangeError('Mode must be climate or surface');

const sources = findJavaWorldgenSources();
if (sources === undefined) {
    process.stderr.write(
        'No Java world generation data. Run `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` ' +
            'and `pnpm --filter @jsprismarine/bedrock-data run datagen:java` first.\n'
    );
    process.exit(1);
}

const registries = loadJavaWorldgenRegistries(sources);
const worldGenerator = new DataDrivenGenerator({
    registries,
    stages: { pipeline: defaultChunkPipeline(), workers, javaTemplates: false }
});
let surfaceProbes = 0;
let spawnCandidates = 0;
const generator: Generator = {
    generateChunk: (...args) => worldGenerator.generateChunk(...args),
    surfaceAt: (...args) => {
        surfaceProbes++;
        return worldGenerator.surfaceAt(...args);
    },
    ...(worldGenerator.spawnChunk === undefined || mode === 'surface'
        ? {}
        : {
              spawnChunk: (seed) => {
                  const selected = worldGenerator.spawnChunk(seed);
                  spawnCandidates += selected.candidates;
                  return selected;
              }
          })
};

const server = stub<Server>({
    getLogger: () =>
        stub<Logger>({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, verbose: () => {} }),
    getConfig: () => stub<Config>({ getEntityTrackingInterval: () => 20 }),
    getContent: () => testContent(),
    getEntityRuntime: () => inertEntityRuntime()
});
const provider = stub<BaseProvider & Provider>({
    readChunk: async (_dimension, cx, cz, _seed, chunkGenerator) => chunkGenerator.generateChunk(cx, cz)
});
const level = fakeLevel({ name: 'world-spawn-bench', seed: 1234n, server, provider });
const world = new World({
    name: 'world-spawn-bench',
    path: 'world-spawn-bench',
    server,
    level,
    stem: TEST_OVERWORLD_STEM,
    generator
});

const beforeProcess = process.cpuUsage();
const beforeThread = process.threadCpuUsage();
const started = performance.now();
let position: Vector3 | undefined;
try {
    position = await world.getSpawnPosition();
} finally {
    worldGenerator.stopGenerating();
}
const wallMs = performance.now() - started;
const processCpu = process.cpuUsage(beforeProcess);
const mainThreadCpu = process.threadCpuUsage(beforeThread);
const processCpuMs = (processCpu.user + processCpu.system) / 1000;
const mainThreadCpuMs = (mainThreadCpu.user + mainThreadCpu.system) / 1000;
const workerCpuMs = Math.max(0, processCpuMs - mainThreadCpuMs);

process.stdout.write(
    `${JSON.stringify({
        benchmark: 'world-spawn',
        mode,
        seed: '1234',
        settings: 'minecraft:overworld',
        node: process.version,
        platform: `${os.platform()}-${os.arch()}`,
        cpu: os.cpus()[0]?.model ?? 'unknown',
        workerCount: workers,
        wallMs,
        mainThreadCpuMs,
        workerCpuMs,
        workerUtilization: wallMs === 0 ? 0 : workerCpuMs / (wallMs * workers),
        candidateCount: spawnCandidates || surfaceProbes,
        surfaceProbes,
        spawnCandidates,
        position: position === undefined ? undefined : { x: position.getX(), y: position.getY(), z: position.getZ() }
    })}\n`
);
