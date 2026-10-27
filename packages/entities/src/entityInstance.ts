import type { BoundComponent, Holder } from '@jsprismarine/content';
import { HookTable, Instance } from '@jsprismarine/content';
import type { MolangValue } from '@jsprismarine/molang';

import { Attributes } from './attributes';
import type { EquipmentParams, SlotDropChance } from './components/vanilla';
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
    FilterSubjects,
    RandomSource
} from './filterContext';
import { damagerSubjects, defaultRandom, isPlayerView } from './filterContext';
import { evaluateFilter } from './filters';
import { GoalScheduler } from './goals';
import type { JavaStatSource } from './javaStats';
import { javaAttributeBases } from './javaStats';
import type { JavaEntityNavigation } from './javaNavigation';
import type { EntityAction, EventTarget } from './events';
import type {
    DamageEvent,
    DamageResult,
    EntityActuator,
    EntityAngerBroadcast,
    EntityEffects,
    EntityItemInteractionEffect,
    EntityItemInteractionState,
    EntityHooks,
    EntityPosition,
    EntitySpawnRequest
} from './hooks';
import { FIRE_DAMAGE_CAUSES, FREEZING_DAMAGE_CAUSES } from './hooks';
import { isRideableParams } from './riding';
import type { PropertyDefinition, PropertyValue } from './properties';
import { PropertyValues } from './properties';
import type { TriggerComponentName } from './triggers';
import { isTriggerParams } from './triggers';

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

/** Whether one entry of a parsed `minecraft:equipment.slot_drop_chance` is the pair it should be. */
const isSlotDropChance = (entry: unknown): entry is SlotDropChance =>
    entry !== null &&
    typeof entry === 'object' &&
    'slot' in entry &&
    typeof entry.slot === 'string' &&
    'dropChance' in entry &&
    typeof entry.dropChance === 'number';

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
    /** Delivers an angry component's broadcast to nearby matching entities. */
    broadcastAnger?(entity: EntityInstance, request: EntityAngerBroadcast): void;
    /** Moves, looks and jumps on behalf of the goals. */
    actuator?: EntityActuator;
    /** Carries out the event actions that leave the package, such as `play_sound`. */
    effects?: EntityEffects;
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
    /** Creates an entity or item requested by a data component. */
    spawnEntity?(entity: EntityInstance, request: EntitySpawnRequest): boolean;
    /** Receives everything the runtime met and did not carry out. */
    report?(message: string, entity: EntityInstance): void;
    /**
     * Java Edition's entity stats, which decide the four attributes a Bedrock
     * client never simulates. Leaving it out runs the pack's own numbers.
     *
     * @see {@link SHARED_STATS} for which stat each edition decides.
     */
    javaStats?: JavaStatSource;
    /** Java's path navigator and collision behavior, when the host has the pinned class dump. */
    javaNavigation?: JavaEntityNavigation;
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
    private home: EntityPosition | undefined;
    private target: FilterEntityView | undefined;
    private mounted: EntityInstance | undefined;
    private readonly seated: EntityInstance[] = [];
    private filterContextCache: FilterContext | undefined;
    private filterContextSelf: FilterEntityView | undefined;

    /**
     * @param holder - A holder from the registry of resolved entity types.
     */
    public constructor(holder: Holder<EntityType>, options: EntityInstanceOptions = {}) {
        const type = holder.value();
        const environment = options.environment ?? {};
        super(holder, {
            attributes: new Attributes(javaAttributeBases(type.identifier, environment.javaStats)),
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

    /** Applies one held item through the active components.
     *
     * @param itemIdentifier - The held item's identifier.
     * @param other - The player or entity applying the item, for interaction filters.
     * @param state - Runtime-owned timers that gate stateful item interactions.
     * @returns Whether an active component accepted the item.
     */
    public interactWithItem(
        itemIdentifier: string,
        other?: FilterEntityView,
        state?: EntityItemInteractionState
    ): boolean {
        return this.interactWithItemResult(itemIdentifier, other, state) !== false;
    }

    /**
     * Dispatches one held item and returns any data-defined effect it requests.
     * A recognized spawn egg routes only through `minecraft:spawn_egg_interaction`.
     *
     * @param itemIdentifier - The held item's identifier.
     * @param other - The player or entity applying the item, for interaction filters.
     * @param state - Runtime-owned timers and resolved spawn-egg data for stateful interactions.
     * @returns False when no active component accepts the item, true when it accepts without
     *   inventory changes, or the item changes requested by the active component.
     */
    public interactWithItemResult(
        itemIdentifier: string,
        other?: FilterEntityView,
        state?: EntityItemInteractionState
    ): boolean | EntityItemInteractionEffect {
        if (state?.spawnEgg !== undefined) {
            const handler = this.active.get('minecraft:spawn_egg_interaction')?.component.handlers.onInteractWithItem;
            return handler?.(this, itemIdentifier, other, state) ?? false;
        }

        return this.dispatchFirst('onInteractWithItem', this, itemIdentifier, other, state) ?? false;
    }

    /** The movement and look control the goals use, when the caller supplied one. */
    public get actuator(): EntityActuator | undefined {
        return this.environment.actuator;
    }

    /** Java's path-navigation and collision rules for this type, when the host supplied them. */
    public get javaNavigation(): JavaEntityNavigation | undefined {
        return this.environment.javaNavigation;
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

    /** Applies the events already queued without advancing component or goal ticks. */
    public applyQueuedEvents(): void {
        const pending = this.pending;
        this.pending = [];
        for (const effects of pending) this.applyEffects(effects);
    }

    /**
     * Runs one server tick: applies the queued events, then the active
     * components' tick handlers, then the goal scheduler.
     */
    public tick(): void {
        this.applyQueuedEvents();

        this.dispatch('onTick', this);
        this.goals.tick();
    }

    /**
     * Applies one damage event.
     *
     * The first component that answers `onDamage` decides the amount, which is
     * what `minecraft:damage_sensor` does. An immunity component then turns the
     * cause aside, after the sensors have seen it, so a sensor still fires its
     * event on damage the entity ends up ignoring. What is left comes off the
     * `health` attribute, and `minecraft:on_hurt`,
     * `minecraft:on_hurt_by_player` and `minecraft:on_death` fire in that
     * order.
     *
     * @returns What landed, with the events queued for the entity's next tick.
     */
    public damage(event: DamageEvent): DamageResult {
        const outcome = this.dispatchFirst('onDamage', this, event);
        const events = [...(outcome?.events ?? [])];
        const amount = this.immuneTo(event.cause) ? 0 : Math.max(0, outcome?.amount ?? event.amount);

        const health = this.attributes.get('health');
        let remaining = health?.current;
        if (health !== undefined && amount > 0) remaining = this.attributes.set('health', health.current - amount);

        const subjects = damagerSubjects(event.damager);
        const fire = (component: TriggerComponentName): void => {
            const fired = this.trigger(component, subjects);
            if (fired !== undefined) events.push(fired);
        };

        if (amount > 0) {
            fire('minecraft:on_hurt');
            if (isPlayerView(event.damager)) fire('minecraft:on_hurt_by_player');
        }

        const died = amount > 0 && remaining !== undefined && remaining <= 0;
        if (died) fire('minecraft:on_death');

        const result = { amount, health: remaining, died, events };
        this.dispatch('onDamageProcessed', this, event, result);
        return result;
    }

    /**
     * Whether an immunity component on the entity turns a damage cause aside.
     *
     * `minecraft:fire_immune` and `minecraft:freezing_immune` are empty
     * markers, so the cause list is the whole of what each one means and the
     * entity reads them here rather than through a hook.
     */
    private immuneTo(cause: string): boolean {
        if (this.hasComponent('minecraft:fire_immune') && FIRE_DAMAGE_CAUSES.includes(cause)) return true;
        return this.hasComponent('minecraft:freezing_immune') && FREEZING_DAMAGE_CAUSES.includes(cause);
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

    /**
     * The position `set_home_position` recorded, which `home_distance` measures
     * against and `execute_event_on_home_block` fires its event on.
     */
    public get homePosition(): EntityPosition | undefined {
        return this.home;
    }

    /** Records where the entity's home is, which `minecraft:home` restricts it to. */
    public setHomePosition(position: EntityPosition | undefined): void {
        this.home = position;
    }

    /**
     * Carries out one event action.
     *
     * `set_home_position` and `stop_movement` go through the actuator and
     * `reset_target` moves state the entity owns; the other six leave through
     * {@link EntityEnvironment.effects}.
     *
     * @returns Whether anything carried the action out. False means the
     *   environment left the member out or the actuator is absent, which the
     *   caller reports.
     */
    public perform(action: EntityAction): boolean {
        const effects = this.environment.effects;
        switch (action.name) {
            case 'play_sound':
                if (effects?.playSound === undefined) return false;
                effects.playSound(this, action.sound);
                return true;
            case 'emit_particle':
                if (effects?.emitParticle === undefined) return false;
                effects.emitParticle(this, action.particle);
                return true;
            case 'emit_vibration':
                if (effects?.emitVibration === undefined) return false;
                effects.emitVibration(this, action.vibration);
                return true;
            case 'queue_command':
                if (effects?.queueCommand === undefined) return false;
                for (const command of action.commands) effects.queueCommand(this, command, action.target);
                return true;
            case 'drop_item':
                if (effects?.dropItem === undefined) return false;
                effects.dropItem(this, action.slot);
                return true;
            case 'set_home_position': {
                const position = this.actuator?.position();
                if (position === undefined) return false;
                this.home = position;
                return true;
            }
            case 'execute_event_on_home_block':
                if (this.home === undefined || effects?.executeEventOnBlock === undefined) return false;
                effects.executeEventOnBlock(this, this.home, action.event);
                return true;
            case 'stop_movement':
                // The actuator paths in three dimensions at once, so either
                // axis the action names stops the whole path.
                if (this.actuator === undefined || (!action.horizontal && !action.vertical)) return false;
                this.actuator.stopMoving();
                return true;
            case 'reset_target':
                this.setAttackTarget(undefined);
                return true;
        }
    }

    /**
     * Fires one of the ten event-shaped `minecraft:on_*` components.
     *
     * The component's own `filters` gate it, a `self` target queues the event
     * for the entity's next tick, and any other target leaves as an outgoing
     * trigger for the environment to route. Nothing happens when the component
     * is not active or names no event, which four vanilla bodies do.
     *
     * @param subjects - Extra filter subjects the fixed point knows about,
     *   such as the damager behind `minecraft:on_hurt_by_player`.
     * @returns The event that fired, or undefined when nothing did.
     */
    public trigger(component: TriggerComponentName, subjects: FilterSubjects = {}): string | undefined {
        const params = this.componentParams(component);
        if (!isTriggerParams(params) || params.event === undefined) return undefined;
        if (params.filters !== undefined && !evaluateFilter(params.filters, { ...this.filterContext(), ...subjects }))
            return undefined;

        return this.raise(params.event, params.target, component);
    }

    /**
     * Fires an event on one of the entity's subjects, which is what a
     * component's `{event, target}` pair names.
     *
     * A `self` target queues the event for the entity's next tick. Any other
     * target leaves as an outgoing trigger for the environment to route.
     *
     * @param source - What asked for the event, which names the report when
     *   nothing routes it.
     * @returns The event when it was raised, or undefined when nothing routed it.
     */
    public raise(event: string, target: EventTarget, source: string): string | undefined {
        if (target === 'self') {
            this.fire(event);
            return event;
        }
        if (this.environment.route === undefined) {
            this.report(`${source} fires ${event} on ${target}, which nothing routes`);
            return undefined;
        }
        this.environment.route({ event, target }, this);
        return event;
    }

    /**
     * Evaluates a Molang expression a component body carries against this
     * entity, such as `minecraft:ambient_sound_interval`'s `condition`.
     *
     * @returns The value, or undefined when the environment supplies no
     *   evaluator or the expression does not evaluate.
     */
    public evaluate(source: string): PropertyValue | undefined {
        return this.environment.molang?.(source, this);
    }

    /** Who is riding this entity, in the order they took their seats. */
    public get riders(): readonly EntityInstance[] {
        return this.seated;
    }

    /** What this entity is riding, which the `is_riding` filter test reads. */
    public get vehicle(): EntityInstance | undefined {
        return this.mounted;
    }

    /**
     * Seats a rider on this entity.
     *
     * The seat count caps the riders and `family_types` decides who is let in.
     * A rider already on something else leaves it first, and a seat taken
     * fires `on_rider_enter_event` on the vehicle.
     *
     * @returns Whether the rider took a seat. False means the entity carries
     *   no active `minecraft:rideable`, the seats are full, the rider is not of
     *   an allowed family, or the two are already in one riding chain.
     */
    public mount(rider: EntityInstance): boolean {
        const params = this.componentParams('minecraft:rideable');
        if (!isRideableParams(params)) return false;
        if (this.seated.length >= params.seatCount || this.seated.includes(rider)) return false;
        if (params.familyTypes.length > 0 && !params.familyTypes.some((name) => rider.families().includes(name)))
            return false;
        // A vehicle cannot end up riding its own passenger.
        for (let above: EntityInstance | undefined = this; above !== undefined; above = above.mounted)
            if (above === rider) return false;

        rider.mounted?.dismount(rider);
        this.seated.push(rider);
        rider.mounted = this;
        if (params.onRiderEnterEvent !== undefined) this.raise(params.onRiderEnterEvent, 'self', 'minecraft:rideable');
        return true;
    }

    /**
     * Takes a rider off this entity, firing `on_rider_exit_event`.
     *
     * @returns Whether the rider was on this entity.
     */
    public dismount(rider: EntityInstance): boolean {
        const seat = this.seated.indexOf(rider);
        if (seat < 0) return false;
        this.seated.splice(seat, 1);
        rider.mounted = undefined;

        const params = this.componentParams('minecraft:rideable');
        if (isRideableParams(params) && params.onRiderExitEvent !== undefined)
            this.raise(params.onRiderExitEvent, 'self', 'minecraft:rideable');
        return true;
    }

    /** Takes every rider off, which is what losing `minecraft:rideable` does. */
    public ejectRiders(): void {
        for (const rider of [...this.seated]) this.dismount(rider);
    }

    /**
     * The pack-relative loot table path of the active `minecraft:loot` component.
     *
     * Read off the active set rather than off the type, because most vanilla mobs declare the
     * component in a component group rather than in their base components: the cow carries it
     * in `minecraft:cow_adult`, so a type-level read finds nothing and a calf and a grown cow
     * would drop the same thing, which is nothing.
     *
     * @returns {string | undefined} The path, or undefined when no active component names one.
     */
    public lootTable(): string | undefined {
        const params = this.componentParams('minecraft:loot');
        if (params === null || typeof params !== 'object' || !('table' in params)) return undefined;
        return typeof params.table === 'string' ? params.table : undefined;
    }

    /**
     * What the active `minecraft:equipment` component declares: the loot table the entity
     * equips from, and the chance each slot's contents survive its death.
     *
     * Read off the active set for the same reason {@link EntityInstance.lootTable} is. Of the
     * 28 vanilla instances of the component, 15 sit in a component group rather than in base
     * components: a piglin's weapon depends on whether `melee_unit` or `ranged_unit` was added,
     * and a type-level read would find neither.
     *
     * @returns {EquipmentParams | undefined} The component's parameters, or undefined when no
     *   active component is `minecraft:equipment`.
     */
    public equipment(): EquipmentParams | undefined {
        const params = this.componentParams('minecraft:equipment');
        if (params === null || typeof params !== 'object' || !('slotDropChance' in params)) return undefined;
        if (!Array.isArray(params.slotDropChance)) return undefined;

        return {
            table: 'table' in params && typeof params.table === 'string' ? params.table : undefined,
            slotDropChance: params.slotDropChance.filter(isSlotDropChance)
        };
    }

    /** The type families of the active `minecraft:type_family` component. */
    public families(): readonly string[] {
        const params = this.componentParams('minecraft:type_family');
        if (params === null || typeof params !== 'object' || !('family' in params)) return [];
        const family = params.family;
        return Array.isArray(family) ? family.filter((name): name is string => typeof name === 'string') : [];
    }

    /** Whether the active type-family component contains any requested family. */
    public hasAnyFamily(families: readonly string[]): boolean {
        if (families.length === 0) return false;

        const params = this.componentParams('minecraft:type_family');
        if (params === null || typeof params !== 'object' || !('family' in params) || !Array.isArray(params.family))
            return false;

        for (const family of params.family) if (typeof family === 'string' && families.includes(family)) return true;
        return false;
    }

    /** What the entity is attacking now, which the `is_target` filter test reads. */
    public get attackTarget(): FilterEntityView | undefined {
        return this.target;
    }

    /**
     * Points the entity at a target, or clears it when passed undefined.
     *
     * Taking a target fires `minecraft:on_target_acquired` and losing one
     * fires `minecraft:on_target_escape`, each only when the target actually
     * changes, so a goal that reasserts the same target every tick fires
     * neither.
     */
    public setAttackTarget(view: FilterEntityView | undefined): void {
        if (view === this.target) return;
        this.target = view;
        this.trigger(view === undefined ? 'minecraft:on_target_escape' : 'minecraft:on_target_acquired');
    }

    /** Dispatches an attack to the active components. */
    public notifyAttack(target: FilterEntityView): void {
        this.dispatch('onAttack', this, target);
    }

    /** Asks the world to carry out one `minecraft:angry.broadcast_anger` request. */
    public broadcastAnger(request: EntityAngerBroadcast): void {
        if (this.environment.broadcastAnger === undefined) {
            this.report(`minecraft:angry broadcasts anger ${request.range} blocks, which nothing carries out`);
            return;
        }
        this.environment.broadcastAnger(this, request);
    }

    /** Asks the world to replace the entity with another type, for `minecraft:transformation`. */
    public transform(request: TransformRequest): void {
        if (this.environment.transform === undefined) {
            this.report(`a transformation into ${request.identifier} has nothing to carry it out`);
            return;
        }
        this.environment.transform(this, request);
    }

    /**
     * Asks the world to create an entity or item a component describes.
     *
     * @param request - The entity or item, count, and event the component configured.
     * @param source - The component asking the world to create it.
     * @returns Whether the world accepted the request.
     */
    public requestSpawn(request: EntitySpawnRequest, source = 'minecraft:spawn_entity'): boolean {
        if (this.environment.spawnEntity === undefined) {
            this.report(`${source} asks to create ${request.identifier}, which nothing handles`);
            return false;
        }
        return this.environment.spawnEntity(this, request);
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

        for (const action of effects.actions) {
            if (action.parsed === undefined) {
                this.report(`${effects.event} asks for ${action.name}, which this package does not carry out`);
                continue;
            }
            if (!this.perform(action.parsed))
                this.report(`${effects.event} asks for ${action.name}, which nothing in the world carries out`);
        }
        for (const message of effects.unhandled) this.report(message);
    }

    /** Builds the filter context for this entity, with its own facts filled in. */
    public filterContext(): FilterContext {
        const supplied = this.environment.filterContext?.(this);
        const random = supplied?.random ?? this.random;
        const cached = this.filterContextCache;
        if (
            cached !== undefined &&
            this.filterContextSelf === supplied?.self &&
            cached.other === supplied?.other &&
            cached.player === supplied?.player &&
            cached.target === supplied?.target &&
            cached.parent === supplied?.parent &&
            cached.baby === supplied?.baby &&
            cached.damager === supplied?.damager &&
            cached.holder === supplied?.holder &&
            cached.item === supplied?.item &&
            cached.block === supplied?.block &&
            cached.world === supplied?.world &&
            cached.random === random
        ) {
            return cached;
        }

        const context = {
            ...supplied,
            self: this.selfView(supplied?.self),
            random
        };
        this.filterContextCache = context;
        this.filterContextSelf = supplied?.self;
        return context;
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

    /**
     * Passes one line to the environment's report, which is where everything
     * the runtime met and did not carry out goes.
     */
    public report(message: string): void {
        this.environment.report?.(message, this);
    }

    /** Wraps a caller's view so the entity answers the facts it owns itself. */
    private selfView(base: FilterEntityView | undefined): FilterEntityView {
        const outer = base ?? {};
        return {
            id: () => outer.id?.() ?? this.identity,
            flag: (name: EntityFlag) => this.ownFlag(name) ?? outer.flag?.(name),
            measure: (name: EntityMeasure) => this.ownMeasure(name) ?? outer.measure?.(name),
            names: (name: EntityNameSet) => this.ownNames(name) ?? outer.names?.(name),
            property: (name: string) => this.properties.get(name),
            hasProperty: (name: string) => this.properties.has(name),
            hasComponent: (name: string) => this.hasComponent(name),
            equipment: (slot, index) => outer.equipment?.(slot, index),
            slotFill: (slot) => outer.slotFill?.(slot),
            carries: (matches) => outer.carries?.(matches),
            vehicle: () => this.mounted?.filterContext().self ?? outer.vehicle?.(),
            owner: () => outer.owner?.(),
            attackTarget: () => this.target ?? outer.attackTarget?.(),
            leashHolder: () => outer.leashHolder?.(),
            trusts: (other) => outer.trusts?.(other)
        };
    }

    private ownFlag(name: EntityFlag): boolean | undefined {
        if (name === 'is_baby') return this.hasComponent('minecraft:is_baby');
        if (name === 'is_missing_health') {
            const health = this.attributes.get('health');
            return health !== undefined && health.current < health.max;
        }
        if (name === 'is_tamed')
            return (
                this.hasComponent('minecraft:is_tamed') ||
                this.environment.filterContext?.(this).self.flag?.(name) === true
            );
        if (name === 'is_persistent') return this.hasComponent('minecraft:persistent');
        if (name === 'has_target') return this.target !== undefined;
        if (name === 'is_riding') return this.mounted !== undefined;
        return undefined;
    }

    /** The name sets the entity answers from its own components and its seats. */
    private ownNames(name: EntityNameSet): readonly string[] | undefined {
        if (name === 'is_family') return this.families();
        // The controlling passenger is whoever took the first seat.
        if (name === 'is_controlling_passenger_family') return this.seated[0]?.families();
        return undefined;
    }

    private ownMeasure(name: EntityMeasure): number | undefined {
        switch (name) {
            case 'actor_health':
                return this.attributes.get('health')?.current;
            case 'home_distance':
                return this.homeDistance();
            case 'rider_count':
                return this.seated.length;
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

    /** How far the entity is from its home, or undefined when it has none or cannot be located. */
    private homeDistance(): number | undefined {
        const position = this.actuator?.position();
        if (this.home === undefined || position === undefined) return undefined;
        return Math.hypot(position.x - this.home.x, position.y - this.home.y, position.z - this.home.z);
    }

    /** The `value` of one of the three integer state components. */
    private integerValue(component: string): number | undefined {
        const params = this.componentParams(component);
        return typeof params === 'number' ? params : undefined;
    }
}
