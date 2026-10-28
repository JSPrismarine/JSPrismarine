import type { MappedRegistry } from '@jsprismarine/mapping';
import { MAPPED_REGISTRIES, REGISTRY_LOSSES, javaIdentifierToBedrock } from '@jsprismarine/mapping';
import { registriesTable } from '@jsprismarine/mapping/tables';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import { loadNetworkBiomes } from './goldens.ts';
import { describeFamily } from './measure.ts';
import { reportParityProgress } from './progress.ts';
import { REFERENCES } from './references.ts';

/**
 * Chunker's totality property for the four registries beyond blocks, items and entities:
 * biome, enchantment, mob effect and potion. The biome half checks its outputs against the
 * `BiomeDefinitionListPacket` capture, which is the list a real client is told about. The other
 * three have no independent Bedrock capture in the repository, so they check totality and the
 * pinned name set only, and the row says so rather than implying a capture stood behind it.
 *
 * Gap ids: `unknown:<registry>/<java id>` for an entry that does not map,
 * `loss:<registry>/<java id>` for a reviewed loss, and `unadvertised:<bedrock id>` for a biome
 * output the capture does not carry.
 */
const compareRegistryMapping = (): { gaps: string[]; entries: Map<MappedRegistry, number> } => {
    const advertisedBiomes = new Set(loadNetworkBiomes().map((biome) => biome.name));
    const gaps = new Set<string>();
    const entries = new Map<MappedRegistry, number>();

    for (const registry of MAPPED_REGISTRIES) {
        // A lossy entry may or may not keep a table row, so the walk is the union: Java's
        // registry is the table plus whatever the loss list answers for before the table.
        const lossIds = REGISTRY_LOSSES.filter((loss) => loss.registry === registry).map((loss) => loss.javaId);
        let entryCount = 0;
        for (const javaId of new Set([...Object.keys(registriesTable[registry]), ...lossIds])) {
            entryCount += 1;
            const result = javaIdentifierToBedrock(registry, javaId);
            if (result.kind === 'unknown') {
                gaps.add(`unknown:${registry}/${javaId}`);
                continue;
            }
            if (result.kind === 'loss') {
                gaps.add(`loss:${registry}/${javaId}`);
                continue;
            }
            if (registry === 'biome' && !advertisedBiomes.has(result.bedrock)) {
                gaps.add(`unadvertised:${result.bedrock}`);
            }
        }
        entries.set(registry, entryCount);
    }

    return { gaps: [...gaps], entries };
};

describeFamily(FAMILIES.mappingRegistries, [REFERENCES.bedrockBiomeDefinitions], () => {
    const { gaps, entries } = compareRegistryMapping();
    const verdict = checkAllowList(FAMILIES.mappingRegistries, gaps);

    it('maps every biome onto one the server advertises, and every other entry onto a Bedrock name', () => {
        expect(verdict.unexpected).toEqual([]);
    });

    it('carries no stale allow-list entry', () => {
        expect(verdict.stale).toEqual([]);
    });

    it('reports the current mapping registry coverage for review', () => {
        reportParityProgress(FAMILIES.mappingRegistries, Object.fromEntries(entries));
        expect([...entries.keys()]).toEqual(MAPPED_REGISTRIES);
    });
});
