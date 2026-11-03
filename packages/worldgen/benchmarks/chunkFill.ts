/**
 * One arm of the terrain fill benchmark, measured in its own process.
 *
 * `benchmarks/run.mts` bundles this file and spawns it once per arm per round, interleaved, so
 * a load spike lands on both arms rather than on one. Each process reports the best of its own
 * repetitions, which is the closest an occupied machine gets to an idle one.
 *
 * Arms:
 * - `fill`: the whole fill the generator does, density and aquifer, block by block.
 * - `router`: the same fill after every slot of the noise router has compiled on the state, as
 *   it has in a running server once the surface pass and the biome source have sampled. The
 *   cell count it reports is the one that exposes a sampler sized from the wrong tree.
 * - `density`: the density pass alone, so a change can be charged to one half or the other.
 * - `generated`: the whole fill with the optional JavaScript density compiler enabled.
 */
import registryVectors from '../vectors/surface-registries.json' with { type: 'json' };
import { CHUNK_SIZE, ChunkSampler } from '../src/chunk/ChunkSampler';
import { RandomState } from '../src/RandomState';
import { WorldgenData } from '../src/WorldgenData';
import type { Noise } from '../src/noise/GradientNoise';
import { NoiseStack } from '../src/noise/NoiseStack';

/** The arms this file knows how to run. */
export type BenchmarkArm = 'density' | 'fill' | 'generated' | 'router';

const ARMS: readonly BenchmarkArm[] = ['fill', 'router', 'density', 'generated'];

const CHUNKS = [
    [3, -5],
    [5, -8],
    [7, -11],
    [9, -14]
] as const;

const REPETITIONS = 7;
const WARMUPS = 2;

const parseDocuments = (source: Record<string, string>): Map<string, unknown> =>
    new Map(Object.entries(source).map(([id, document]) => [id, JSON.parse(document) as unknown]));

const data = new WorldgenData({
    densityFunctions: parseDocuments(registryVectors.densityFunctions),
    noises: parseDocuments(registryVectors.noises),
    noiseSettings: parseDocuments(registryVectors.noiseSettings)
});

const settings = data.settings('minecraft:overworld');
const requested = ARMS.find((arm) => arm === process.argv[2]);
if (!requested) throw new RangeError(`Pass one of ${ARMS.join(', ')}, not ${process.argv[2]}`);
const compilerOptions = requested === 'generated' ? { generatedFunctions: true } : {};
const compileState = new RandomState(data, 1234n, settings, compilerOptions);
global.gc?.();
const compileHeapBefore = process.memoryUsage().heapUsed;
const compileStarted = performance.now();
for (const node of Object.values(settings.noiseRouter)) compileState.sampler(node);
const compileMilliseconds = performance.now() - compileStarted;
// Collect temporary compiler objects so this delta approximates retained per-state heap.
global.gc?.();
const compileHeapBytes = process.memoryUsage().heapUsed - compileHeapBefore;
const state = new RandomState(data, 1234n, settings, compilerOptions);
const countedState = new RandomState(data, 1234n, settings, compilerOptions);
const finalDensity = settings.noiseRouter.finalDensity;
const octaveSamples = { count: 0 };
const instrumentedOctaves = new Set<Noise>();
for (const id of data.noiseIds) {
    const stack = countedState.noise(id);
    if (!(stack instanceof NoiseStack)) continue;
    for (const layer of stack.layers) {
        const octave = layer.noise;
        if (instrumentedOctaves.has(octave)) continue;
        instrumentedOctaves.add(octave);
        const get3 = octave.get3.bind(octave);
        const get2 = octave.get2.bind(octave);
        Object.defineProperty(octave, 'get3', {
            configurable: true,
            value: (x: number, y: number, z: number) => {
                octaveSamples.count++;
                return get3(x, y, z);
            }
        });
        Object.defineProperty(octave, 'get2', {
            configurable: true,
            value: (x: number, z: number) => {
                octaveSamples.count++;
                return get2(x, z);
            }
        });
    }
}
// The density-only arm walks final_density's lattice even though the router arm compiles
// chunk_surface_level, whose 16 by 1 cell size must not change the terrain fill.

/** Walks every block of a chunk the way the generator does, and counts what it placed. */
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;
const floatBits = new Float32Array(1);
const floatWords = new Uint32Array(floatBits.buffer);

const hashText = (hash: number, text: string): number => {
    let result = hash;
    for (let index = 0; index < text.length; index++) result = Math.imul(result ^ text.charCodeAt(index), FNV_PRIME);
    return Math.imul(result ^ 0xff, FNV_PRIME) >>> 0;
};

const hashWord = (hash: number, word: number): number => Math.imul(hash ^ word, FNV_PRIME) >>> 0;

interface WalkResult {
    readonly count: number;
    readonly digest: number;
}

/** Hashes the block output and counts solids while walking the generated cell buffers. */
const fillChunk = (sampler: ChunkSampler, includeDigest: boolean): WalkResult => {
    let placed = 0;
    let digest = FNV_OFFSET;
    for (let cell = 0; cell < sampler.cellCount; cell++) {
        sampler.forEachCellBlock(cell, (_x, _y, _z, block) => {
            if (includeDigest) digest = hashText(digest, block);
            if (block !== 'minecraft:air') placed++;
        });
    }
    return { count: placed, digest };
};

// The interpolation cell the density arm walks, so it crosses a cell boundary as rarely as
// `forEachCellBlock` does. A column walk refetches eight corners every eight blocks and would
// charge the density pass for an order the generator stopped using.
const cell = state.interpolationCellSizeOf(finalDensity) ?? { xz: CHUNK_SIZE, y: settings.noiseSettings.height };

/** Reads the density of every block of a chunk, cell by cell, with no aquifer. */
const fillDensity = (sampler: ChunkSampler, includeDigest: boolean): WalkResult => {
    const { minBlockX, minBlockY, minBlockZ, maxBlockY } = sampler.volume;
    let solid = 0;
    let digest = FNV_OFFSET;
    for (let firstZ = minBlockZ; firstZ < minBlockZ + CHUNK_SIZE; firstZ += cell.xz) {
        for (let firstX = minBlockX; firstX < minBlockX + CHUNK_SIZE; firstX += cell.xz) {
            for (let lastY = maxBlockY; lastY >= minBlockY; lastY -= cell.y) {
                for (let x = firstX; x < firstX + cell.xz; x++) {
                    for (let z = firstZ; z < firstZ + cell.xz; z++) {
                        for (let y = lastY; y > Math.max(minBlockY - 1, lastY - cell.y); y--) {
                            const density = sampler.density(x, y, z);
                            if (includeDigest) {
                                floatBits[0] = density;
                                digest = hashWord(digest, floatWords[0] ?? 0);
                            }
                            if (density > 0) solid++;
                        }
                    }
                }
            }
        }
    }
    return { count: solid, digest };
};

const run = (
    arm: BenchmarkArm
): {
    arm: BenchmarkArm;
    millisecondsPerChunk: number;
    checksum: number;
    digest: string;
    octaveSamplesPerChunk: number;
    cellsPerChunk: number;
    compileMilliseconds: number;
    compileHeapBytes: number;
    generatedFunctionCount: number;
    generatedFunctionBytes: number;
    closureFallbackCount: number;
} => {
    const walk = arm === 'density' ? fillDensity : fillChunk;
    // Compile every slot before anything is measured in the router arm. This matches a running
    // server after the surface pass compiled `chunk_surface_level`.
    if (arm === 'router' || arm === 'generated') {
        for (const slot of Object.values(settings.noiseRouter)) state.sampler(slot);
        for (const slot of Object.values(settings.noiseRouter)) countedState.sampler(slot);
    }

    let checksum = 0;
    let digest = FNV_OFFSET;
    let cellsPerChunk = 0;
    let best = Number.POSITIVE_INFINITY;
    for (let round = 0; round < WARMUPS + REPETITIONS; round++) {
        const started = performance.now();
        for (const [chunkX, chunkZ] of CHUNKS) {
            const sampler = new ChunkSampler(state, { chunkX, chunkZ });
            cellsPerChunk = sampler.cellCount;
            const result = walk(sampler, false);
            checksum += result.count;
        }
        const elapsed = (performance.now() - started) / CHUNKS.length;
        if (round >= WARMUPS) best = Math.min(best, elapsed);
    }

    // Keep the digest and octave counter out of the timed passes so instrumentation does not hide
    // the cache's throughput change.
    for (const [chunkX, chunkZ] of CHUNKS) {
        const sampler = new ChunkSampler(countedState, { chunkX, chunkZ });
        digest = hashWord(digest, walk(sampler, true).digest);
    }
    return {
        arm,
        millisecondsPerChunk: best,
        checksum,
        digest: digest.toString(16).padStart(8, '0'),
        octaveSamplesPerChunk: octaveSamples.count / CHUNKS.length,
        cellsPerChunk,
        compileMilliseconds,
        compileHeapBytes,
        generatedFunctionCount: compileState.generatedFunctionCount,
        generatedFunctionBytes: compileState.generatedFunctionBytes,
        closureFallbackCount: compileState.closureFallbackCount
    };
};

process.stdout.write(`${JSON.stringify(run(requested))}\n`);
