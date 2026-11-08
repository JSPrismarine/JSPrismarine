import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { evaluateFilter } from '@jsprismarine/entities';
import { entitiesTable } from '@jsprismarine/mapping/tables';
import { javaEntityTypeToBedrock, javaIdentifierToBedrock, javaItemToBedrock } from '@jsprismarine/mapping';
import { parseBiomeTags } from '@jsprismarine/prismarine/content/biomeTags';
import { expect, it } from 'vitest';

import type { BehaviorScenario } from './behaviorScenarios.ts';
import { measureScenarios, reportCoverage, scenarioGroup } from './behaviorScenarios.ts';
import { FAMILIES } from './families.ts';
import { unpackVanillaDatapack } from './javaDatapack.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';
import { serverContent } from './serverStack.ts';

/** One mob Java's biome can spawn naturally: the biome, the mob, and the category that gates its cap. */
interface NaturalSpawn {
    readonly biome: string;
    readonly mob: string;
    readonly category: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

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

/** A Java entity type paired with the Bedrock identity the server runs it as. */
interface EntitySubject {
    readonly javaId: string;
    readonly bedrock: string;
    /** The Java item or entity-type tag this scenario compares, when it compares one. */
    readonly tag?: string;
}

/** Every value a Bedrock entity definition gives one component, in its base components and each component group. */
const componentValues = (bedrock: string, component: string): readonly unknown[] => {
    const entity = field(
        field(serverContent().definitions.entities.get(bedrock)?.data, 'minecraft:entity'),
        'minecraft:entity'
    );
    const body = isRecord(entity)
        ? entity
        : field(serverContent().definitions.entities.get(bedrock)?.data, 'minecraft:entity');
    const found: unknown[] = [];
    const base = field(field(body, 'components'), component);
    if (base !== undefined) found.push(base);
    const groups = field(body, 'component_groups');
    if (isRecord(groups)) {
        for (const group of Object.values(groups)) {
            const value = field(group, component);
            if (value !== undefined) found.push(value);
        }
    }
    return found;
};

const field = (value: unknown, name: string): unknown => (isRecord(value) ? value[name] : undefined);

/** Bedrock's legacy item names, which the modern names Java's data maps to replaced. */
const LEGACY_ITEM_NAMES: Readonly<Record<string, string>> = {
    'minecraft:fish': 'minecraft:cod',
    'minecraft:cooked_fish': 'minecraft:cooked_cod',
    'minecraft:muttonraw': 'minecraft:mutton',
    'minecraft:muttoncooked': 'minecraft:cooked_mutton',
    'minecraft:appleenchanted': 'minecraft:enchanted_golden_apple'
};

const withNamespace = (identifier: string): string => {
    const qualified = identifier.includes(':') ? identifier : `minecraft:${identifier}`;
    return LEGACY_ITEM_NAMES[qualified.toLowerCase()] ?? qualified;
};

const stringList = (value: unknown): readonly string[] =>
    typeof value === 'string'
        ? [value]
        : Array.isArray(value)
          ? value.filter((entry): entry is string => typeof entry === 'string')
          : [];

/** The Java food tag each breedable Java animal reads, which is the item set `Animal.isFood` accepts. */
const BREEDING_FOOD: readonly (readonly [string, string])[] = [
    ['minecraft:armadillo', 'minecraft:armadillo_food'],
    ['minecraft:axolotl', 'minecraft:axolotl_food'],
    ['minecraft:bee', 'minecraft:bee_food'],
    ['minecraft:camel', 'minecraft:camel_food'],
    ['minecraft:cat', 'minecraft:cat_food'],
    ['minecraft:chicken', 'minecraft:chicken_food'],
    ['minecraft:cow', 'minecraft:cow_food'],
    ['minecraft:fox', 'minecraft:fox_food'],
    ['minecraft:frog', 'minecraft:frog_food'],
    ['minecraft:goat', 'minecraft:goat_food'],
    ['minecraft:hoglin', 'minecraft:hoglin_food'],
    ['minecraft:ocelot', 'minecraft:ocelot_food'],
    ['minecraft:panda', 'minecraft:panda_food'],
    ['minecraft:pig', 'minecraft:pig_food'],
    ['minecraft:rabbit', 'minecraft:rabbit_food'],
    ['minecraft:sheep', 'minecraft:sheep_food'],
    ['minecraft:sniffer', 'minecraft:sniffer_food'],
    ['minecraft:strider', 'minecraft:strider_food'],
    ['minecraft:turtle', 'minecraft:turtle_food'],
    ['minecraft:wolf', 'minecraft:wolf_food']
];

/** The Java entity-type tags that name a mob family Bedrock expresses as `minecraft:type_family`. */
const FAMILY_BY_TAG: readonly (readonly [string, string])[] = [
    ['minecraft:undead', 'undead'],
    ['minecraft:arthropod', 'arthropod'],
    ['minecraft:illager', 'illager']
];

const mappedEntity = (javaId: string, tag?: string): EntitySubject | undefined => {
    const mapping = javaEntityTypeToBedrock(javaId);
    return mapping.kind === 'mapped'
        ? { javaId, bedrock: mapping.bedrock, ...(tag === undefined ? {} : { tag }) }
        : undefined;
};

const entityScenarios: readonly BehaviorScenario<EntitySubject>[] = [
    {
        name: 'breeding-food',
        java: 'An animal breeds with exactly the items in its Java food tag.',
        reference: 'Java Animal.isFood and the data/minecraft/tags/item/*_food tags; issue #2911',
        subjects: () => BREEDING_FOOD.flatMap(([javaId, tag]) => mappedEntity(javaId, tag) ?? []),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const content = serverContent();
            const java = new Set(
                content.tags.members('item', subject.tag ?? '').flatMap((javaItem) => {
                    const mapped = javaItemToBedrock(javaItem);
                    return mapped.kind === 'unknown' ? [] : [mapped.bedrock.identifier];
                })
            );
            const server = new Set(
                componentValues(subject.bedrock, 'minecraft:breedable').flatMap((value) =>
                    stringList(field(value, 'breed_items')).map(withNamespace)
                )
            );
            const missing = [...java].filter((item) => !server.has(item));
            const extra = [...server].filter((item) => !java.has(item));
            if (missing.length === 0 && extra.length === 0) return undefined;
            return `the server breeds it with ${[...server].sort().join(', ') || 'nothing'}; Java accepts ${[...java].sort().join(', ')}`;
        }
    },
    {
        name: 'mob-family',
        java: 'A mob in a Java family tag (undead, arthropod, illager) carries the matching family on the server.',
        reference:
            'Java entity type tags undead, arthropod and illager, which Smite, Bane of Arthropods and the raid logic read',
        subjects: () =>
            FAMILY_BY_TAG.flatMap(([tag]) =>
                serverContent()
                    .tags.members('entity_type', tag)
                    .flatMap((javaId) => mappedEntity(javaId, tag) ?? [])
            ),
        idOf: (subject) => `${subject.tag}/${subject.javaId}`,
        covers: (subject) => subject.javaId,
        run: (subject) => {
            const family = FAMILY_BY_TAG.find(([tag]) => tag === subject.tag)?.[1] ?? '';
            const families = componentValues(subject.bedrock, 'minecraft:type_family').flatMap((value) =>
                stringList(field(value, 'family'))
            );
            return families.includes(family) ? undefined : `it is not in the ${family} family on the server`;
        }
    }
];

const scenarios: readonly BehaviorScenario<NaturalSpawn>[] = [
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

describeFamily(
    FAMILIES.entitiesBehavior,
    [REFERENCES.javaEntityRegistry, REFERENCES.bedrockBehaviorPack, REFERENCES.javaWorldgenData],
    () => {
        it('exercises each Java entity behavior against the server runtime', { timeout: 180_000 }, () => {
            const rows = [
                ...measureScenarios(
                    FAMILIES.entitiesBehavior,
                    import.meta.filename,
                    scenarioGroup(scenarios),
                    scenarioGroup(entityScenarios)
                )
            ];

            reportCoverage(
                FAMILIES.entitiesBehavior,
                import.meta.filename,
                Object.keys(entitiesTable.entities).sort((left, right) => left.localeCompare(right, 'en')),
                rows,
                (identifier) =>
                    identifier === 'minecraft:villager'
                        ? 'Villager profession and job-site behavior, trade restocking, player gossip, farming, and village or raid lifecycle are not compared with Java.'
                        : "No scenario compares this entity's Java AI, movement, combat or lifecycle behavior with the server."
            );
            expect(rows.length).toBeGreaterThan(0);
        });
    }
);
