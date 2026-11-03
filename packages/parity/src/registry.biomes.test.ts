import { describe, expect, it } from 'vitest';

import { FAMILIES } from './families.ts';
import { checkAllowList } from './allowlist.ts';
import { loadBiomeDefinitions, loadNetworkBiomes } from './goldens.ts';
import { reportParityProgress } from './progress.ts';
import { reportParityCases } from './trackerCases.ts';

/** The submodule dump keys biomes as `minecraft:<name>`; the network string table drops the namespace. */
const stripNamespace = (name: string): string => name.replace(/^minecraft:/, '');

/**
 * Compares the biome list the server replays as `BiomeDefinitionListPacket` (the 1.26.51
 * capture) against the submodule's `biome_definitions.json` dump: same biome names, and the
 * climate values the packet carries agree with the dump within float precision.
 *
 * Gap ids: `capture-only:<name>`, `dump-only:<name>`, `climate:<name>`.
 */
interface BiomeRegistryCase {
    readonly id: string;
    readonly title: string;
    readonly gaps: string[];
}

const compareBiomes = (): { gaps: string[]; cases: BiomeRegistryCase[] } => {
    const network = loadNetworkBiomes();
    const dump = loadBiomeDefinitions();
    const gaps: string[] = [];
    const caseMap = new Map<string, BiomeRegistryCase>();
    for (const biome of network) {
        const id = stripNamespace(biome.name);
        if (!caseMap.has(id)) caseMap.set(id, { id: biome.name, title: biome.name, gaps: [] });
    }

    const dumpByName = new Map(Object.entries(dump).map(([name, biome]) => [stripNamespace(name), biome]));
    const networkNames = new Set(network.map((biome) => stripNamespace(biome.name)));

    for (const biome of network) {
        if (!dumpByName.has(stripNamespace(biome.name))) {
            const gap = `capture-only:${biome.name}`;
            gaps.push(gap);
            caseMap.get(stripNamespace(biome.name))?.gaps.push(gap);
        }
    }
    for (const name of dumpByName.keys()) {
        if (!networkNames.has(name)) {
            const id = `minecraft:${name}`;
            const gap = `dump-only:${name}`;
            gaps.push(gap);
            caseMap.set(name, { id, title: id, gaps: [gap] });
        }
    }

    for (const biome of network) {
        const dumped = dumpByName.get(stripNamespace(biome.name));
        if (!dumped) continue;
        const agrees =
            Math.abs(dumped.temperature - biome.temperature) < 1e-6 &&
            Math.abs(dumped.downfall - biome.downfall) < 1e-6;
        if (!agrees) {
            const gap = `climate:${biome.name}`;
            gaps.push(gap);
            caseMap.get(stripNamespace(biome.name))?.gaps.push(gap);
        }
    }

    return { gaps, cases: [...caseMap.values()] };
};

describe(FAMILIES.registryBiomes, () => {
    const comparison = compareBiomes();
    const verdict = checkAllowList(FAMILIES.registryBiomes, comparison.gaps);
    const unexpected = new Set(verdict.unexpected);

    reportParityCases(
        FAMILIES.registryBiomes,
        import.meta.filename,
        comparison.cases.map(({ id, title, gaps }) => ({
            id,
            title,
            context: 'Bedrock biome packet against biome definitions and climate data',
            status: gaps.some((gap) => unexpected.has(gap)) ? 'failed' : 'passed',
            ...(gaps.length === 0 ? {} : { details: gaps.join(', ') })
        }))
    );

    it('replays the biome list the dump describes, with agreeing climate values', () => {
        expect(verdict.unexpected).toEqual([]);
    });

    it('carries no stale allow-list entry', () => {
        expect(verdict.stale).toEqual([]);
    });

    it('reports the current vanilla biome catalog size', () => {
        const biomes = loadNetworkBiomes();
        reportParityProgress(FAMILIES.registryBiomes, {
            capturedBiomes: biomes.length,
            dumpedBiomes: Object.keys(loadBiomeDefinitions()).length
        });
        expect(biomes.length).toBeGreaterThan(0);
    });
});
