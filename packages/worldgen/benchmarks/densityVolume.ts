import { Session } from 'node:inspector/promises';
import { performance } from 'node:perf_hooks';
import { parentPort, workerData } from 'node:worker_threads';

import chunkVectors from '../vectors/chunk.json' with { type: 'json' };
import registryVectors from '../vectors/surface-registries.json' with { type: 'json' };
import { CHUNK_SIZE, ChunkSampler } from '../src/chunk/ChunkSampler';
import { RandomState } from '../src/RandomState';
import { WorldgenData } from '../src/WorldgenData';

const CHUNK_X = chunkVectors.chunkX;
const CHUNK_Z = chunkVectors.chunkZ;
const WARMUPS = 1;
const REPETITIONS = 3;
const HEAP_SAMPLING_INTERVAL_BYTES = 1024;

const parseDocuments = (source: Record<string, string>): Map<string, unknown> =>
    new Map(Object.entries(source).map(([id, document]) => [id, JSON.parse(document) as unknown]));

const data = new WorldgenData({
    densityFunctions: parseDocuments(registryVectors.densityFunctions),
    noises: parseDocuments(registryVectors.noises),
    noiseSettings: parseDocuments(registryVectors.noiseSettings)
});
const settings = data.settings(chunkVectors.settings);
const state = new RandomState(data, BigInt(chunkVectors.seed), settings);

interface FillMeasurement {
    readonly milliseconds: number;
    readonly digest: string;
    readonly samples: number;
}

interface DensityMeasurement {
    readonly milliseconds: number;
    readonly digest: string;
    readonly samples: number;
}

interface DensityVolumeBenchmarkResult {
    readonly node: string;
    readonly volumePlan: {
        readonly instructions: number;
        readonly scalarFallbacks: number;
        readonly workspaceBytes: number;
        readonly workspaceGrowths: number;
        readonly bytesPerCellOutput: number;
    };
    readonly density: {
        readonly samples: number;
        readonly scalarMilliseconds: number;
        readonly volumeMilliseconds: number;
        readonly scalarSamplesPerSecond: number;
        readonly volumeSamplesPerSecond: number;
        readonly digest: string;
    };
    readonly chunkFill: {
        readonly scalarMilliseconds: number;
        readonly volumeMilliseconds: number;
        readonly digest: string;
    };
}

interface PinnedJavaCorpusResult {
    readonly arm: 'scalar' | 'volume';
    readonly fullChunkDigest: string;
    readonly javaColumnsDigest: string;
    readonly columns: number;
    readonly blocks: number;
}

interface MemoryMeasurement {
    readonly arm: 'scalar' | 'volume';
    readonly heapSampledAllocationBytes: number;
    readonly heapSampleCount: number;
    readonly heapUsedBeforeBytes: number;
    readonly heapUsedAfterFillBytes: number;
    readonly heapUsedAfterGcBytes: number;
    readonly arrayBuffersBeforeBytes: number;
    readonly arrayBuffersAfterFillBytes: number;
    readonly arrayBuffersAfterGcBytes: number;
    readonly retainedArrayBufferDeltaBytes: number;
}

interface AllocationSampleStats {
    readonly bytes: number;
    readonly count: number;
}

const allocationSampleStats = (profile: unknown): AllocationSampleStats => {
    if (!isRecord(profile) || !Array.isArray(profile['samples'])) {
        throw new TypeError('Inspector returned no allocation samples');
    }
    let bytes = 0;
    for (const sample of profile['samples']) {
        if (!isRecord(sample) || typeof sample['size'] !== 'number') {
            throw new TypeError('Inspector returned a malformed allocation sample');
        }
        bytes += sample['size'];
    }
    return { bytes, count: profile['samples'].length };
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const hashWord = (hash: number, word: number): number => Math.imul(hash ^ word, 16_777_619) >>> 0;

const hashText = (hash: number, value: string): number => {
    let result = hash;
    for (let index = 0; index < value.length; index++) {
        result = hashWord(result, value.charCodeAt(index));
    }
    return hashWord(result, 255);
};

const createSampler = (useVolumeDensity: boolean, chunkX = CHUNK_X, chunkZ = CHUNK_Z): ChunkSampler =>
    new ChunkSampler(state, {
        chunkX,
        chunkZ,
        // Cell skips bypass both density evaluators, so benchmark both arms over every block.
        skipProvenCells: false,
        useVolumeDensity
    });

const fillSampler = (
    sampler: ChunkSampler,
    visit?: (x: number, y: number, z: number, block: string) => void
): FillMeasurement => {
    let digest = 2_166_136_261;
    let samples = 0;
    const started = performance.now();
    const hashBlock = (x: number, y: number, z: number, block: string, scheduleFluidUpdate: boolean): void => {
        digest = hashWord(digest, x);
        digest = hashWord(digest, y);
        digest = hashWord(digest, z);
        digest = hashText(digest, block);
        digest = hashWord(digest, scheduleFluidUpdate ? 1 : 0);
        samples++;
        visit?.(x, y, z, block);
    };

    // The volume evaluator fills density first; aquifer calls still follow the sampler's normal cell visit order.
    for (let cell = 0; cell < sampler.cellCount; cell++) sampler.forEachCellBlock(cell, hashBlock);

    return {
        milliseconds: performance.now() - started,
        digest: digest.toString(16).padStart(8, '0'),
        samples
    };
};

const bestDensityMeasurement = (useVolume: boolean): DensityMeasurement => {
    const node = settings.noiseRouter.finalDensity;
    const cell = state.interpolationCellSizeOf(node) ?? { xz: CHUNK_SIZE, y: settings.noiseSettings.height };
    const sampler = state.sampler(node);
    const evaluator = useVolume ? state.volumeSampler(node) : undefined;
    const minX = CHUNK_X * CHUNK_SIZE;
    const minY = settings.noiseSettings.minY;
    const minZ = CHUNK_Z * CHUNK_SIZE;
    const cellsY = Math.ceil(settings.noiseSettings.height / cell.y);
    const output = new Float64Array(cell.xz * cell.xz * cell.y);
    const volumeBounds = evaluator ? { minX, minY, minZ, sizeX: cell.xz, sizeY: cell.y, sizeZ: cell.xz } : undefined;
    const floatBuffer = new Float32Array(1);
    const uintBuffer = new Uint32Array(floatBuffer.buffer);

    const run = (): DensityMeasurement => {
        const context = state.createContext();
        context.interpolationBuffersEnabled = true;
        let digest = 2_166_136_261;
        let samples = 0;
        const started = performance.now();

        for (let cellY = cellsY - 1; cellY >= 0; cellY--) {
            for (let cellX = 0; cellX < CHUNK_SIZE / cell.xz; cellX++) {
                for (let cellZ = 0; cellZ < CHUNK_SIZE / cell.xz; cellZ++) {
                    const firstX = minX + cellX * cell.xz;
                    const firstY = minY + cellY * cell.y;
                    const firstZ = minZ + cellZ * cell.xz;
                    const sizeY = Math.min(cell.y, minY + settings.noiseSettings.height - firstY);

                    if (evaluator && volumeBounds) {
                        volumeBounds.minX = firstX;
                        volumeBounds.minY = firstY;
                        volumeBounds.minZ = firstZ;
                        volumeBounds.sizeY = sizeY;
                        evaluator.sample(context, volumeBounds, output);
                    }

                    for (let x = firstX; x < firstX + cell.xz; x++) {
                        for (let z = firstZ; z < firstZ + cell.xz; z++) {
                            for (let y = firstY + sizeY - 1; y >= firstY; y--) {
                                const value = evaluator
                                    ? (output[
                                          (y - firstY) * cell.xz * cell.xz + (z - firstZ) * cell.xz + (x - firstX)
                                      ] ?? 0)
                                    : sampler(context, x, y, z);
                                floatBuffer[0] = value;
                                digest = hashWord(digest, uintBuffer[0] ?? 0);
                                samples++;
                            }
                        }
                    }
                }
            }
        }

        return {
            milliseconds: performance.now() - started,
            digest: digest.toString(16).padStart(8, '0'),
            samples
        };
    };

    for (let warmup = 0; warmup < WARMUPS; warmup++) run();
    let best: DensityMeasurement | undefined;
    for (let repetition = 0; repetition < REPETITIONS; repetition++) {
        const measurement = run();
        if (best === undefined || measurement.milliseconds < best.milliseconds) best = measurement;
    }
    if (best === undefined) throw new Error('Density volume benchmark completed no repetitions');
    return best;
};

const runChunkFill = (useVolumeDensity: boolean): FillMeasurement => fillSampler(createSampler(useVolumeDensity));

const bestChunkFill = (useVolumeDensity: boolean): FillMeasurement => {
    for (let warmup = 0; warmup < WARMUPS; warmup++) runChunkFill(useVolumeDensity);
    let best: FillMeasurement | undefined;
    for (let repetition = 0; repetition < REPETITIONS; repetition++) {
        const measurement = runChunkFill(useVolumeDensity);
        if (best === undefined || measurement.milliseconds < best.milliseconds) best = measurement;
    }
    if (best === undefined) throw new Error('Chunk fill benchmark completed no repetitions');
    return best;
};

const runPinnedJavaCorpus = (useVolumeDensity: boolean): PinnedJavaCorpusResult => {
    // `chunk.json` is the full checked-in Java output corpus: nine complete columns. `column()` is scalar-only,
    // so collect those oracle columns from the cell walk that routes through the optional volume evaluator.
    const sampler = createSampler(useVolumeDensity, chunkVectors.chunkX, chunkVectors.chunkZ);
    const columns = new Map<number, Map<number, (string | undefined)[]>>();
    for (const expected of chunkVectors.columns) {
        let byZ = columns.get(expected.x);
        if (byZ === undefined) {
            byZ = new Map();
            columns.set(expected.x, byZ);
        }
        byZ.set(expected.z, new Array<string | undefined>(chunkVectors.height));
    }

    const fullChunk = fillSampler(sampler, (x, y, z, block) => {
        const states = columns.get(x)?.get(z);
        if (states !== undefined) states[y - chunkVectors.minY] = block;
    });

    let javaColumnsDigest = 2_166_136_261;
    for (const expected of chunkVectors.columns) {
        const states = columns.get(expected.x)?.get(expected.z);
        if (states === undefined) throw new Error(`Missing pinned Java column ${expected.x},${expected.z}`);
        javaColumnsDigest = hashWord(javaColumnsDigest, expected.x);
        javaColumnsDigest = hashWord(javaColumnsDigest, expected.z);

        let yIndex = 0;
        for (const run of expected.runs) {
            for (let index = 0; index < run.count; index++) {
                const actual = states[yIndex];
                if (actual !== run.block) {
                    throw new Error(
                        `Pinned Java column changed at ${expected.x},${chunkVectors.minY + yIndex},${expected.z}: ` +
                            `${String(actual)} != ${run.block}`
                    );
                }
                javaColumnsDigest = hashText(javaColumnsDigest, actual);
                yIndex++;
            }
        }
        if (yIndex !== chunkVectors.height) {
            throw new Error(
                `Pinned Java column ${expected.x},${expected.z} covers ${yIndex} of ${chunkVectors.height} blocks`
            );
        }
    }

    return {
        arm: useVolumeDensity ? 'volume' : 'scalar',
        fullChunkDigest: fullChunk.digest,
        javaColumnsDigest: javaColumnsDigest.toString(16).padStart(8, '0'),
        columns: chunkVectors.columns.length,
        blocks: fullChunk.samples
    };
};

const measureMemory = async (useVolumeDensity: boolean): Promise<MemoryMeasurement> => {
    if (global.gc === undefined) throw new Error('Memory sampling needs a process started with --expose-gc');

    fillSampler(createSampler(useVolumeDensity));
    const session = new Session();
    session.connect();
    global.gc();
    const before = process.memoryUsage();

    await session.post('HeapProfiler.startSampling', { samplingInterval: HEAP_SAMPLING_INTERVAL_BYTES });
    const sampler = createSampler(useVolumeDensity);
    const fill = fillSampler(sampler);
    const { profile } = await session.post('HeapProfiler.stopSampling');
    session.disconnect();
    const afterFill = process.memoryUsage();
    global.gc();
    const afterGc = process.memoryUsage();

    // Read the sampler after collection so its typed-array workspace stays live for the retained-buffer sample.
    if (sampler.cellCount === 0 || fill.samples === 0) throw new Error('Memory sampling did not fill a chunk');
    // Node 26 returns allocation samples here; @types/node 24 models the live profile tree but omits this field.
    const allocationSamples = allocationSampleStats(profile);
    return {
        arm: useVolumeDensity ? 'volume' : 'scalar',
        heapSampledAllocationBytes: allocationSamples.bytes,
        heapSampleCount: allocationSamples.count,
        heapUsedBeforeBytes: before.heapUsed,
        heapUsedAfterFillBytes: afterFill.heapUsed,
        heapUsedAfterGcBytes: afterGc.heapUsed,
        arrayBuffersBeforeBytes: before.arrayBuffers,
        arrayBuffersAfterFillBytes: afterFill.arrayBuffers,
        arrayBuffersAfterGcBytes: afterGc.arrayBuffers,
        retainedArrayBufferDeltaBytes: afterGc.arrayBuffers - before.arrayBuffers
    };
};

const runTask = async (task: unknown): Promise<unknown> => {
    if (task === 'memory:scalar') return measureMemory(false);
    if (task === 'memory:volume') return measureMemory(true);
    if (task === 'pinned:scalar') return runPinnedJavaCorpus(false);
    if (task === 'pinned:volume') return runPinnedJavaCorpus(true);

    if (task === 'compare') {
        const node = settings.noiseRouter.finalDensity;
        const volumeEvaluator = state.volumeSampler(node);
        const interpolationCell = state.interpolationCellSizeOf(node) ?? {
            xz: CHUNK_SIZE,
            y: settings.noiseSettings.height
        };
        const output = new Float64Array(interpolationCell.xz * interpolationCell.xz * interpolationCell.y);
        volumeEvaluator.sample(
            state.createContext(),
            {
                minX: CHUNK_X * CHUNK_SIZE,
                minY: settings.noiseSettings.minY,
                minZ: CHUNK_Z * CHUNK_SIZE,
                sizeX: interpolationCell.xz,
                sizeY: interpolationCell.y,
                sizeZ: interpolationCell.xz
            },
            output
        );

        const scalarDensity = bestDensityMeasurement(false);
        const volumeDensity = bestDensityMeasurement(true);
        const scalarFill = bestChunkFill(false);
        const volumeFill = bestChunkFill(true);
        if (scalarDensity.digest !== volumeDensity.digest) {
            throw new Error(`Density digest changed: ${scalarDensity.digest} != ${volumeDensity.digest}`);
        }
        if (scalarFill.digest !== volumeFill.digest) {
            throw new Error(`Chunk digest changed: ${scalarFill.digest} != ${volumeFill.digest}`);
        }

        return {
            node: 'minecraft:overworld/final_density',
            volumePlan: {
                instructions: volumeEvaluator.instructionCount,
                scalarFallbacks: volumeEvaluator.scalarFallbackCount,
                workspaceBytes: volumeEvaluator.retainedWorkspaceBytes,
                workspaceGrowths: volumeEvaluator.workspaceGrowthCount,
                bytesPerCellOutput: output.byteLength
            },
            density: {
                samples: scalarDensity.samples,
                scalarMilliseconds: scalarDensity.milliseconds,
                volumeMilliseconds: volumeDensity.milliseconds,
                scalarSamplesPerSecond:
                    (CHUNK_SIZE * CHUNK_SIZE * settings.noiseSettings.height * 1000) / scalarDensity.milliseconds,
                volumeSamplesPerSecond:
                    (CHUNK_SIZE * CHUNK_SIZE * settings.noiseSettings.height * 1000) / volumeDensity.milliseconds,
                digest: scalarDensity.digest
            },
            chunkFill: {
                scalarMilliseconds: scalarFill.milliseconds,
                volumeMilliseconds: volumeFill.milliseconds,
                digest: scalarFill.digest
            }
        } satisfies DensityVolumeBenchmarkResult;
    }

    throw new Error(`Unexpected density volume benchmark task: ${String(task)}`);
};

const task = parentPort === null ? process.argv[2] : workerData;
const result = await runTask(task);
if (parentPort === null) process.stdout.write(`${JSON.stringify(result)}\n`);
else parentPort.postMessage(result);
