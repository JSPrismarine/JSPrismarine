import { javaIdentifierToBedrock } from '@jsprismarine/mapping';
import type { CarverConfig, ClimateTargetPoint } from '@jsprismarine/worldgen';
import {
    BiomeManager,
    ClimateParameterList,
    MultiNoiseBiomeSource,
    RandomState,
    WorldgenData,
    carversFromNoiseBiome,
    createClimateSampler,
    parseCarver,
    quantizeClimateCoord
} from '@jsprismarine/worldgen';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import {
    loadJavaBiomePoints,
    loadJavaCarverBiomes,
    loadJavaWorldgenRegistries,
    loadNetworkBiomes,
    unpackClimatePoint
} from './goldens.ts';
import { describeFamily } from './measure.ts';
import { reportParityProgress } from './progress.ts';
import { REFERENCES } from './references.ts';
import { reportParityCases } from './trackerCases.ts';

/** Reads one dumped target, which the oracle writes in quantized units already. */
const targetOf = (values: readonly number[]): ClimateTargetPoint => ({
    temperature: values[0] ?? 0,
    humidity: values[1] ?? 0,
    continentalness: values[2] ?? 0,
    erosion: values[3] ?? 0,
    depth: values[4] ?? 0,
    weirdness: values[5] ?? 0
});

/**
 * Phase 4's biome half: the multi-noise biome source against Java's own answers.
 *
 * The oracle dumped every climate parameter box of the overworld and nether lists and then
 * asked Java which biome a set of sampled climates lands in. This replays those queries
 * through the server's search tree and checks it returns the same biome, then checks the biome
 * can reach a Bedrock client at all by resolving it through the mapping onto a biome the
 * `BiomeDefinitionListPacket` capture advertises.
 *
 * Gap ids: `lookup:<list>#<index>` where the server picks a different biome from Java, and
 * `unadvertised:<java biome>` where the biome does not resolve onto one the client is told
 * about.
 */
interface BiomeParityCase {
    readonly id: string;
    lookups: number;
    readonly gaps: string[];
}

const compareBiomeSource = (): {
    gaps: string[];
    lookups: number;
    boxes: number;
    detail: string[];
    cases: BiomeParityCase[];
} => {
    const vectors = loadJavaBiomePoints();
    const advertised = new Set(loadNetworkBiomes().map((biome) => biome.name));
    const gaps: string[] = [];
    const detail: string[] = [];
    const caseMap = new Map<string, BiomeParityCase>();
    let lookups = 0;
    let boxes = 0;

    for (const list of vectors.parameterLists) {
        const entries = list.points.map((packed) => unpackClimatePoint(packed, list.biomes));
        boxes += entries.length;
        const source = new MultiNoiseBiomeSource(new ClimateParameterList(entries));

        for (const biome of list.biomes) {
            if (!caseMap.has(biome)) caseMap.set(biome, { id: biome, lookups: 0, gaps: [] });
        }

        list.lookups.forEach((lookup, index) => {
            lookups += 1;
            const parityCase = caseMap.get(lookup.tree);
            if (parityCase !== undefined) parityCase.lookups += 1;
            // The dumper writes targets already quantized, which is the unit the search tree
            // works in, so they go in as they are rather than through `climateTarget`.
            const found = source.parameters.find(targetOf(lookup.target));
            if (found === lookup.tree) return;
            const gap = `lookup:${list.name}#${index}`;
            gaps.push(gap);
            parityCase?.gaps.push(gap);
            detail.push(`${list.name} target ${lookup.target.join(',')}: server ${found}, Java ${lookup.tree}`);
        });

        for (const biome of list.biomes) {
            const mapped = javaIdentifierToBedrock('biome', biome);
            if (mapped.kind === 'mapped' && advertised.has(mapped.bedrock)) continue;
            const gap = `unadvertised:${biome}`;
            gaps.push(gap);
            caseMap.get(biome)?.gaps.push(gap);
        }
    }

    return { gaps: [...new Set(gaps)], lookups, boxes, detail, cases: [...caseMap.values()] };
};

/** The overworld list and a sampler for the oracle's seed, built from the committed vectors. */
const overworldAt = (seed: bigint) => {
    const vectors = loadJavaBiomePoints();
    const list = vectors.parameterLists.find((candidate) => candidate.name === 'minecraft:overworld');
    if (list === undefined) throw new Error('the biome vector file has no overworld parameter list');
    const entries = list.points.map((packed) => unpackClimatePoint(packed, list.biomes));

    const registries = loadJavaWorldgenRegistries();
    const parse = (documents: Record<string, string>): Map<string, unknown> =>
        // The oracle writes each registry document as one line of JSON.
        new Map(Object.entries(documents).map(([id, document]) => [id, JSON.parse(document) as unknown]));
    const data = new WorldgenData({
        densityFunctions: parse(registries.densityFunctions),
        noises: parse(registries.noises),
        noiseSettings: parse(registries.noiseSettings)
    });
    const state = new RandomState(data, seed, data.settings('minecraft:overworld'));
    return { entries, registries, sampler: createClimateSampler(state) };
};

const needs = [REFERENCES.worldgenBiomePoints, REFERENCES.worldgenCarverBiomes, REFERENCES.bedrockBiomeDefinitions];

describeFamily(FAMILIES.worldgenBiomes, needs, () => {
    const { gaps, lookups, boxes, detail, cases } = compareBiomeSource();
    const verdict = checkAllowList(FAMILIES.worldgenBiomes, gaps);
    const unexpected = new Set(verdict.unexpected);

    reportParityCases(
        FAMILIES.worldgenBiomes,
        import.meta.filename,
        cases.map(({ id, lookups: lookupCount, gaps: caseGaps }) => ({
            id,
            title: id,
            context: `Java biome climate lookup · ${lookupCount} sampled targets`,
            status: caseGaps.some((gap) => unexpected.has(gap)) ? 'failed' : 'passed',
            ...(caseGaps.length === 0 ? {} : { details: caseGaps.join(', ') })
        }))
    );

    it('picks the biome Java picks, and one a Bedrock client is told about', () => {
        expect(verdict.unexpected, detail.join('\n')).toEqual([]);
    });

    it('carries no stale allow-list entry', () => {
        expect(verdict.stale).toEqual([]);
    });

    it("quantizes a climate coordinate the way Java's float arithmetic does", () => {
        // A double product lands 0.0003 on 2 where a float lands it on 3, which moves a biome
        // edge by one cell. The oracle recorded Java's answers, so this is a value comparison.
        for (const entry of loadJavaBiomePoints().quantizeCoord) {
            expect(quantizeClimateCoord(entry.value)).toBe(entry.quantized);
        }
    });

    it("replays Java's whole lookup dump rather than a sample", () => {
        const vectors = loadJavaBiomePoints();
        const expectedLookups = vectors.parameterLists.reduce((total, list) => total + list.lookups.length, 0);
        const expectedBoxes = vectors.parameterLists.reduce((total, list) => total + list.points.length, 0);

        reportParityProgress(FAMILIES.worldgenBiomes, { javaLookupPoints: lookups, javaParameterBoxes: boxes });
        expect(vectors.parameterLists.length).toBeGreaterThan(0);
        expect(lookups).toBe(expectedLookups);
        expect(boxes).toBe(expectedBoxes);
    });

    it("selects a data pack's carvers from the noise biome Java reads, not the jittered one", () => {
        const vectors = loadJavaCarverBiomes();
        const { entries, registries, sampler } = overworldAt(BigInt(vectors.seed));
        const noiseBiome = new MultiNoiseBiomeSource(new ClimateParameterList(entries)).resolver(sampler);

        // A data pack whose biomes list different carvers: every other biome digs canyons.
        const cave = parseCarver(JSON.parse(registries.carvers['minecraft:cave'] as string) as unknown, 'cave');
        const canyon = parseCarver(JSON.parse(registries.carvers['minecraft:canyon'] as string) as unknown, 'canyon');
        const carversOf = (biome: string): readonly CarverConfig[] =>
            vectors.biomes.indexOf(biome) % 2 === 0 ? [cave] : [canyon];

        const carversAt = carversFromNoiseBiome(noiseBiome, carversOf);
        let differsFromJittered = 0;
        let compared = 0;
        vectors.noise.forEach((javaNoise, index) => {
            const chunkX = vectors.firstChunk + Math.floor(index / vectors.chunks);
            const chunkZ = vectors.firstChunk + (index % vectors.chunks);
            const expected = carversOf(vectors.biomes[javaNoise] as string);
            expect(carversAt(chunkX, chunkZ), `chunk ${chunkX},${chunkZ}`).toEqual(expected);
            if (carversOf(vectors.biomes[vectors.jittered[index] as number] as string)[0] !== expected[0]) {
                differsFromJittered++;
            }
            compared++;
        });

        // The window has to hold chunks where the jittered biome would pick other carvers.
        expect(differsFromJittered).toBeGreaterThan(0);
        // `BiomeManager` keeps matching Java at the corner, so the two lookups stay distinguishable.
        const manager = new BiomeManager(noiseBiome, BiomeManager.obfuscateSeed(BigInt(vectors.seed)));
        const moved = vectors.noise.findIndex((javaNoise, index) => javaNoise !== vectors.jittered[index]);
        const movedBiome = vectors.biomes[vectors.jittered[moved] as number];
        expect(
            manager.getBiome(
                (vectors.firstChunk + Math.floor(moved / vectors.chunks)) * 16,
                0,
                (vectors.firstChunk + (moved % vectors.chunks)) * 16
            )
        ).toBe(movedBiome);
        reportParityProgress(FAMILIES.worldgenBiomes, { javaCarverChunks: compared });
    });
});
