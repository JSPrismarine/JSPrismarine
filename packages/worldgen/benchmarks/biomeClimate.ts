import registryVectors from '../vectors/surface-registries.json' with { type: 'json' };
import biomeVectors from '../vectors/biome-points.json' with { type: 'json' };
import type { DensitySampler } from '../src/density/compile';
import type { DensityFunctionNode } from '../src/density/DensityFunction';
import { SampleContext } from '../src/density/SampleContext';
import { ClimateParameterList, climateTarget } from '../src/biome/Climate';
import { createClimateSampler } from '../src/biome/ClimateSampler';
import { RandomState } from '../src/RandomState';
import { NoiseStack } from '../src/noise/NoiseStack';
import { WorldgenData } from '../src/WorldgenData';

const PARAMETERS = ['temperature', 'humidity', 'continents', 'erosion', 'depth', 'ridges'] as const;
type Parameter = (typeof PARAMETERS)[number];
type ParameterCounts = Record<Parameter, number>;

const parseDocuments = (source: Record<string, string>): Map<string, unknown> =>
    new Map(Object.entries(source).map(([id, document]) => [id, JSON.parse(document) as unknown]));

const data = new WorldgenData({
    densityFunctions: parseDocuments(registryVectors.densityFunctions),
    noises: parseDocuments(registryVectors.noises),
    noiseSettings: parseDocuments(registryVectors.noiseSettings)
});
const settings = data.settings('minecraft:overworld');
const router = settings.noiseRouter;
const nodes = [
    router.temperature,
    router.vegetation,
    router.continents,
    router.erosion,
    router.depth,
    router.ridges
] as const;
const entries = biomeVectors.parameterLists
    .find((list) => list.name === 'minecraft:overworld')
    ?.points.map((row) => {
        const values = row.split(' ').map(Number);
        const at = (index: number): number => values[index] ?? 0;
        const range = (index: number) => ({ min: at(index), max: at(index + 1) });
        return {
            point: {
                temperature: range(1),
                humidity: range(3),
                continentalness: range(5),
                erosion: range(7),
                depth: range(9),
                weirdness: range(11),
                offset: at(13)
            },
            value: String(at(0))
        };
    });
if (!entries) throw new Error('Biome vector file has no overworld parameter list');
const biomes = new ClimateParameterList(entries);

const emptyCounts = (): ParameterCounts => ({
    temperature: 0,
    humidity: 0,
    continents: 0,
    erosion: 0,
    depth: 0,
    ridges: 0
});

interface RunState {
    readonly sampleCached: (quartX: number, quartY: number, quartZ: number) => ReturnType<typeof climateTarget>;
    readonly sampleDirect: (quartX: number, quartY: number, quartZ: number) => ReturnType<typeof climateTarget>;
    readonly sampledParameters: ParameterCounts;
    readonly octaveSamples: ParameterCounts;
}

const instrument = (): RunState => {
    const state = new RandomState(data, 1234n, settings);
    const sampledParameters = emptyCounts();
    const octaveSamples = emptyCounts();
    let activeParameter: Parameter | undefined;
    const byNode = new Map<DensityFunctionNode, Parameter>(
        nodes.map((node, index) => [node, PARAMETERS[index] as Parameter])
    );
    const rootSamplers = new Map<Parameter, DensitySampler>();
    const originalSampler = state.sampler.bind(state);

    Object.defineProperty(state, 'sampler', {
        value: (node: DensityFunctionNode): DensitySampler => {
            const parameter = byNode.get(node);
            const sampler = originalSampler(node);
            if (!parameter) return sampler;
            const wrapped: DensitySampler = (context, x, y, z) => {
                sampledParameters[parameter]++;
                const previous = activeParameter;
                activeParameter = parameter;
                try {
                    return sampler(context, x, y, z);
                } finally {
                    activeParameter = previous;
                }
            };
            rootSamplers.set(parameter, wrapped);
            return wrapped;
        }
    });

    const countedOctaves = new Set<object>();
    for (const id of data.noiseIds) {
        const stack = state.noise(id);
        if (!(stack instanceof NoiseStack)) continue;
        for (const layer of stack.layers) {
            const octave = layer.noise;
            if (countedOctaves.has(octave)) continue;
            countedOctaves.add(octave);
            const get3 = octave.get3.bind(octave);
            const get2 = octave.get2.bind(octave);
            Object.defineProperty(octave, 'get3', {
                configurable: true,
                value: (x: number, y: number, z: number) => {
                    if (activeParameter) octaveSamples[activeParameter]++;
                    return get3(x, y, z);
                }
            });
            Object.defineProperty(octave, 'get2', {
                configurable: true,
                value: (x: number, z: number) => {
                    if (activeParameter) octaveSamples[activeParameter]++;
                    return get2(x, z);
                }
            });
        }
    }

    const context = new SampleContext();
    const cached = createClimateSampler(state, context);
    const sampleDirect = (quartX: number, quartY: number, quartZ: number) => {
        const x = quartX * 4;
        const y = quartY * 4;
        const z = quartZ * 4;
        const sample = (parameter: Parameter): number => {
            const sampler = rootSamplers.get(parameter);
            if (!sampler) throw new Error(`Climate sampler did not compile ${parameter}`);
            return sampler(context, x, y, z);
        };
        return climateTarget(
            sample('temperature'),
            sample('humidity'),
            sample('continents'),
            sample('erosion'),
            sample('depth'),
            sample('ridges')
        );
    };
    return {
        sampleCached: (x, y, z) => cached.sample(x, y, z),
        sampleDirect,
        sampledParameters,
        octaveSamples
    };
};

const CHUNK_COLUMNS = 16 * 16;
const QUART_HEIGHT = 96;
const WARMUPS = 1;
const REPETITIONS = 2;
const hashWord = (hash: number, word: number): number => Math.imul(hash ^ word, 16777619) >>> 0;
const hashText = (hash: number, text: string): number => {
    let result = hash;
    for (let index = 0; index < text.length; index++) result = hashWord(result, text.charCodeAt(index));
    return hashWord(result, 0xff);
};
const measure = (run: RunState, cached: boolean): { milliseconds: number; digest: string; searches: number } => {
    let best = Number.POSITIVE_INFINITY;
    let digest = 2166136261;
    let searches = 0;
    for (let repetition = 0; repetition < WARMUPS + REPETITIONS; repetition++) {
        const started = performance.now();
        let currentDigest = 2166136261;
        let currentSearches = 0;
        for (let column = 0; column < CHUNK_COLUMNS; column++) {
            const quartX = -128 + (column % 16);
            const quartZ = -144 + Math.floor(column / 16);
            for (let quartY = -64; quartY < -64 + QUART_HEIGHT; quartY++) {
                const target = cached
                    ? run.sampleCached(quartX, quartY, quartZ)
                    : run.sampleDirect(quartX, quartY, quartZ);
                currentDigest = hashWord(currentDigest, target.temperature);
                currentDigest = hashWord(currentDigest, target.humidity);
                currentDigest = hashWord(currentDigest, target.continentalness);
                currentDigest = hashWord(currentDigest, target.erosion);
                currentDigest = hashWord(currentDigest, target.depth);
                currentDigest = hashWord(currentDigest, target.weirdness);
                currentDigest = hashText(currentDigest, biomes.find(target));
                currentSearches++;
            }
        }
        digest = currentDigest;
        if (repetition >= WARMUPS) searches += currentSearches;
        const elapsed = performance.now() - started;
        if (repetition >= WARMUPS) best = Math.min(best, elapsed);
    }
    return { milliseconds: best, digest: digest.toString(16).padStart(8, '0'), searches };
};

const cached = instrument();
const direct = instrument();
const cachedResult = measure(cached, true);
const directResult = measure(direct, false);
if (cachedResult.digest !== directResult.digest) throw new Error('Cached climate samples changed the output digest');

process.stdout.write(`samples per column: ${QUART_HEIGHT}\n`);
process.stdout.write(
    `cached: ${cachedResult.milliseconds.toFixed(2)} ms, ${cachedResult.searches} climate searches, ` +
        `digest ${cachedResult.digest}\n`
);
process.stdout.write(
    `direct: ${directResult.milliseconds.toFixed(2)} ms, ${directResult.searches} climate searches, ` +
        `digest ${directResult.digest}\n`
);
for (const parameter of PARAMETERS) {
    process.stdout.write(
        `${parameter.padEnd(13)} root calls ${cached.sampledParameters[parameter]} cached / ` +
            `${direct.sampledParameters[parameter]} direct; octave samples ${cached.octaveSamples[parameter]} cached / ` +
            `${direct.octaveSamples[parameter]} direct\n`
    );
}
