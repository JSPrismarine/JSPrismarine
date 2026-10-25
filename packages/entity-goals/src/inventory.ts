import data from './generated/goalInventory.json';

/**
 * The vanilla goal inventory, measured from the composed behavior pack.
 *
 * `utils/build-inventory.ts` writes `src/generated/goalInventory.json` from the
 * 129 vanilla entity files, and everything in this package is driven by it: the
 * parameter keys each goal parses come from the measured key union, and the
 * totality test fails when a name in here has no registered factory.
 */

/** One parameter key vanilla writes under a goal, with how often and as what. */
export interface GoalParameterUse {
    /** The key as the entity files spell it, such as `speed_multiplier`. */
    readonly key: string;
    /** How many component instances set the key. */
    readonly instances: number;
    /** The JSON types observed, where a whole number is reported as `integer`. */
    readonly types: readonly string[];
}

/** One `minecraft:behavior.*` name as vanilla uses it. */
export interface GoalUse {
    /** The component name, such as `minecraft:behavior.random_stroll`. */
    readonly name: string;
    /** How many of the 129 entity files declare it anywhere. */
    readonly entities: number;
    /** How many times it appears, counting each component group separately. */
    readonly instances: number;
    readonly inBaseComponents: number;
    readonly inComponentGroups: number;
    /** The union of parameter keys observed, most used first. */
    readonly parameters: readonly GoalParameterUse[];
    /** The identifiers of the entities that declare it, sorted. */
    readonly usedBy: readonly string[];
}

/** What `utils/build-inventory.ts` measures from one vanilla behavior pack. */
export interface GoalInventory {
    /** The pack the measurement came from, such as `Bedrock Dedicated Server 1.26.51.1`. */
    readonly source: string;
    readonly entityCount: number;
    readonly goalCount: number;
    /** Every entity identifier in the pack, sorted, including the ones with no goals. */
    readonly entities: readonly string[];
    /** Every goal, most used first, ties broken by name. */
    readonly goals: readonly GoalUse[];
}

/** The measured inventory of the vanilla pack this package was written against. */
export const goalInventory: GoalInventory = data;

/** Every vanilla goal name, in descending use order. */
export const goalNames: readonly string[] = goalInventory.goals.map((goal) => goal.name);

const byName = new Map(goalInventory.goals.map((goal) => [goal.name, goal]));

/** What the inventory records for one goal name, or undefined when vanilla does not use it. */
export const goalUse = (name: string): GoalUse | undefined => byName.get(name);

/** The goals one vanilla entity declares, in descending use order. */
export const goalsOf = (identifier: string): readonly string[] =>
    goalInventory.goals.filter((goal) => goal.usedBy.includes(identifier)).map((goal) => goal.name);

/** How far a set of implemented goal names gets against the vanilla pack. */
export interface GoalCoverage {
    /** How many of the inventory's goals the set covers. */
    readonly goals: number;
    /** How many entities have every goal they declare in the set. */
    readonly entities: number;
    /** How many of those entities declare at least one goal. */
    readonly entitiesWithGoals: number;
    /** The goal names the set leaves out, in descending use order. */
    readonly missing: readonly string[];
}

/**
 * Measures a set of implemented goal names against the inventory.
 *
 * An entity that declares no goal counts as covered, which is how the research
 * note counts the 37 vanilla entities with no AI.
 */
export const measureCoverage = (implemented: ReadonlySet<string>): GoalCoverage => {
    const missing = goalNames.filter((name) => !implemented.has(name));
    const missingSet = new Set(missing);

    let entities = 0;
    let entitiesWithGoals = 0;
    for (const identifier of goalInventory.entities) {
        const goals = goalsOf(identifier);
        if (goals.length > 0 && goals.every((name) => !missingSet.has(name))) entitiesWithGoals += 1;
        if (goals.every((name) => !missingSet.has(name))) entities += 1;
    }

    return { goals: goalNames.length - missing.length, entities, entitiesWithGoals, missing };
};
