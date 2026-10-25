import type { MappedRegistry } from '@jsprismarine/mapping';
import { MAPPED_REGISTRIES, REGISTRY_LOSSES, javaIdentifierToBedrock } from '@jsprismarine/mapping';
import { registriesTable } from '@jsprismarine/mapping/tables';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import { loadNetworkBiomes } from './goldens.ts';
import { describeFamily } from './measure.ts';
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
const compareRegistryMapping = (): { gaps: string[]; entries: Record<MappedRegistry, number> } => {
    const advertisedBiomes = new Set(loadNetworkBiomes().map((biome) => biome.name));
    const gaps = new Set<string>();
    const entries = { biome: 0, enchantment: 0, mob_effect: 0, potion: 0 } satisfies Record<MappedRegistry, number>;

    for (const registry of MAPPED_REGISTRIES) {
        // A lossy entry may or may not keep a table row, so the walk is the union: Java's
        // registry is the table plus whatever the loss list answers for before the table.
        const lossIds = REGISTRY_LOSSES.filter((loss) => loss.registry === registry).map((loss) => loss.javaId);
        for (const javaId of new Set([...Object.keys(registriesTable[registry]), ...lossIds])) {
            entries[registry] += 1;
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

    it("covers all four of Java 26.3's mapped registries, whole", () => {
        // docs/research/java-to-bedrock-translation.md section 6 counted the biomes and the
        // enchantments; docs/research/java-datapacks.md counted the potions and the mob
        // effects. The walk adds the reviewed losses back, so each count is Java's registry
        // size, not the table's. A registry added to `MAPPED_REGISTRIES` fails this on the
        // missing key rather than slipping in unmeasured.
        expect(entries).toEqual({ biome: 67, enchantment: 43, mob_effect: 40, potion: 46 });
    });
});
