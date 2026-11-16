import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { evaluateFilter } from '@jsprismarine/entities';
import { javaEntityTypeToBedrock, javaIdentifierToBedrock } from '@jsprismarine/mapping';
import { parseBiomeTags } from '@jsprismarine/prismarine/content/biomeTags';

import type { BehaviorScenario } from '../behaviorScenarios.ts';
import { isRecord } from '../isRecord.ts';
import { unpackVanillaDatapack } from '../javaDatapack.ts';
import { serverContent } from '../serverStack.ts';

/** One mob Java's biome can spawn naturally: the biome, the mob, and the category that gates its cap. */
export interface NaturalSpawn {
    readonly biome: string;
    readonly mob: string;
    readonly category: string;
}

/** Java's per-biome `minecraft:gameplay/natural_mob_spawns` attribute, one entry per mob. */
const naturalSpawns = (): readonly NaturalSpawn[] => {
    const directory = join(unpackVanillaDatapack(), 'data', 'minecraft', 'worldgen', 'biome');
    return readdirSync(directory)
        .filter((file) => file.endsWith('.json'))
        .flatMap((file) => {
            // Parsed JSON boundary; the datapack's biome files are read only for the fields named below.
            const biome: unknown = JSON.parse(readFileSync(join(directory, file), 'utf-8'));
            const attribute =
                isRecord(biome) && isRecord(biome.attributes)
                    ? biome.attributes['minecraft:gameplay/natural_mob_spawns']
                    : undefined;
            const argument = isRecord(attribute) ? attribute.argument : undefined;
            const categories =
                isRecord(argument) && isRecord(argument.spawns_by_category) ? argument.spawns_by_category : {};
            return Object.entries(categories).flatMap(([category, entries]) =>
                Array.isArray(entries)
                    ? entries.flatMap((entry) =>
                          isRecord(entry) && typeof entry.type === 'string'
                              ? [{ biome: `minecraft:${file.replace(/\.json$/, '')}`, mob: entry.type, category }]
                              : []
                      )
                    : []
            );
        });
};

/** Every mob in a Java biome's natural spawn list against the server's spawn rules for that biome. */
export const spawnScenarios: readonly BehaviorScenario<NaturalSpawn>[] = [
    {
        name: 'spawns-in-biome',
        java: "A mob in a biome's natural spawn list can spawn there.",
        reference: 'Java Biome minecraft:gameplay/natural_mob_spawns attribute; issue #2910',
        classify: (spawn) =>
            spawn.mob === 'minecraft:zombie_villager'
                ? {
                      kind: 'intentional',
                      reason: 'Bedrock gives zombie villagers no spawn rule of their own: the zombie rule swaps in a villager zombie for 5 to 9 percent of its spawns, where Java lists the zombie villager at weight 1 in each overworld monster list.'
                  }
                : undefined,
        covers: () => undefined,
        subjects: naturalSpawns,
        idOf: (spawn) => `${spawn.biome}/${spawn.mob}`,
        run: (spawn) => {
            const content = serverContent();
            const entity = javaEntityTypeToBedrock(spawn.mob);
            if (entity.kind !== 'mapped') return undefined;
            const biome = javaIdentifierToBedrock('biome', spawn.biome);
            if (biome.kind !== 'mapped') return undefined;

            const rules = content.spawnRules.filter((rule) => rule.identifier === entity.bedrock);
            if (rules.length === 0) return `the server has no spawn rule for ${entity.bedrock}`;

            const tags = parseBiomeTags(content.biomes).get(biome.bedrock) ?? [];
            const context = {
                self: {
                    flag: () => undefined,
                    names: (name: string) =>
                        name === 'has_biome_tag' ? tags : name === 'is_biome' ? [biome.bedrock] : undefined
                },
                world: { difficulty: () => 'normal' as const, weather: () => 'clear' as const }
            };
            const admitted = rules.some((rule) =>
                rule.conditions.some(
                    (condition) =>
                        condition.biomeFilter === undefined || evaluateFilter(condition.biomeFilter, context, {})
                )
            );
            return admitted ? undefined : `no ${entity.bedrock} spawn rule admits ${biome.bedrock}`;
        }
    }
];
