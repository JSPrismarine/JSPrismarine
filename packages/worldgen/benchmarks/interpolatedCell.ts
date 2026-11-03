import { performance } from 'node:perf_hooks';

import { DensityFunctionCompiler } from '../src/density/compile';
import type { CompileEnvironment } from '../src/density/compile';
import { parseDensityFunction } from '../src/density/parse';
import { SampleContext } from '../src/density/SampleContext';
import type { Noise } from '../src/noise/GradientNoise';
import { f32 } from '../src/math';
import { LegacyRandomSource } from '../src/random/LegacyRandomSource';

const CHUNK_BLOCKS = 16 * 16 * 384;
const INTERPOLATED_NODES = 5;
const CELL_VALUES = 4 * 8 * 4;
const CELL_COUNT = (16 / 4) * (16 / 4) * (384 / 8);
const random = (): LegacyRandomSource => new LegacyRandomSource(1234n);

let noiseEvaluations = 0;
const environment: CompileEnvironment = {
    noise: (id): Noise => {
        const offset = Number(id.split('_').at(-1) ?? 0);
        return {
            get3: (x, y, z) => {
                noiseEvaluations++;
                return f32(x * 0.125 + y * 0.25 + z * 0.375 + offset);
            },
            get2: (x, z) => {
                noiseEvaluations++;
                return f32(x * 0.125 + z * 0.375 + offset);
            }
        };
    },
    random,
    endIslandRandom: random
};

const interpolatedNodes = Array.from({ length: INTERPOLATED_NODES }, (_unused, index) => ({
    type: 'minecraft:interpolated',
    input: {
        type: 'minecraft:add',
        left: { type: 'minecraft:noise', noise: `benchmark_${index}` },
        right: {
            type: 'minecraft:gradient',
            axis: 'y',
            from_coordinate: -64,
            to_coordinate: 320,
            from_value: -1,
            to_value: 1
        }
    },
    cell_size_xz: 4,
    cell_size_y: 8
}));

const root = interpolatedNodes.reduce((left, right) =>
    left === undefined ? right : { type: 'minecraft:add', left, right }
);
const node = parseDensityFunction(root, (id) => {
    throw new RangeError(`Unexpected density reference ${id}`);
});

interface Measurement {
    readonly milliseconds: number;
    readonly noiseEvaluations: number;
    readonly digest: string;
}

const run = (precomputeInterpolationCells: boolean): Measurement => {
    const compiler = new DensityFunctionCompiler(environment, { precomputeInterpolationCells });
    const sampler = compiler.compile(node);
    const context = new SampleContext();
    context.interpolationBuffersEnabled = precomputeInterpolationCells;
    const bits = new DataView(new ArrayBuffer(4));
    let digest = 2_166_136_261;
    noiseEvaluations = 0;
    const started = performance.now();
    for (let cellY = 47; cellY >= 0; cellY--) {
        for (let cellX = 0; cellX < 4; cellX++) {
            for (let cellZ = 0; cellZ < 4; cellZ++) {
                for (let localX = 0; localX < 4; localX++) {
                    for (let localZ = 0; localZ < 4; localZ++) {
                        for (let localY = 7; localY >= 0; localY--) {
                            const x = cellX * 4 + localX;
                            const y = -64 + cellY * 8 + localY;
                            const z = cellZ * 4 + localZ;
                            bits.setFloat32(0, sampler(context, x, y, z), true);
                            digest = Math.imul(digest ^ bits.getUint32(0, true), 16_777_619) >>> 0;
                        }
                    }
                }
            }
        }
    }
    return {
        milliseconds: performance.now() - started,
        noiseEvaluations,
        digest: digest.toString(16).padStart(8, '0')
    };
};

const measureBest = (precomputeInterpolationCells: boolean): Measurement => {
    for (let warmup = 0; warmup < 2; warmup++) run(precomputeInterpolationCells);
    let best: Measurement | undefined;
    for (let repetition = 0; repetition < 3; repetition++) {
        const measurement = run(precomputeInterpolationCells);
        if (best === undefined || measurement.milliseconds < best.milliseconds) best = measurement;
    }
    if (best === undefined) throw new Error('Interpolation cell benchmark completed no runs');
    return best;
};

const scalar = measureBest(false);
const buffered = measureBest(true);
if (scalar.digest !== buffered.digest)
    throw new Error(`Chunk density digest changed: ${scalar.digest} != ${buffered.digest}`);

process.stdout.write(`chunk density samples: ${CHUNK_BLOCKS}\n`);
process.stdout.write(`interpolated nodes per sample: ${INTERPOLATED_NODES}\n`);
process.stdout.write(`interpolated node evaluations per arm: ${CHUNK_BLOCKS * INTERPOLATED_NODES}\n`);
process.stdout.write(`buffer fills per chunk: ${CELL_COUNT * INTERPOLATED_NODES}\n`);
process.stdout.write(`cell buffer value writes: ${CHUNK_BLOCKS * INTERPOLATED_NODES}\n`);
process.stdout.write(
    `reusable output buffer memory: ${INTERPOLATED_NODES * CELL_VALUES * Float64Array.BYTES_PER_ELEMENT} bytes\n`
);
process.stdout.write(`best scalar density time: ${scalar.milliseconds.toFixed(2)} ms\n`);
process.stdout.write(`best buffered density time: ${buffered.milliseconds.toFixed(2)} ms\n`);
process.stdout.write(`noise evaluations: ${scalar.noiseEvaluations} -> ${buffered.noiseEvaluations}\n`);
process.stdout.write(`digest: ${buffered.digest}\n`);
