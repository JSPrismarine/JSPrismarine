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
import { JAVA_TRANSLATED_GOALS, javaGoalBody, matchingJavaGoals } from '@jsprismarine/entity-goals/javaArguments';
import type { GoalBody } from '@jsprismarine/entity-goals/params';
import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';

import type { ContentTags } from '../content/tags';
import { isRecord } from '../utils/isRecord';
import { entityFileIdentifier, withComponentRewritten, withoutComponent } from './definitionOverlay';
import { bedrockItemsOf } from './javaBreedingFood';

/** What the overlay reads. */
export interface JavaGoalSources {
    /** Every Java mob's goals, from `java_entity_goals`. */
    readonly goals: Readonly<Record<string, readonly JavaEntityGoal[]>>;
    /** Java's attribute table, from `java_entity_attributes`. */
    readonly attributes: Readonly<Record<string, JavaEntityAttributes>>;
    /** The stack's tags, which a tempt predicate's item tags resolve against. */
    readonly tags: ContentTags;
    /**
     * The Java mobs whose brain runs in place of their goals, by Java identifier. Their files keep
     * every goal, since the server runs none of them.
     */
    readonly brainOnly?: ReadonlySet<string>;
}

/**
 * The Java goals of a mob's own class that do a Bedrock goal's job under their own rule, by the
 * Bedrock goal. The Bedrock goal stays on such a mob, since without it the mob would not do the
 * job at all: a blaze would never shoot.
 */
const STAND_INS: Readonly<Record<string, readonly string[]>> = {
    'minecraft:behavior.ranged_attack': [
        'Blaze$BlazeAttackGoal',
        'Ghast$GhastShootFireballGoal',
        'Shulker$ShulkerAttackGoal'
    ],
    'minecraft:behavior.melee_box_attack': ['Blaze$BlazeAttackGoal'],
    'minecraft:behavior.nearest_attackable_target': ['Phantom$PhantomAttackPlayerTargetGoal'],
    // `PhantomSweepAttackGoal.canContinueToUse` breaks off a swoop when a cat is near.
    'minecraft:behavior.avoid_mob_type': ['Phantom$PhantomSweepAttackGoal'],
    // A guardian's `RandomStrollGoal` swims, since its navigation is bound to water, and a turtle's
    // `TurtleTravelGoal` swims it about in water.
    'minecraft:behavior.random_swim': ['RandomStrollGoal', 'Turtle$TurtleTravelGoal'],
    // The parrot's, which `withJavaGoals` swaps for the goal that runs `LandOnOwnersShoulderGoal`.
    'minecraft:behavior.find_mount': ['LandOnOwnersShoulderGoal']
};

/** Bedrock's goal that collects items, which Java runs without a goal unless the mob walks to them. */
const PICKUP_ITEMS = 'minecraft:behavior.pickup_items';

/**
 * The Java goals that walk a mob to an item: a fox's search, a dolphin's play, a sulfur cube's
 * search and a raider fetching its leader's banner. A mob with none of them picks up only what it
 * touches, in `Mob.aiStep`.
 */
const ITEM_SEEKERS: readonly string[] = [
    'Fox$FoxSearchForItemsGoal',
    'Dolphin$PlayWithItemsGoal',
    'Dolphin$MoveToItemGoal',
    'SulfurCube$SulfurCubeSearchForItemsGoal',
    'Raider$ObtainRaidLeaderBannerGoal'
];

/** How far past its box `Mob.aiStep` reaches for an item: `Mob.ITEM_PICKUP_REACH`, one block across. */
const ITEM_PICKUP_REACH = 1;

/** Half the width of a dropped item, which `EntityType.ITEM` sizes 0.25 across. */
const ITEM_HALF_WIDTH = 0.125;

/**
 * Whether a mob's Java class registers nothing that does a Bedrock goal's job: no goal the
 * translation matches and no goal of its own that stands in for it.
 */
const unregistered = (component: string, goals: readonly JavaEntityGoal[]): boolean =>
    matchingJavaGoals(component, goals)?.length === 0 &&
    !goals.some((goal) => goal.classes.some((name) => STAND_INS[component]?.includes(name) === true));

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
 *   goals, otherwise a copy whose goal bodies carry Java's arguments, without the goals Java's
 *   class does not register.
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
        const keepsGoals = sources.brainOnly?.has(javaId) === true;

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
        // A goal Java's class does not register comes off the file; the rest take Java's arguments.
        const translated = JAVA_TRANSLATED_GOALS.reduce(
            (file, component) =>
                !keepsGoals && unregistered(component, goals)
                    ? withoutComponent(file, component)
                    : withComponentRewritten(file, component, (body) => javaGoalBody(component, body, goals, context)),
            data
        );
        const width = sources.attributes[javaId]?.width;
        if (
            keepsGoals ||
            width === undefined ||
            goals.some((goal) => goal.classes.some((name) => ITEM_SEEKERS.includes(name)))
        )
            return translated;
        // `Mob.aiStep` takes the items its box, grown by the pickup reach, touches, so the goal
        // searches no further and takes them where they lie.
        const reach = width / 2 + ITEM_PICKUP_REACH + ITEM_HALF_WIDTH;
        return withComponentRewritten(translated, PICKUP_ITEMS, (body) => ({
            ...body,
            max_dist: reach,
            goal_radius: reach
        }));
    };
};
