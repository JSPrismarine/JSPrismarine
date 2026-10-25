import type { BoundComponent, Holder } from '@jsprismarine/content';
import { HookTable, Instance } from '@jsprismarine/content';
import type { MolangValue } from '@jsprismarine/molang';

import { Attributes } from './attributes';
import type { EntityType } from './entityType';
import type { EventEffects, OutgoingTrigger, SpawnCause } from './eventEngine';
import { determineEvent, noEffects, spawnEventFor } from './eventEngine';
import type { EntityTypeFlag } from './entityType';
import type {
    EntityFlag,
    EntityMeasure,
    EntityNameSet,
    FilterContext,
    FilterEntityView,
    RandomSource
} from './filterContext';
import { defaultRandom } from './filterContext';
import { GoalScheduler } from './goals';
import type { DamageEvent, DamageOutcome, EntityActuator, EntityHooks } from './hooks';
import type { PropertyDefinition, PropertyValue } from './properties';
import { PropertyValues } from './properties';

/**
 * The third content layer for entities: one live entity, holding its active
 * components, its attributes, its properties, its Molang variables, its goal
 * scheduler and the events waiting for its next tick.
 */

/** The per-instance state `@jsprismarine/content`'s `Instance` carries for this domain. */
export interface EntityState {
    readonly attributes: Attributes;
    readonly properties: PropertyValues;
    /** `variable.*` storage the entity's Molang expressions read and write. */
    readonly variables: Map<string, MolangValue>;
    /** The component groups active now, in the order they became active. */
    readonly activeGroups: Set<string>;
}

/** One active component, with the group that contributed it. */
interface ActiveComponent {
    readonly component: BoundComponent<EntityHooks>;
    /** The group that contributed the component, or undefined for a base component. */
    readonly group?: string;
}

/** What `minecraft:transformation` asks the world to do. */
export interface TransformRequest {
    /** The entity type to become. */
    readonly identifier: string;
    /** The event to run on the new entity, from the `identifier<event>` form. */
    readonly event?: string;
    /** Component groups to add to the new entity. */
    readonly addGroups: readonly string[];
    readonly keepLevel: boolean;
    readonly keepOwner: boolean;
    readonly preserveEquipment: boolean;
    readonly dropEquipment: boolean;
    readonly dropInventory: boolean;
}

/** What an entity needs from the world around it. */
export interface EntityEnvironment {
    /**
     * Builds the filter context for one evaluation. The entity fills in its
     * own facts (properties, components, type families, attributes) over
     * whatever this returns.
     */
    filterContext?(entity: EntityInstance): FilterContext;
    /** Moves, looks and jumps on behalf of the goals. */
    actuator?: EntityActuator;
    /** Draws the `randomize` weights and the `random_chance` filter. */
    random?: RandomSource;
    /** Evaluates a Molang expression for a `set_property` value or a component's expression. */
    molang?(source: string, entity: EntityInstance): PropertyValue | undefined;
    /**
     * Evaluates a property's Molang default. It takes no entity, because a
     * default expression may only call `query.had_component_group`, which
     * reads the saved data the entity is being built from.
     */
    propertyDefault?(source: string, definition: PropertyDefinition): PropertyValue | undefined;
    /** Delivers an event an entity triggered on another entity. */
    route?(trigger: OutgoingTrigger, entity: EntityInstance): void;
    /** Takes the entity out of the world, for `minecraft:despawn` and `minecraft:instant_despawn`. */
    remove?(entity: EntityInstance, reason: string): void;
    /** Replaces the entity with another type, for `minecraft:transformation`. */
    transform?(entity: EntityInstance, request: TransformRequest): void;
    /** Receives everything the runtime met and did not carry out. */
    report?(message: string, entity: EntityInstance): void;
}

/** Options for one {@link EntityInstance}. */
export interface EntityInstanceOptions {
    /** A stable identity, which the filter tests that compare two entities read. */
    id?: string | number;
    environment?: EntityEnvironment;
}

/**
 * One live entity.
 *
 * The active component set is the base `components` plus every active
 * component group, with a later group replacing an earlier component of the
 * same name. It changes only through {@link EntityInstance.applyEffects}, so
 * an event's effects land on a tick boundary.
 */
export class EntityInstance extends Instance<EntityHooks, EntityState, EntityTypeFlag> {
    /** The goals registered by the active `minecraft:behavior.*` components. */
    public readonly goals = new GoalScheduler();

    private readonly typeHolder: Holder<EntityType>;
    private readonly environment: EntityEnvironment;
    private readonly identity: string | number;
    private active = new Map<string, ActiveComponent>();
    private table = new HookTable<EntityHooks>([]);
    private pending: EventEffects[] = [];

    /**
     * @param holder - A holder from the registry of resolved entity types.
     */
    public constructor(holder: Holder<EntityType>, options: EntityInstanceOptions = {}) {
        const type = holder.value();
        const environment = options.environment ?? {};
        super(holder, {
            attributes: new Attributes(),
            properties: new PropertyValues(type.entity.description.properties, (definition, source) =>
                environment.propertyDefault?.(source, definition)
            ),
            variables: new Map(),
            activeGroups: new Set()
        });
        this.typeHolder = holder;
        this.environment = environment;
        this.identity = options.id ?? 0;
        this.rebuild([], []);
    }

    /** The entity type, with its component groups and its parsed definition. */
    public override get type(): EntityType {
        return this.typeHolder.value();
    }

    /** The entity's live attributes. */
    public get attributes(): Attributes {
        return this.state.attributes;
    }

    /** The entity's live property values. */
    public get properties(): PropertyValues {
        return this.state.properties;
    }

    /** The entity's `variable.*` Molang storage. */
    public get variables(): Map<string, MolangValue> {
        return this.state.variables;
    }

    /** The component groups active now, in the order they became active. */
    public activeComponentGroups(): readonly string[] {
        return [...this.state.activeGroups];
    }

    /** Every active component name, base components first and later groups last. */
    public activeComponents(): readonly string[] {
        return [...this.active.keys()];
    }

    /** Whether a component is active on the entity now. */
    public hasComponent(name: string): boolean {
        return this.active.has(name);
    }

    /** The parsed parameters of an active component, or undefined when it is not active. */
    public componentParams(name: string): unknown {
        return this.active.get(name)?.component.params;
    }

    /** The movement and look control the goals use, when the caller supplied one. */
    public get actuator(): EntityActuator | undefined {
        return this.environment.actuator;
    }

    /** The random source this entity draws from. */
    public get random(): RandomSource {
        return this.environment.random ?? defaultRandom;
    }

    /** Dispatches through the active component set rather than the type's base components. */
    public override dispatch<K extends keyof EntityHooks & string>(hook: K, ...args: Parameters<EntityHooks[K]>): void {
        this.table.dispatch(hook, ...args);
    }

    /** Dispatches through the active component set until one handler answers. */
    public override dispatchFirst<K extends keyof EntityHooks & string>(
        hook: K,
        ...args: Parameters<EntityHooks[K]>
    ): ReturnType<EntityHooks[K]> | undefined {
        return this.table.dispatchFirst(hook, ...args);
    }

    /**
     * Runs the one event an entity gets when it is created.
     *
     * Exactly one spawn event runs: the built-in event for the cause, or the
     * one the caller named, never both. Its effects apply at once, because the
     * entity has no earlier tick to defer to.
     *
     * @param named - The event `/summon`, a spawn rule or a transformation asked for.
     * @returns What the event determined.
     */
    public spawn(cause: SpawnCause = 'spawned', named?: string): EventEffects {
        const effects = this.determine(spawnEventFor(cause, named));
        this.applyEffects(effects);
        return effects;
    }

    /**
     * Runs an event and queues its effects for the entity's next tick.
     *
     * @returns What the event determined, which is settled now even though it
     *   lands later.
     */
    public fire(event: string): EventEffects {
        const effects = this.determine(event);
        this.pending.push(effects);
        return effects;
    }

    /** The events waiting for the next tick, oldest first. */
    public queued(): readonly EventEffects[] {
        return this.pending;
    }

    /**
     * Runs one server tick: applies the queued events, then the active
     * components' tick handlers, then the goal scheduler.
     */
    public tick(): void {
        const pending = this.pending;
        this.pending = [];
        for (const effects of pending) this.applyEffects(effects);

        this.dispatch('onTick', this);
        this.goals.tick();
    }

    /**
     * Offers one damage event to the active components.
     *
     * @returns What the first component that answered decided, or undefined
     *   when none did, which means the damage applies unchanged.
     */
    public damage(event: DamageEvent): DamageOutcome | undefined {
        return this.dispatchFirst('onDamage', this, event);
    }

    /**
     * Asks the world to take the entity out, which is what the despawn
     * components do.
     *
     * @param reason - What asked for the removal; it reaches the report when
     *   nothing in the environment handles removal.
     */
    public remove(reason: string): void {
        if (this.environment.remove === undefined) {
            this.report(`${reason} asked to remove the entity, which nothing handles`);
            return;
        }
        this.environment.remove(this, reason);
    }

    /** Asks the world to replace the entity with another type, for `minecraft:transformation`. */
    public transform(request: TransformRequest): void {
        if (this.environment.transform === undefined) {
            this.report(`a transformation into ${request.identifier} has nothing to carry it out`);
            return;
        }
        this.environment.transform(this, request);
    }

    /** Applies one event's effects now, outside the tick loop. */
    public applyEffects(effects: EventEffects): void {
        if (effects.removeGroups.length > 0 || effects.addGroups.length > 0)
            this.rebuild(effects.removeGroups, effects.addGroups);

        for (const write of effects.propertyWrites) {
            if (this.properties.set(write.name, write.value) === undefined)
                this.report(
                    `${effects.event} wrote ${JSON.stringify(write.value)} to ${write.name}, which rejected it`
                );
        }

        for (const trigger of effects.outgoingTriggers) {
            if (this.environment.route === undefined) {
                this.report(`${effects.event} triggers ${trigger.event} on ${trigger.target}, which nothing routes`);
                continue;
            }
            this.environment.route(trigger, this);
        }

        for (const action of effects.actions) this.report(`${effects.event} asks for ${action.name}`);
        for (const message of effects.unhandled) this.report(message);
    }

    /** Builds the filter context for this entity, with its own facts filled in. */
    public filterContext(): FilterContext {
        const supplied = this.environment.filterContext?.(this);
        return {
            ...supplied,
            self: this.selfView(supplied?.self),
            random: supplied?.random ?? this.random
        };
    }

    /** Runs the event and resolves its values, without changing anything. */
    private determine(event: string): EventEffects {
        const node = this.type.entity.events.get(event);
        if (node === undefined) return noEffects(event);

        return determineEvent(
            {
                event: (name) => this.type.entity.events.get(name),
                context: this.filterContext(),
                properties: this.properties,
                random: this.random,
                evaluate: (source) => this.environment.molang?.(source, this)
            },
            event
        );
    }

    /**
     * Recomputes the active component set after a group change.
     *
     * A component that left runs `onRemove`. A component that arrived runs
     * `onInitialize`, and so does one whose group was named in `added`, which
     * is the documented rule that re-adding an active group re-initializes its
     * components.
     */
    private rebuild(removed: readonly string[], added: readonly string[]): void {
        const groups = this.state.activeGroups;
        for (const name of removed) groups.delete(name);
        for (const name of added) {
            if (!this.type.groups.has(name)) {
                this.report(`an event added ${name}, which the entity declares no component group for`);
                continue;
            }
            // Deleting first moves a re-added group to the end, so its
            // components replace the ones an earlier group contributed.
            groups.delete(name);
            groups.add(name);
        }

        const before = this.active;
        const next = new Map<string, ActiveComponent>();
        for (const component of this.type.components) next.set(component.name, { component });
        for (const group of groups) {
            for (const component of this.type.groups.get(group)?.components ?? [])
                next.set(component.name, { component, group });
        }

        for (const [name, entry] of before) {
            if (next.has(name)) continue;
            entry.component.handlers.onRemove?.(this);
        }

        this.active = next;
        this.table = new HookTable<EntityHooks>(
            [...next.values()].map((entry) => ({
                source: entry.component.name,
                handlers: entry.component.handlers,
                override: false
            }))
        );

        for (const [name, entry] of next) {
            const previous = before.get(name);
            const reinitialized = entry.group !== undefined && added.includes(entry.group);
            if (previous !== undefined && previous.component === entry.component && !reinitialized) continue;
            entry.component.handlers.onInitialize?.(this);
        }
    }

    private report(message: string): void {
        this.environment.report?.(message, this);
    }

    /** Wraps a caller's view so the entity answers the facts it owns itself. */
    private selfView(base: FilterEntityView | undefined): FilterEntityView {
        const outer = base ?? {};
        return {
            id: () => outer.id?.() ?? this.identity,
            flag: (name: EntityFlag) => this.ownFlag(name) ?? outer.flag?.(name),
            measure: (name: EntityMeasure) => this.ownMeasure(name) ?? outer.measure?.(name),
            names: (name: EntityNameSet) => (name === 'is_family' ? this.families() : outer.names?.(name)),
            property: (name: string) => this.properties.get(name),
            hasProperty: (name: string) => this.properties.has(name),
            hasComponent: (name: string) => this.hasComponent(name),
            equipment: (slot, index) => outer.equipment?.(slot, index),
            slotFill: (slot) => outer.slotFill?.(slot),
            carries: (matches) => outer.carries?.(matches),
            vehicle: () => outer.vehicle?.(),
            owner: () => outer.owner?.(),
            attackTarget: () => outer.attackTarget?.(),
            leashHolder: () => outer.leashHolder?.(),
            trusts: (other) => outer.trusts?.(other)
        };
    }

    /** The type families of the active `minecraft:type_family` component. */
    private families(): readonly string[] {
        const params = this.componentParams('minecraft:type_family');
        if (params === null || typeof params !== 'object' || !('family' in params)) return [];
        const family = params.family;
        return Array.isArray(family) ? family.filter((name): name is string => typeof name === 'string') : [];
    }

    private ownFlag(name: EntityFlag): boolean | undefined {
        if (name === 'is_baby') return this.hasComponent('minecraft:is_baby');
        if (name === 'is_tamed') return this.hasComponent('minecraft:is_tamed');
        if (name === 'is_persistent') return this.hasComponent('minecraft:persistent');
        return undefined;
    }

    private ownMeasure(name: EntityMeasure): number | undefined {
        switch (name) {
            case 'actor_health':
                return this.attributes.get('health')?.current;
            case 'is_variant':
                return this.integerValue('minecraft:variant');
            case 'is_mark_variant':
                return this.integerValue('minecraft:mark_variant');
            case 'is_skin_id':
                return this.integerValue('minecraft:skin_id');
            default:
                return undefined;
        }
    }

    /** The `value` of one of the three integer state components. */
    private integerValue(component: string): number | undefined {
        const params = this.componentParams(component);
        return typeof params === 'number' ? params : undefined;
    }
}
