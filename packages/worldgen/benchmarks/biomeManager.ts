import { performance } from 'node:perf_hooks';

import { BiomeManager } from '../src/biome/BiomeManager';

const LOOKUPS_PER_CHUNK = 134_994;
const BLOCKS_PER_COLUMN = 384;
const BIOME_A = 'benchmark:odd';
const BIOME_B = 'benchmark:even';
const resolver = (quartX: number, quartY: number, quartZ: number): string =>
    ((quartX ^ quartY ^ quartZ) & 1) === 0 ? BIOME_B : BIOME_A;

interface Measurement {
    readonly milliseconds: number;
    readonly jitterCalls: number;
    readonly digest: string;
}

type JitterAt = (pointX: number, pointY: number, pointZ: number) => number;

const isJitterAt = (value: unknown): value is JitterAt => typeof value === 'function';

const run = (): Measurement => {
    const manager = new BiomeManager(resolver, BiomeManager.obfuscateSeed(1234n));
    let jitterCalls = 0;
    // Instrument the private method at runtime so production code carries no benchmark counter.
    const jitterAt: unknown = Reflect.get(manager, 'jitterAt');
    if (!isJitterAt(jitterAt)) throw new Error('BiomeManager jitterAt instrumentation target is missing');
    const original = jitterAt.bind(manager);
    Object.defineProperty(manager, 'jitterAt', {
        configurable: true,
        value: (pointX: number, pointY: number, pointZ: number) => {
            jitterCalls++;
            return original(pointX, pointY, pointZ);
        }
    });

    let digest = 2_166_136_261;
    const started = performance.now();
    for (let query = 0; query < LOOKUPS_PER_CHUNK; query++) {
        const column = Math.floor(query / BLOCKS_PER_COLUMN) % 256;
        const x = -128 + (column & 15);
        const z = -144 + (column >>> 4);
        const y = -64 + (query % BLOCKS_PER_COLUMN);
        digest = Math.imul(digest ^ (manager.getBiome(x, y, z) === BIOME_A ? 1 : 2), 16_777_619) >>> 0;
    }
    return { milliseconds: performance.now() - started, jitterCalls, digest: digest.toString(16).padStart(8, '0') };
};

let best: Measurement | undefined;
for (let repetition = 0; repetition < 3; repetition++) {
    const measurement = run();
    if (best === undefined || measurement.milliseconds < best.milliseconds) best = measurement;
}
if (best === undefined) throw new Error('Biome manager benchmark completed no runs');

const previousJitterCalls = LOOKUPS_PER_CHUNK * 8;
const savedCalls = previousJitterCalls - best.jitterCalls;
process.stdout.write(`getBiome calls per terrain chunk: ${LOOKUPS_PER_CHUNK}\n`);
process.stdout.write(`jitterAt calls before: ${previousJitterCalls}\n`);
process.stdout.write(`jitterAt calls after: ${best.jitterCalls}\n`);
process.stdout.write(`jitterAt calls saved: ${savedCalls}\n`);
process.stdout.write(`best measured time: ${best.milliseconds.toFixed(2)} ms, digest ${best.digest}\n`);
