import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { evaluateFilter } from '@jsprismarine/entities';
import type { SpawnCondition, SpawnRule } from '@jsprismarine/spawning/rules';
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
    /** Whether the biome is cold enough to snow, so its generated surface carries snow. */
    readonly snowy: boolean;
}

/** The temperature below which Java's `Biome.coldEnoughToSnow` lets snow settle. */
const SNOW_TEMPERATURE = 0.15;

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
            const snowy =
                isRecord(biome) && typeof biome.temperature === 'number' && biome.temperature < SNOW_TEMPERATURE;
            return Object.entries(categories).flatMap(([category, entries]) =>
                Array.isArray(entries)
                    ? entries.flatMap((entry) =>
                          isRecord(entry) && typeof entry.type === 'string'
                              ? [
                                    {
                                        biome: `minecraft:${file.replace(/\.json$/, '')}`,
                                        mob: entry.type,
                                        category,
                                        snowy
                                    }
                                ]
                              : []
                      )
                    : []
            );
        });
};

/** An entity identifier without the `<event>` suffix a spawn reference may carry. */
const withoutEvent = (reference: string): string => reference.replace(/<.*>$/, '');

/**
 * Every entity one event of an entity's definition can turn it into: the `into` of each
 * `minecraft:transformation` in a component group the event adds, in any of its branches.
 */
const transformationsOf = (identifier: string, event: string): readonly string[] => {
    const data = serverContent().definitions.entities.get(identifier)?.data;
    const body = isRecord(data) ? data['minecraft:entity'] : undefined;
    if (!isRecord(body) || !isRecord(body.events) || !isRecord(body.component_groups)) return [];
    const groups = body.component_groups;

    const added: string[] = [];
    const walk = (node: unknown): void => {
        if (Array.isArray(node)) {
            for (const child of node) walk(child);
            return;
        }
        if (!isRecord(node)) return;
        const add = node.add;
        if (isRecord(add) && Array.isArray(add.component_groups))
            for (const group of add.component_groups) if (typeof group === 'string') added.push(group);
        for (const branch of ['sequence', 'randomize', 'first_valid']) walk(node[branch]);
    };
    walk(body.events[event]);

    return added.flatMap((name) => {
        const group = groups[name];
        const transformation = isRecord(group) ? group['minecraft:transformation'] : undefined;
        const into = isRecord(transformation) ? transformation.into : undefined;
        return typeof into === 'string' ? [withoutEvent(into)] : [];
    });
};

/**
 * Every entity one spawn rule condition can place: the rule's own entity, the types its
 * `minecraft:permute_type` swaps in, and what its `minecraft:spawn_event` transforms the entity
 * into, which is how Bedrock's stray rule places a skeleton in a frozen biome.
 */
const spawnedBy = (rule: SpawnRule, condition: SpawnCondition): readonly string[] => [
    ...(condition.permutations ?? []).map((permutation) =>
        permutation.entityType === undefined ? rule.identifier : withoutEvent(permutation.entityType)
    ),
    ...(condition.permutations === undefined ? [rule.identifier] : []),
    ...(condition.spawnEvent === undefined ? [] : transformationsOf(rule.identifier, condition.spawnEvent))
];

/** Every mob in a Java biome's natural spawn list against the server's spawn rules for that biome. */
export const spawnScenarios: readonly BehaviorScenario<NaturalSpawn>[] = [
    {
        name: 'spawns-in-biome',
        java: "A mob in a biome's natural spawn list can spawn there.",
        reference: 'Java Biome minecraft:gameplay/natural_mob_spawns attribute and Biome.coldEnoughToSnow; issue #2910',
        covers: () => undefined,
        subjects: naturalSpawns,
        idOf: (spawn) => `${spawn.biome}/${spawn.mob}`,
        run: (spawn) => {
            const content = serverContent();
            const entity = javaEntityTypeToBedrock(spawn.mob);
            if (entity.kind !== 'mapped') return `${spawn.mob} maps to no Bedrock entity`;
            // Java's four outer End biomes are a reviewed loss onto Bedrock's one End biome, which
            // is the biome a chunk there stores.
            const mapping = javaIdentifierToBedrock('biome', spawn.biome);
            const bedrockBiome =
                mapping.kind === 'mapped'
                    ? mapping.bedrock
                    : mapping.kind === 'loss'
                      ? mapping.loss.bedrockFallback
                      : undefined;
            if (bedrockBiome === undefined) return `${spawn.biome} maps to no Bedrock biome`;
            const biome = { bedrock: bedrockBiome };

            const tags = parseBiomeTags(content.biomes).get(biome.bedrock) ?? [];
            // The server answers `is_snow_covered` from the snow on the site, which world
            // generation lays wherever the biome is cold enough to snow.
            const context = {
                self: {
                    flag: (name: string) => (name === 'is_snow_covered' ? spawn.snowy : undefined),
                    names: (name: string) =>
                        name === 'has_biome_tag' ? tags : name === 'is_biome' ? [biome.bedrock] : undefined
                },
                world: { difficulty: () => 'normal' as const, weather: () => 'clear' as const }
            };
            const admitted = content.spawnRules.some((rule) =>
                rule.conditions.some(
                    (condition) =>
                        spawnedBy(rule, condition).includes(entity.bedrock) &&
                        (condition.biomeFilter === undefined || evaluateFilter(condition.biomeFilter, context, {}))
                )
            );
            return admitted ? undefined : `no spawn rule places ${entity.bedrock} in ${biome.bedrock}`;
        }
    }
];
