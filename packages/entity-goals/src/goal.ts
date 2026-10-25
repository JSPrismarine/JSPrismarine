import type { ComponentSchema } from '@jsprismarine/content';
import type { ControlFlag, EntityComponentRegistry, EntityInstance, Goal } from '@jsprismarine/entities';
import { goalComponent } from '@jsprismarine/entities';

import { GoalSupport } from './support';
import type { GoalWorld } from './world';

/**
 * How one vanilla goal is written in this package.
 *
 * `@jsprismarine/entities` defines `GoalFactory`, whose `create` takes the
 * entity. A goal here takes a {@link GoalSupport} instead, so it never reaches
 * for the entity, the actuator or the world seam itself. {@link goal} turns
 * one into the factory the entity runtime registers.
 */

/** Builds the support object a goal runs against. */
export type SupportSource = (entity: EntityInstance) => GoalSupport;

/** One goal implementation, with the parameters its component body parses into. */
export interface GoalDefinition<P> {
    /** The component name, such as `minecraft:behavior.random_stroll`. */
    readonly name: string;
    /** The control flags the goal holds when the definition names none. */
    readonly controlFlags: readonly ControlFlag[];
    /** Parses the goal's own parameters; `priority` and `control_flags` are handled by the wrapper. */
    readonly schema: ComponentSchema<P>;
    /** Builds the goal for one entity, each time its component initializes. */
    create(params: P, support: GoalSupport): Goal;
}

/**
 * One goal with its parameter type hidden, so a list can hold goals of
 * different shapes without erasing the type each goal parses into.
 */
export interface RegisterableGoal {
    /** The component name the goal registers under. */
    readonly name: string;
    /** The control flags the goal holds when the definition names none. */
    readonly controlFlags: readonly ControlFlag[];
    /** Registers the goal, building its support from the source. */
    register(registry: EntityComponentRegistry, source: SupportSource): void;
}

/** Wraps a goal implementation so a registry can take it. */
export const goal = <P>(definition: GoalDefinition<P>): RegisterableGoal => ({
    name: definition.name,
    controlFlags: definition.controlFlags,
    register: (registry, source) =>
        registry.register(
            goalComponent<P>({
                name: definition.name,
                controlFlags: definition.controlFlags,
                schema: definition.schema,
                create: (params, entity) => definition.create(params, source(entity))
            })
        )
});

/** Builds support straight from an entity and a world, which is the default wiring. */
export const supportSource =
    (world: (entity: EntityInstance) => GoalWorld | undefined): SupportSource =>
    (entity) =>
        new GoalSupport(entity, world(entity));
