import { expect, it } from 'vitest';

import { FAMILIES } from './families.ts';
import { checkAllowList } from './allowlist.ts';
import { loadBehaviorPackBiomes, loadNetworkBiomes } from './goldens.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';
import { reportParityProgress } from './progress.ts';
import { reportParityCases } from './trackerCases.ts';

/** The biome files name biomes `minecraft:<name>`; the network string table drops the namespace. */
const stripNamespace = (name: string): string => name.replace(/^minecraft:/, '');

/**
 * Compares the biome list the server replays as `BiomeDefinitionListPacket` (the 1.26.51
 * capture) against the biome files of Mojang's vanilla behavior pack: same biome names, and the
 * climate values the packet carries agree with each file's `minecraft:climate` within float
 * precision.
 *
 * Gap ids: `capture-only:<name>`, `samples-only:<name>`, `climate:<name>`.
 */
interface BiomeRegistryCase {
    readonly id: string;
    readonly title: string;
    readonly gaps: string[];
}

const compareBiomes = (samplesRoot: string): { gaps: string[]; cases: BiomeRegistryCase[] } => {
    const network = loadNetworkBiomes();
    const samples = loadBehaviorPackBiomes(samplesRoot);
    const gaps: string[] = [];
    const caseMap = new Map<string, BiomeRegistryCase>();
    for (const biome of network) {
        const id = stripNamespace(biome.name);
        if (!caseMap.has(id)) caseMap.set(id, { id: biome.name, title: biome.name, gaps: [] });
    }

    const samplesByName = new Map(Object.entries(samples).map(([name, biome]) => [stripNamespace(name), biome]));
    const networkNames = new Set(network.map((biome) => stripNamespace(biome.name)));

    for (const biome of network) {
        if (!samplesByName.has(stripNamespace(biome.name))) {
            const gap = `capture-only:${biome.name}`;
            gaps.push(gap);
            caseMap.get(stripNamespace(biome.name))?.gaps.push(gap);
        }
    }
    for (const name of samplesByName.keys()) {
        if (!networkNames.has(name)) {
            const id = `minecraft:${name}`;
            const gap = `samples-only:${name}`;
            gaps.push(gap);
            caseMap.set(name, { id, title: id, gaps: [gap] });
        }
    }

    for (const biome of network) {
        const declared = samplesByName.get(stripNamespace(biome.name));
        if (!declared) continue;
        const agrees =
            Math.abs(declared.temperature - biome.temperature) < 1e-6 &&
            Math.abs(declared.downfall - biome.downfall) < 1e-6;
        if (!agrees) {
            const gap = `climate:${biome.name}`;
            gaps.push(gap);
            caseMap.get(stripNamespace(biome.name))?.gaps.push(gap);
        }
    }

    return { gaps, cases: [...caseMap.values()] };
};

describeFamily(FAMILIES.registryBiomes, [REFERENCES.bedrockBehaviorPack], () => {
    // describeFamily runs this body only once the reference is located.
    const samplesRoot = REFERENCES.bedrockBehaviorPack.locate() ?? '';
    const comparison = compareBiomes(samplesRoot);
    const verdict = checkAllowList(FAMILIES.registryBiomes, comparison.gaps);
    const unexpected = new Set(verdict.unexpected);

    reportParityCases(
        FAMILIES.registryBiomes,
        import.meta.filename,
        comparison.cases.map(({ id, title, gaps }) => ({
            id,
            title,
            context: 'Bedrock biome packet against the vanilla biome files and their climate',
            status: gaps.some((gap) => unexpected.has(gap)) ? 'failed' : 'passed',
            ...(gaps.length === 0 ? {} : { details: gaps.join(', ') })
        }))
    );

    it('replays the biome list the vanilla biome files describe, with agreeing climate values', () => {
        expect(verdict.unexpected).toEqual([]);
    });

    it('carries no stale allow-list entry', () => {
        expect(verdict.stale).toEqual([]);
    });

    it('reports the current vanilla biome catalog size', () => {
        const biomes = loadNetworkBiomes();
        reportParityProgress(FAMILIES.registryBiomes, {
            capturedBiomes: biomes.length,
            samplesBiomes: Object.keys(loadBehaviorPackBiomes(samplesRoot)).length
        });
        expect(biomes.length).toBeGreaterThan(0);
    });
});
