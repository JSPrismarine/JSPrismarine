import type { EventAction, EventNode, EventTarget, EventValue } from './events';
import type { FilterContext, RandomSource } from './filterContext';
import { evaluateFilter } from './filters';
import type { PropertyValue, PropertyValues } from './properties';

/**
 * The event engine.
 *
 * An event runs in two steps, which is the rule the documentation states: the
 * effects "are determined immediately, but those changes are not applied to
 * the entity until the entity ticks on the server side", so "filters in later
 * entries in a `sequence` array won't see changes from earlier in that array".
 * {@link determineEvent} is the first step and produces {@link EventEffects};
 * the entity applies them on its next tick.
 */

/** The four events the engine itself runs on a new entity. */
export const BUILT_IN_SPAWN_EVENTS = [
    'minecraft:entity_spawned',
    'minecraft:entity_born',
    'minecraft:entity_transformed',
    'minecraft:on_prime'
] as const;

/** One of {@link BUILT_IN_SPAWN_EVENTS}. */
export type BuiltInSpawnEvent = (typeof BUILT_IN_SPAWN_EVENTS)[number];

/** Why an entity is being created, which picks its spawn event. */
export type SpawnCause =
    /** A natural spawn, a spawn egg or a spawner: `minecraft:entity_spawned`. */
    | 'spawned'
    /** `minecraft:behavior.breed` or `minecraft:spawn_entity`: `minecraft:entity_born`. */
    | 'born'
    /** `minecraft:transformation`: `minecraft:entity_transformed`. */
    | 'transformed'
    /** A primed TNT minecart: `minecraft:on_prime`. */
    | 'primed';

const SPAWN_EVENT_BY_CAUSE: Readonly<Record<SpawnCause, BuiltInSpawnEvent>> = {
    spawned: 'minecraft:entity_spawned',
    born: 'minecraft:entity_born',
    transformed: 'minecraft:entity_transformed',
    primed: 'minecraft:on_prime'
};

/**
 * Picks the one event that runs when an entity is created.
 *
 * Exactly one runs. A caller that names an event, which is what `/summon`, a
 * spawn rule's `initial_event`, `minecraft:spawn_entity.spawn_event` and the
 * `type<event>` form in `transformation.into` all do, replaces the built-in
 * one rather than adding to it.
 *
 * @param named - The event the caller asked for, if any.
 */
export const spawnEventFor = (cause: SpawnCause, named?: string): string => named ?? SPAWN_EVENT_BY_CAUSE[cause];

/**
 * Splits the `identifier<event>` form vanilla writes in `transformation.into`
 * and `permute_type.entity_type`, such as
 * `minecraft:drowned<minecraft:as_adult>`.
 */
export const splitSpawnReference = (reference: string): { readonly identifier: string; readonly event?: string } => {
    const match = /^(?<identifier>[^<]+)<(?<event>[^>]+)>$/.exec(reference.trim());
    if (match?.groups === undefined) return { identifier: reference.trim() };
    return { identifier: match.groups.identifier!.trim(), event: match.groups.event!.trim() };
};

/** One property write an event determined, with its value already resolved. */
export interface ResolvedPropertyWrite {
    readonly name: string;
    readonly value: PropertyValue;
}

/** One event to fire on another entity, which the caller routes. */
export interface OutgoingTrigger {
    readonly event: string;
    readonly target: Exclude<EventTarget, 'self'>;
}

/** What one event determined, before the entity applies it on its next tick. */
export interface EventEffects {
    /** The event name the effects came from. */
    readonly event: string;
    /** Component groups to add, in the order the nodes named them. */
    readonly addGroups: readonly string[];
    /** Component groups to remove, in the order the nodes named them. */
    readonly removeGroups: readonly string[];
    readonly propertyWrites: readonly ResolvedPropertyWrite[];
    /** Events for other entities; a `self` trigger is already folded in. */
    readonly outgoingTriggers: readonly OutgoingTrigger[];
    /** Sounds, particles, vibrations and the other actions this package keeps raw. */
    readonly actions: readonly EventAction[];
    /** What the engine met and could not carry out, one line each. */
    readonly unhandled: readonly string[];
}

/** An {@link EventEffects} with nothing in it, which is what an absent event determines. */
export const noEffects = (event: string): EventEffects => ({
    event,
    addGroups: [],
    removeGroups: [],
    propertyWrites: [],
    outgoingTriggers: [],
    actions: [],
    unhandled: []
});

/** What {@link determineEvent} reads while it walks an event tree. */
export interface EventRuntime {
    /** The named event of the entity's type, or undefined when it declares none. */
    event(name: string): EventNode | undefined;
    /** The entity's filter context, read as it was before the event's changes. */
    context: FilterContext;
    /** The entity's properties, which `set_property` writes and reads. */
    properties: PropertyValues;
    /** Draws the `randomize` weights. */
    random: RandomSource;
    /**
     * Evaluates a Molang expression for a `set_property` value.
     *
     * @returns The value, or undefined when the expression does not evaluate.
     */
    evaluate?(source: string): PropertyValue | undefined;
}

interface Collector {
    addGroups: string[];
    removeGroups: string[];
    propertyWrites: ResolvedPropertyWrite[];
    outgoingTriggers: OutgoingTrigger[];
    actions: EventAction[];
    unhandled: string[];
}

/** How deep a chain of `self` triggers may run before the engine calls it a cycle. */
const MAX_TRIGGER_DEPTH = 16;

/**
 * Runs one event and returns what it decided, without changing the entity.
 *
 * A node's own `filters` gate the whole node. Within a node the engine applies
 * `add`, `remove`, `set_property`, the raw actions and `trigger`, then walks
 * `sequence` in order, then draws one branch of `randomize`, then takes the
 * first passing branch of `first_valid`. A `trigger` on `self` is folded into
 * the same result, so one tick applies the whole chain; a trigger on another
 * target is left for the caller to route.
 */
export const determineEvent = (runtime: EventRuntime, event: string): EventEffects => {
    const collector: Collector = {
        addGroups: [],
        removeGroups: [],
        propertyWrites: [],
        outgoingTriggers: [],
        actions: [],
        unhandled: []
    };

    const node = runtime.event(event);
    if (node === undefined) return noEffects(event);

    visit(node, runtime, collector, [event]);

    return {
        event,
        addGroups: collector.addGroups,
        removeGroups: collector.removeGroups,
        propertyWrites: collector.propertyWrites,
        outgoingTriggers: collector.outgoingTriggers,
        actions: collector.actions,
        unhandled: collector.unhandled
    };
};

const passes = (node: EventNode, runtime: EventRuntime): boolean =>
    node.filters === undefined || evaluateFilter(node.filters, runtime.context);

const visit = (
    node: EventNode,
    runtime: EventRuntime,
    collector: Collector,
    chain: readonly string[],
    gated = true
): void => {
    if (gated && !passes(node, runtime)) return;

    collector.addGroups.push(...node.add);
    collector.removeGroups.push(...node.remove);

    for (const write of node.setProperties) {
        const resolved = resolveValue(write.value, write.name, runtime, collector);
        if (resolved !== undefined) collector.propertyWrites.push({ name: write.name, value: resolved });
    }

    collector.actions.push(...node.actions);

    for (const trigger of node.triggers) {
        if (trigger.filters !== undefined && !evaluateFilter(trigger.filters, runtime.context)) continue;
        if (trigger.target !== 'self') {
            collector.outgoingTriggers.push({ event: trigger.event, target: trigger.target });
            continue;
        }
        if (chain.includes(trigger.event) || chain.length >= MAX_TRIGGER_DEPTH) {
            collector.unhandled.push(`trigger ${trigger.event} would loop through ${chain.join(' -> ')}`);
            continue;
        }
        const triggered = runtime.event(trigger.event);
        if (triggered === undefined) {
            collector.unhandled.push(`trigger names ${trigger.event}, which the entity does not declare`);
            continue;
        }
        visit(triggered, runtime, collector, [...chain, trigger.event]);
    }

    for (const child of node.sequence) visit(child, runtime, collector, chain);

    if (node.randomize.length > 0) {
        const chosen = drawWeighted(node.randomize, runtime.random);
        if (chosen !== undefined) visit(chosen, runtime, collector, chain);
    }

    for (const child of node.firstValid) {
        if (!passes(child, runtime)) continue;
        // The branch's filters were just evaluated; a second pass would draw
        // `random_chance` twice.
        visit(child, runtime, collector, chain, false);
        break;
    }
};

/**
 * Draws one branch of `randomize` against its weights.
 *
 * Weights are relative, not percentages: the zombie's spawn event uses 9500,
 * 425 and 75, which sum to 10000, while other entities write 1 and 1.
 */
const drawWeighted = <T extends { readonly weight: number; readonly node: EventNode }>(
    branches: readonly T[],
    random: RandomSource
): EventNode | undefined => {
    const total = branches.reduce((sum, branch) => sum + Math.max(0, branch.weight), 0);
    if (total <= 0) return branches[0]?.node;

    let roll = random.next() * total;
    for (const branch of branches) {
        roll -= Math.max(0, branch.weight);
        if (roll < 0) return branch.node;
    }
    return branches[branches.length - 1]?.node;
};

/**
 * Resolves a `set_property` value against the property it writes.
 *
 * A number or a boolean is already a value. A string is ambiguous in the file:
 * the engine reads it as Molang, and vanilla also writes enum members bare, so
 * a member of the target enum wins and anything else compiles as Molang.
 */
const resolveValue = (
    value: EventValue,
    property: string,
    runtime: EventRuntime,
    collector: Collector
): PropertyValue | undefined => {
    if (value.kind === 'literal') return value.value;

    const definition = runtime.properties.definition(property);
    if (definition?.type === 'enum' && definition.values?.includes(value.text)) return value.text;

    const evaluated = runtime.evaluate?.(value.text);
    if (evaluated !== undefined) return evaluated;

    collector.unhandled.push(`set_property ${property} could not resolve ${JSON.stringify(value.text)}`);
    return undefined;
};
