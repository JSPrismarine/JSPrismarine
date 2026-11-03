import { performance } from 'node:perf_hooks';

import { GenerationRegion } from '../src/world/generators/datadriven/GenerationRegion';
import { createJavaBlockOracle } from '../src/world/generators/datadriven/javaBlockOracle';

const WRITE_COUNT = 60_000;
const STONE = 'minecraft:stone';
const DIRT = 'minecraft:dirt';
const GRAVEL = 'minecraft:gravel';

type PaletteSlotForName = (name: string) => number;

const isPaletteSlotForName = (value: unknown): value is PaletteSlotForName => typeof value === 'function';

interface Measurement {
    readonly milliseconds: number;
    readonly paletteResolutions: number;
    readonly digest: string;
}

interface WriteMeasurement extends Measurement {
    readonly writes: number;
}

const makeRegion = (): GenerationRegion =>
    new GenerationRegion({
        chunkX: 0,
        chunkZ: 0,
        minY: -64,
        height: 384,
        radius: 0,
        seaLevel: 63,
        seed: 1234n,
        blocks: createJavaBlockOracle(new Map()),
        biomeAt: () => 'minecraft:plains'
    });

const runTerrain = (useTerrainWriter: boolean): Measurement => {
    const region = makeRegion();
    let paletteResolutions = 0;
    // Count palette lookup work without putting benchmark instrumentation in the region API.
    const rawLookup: unknown = Reflect.get(region, 'paletteSlotForName');
    if (!isPaletteSlotForName(rawLookup)) throw new Error('GenerationRegion palette lookup target is missing');
    const lookup = rawLookup.bind(region);
    Object.defineProperty(region, 'paletteSlotForName', {
        configurable: true,
        value: (name: string) => {
            paletteResolutions++;
            return lookup(name);
        }
    });

    const writeTerrain = useTerrainWriter ? region.createTerrainNameWriter() : undefined;
    const started = performance.now();
    for (let write = 0; write < WRITE_COUNT; write++) {
        const column = Math.floor(write / 384);
        const x = column & 15;
        const z = column >>> 4;
        const y = -64 + (write % 384);
        const name = y < 0 ? STONE : y < 24 ? DIRT : column % 11 === 0 ? GRAVEL : STONE;
        if (writeTerrain === undefined) region.writeName(x, y, z, name);
        else writeTerrain(x, y, z, name);
    }
    const milliseconds = performance.now() - started;

    let digest = 2_166_136_261;
    for (const slot of region.centerBlockSlots().slots) {
        digest = Math.imul(digest ^ slot, 16_777_619) >>> 0;
    }
    return { milliseconds, paletteResolutions, digest: digest.toString(16).padStart(8, '0') };
};

const runSurface = (useFastSurfacePath: boolean): WriteMeasurement => {
    const region = makeRegion();
    const surface = useFastSurfacePath ? region.surfaceChunk() : undefined;
    // This reproduces the former surface bridge: memoize a name-only BlockState, then call write.
    const states = new Map<string, { readonly name: string; readonly properties: Record<string, never> }>();
    const writeLegacySurface = (x: number, y: number, z: number, name: string): void => {
        let state = states.get(name);
        if (state === undefined) {
            state = { name, properties: {} };
            states.set(name, state);
        }
        region.write(x, y, z, state);
    };
    let digest = 2_166_136_261;
    const started = performance.now();
    for (let write = 0; write < WRITE_COUNT; write++) {
        const column = Math.floor(write / 384);
        const x = column & 15;
        const z = column >>> 4;
        const y = -64 + (write % 384);
        const name = y < 0 ? STONE : y < 24 ? DIRT : column % 11 === 0 ? GRAVEL : STONE;
        if (surface !== undefined) surface.setBlock(x, y, z, name);
        else writeLegacySurface(x, y, z, name);
    }
    const milliseconds = performance.now() - started;
    for (const slot of region.centerBlockSlots().slots) {
        digest = Math.imul(digest ^ slot, 16_777_619) >>> 0;
    }
    return {
        milliseconds,
        paletteResolutions: states.size,
        digest: digest.toString(16).padStart(8, '0'),
        writes: WRITE_COUNT
    };
};

const measureBest = (run: () => Measurement): Measurement => {
    for (let warmup = 0; warmup < 2; warmup++) run();

    let best: Measurement | undefined;
    for (let repetition = 0; repetition < 3; repetition++) {
        const measurement = run();
        if (best === undefined || measurement.milliseconds < best.milliseconds) best = measurement;
    }
    if (best === undefined) throw new Error('Terrain-write benchmark completed no runs');
    return best;
};

const before = measureBest(() => runTerrain(false));
const after = measureBest(() => runTerrain(true));
if (before.digest !== after.digest)
    throw new Error(`Terrain-write digest changed: ${before.digest} != ${after.digest}`);

process.stdout.write(`terrain name writes: ${WRITE_COUNT}\n`);
process.stdout.write(`palette resolutions before: ${before.paletteResolutions}\n`);
process.stdout.write(`palette resolutions after: ${after.paletteResolutions}\n`);
process.stdout.write(`best CPU time before: ${before.milliseconds.toFixed(2)} ms\n`);
process.stdout.write(`best CPU time after: ${after.milliseconds.toFixed(2)} ms\n`);
process.stdout.write(`digest: ${after.digest}\n`);

const surfaceBefore = measureBest(() => runSurface(false));
const surfaceAfter = measureBest(() => runSurface(true));
if (surfaceBefore.digest !== surfaceAfter.digest) {
    throw new Error(`Surface-write digest changed: ${surfaceBefore.digest} != ${surfaceAfter.digest}`);
}
process.stdout.write(`surface rule writes: ${surfaceAfter.writes}\n`);
process.stdout.write(`best surface CPU time before: ${surfaceBefore.milliseconds.toFixed(2)} ms\n`);
process.stdout.write(`best surface CPU time after: ${surfaceAfter.milliseconds.toFixed(2)} ms\n`);
process.stdout.write(`surface digest: ${surfaceAfter.digest}\n`);
