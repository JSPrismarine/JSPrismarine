import { performance } from 'node:perf_hooks';
import { parentPort, workerData } from 'node:worker_threads';

import registryVectors from '../vectors/surface-registries.json' with { type: 'json' };
import { CHUNK_SIZE, ChunkSampler } from '../src/chunk/ChunkSampler';
import { RandomState } from '../src/RandomState';
import { WorldgenData } from '../src/WorldgenData';

const CHUNK_X = 3;
const CHUNK_Z = -5;
const SEED = 1234n;
const WARMUPS = 1;
const REPETITIONS = 3;

const parseDocuments = (source: Record<string, string>): Map<string, unknown> =>
    new Map(Object.entries(source).map(([id, document]) => [id, JSON.parse(document) as unknown]));

const data = new WorldgenData({
    densityFunctions: parseDocuments(registryVectors.densityFunctions),
    noises: parseDocuments(registryVectors.noises),
    noiseSettings: parseDocuments(registryVectors.noiseSettings)
});
const settings = data.settings('minecraft:overworld');
const state = new RandomState(data, SEED, settings);

interface FillMeasurement {
    readonly milliseconds: number;
    readonly digest: string;
    readonly heapBeforeBytes: number;
    readonly heapAfterBytes: number;
    readonly arrayBuffersBeforeBytes: number;
    readonly arrayBuffersAfterBytes: number;
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

const hashWord = (hash: number, word: number): number => Math.imul(hash ^ word, 16_777_619) >>> 0;

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

const runChunkFill = (useVolumeDensity: boolean): FillMeasurement => {
    const before = process.memoryUsage();
    const sampler = new ChunkSampler(state, {
        chunkX: CHUNK_X,
        chunkZ: CHUNK_Z,
        skipProvenCells: false,
        useVolumeDensity
    });
    let digest = 2_166_136_261;
    const started = performance.now();
    for (let cell = 0; cell < sampler.cellCount; cell++) {
        sampler.forEachCellBlock(cell, (_x, _y, _z, block, scheduleFluidUpdate) => {
            for (let index = 0; index < block.length; index++) {
                digest = hashWord(digest, block.charCodeAt(index));
            }
            digest = hashWord(digest, scheduleFluidUpdate ? 1 : 0);
        });
    }
    const milliseconds = performance.now() - started;
    const after = process.memoryUsage();

    return {
        milliseconds,
        digest: digest.toString(16).padStart(8, '0'),
        heapBeforeBytes: before.heapUsed,
        heapAfterBytes: after.heapUsed,
        arrayBuffersBeforeBytes: before.arrayBuffers,
        arrayBuffersAfterBytes: after.arrayBuffers
    };
};

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

if (!parentPort) throw new Error('Density volume benchmark must run in a worker thread');

if (workerData === 'memory:scalar' || workerData === 'memory:volume') {
    const useVolumeDensity = workerData === 'memory:volume';
    runChunkFill(useVolumeDensity);
    const measurement = runChunkFill(useVolumeDensity);
    parentPort.postMessage({
        arm: useVolumeDensity ? 'volume' : 'scalar',
        chunkMilliseconds: measurement.milliseconds,
        heapDeltaBytes: measurement.heapAfterBytes - measurement.heapBeforeBytes,
        arrayBuffersDeltaBytes: measurement.arrayBuffersAfterBytes - measurement.arrayBuffersBeforeBytes,
        heapAfterBytes: measurement.heapAfterBytes,
        arrayBuffersAfterBytes: measurement.arrayBuffersAfterBytes
    });
} else if (workerData === 'compare') {
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

    parentPort.postMessage({
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
    } satisfies DensityVolumeBenchmarkResult);
} else {
    throw new Error(`Unexpected density volume worker mode: ${String(workerData)}`);
}
