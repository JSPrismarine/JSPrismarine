import { javaIdentifierToBedrock } from '@jsprismarine/mapping';
import type { ClimateTargetPoint } from '@jsprismarine/worldgen';
import { ClimateParameterList, MultiNoiseBiomeSource, quantizeClimateCoord } from '@jsprismarine/worldgen';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import { loadJavaBiomePoints, loadNetworkBiomes, unpackClimatePoint } from './goldens.ts';
import { describeFamily } from './measure.ts';
import { reportParityProgress } from './progress.ts';
import { REFERENCES } from './references.ts';

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
const compareBiomeSource = (): { gaps: string[]; lookups: number; boxes: number; detail: string[] } => {
    const vectors = loadJavaBiomePoints();
    const advertised = new Set(loadNetworkBiomes().map((biome) => biome.name));
    const gaps: string[] = [];
    const detail: string[] = [];
    let lookups = 0;
    let boxes = 0;

    for (const list of vectors.parameterLists) {
        const entries = list.points.map((packed) => unpackClimatePoint(packed, list.biomes));
        boxes += entries.length;
        const source = new MultiNoiseBiomeSource(new ClimateParameterList(entries));

        list.lookups.forEach((lookup, index) => {
            lookups += 1;
            // The dumper writes targets already quantized, which is the unit the search tree
            // works in, so they go in as they are rather than through `climateTarget`.
            const found = source.parameters.find(targetOf(lookup.target));
            if (found === lookup.tree) return;
            gaps.push(`lookup:${list.name}#${index}`);
            detail.push(`${list.name} target ${lookup.target.join(',')}: server ${found}, Java ${lookup.tree}`);
        });

        for (const biome of list.biomes) {
            const mapped = javaIdentifierToBedrock('biome', biome);
            if (mapped.kind === 'mapped' && advertised.has(mapped.bedrock)) continue;
            gaps.push(`unadvertised:${biome}`);
        }
    }

    return { gaps: [...new Set(gaps)], lookups, boxes, detail };
};

describeFamily(FAMILIES.worldgenBiomes, [REFERENCES.worldgenBiomePoints, REFERENCES.bedrockBiomeDefinitions], () => {
    const { gaps, lookups, boxes, detail } = compareBiomeSource();
    const verdict = checkAllowList(FAMILIES.worldgenBiomes, gaps);

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
});
