/**
 * One arm of the terrain fill benchmark, measured in its own process.
 *
 * `benchmarks/run.mts` bundles this file and spawns it once per arm per round, interleaved, so
 * a load spike lands on both arms rather than on one. Each process reports the best of its own
 * repetitions, which is the closest an occupied machine gets to an idle one.
 *
 * Arms:
 * - `fill`: the whole fill the generator does, density and aquifer, block by block.
 * - `density`: the density pass alone, so a change can be charged to one half or the other.
 */
import registryVectors from '../vectors/surface-registries.json' with { type: 'json' };
import { CHUNK_SIZE, ChunkSampler } from '../src/chunk/ChunkSampler';
import { RandomState } from '../src/RandomState';
import { WorldgenData } from '../src/WorldgenData';

/** The arms this file knows how to run. */
export type BenchmarkArm = 'density' | 'fill';

const ARMS: readonly BenchmarkArm[] = ['fill', 'density'];

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

const state = new RandomState(data, 1234n, data.settings('minecraft:overworld'));

/** Walks every block of a chunk the way the generator does, and counts what it placed. */
const fillChunk = (sampler: ChunkSampler): number => {
    let placed = 0;
    for (let cell = 0; cell < sampler.cellCount; cell++) {
        sampler.forEachCellBlock(cell, (_x, _y, _z, block) => {
            if (block !== 'minecraft:air') placed++;
        });
    }
    return placed;
};

// The interpolation cell the density arm walks, so it crosses a cell boundary as rarely as
// `forEachCellBlock` does. A column walk refetches eight corners every eight blocks and would
// charge the density pass for an order the generator stopped using.
const cell = state.interpolationCellSize ?? { xz: CHUNK_SIZE, y: 384 };

/** Reads the density of every block of a chunk, cell by cell, with no aquifer. */
const fillDensity = (sampler: ChunkSampler): number => {
    const { minBlockX, minBlockY, minBlockZ, maxBlockY } = sampler.volume;
    let solid = 0;
    for (let firstZ = minBlockZ; firstZ < minBlockZ + CHUNK_SIZE; firstZ += cell.xz) {
        for (let firstX = minBlockX; firstX < minBlockX + CHUNK_SIZE; firstX += cell.xz) {
            for (let lastY = maxBlockY; lastY >= minBlockY; lastY -= cell.y) {
                for (let x = firstX; x < firstX + cell.xz; x++) {
                    for (let z = firstZ; z < firstZ + cell.xz; z++) {
                        for (let y = lastY; y > Math.max(minBlockY - 1, lastY - cell.y); y--) {
                            if (sampler.density(x, y, z) > 0) solid++;
                        }
                    }
                }
            }
        }
    }
    return solid;
};

const run = (arm: BenchmarkArm): { arm: BenchmarkArm; millisecondsPerChunk: number; checksum: number } => {
    const walk = arm === 'fill' ? fillChunk : fillDensity;

    let checksum = 0;
    let best = Number.POSITIVE_INFINITY;
    for (let round = 0; round < WARMUPS + REPETITIONS; round++) {
        const started = performance.now();
        for (const [chunkX, chunkZ] of CHUNKS) {
            checksum += walk(new ChunkSampler(state, { chunkX, chunkZ }));
        }
        const elapsed = (performance.now() - started) / CHUNKS.length;
        if (round >= WARMUPS) best = Math.min(best, elapsed);
    }
    return { arm, millisecondsPerChunk: best, checksum };
};

const requested = ARMS.find((arm) => arm === process.argv[2]);
if (!requested) throw new RangeError(`Pass one of ${ARMS.join(', ')}, not ${process.argv[2]}`);
process.stdout.write(`${JSON.stringify(run(requested))}\n`);
