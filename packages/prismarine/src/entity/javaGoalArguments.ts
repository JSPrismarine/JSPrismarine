/**
 * Java's goal arguments, written into the goal bodies of each entity file as it loads.
 *
 * Java's mobs pass their goals their numbers in `registerGoals`: how far a zombie looks at a
 * player, what tempts a cow and how fast it follows, which classes a spider targets. Bedrock's pack
 * writes the same decisions as goal bodies, and many have drifted. The Bedrock client runs no mob
 * AI, so these numbers are the server's alone, and
 * [ADR 0019](../../../../docs/adr/0019-java-decides-server-decided-goal-parameters.md) gives them
 * to Java. `@jsprismarine/entity-goals` owns what each argument means for a body; this overlay finds
 * each file's Java mob and answers what the translation cannot: the mob's Java attributes, a filter
 * for a set of Java entity types, and the Bedrock items of a Java item predicate.
 */
import type { JavaEntityAttributes, JavaEntityGoal } from '@jsprismarine/bedrock-data';
import type { JavaGoalContext } from '@jsprismarine/entity-goals/javaArguments';
import { JAVA_TRANSLATED_GOALS, javaGoalBody } from '@jsprismarine/entity-goals/javaArguments';
import type { GoalBody } from '@jsprismarine/entity-goals/params';
import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';

import type { ContentTags } from '../content/tags';
import { isRecord } from '../utils/isRecord';
import { entityFileIdentifier, withComponentRewritten } from './definitionOverlay';
import { bedrockItemsOf } from './javaBreedingFood';

/** What the overlay reads. */
export interface JavaGoalSources {
    /** Every Java mob's goals, from `java_entity_goals`. */
    readonly goals: Readonly<Record<string, readonly JavaEntityGoal[]>>;
    /** Java's attribute table, from `java_entity_attributes`. */
    readonly attributes: Readonly<Record<string, JavaEntityAttributes>>;
    /** The stack's tags, which a tempt predicate's item tags resolve against. */
    readonly tags: ContentTags;
}

/** The families each entity file declares, in its base components and every component group. */
const declaredFamilies = (data: unknown): readonly string[] => {
    const entity = isRecord(data) ? data['minecraft:entity'] : undefined;
    if (!isRecord(entity)) return [];
    const maps = [
        entity['components'],
        ...(isRecord(entity['component_groups']) ? Object.values(entity['component_groups']) : [])
    ];
    return [
        ...new Set(
            maps.flatMap((map) => {
                const family =
                    isRecord(map) && isRecord(map['minecraft:type_family'])
                        ? map['minecraft:type_family']['family']
                        : undefined;
                return Array.isArray(family) ? family.filter((name) => typeof name === 'string') : [];
            })
        )
    ];
};

const familyTest = (family: string): GoalBody => ({
    test: 'is_family',
    subject: 'other',
    operator: '==',
    value: family
});

/**
 * Builds the filter that accepts, as `other`, the entities of a set of Bedrock types, from the
 * families each type's file declares.
 *
 * Families no unwanted type carries are taken first, the one covering most of what is left each
 * time, so every mob is `is_family mob` rather than a list of 80 names. A type no such family
 * covers is matched by its family the fewest unwanted types share, and each unwanted type that
 * then matches is excluded by a family of its own that no wanted type carries. A husk carries
 * `zombie`, so a filter for the zombie alone reads `is_family zombie` and not `is_family husk`.
 */
export const familyFilter = (
    families: ReadonlyMap<string, readonly string[]>
): ((wanted: ReadonlySet<string>) => GoalBody | undefined) => {
    const carriers = new Map<string, Set<string>>();
    for (const [entity, names] of families) {
        for (const name of names) {
            let set = carriers.get(name);
            if (set === undefined) carriers.set(name, (set = new Set()));
            set.add(entity);
        }
    }
    const carriersOf = (family: string): readonly string[] => [...(carriers.get(family) ?? [])];
    const outside = (family: string, wanted: ReadonlySet<string>): number =>
        carriersOf(family).filter((entity) => !wanted.has(entity)).length;
    const covers = (family: string, left: ReadonlySet<string>): number =>
        carriersOf(family).filter((entity) => left.has(entity)).length;

    return (wanted) => {
        // Among equals, a family named after a wanted type reads best: `zombie` over `undead`.
        const named = new Set([...wanted].map((entity) => entity.slice(entity.indexOf(':') + 1)));
        const byName = (one: string, other: string): number =>
            Number(named.has(other)) - Number(named.has(one)) || one.localeCompare(other, 'en');
        const chosen = new Set<string>();
        const left = new Set(wanted);
        const exact = [...carriers.keys()].filter((family) => outside(family, wanted) === 0);
        for (;;) {
            const best = exact
                .filter((family) => covers(family, left) > 0)
                .sort((one, other) => covers(other, left) - covers(one, left) || byName(one, other))[0];
            if (best === undefined) break;
            chosen.add(best);
            for (const entity of carriersOf(best)) left.delete(entity);
        }
        for (const entity of [...left].sort()) {
            if (!left.has(entity)) continue;
            const best = [...(families.get(entity) ?? [])].sort(
                (one, other) =>
                    outside(one, wanted) - outside(other, wanted) ||
                    covers(other, left) - covers(one, left) ||
                    byName(one, other)
            )[0];
            if (best === undefined) continue;
            chosen.add(best);
            for (const covered of carriersOf(best)) left.delete(covered);
        }
        if (chosen.size === 0) return undefined;

        const excluded = new Set<string>();
        const strays = new Set([...chosen].flatMap(carriersOf).filter((entity) => !wanted.has(entity)));
        for (const stray of strays) {
            const own = [...(families.get(stray) ?? [])]
                .filter((family) => carriersOf(family).every((entity) => !wanted.has(entity)))
                .sort(
                    (one, other) => carriersOf(other).length - carriersOf(one).length || one.localeCompare(other, 'en')
                );
            if (own.some((family) => excluded.has(family))) continue;
            if (own[0] !== undefined) excluded.add(own[0]);
        }

        const accept = [...chosen].sort().map(familyTest);
        const anyOf = accept.length === 1 && accept[0] !== undefined ? accept[0] : { any_of: accept };
        return excluded.size === 0 ? anyOf : { all_of: [anyOf, { none_of: [...excluded].sort().map(familyTest) }] };
    };
};

/**
 * Builds the overlay over a stack's entity files.
 *
 * @param files - Every entity file the stack loads, whose families the entity filters read.
 * @param sources - Java's goals and attributes, and the stack's tags.
 * @returns A rewrite for one entity file: the same object when its entity has no Java mob with
 *   goals, otherwise a copy whose goal bodies carry Java's arguments.
 */
export const javaGoalOverlay = (files: Iterable<unknown>, sources: JavaGoalSources): ((data: unknown) => unknown) => {
    const families = new Map<string, readonly string[]>();
    for (const data of files) {
        const identifier = entityFileIdentifier(data);
        if (identifier !== undefined) families.set(identifier, declaredFamilies(data));
    }
    const filterFor = familyFilter(families);

    const javaByBedrock = new Map<string, string>();
    for (const javaId of Object.keys(sources.goals)) {
        const mapped = javaEntityTypeToBedrock(javaId);
        if (mapped.kind === 'mapped') javaByBedrock.set(mapped.bedrock, javaId);
    }

    return (data) => {
        const identifier = entityFileIdentifier(data);
        const javaId = identifier === undefined ? undefined : javaByBedrock.get(identifier);
        const goals = javaId === undefined ? undefined : sources.goals[javaId];
        if (javaId === undefined || goals === undefined) return data;

        const context: JavaGoalContext = {
            self: javaId,
            attribute: (name) => sources.attributes[javaId]?.attributes[name],
            entityFilter: (javaEntities) => {
                const wanted = new Set(
                    javaEntities.flatMap((entity) => {
                        const mapped = javaEntityTypeToBedrock(entity);
                        return mapped.kind === 'mapped' && families.has(mapped.bedrock) ? [mapped.bedrock] : [];
                    })
                );
                return wanted.size === 0 ? undefined : filterFor(wanted);
            },
            items: (predicate) =>
                bedrockItemsOf([
                    ...(predicate.itemTags ?? []).flatMap((tag) =>
                        sources.tags.has('item', tag) ? sources.tags.members('item', tag) : []
                    ),
                    ...(predicate.items ?? [])
                ])
        };
        return JAVA_TRANSLATED_GOALS.reduce(
            (file, component) =>
                withComponentRewritten(file, component, (body) => javaGoalBody(component, body, goals, context)),
            data
        );
    };
};
