/**
 * The data-driven entity runtime: the live entities of one dimension.
 *
 * This is the whole of what used to be 111 entity classes, `MobStats`,
 * `EntitySize`, `LootTables`, `Brains`, `Targeting` and `Speed`. An entity is
 * a reference to a resolved `EntityType` plus the component state that type
 * builds, so adding a mob is adding a behavior-pack file and nothing else.
 *
 * Three things happen per entity per tick, in this order, which is the order
 * both AI packages document:
 *
 * 1. `EntityInstance.tick` applies the events that fired last tick, runs the
 *    active components, then runs the goal scheduler.
 * 2. A brain mob runs its `updateActivity` and then its brain, because the
 *    brain never chooses an activity - the mob does, and the brain only
 *    answers whether one is possible.
 * 3. The body takes one step along whatever walk the two systems asked for.
 *
 * The camel and the happy ghast run both 1 and 2, which is what
 * `BrainMobDefinition.alsoRunsGoals` is for.
 */
import { legacy_item_aliases } from '@jsprismarine/bedrock-data';
import type {
    EntityActuator,
    EntityEffects,
    EntityPosition,
    EntitySpawnRequest,
    EventTarget,
    FilterContext,
    FilterEntityView,
    OutgoingTrigger,
    TransformRequest
} from '@jsprismarine/entities';
import {
    canEntityAttack,
    EntityInstance,
    EVENT_TARGETS,
    evaluateFilter,
    isRecord,
    javaEntityNavigation,
    noEffects
} from '@jsprismarine/entities';
import { fluidStateOf } from '@jsprismarine/engine-systems';
import { parseFilter } from '@jsprismarine/packs';
import type { BlockQuery, GoalBlock, GoalItem, GoalMob, GoalWorld, NavigationView } from '@jsprismarine/entity-goals';
import { navigationProfile } from '@jsprismarine/entity-goals';
import type { SpawnRequest, SpawnWorld } from '@jsprismarine/spawning';
import { Spawner, despawnReason } from '@jsprismarine/spawning';
import type { Merchant } from '@jsprismarine/trading';

import { EYE_HEIGHT as PLAYER_EYE_HEIGHT } from '../Human';
import type { ContentEntity, ContentItemDrop } from '../../content/world/adapter';
import { BLOCK_DROPS, MOB_DROPS, MOB_GRIEFING, SPAWN_MOBS, ruleIsOn } from '../../content/world/gameRules';
import type { ServerContent } from '../../content/ServerContent';
import { bedrockItemDrops } from '../../item/bedrockDrops';
import { dropOfRolledStack } from '../../item/lootStack';
import { itemOfDrop } from '../../inventory/persistence';
import { breedableOf, canBreed, offspringOf, spendLove } from './breeding';
import { DataEntity, MobBody, distance } from './DataEntity';
import { EntityGrid } from './entityGrid';
import { detonate } from './explosion';
import { rollMobEquipment } from '../equipment';
import { EntityFactsLookup, javaLootIdOf } from './facts';
import type { EntityFacts } from './facts';
import { bodyCanOccupy, bodyIntersectsMedium, isSupported, moveOnAxis } from './collision';
import { actuatorOf, goalMobOf, goalWorldOf, playerGoalMob } from './goalWorld';
import { blockPositionOf } from './position';
import { brainMobFor } from './brainIdentifiers';
import { brainMobOf, brainWorldOf, tickBrainNavigation } from './brainWorld';
import { entityFilterContextOf } from './filterView';
import type { EntityHostFacts, EntityWorldFacts } from './host';
import { navigationViewOf } from './navigationView';
import type { DataEntityRecord } from './persistence';
import { applyDataEntityRecord } from './persistence';
import type { EntityItemInteraction } from './itemInteraction';
import { PointsOfInterest } from './poi';
import { RideIndex } from './riding';
import type { EntityScene, SpawnOptions } from './scene';
import { merchantFor } from './trading';

/** The interval between projectile samples, small enough not to skip a target. */
const PROJECTILE_SWEEP_STEP = 0.25;

/** Vanilla expands a projectile target by this amount before checking a hit. */
const PROJECTILE_HIT_MARGIN = 0.3;

/** How long a projectile ignores its owner and stays alive, in ticks. */
const PROJECTILE_OWNER_GRACE = 5;
const PROJECTILE_MAX_LIFE = 1200;
const PROJECTILE_KNOCKBACK = 0.4;
const PROJECTILE_KNOCKBACK_LIFT = 0.1;
const PLAYER_WIDTH = 0.6;
const PLAYER_HEIGHT = 1.8;

/** The default eye position as a fraction of a non-player entity's hitbox height. */
export const PROJECTILE_EYE_HEIGHT_FRACTION = 0.85;

/** The body and flight lifetime state of one active projectile. */
interface ProjectileState {
    age: number;
    stuck: boolean;
    readonly hitEntities: Set<number>;
}

/** Whether a point along a projectile's path overlaps a target's data-driven box. */
const projectileOverlaps = (
    at: EntityPosition,
    projectile: { readonly width: number; readonly height: number },
    target: EntityPosition,
    width: number,
    height: number
): boolean =>
    Math.abs(at.x - target.x) <= projectile.width / 2 + width / 2 + PROJECTILE_HIT_MARGIN &&
    Math.abs(at.z - target.z) <= projectile.width / 2 + width / 2 + PROJECTILE_HIT_MARGIN &&
    at.y + projectile.height >= target.y - PROJECTILE_HIT_MARGIN &&
    at.y <= target.y + height + PROJECTILE_HIT_MARGIN;

/** Turns a direction, speed, and spread into a projectile velocity. */
const projectileVelocity = (
    direction: EntityPosition,
    speed: number,
    inaccuracy: number,
    random: { nextFloat(): number }
): EntityPosition => {
    const length = Math.hypot(direction.x, direction.y, direction.z);
    const unit =
        length > 0
            ? { x: direction.x / length, y: direction.y / length, z: direction.z / length }
            : { x: 0, y: 0, z: 1 };
    const spread = Math.max(0, inaccuracy) * 0.0075;
    const gaussian = (): number => {
        const first = Math.max(Number.MIN_VALUE, random.nextFloat());
        const second = random.nextFloat();
        return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
    };
    const scattered =
        spread === 0
            ? unit
            : { x: unit.x + gaussian() * spread, y: unit.y + gaussian() * spread, z: unit.z + gaussian() * spread };
    const launchSpeed = Math.max(0, Number.isFinite(speed) ? speed : 0);

    return {
        x: scattered.x * launchSpeed,
        y: scattered.y * launchSpeed,
        z: scattered.z * launchSpeed
    };
};

/** How to build one {@link EntityRuntime}. */
export interface EntityRuntimeOptions {
    /**
     * The built content, read back lazily.
     *
     * The world adapter is assembled before `buildServerContent` returns, so a
     * runtime that held the content directly could not be built at all. This
     * is the same closure `contentWorldViews` takes for the same reason.
     */
    content(): ServerContent;
    readonly world: EntityWorldFacts;
    readonly host: EntityHostFacts;
    /** Receives everything the runtime met and could not carry out. */
    report?(message: string): void;
    /**
     * Called once per entity, after its spawn event has run.
     *
     * This is how a server that has to show an entity to a client learns that
     * one exists. The runtime's index is the behavior; the body a client is
     * sent is the host's, and it is created here rather than by every caller
     * of {@link EntityRuntime.spawn}.
     */
    onSpawn?(entity: DataEntity): void;
    /** Called once per entity, after it has left the index. */
    onRemove?(entity: DataEntity, reason: string): void;
    /**
     * Draws the next runtime id, so a host can keep one pool of them.
     *
     * A goal names a target by runtime id and does not care which index
     * answers, so the ids of this runtime's entities and of the host's players
     * have to be drawn from the same counter. A host that keeps its own
     * entities supplies this; one that does not gets a counter from 1.
     */
    nextId?(): number;
}

/** The live entities of one dimension, and the AI that drives them. */
export class EntityRuntime implements EntityScene {
    public readonly world: EntityWorldFacts;
    public readonly host: EntityHostFacts;

    private readonly entities = new Map<number, DataEntity>();
    /** Lethal hits waiting for their queued `minecraft:on_death` events to apply. */
    private readonly pendingDeaths = new Set<number>();
    /** Where each of them stands, which is what makes a neighbor search cheaper than a scan. */
    private readonly grid = new EntityGrid();
    /** The entity each `EntityInstance` belongs to, which is how the AI seams resolve a body. */
    private readonly byInstance = new Map<EntityInstance, DataEntity>();
    /**
     * The body being built right now.
     *
     * A goal component builds its support inside `new EntityInstance`, before
     * the entity it belongs to exists, and the support keeps the actuator and
     * the goal world it was handed. This is that body, and it is the only
     * moment at which an instance is not yet in the index.
     */
    private spawning: MobBody | undefined;
    /** The pool each entity's spawn counted against, for `SpawnWorld.poolCount`. */
    private readonly pools = new Map<number, string>();
    /** The start height and pass-through blocks for each active falling-block entity. */
    private readonly fallingBlocks = new Map<
        number,
        { readonly startY: number; readonly fallThrough: ReadonlySet<string> }
    >();
    /** Flight age and impacts already passed through for each active projectile. */
    private readonly projectiles = new Map<number, ProjectileState>();
    /** One merchant per trading entity, kept because `persist_trades` means the offers are drawn once. */
    private readonly merchants = new Map<number, Merchant>();
    /** Who rides whom, which both the rider's and the vehicle's goals read. */
    private readonly rides = new RideIndex();
    /** The points of interest of the dimension, which eleven goals search. */
    private readonly interest = new PointsOfInterest({ navigation: () => this.navigation() });
    /** The point-of-interest kinds already reported as unindexed, so each is said once. */
    private readonly unindexedPoi = new Set<string>();
    private readonly lookupContent: () => ServerContent;
    private readonly onReport: (message: string) => void;
    private readonly onSpawn: (entity: DataEntity) => void;
    private readonly onRemove: (entity: DataEntity, reason: string) => void;
    private readonly drawId: () => number;
    private facts: EntityFactsLookup | undefined;
    private factsGeneration = -1;
    private spawner: Spawner | undefined;
    /** The world the spawn rules read, kept because the despawn pass reads the same one. */
    private spawnWorld: SpawnWorld | undefined;
    /** The path finder's view, built once; see {@link EntityRuntime.navigation}. */
    private navigationView: NavigationView | undefined;
    private nextId = 1;

    public constructor(options: EntityRuntimeOptions) {
        this.lookupContent = options.content;
        this.world = options.world;
        this.host = options.host;
        this.onReport = options.report ?? (() => undefined);
        this.onSpawn = options.onSpawn ?? (() => undefined);
        this.onRemove = options.onRemove ?? (() => undefined);
        this.drawId =
            options.nextId ??
            (() => {
                const id = this.nextId;
                this.nextId += 1;
                return id;
            });
    }

    /** The built content. */
    public content(): ServerContent {
        return this.lookupContent();
    }

    /** The facts of every entity type, rebuilt when the content registry is replaced. */
    public typeFacts(): EntityFactsLookup {
        const registry = this.content().entities.registry;
        if (this.facts === undefined || this.factsGeneration !== registry.generation) {
            this.facts = new EntityFactsLookup(registry);
            this.factsGeneration = registry.generation;
        }
        return this.facts;
    }

    /** Every live entity, in spawn order. */
    public all(): readonly DataEntity[] {
        return [...this.entities.values()];
    }

    /** One live entity by its runtime id, or undefined when this index holds no such entity. */
    public byId(id: number): DataEntity | undefined {
        return this.entities.get(id);
    }

    /**
     * Every live entity within a radius of a position, in spawn order.
     *
     * The hot read of the whole runtime: `goalWorld.mobs` calls it once per
     * goal that searches for a neighbor, which at a hundred mobs is about
     * seventy-five times a tick. {@link EntityGrid} is what keeps that from
     * crossing every entity each time.
     */
    public near(center: EntityPosition, radius: number): readonly DataEntity[] {
        return this.grid.within(center, radius);
    }

    /** How many live entities of one type stand within a radius of a position. */
    public countOfType(identifier: string, at: EntityPosition, radius: number): number {
        return this.near(at, radius).filter((entity) => entity.identifier === identifier).length;
    }

    /** How many live entities count against one population pool's cap. */
    public poolCount(pool: string): number {
        let count = 0;
        for (const [id, name] of this.pools) if (name === pool && this.entities.has(id)) count += 1;
        return count;
    }

    /**
     * Creates one entity and runs its spawn event.
     *
     * Exactly one spawn event runs: `minecraft:entity_spawned` by default,
     * `entity_born`, `entity_transformed` or `on_prime` for the other three
     * causes, and an event the caller names replaces it rather than adding to
     * it. That is the rule `@jsprismarine/entities` implements, and spawning
     * is the only place the server has to get it right.
     *
     * @returns The entity, or undefined when the content declares no such type.
     */
    public spawn(identifier: string, at: EntityPosition, options: SpawnOptions = {}): DataEntity | undefined {
        const entity = this.create(identifier, at, options);
        if (entity === undefined) return undefined;
        if (!this.hasValidFallingBlockData(entity)) {
            this.remove(entity.id, 'invalid_spawn_data');
            return undefined;
        }

        entity.instance.spawn(options.cause ?? 'spawned', options.event);
        // Between the spawn event and the body, for the same reason the body comes last. The
        // event is what activates the component group a mob's `minecraft:equipment` usually
        // sits in - a piglin's weapon depends on whether `melee_unit` or `ranged_unit` was
        // added - so a roll before it would find no component, and a roll after the body
        // would leave the client a frame of an empty-handed skeleton.
        this.equip(entity);
        // After the spawn event, so the body a client is sent already carries whatever the
        // event added: a baby is born a baby rather than growing into one on the next tick.
        this.onSpawn(entity);
        return entity;
    }

    /**
     * Brings one saved entity back, with the state it was saved with.
     *
     * No spawn event runs. The record already holds what the spawn event did
     * the first time, and running it again would add the groups a second time
     * and reset every attribute the entity had spent: a wounded mob would come
     * back at full health and a sheared sheep with its wool.
     *
     * @param at - Where the saved body stood, which the record does not carry
     *   because the actor compound already does.
     * @returns The entity, or undefined when no loaded pack declares its type,
     *   in which case the caller restores the saved body the way it always did.
     */
    public restore(record: DataEntityRecord, at: EntityPosition): DataEntity | undefined {
        const entity = this.create(record.identifier, at, {
            pool: record.pool,
            yaw: record.yaw,
            pitch: record.pitch,
            data: record.spawnData
        });
        if (entity === undefined) return undefined;
        if (!this.hasValidFallingBlockData(entity)) {
            this.remove(entity.id, 'invalid_spawn_data');
            return undefined;
        }

        applyDataEntityRecord(entity, record);
        this.onSpawn(entity);
        return entity;
    }

    /** The population pool one entity's spawn counted against, if any. */
    public poolOf(id: number): string | undefined {
        return this.pools.get(id);
    }

    /** A falling-block payload must name a block the active content stack knows. */
    private hasValidFallingBlockData(entity: DataEntity): boolean {
        if (!entity.instance.hasComponent('jsprismarine:falling_block')) return true;

        const blockName = entity.spawnData?.['block'];
        if (typeof blockName === 'string' && this.content().blocks.types.has(blockName)) return true;

        this.report(`${entity.identifier} needs a known block identifier in its spawn data`);
        return false;
    }

    /**
     * Builds one entity and puts it in the index, without running anything on it.
     *
     * The step {@link EntityRuntime.spawn} and {@link EntityRuntime.restore}
     * share. What separates the two is only what happens to the entity next: a
     * spawn runs its spawn event, a restore writes the state it was saved with.
     */
    private create(identifier: string, at: EntityPosition, options: SpawnOptions): DataEntity | undefined {
        const content = this.content();
        const registry = content.entities.registry;
        const reference = identifier.includes('<') ? identifier.slice(0, identifier.indexOf('<')) : identifier;
        if (!registry.has(reference)) {
            this.report(`asked to spawn ${reference}, which the content declares no entity type for`);
            return undefined;
        }

        const facts = this.typeFacts().get(reference);
        if (facts === undefined) return undefined;

        const id = this.drawId();

        // The body comes first: a goal component builds its support while the instance is being
        // constructed, and that reads the actuator straight away.
        const body = new MobBody(id, at, facts);
        body.yaw = options.yaw ?? 0;
        body.pitch = options.pitch ?? 0;
        this.spawning = body;
        const instance = new EntityInstance(registry.holder(reference), {
            id,
            environment: {
                actuator: actuatorOf(body, this),
                effects: {
                    playSound: (_source, sound) => this.world.effects.playSound(blockPositionOf(body.position), sound),
                    emitParticle: (_source, particle) =>
                        this.world.effects.spawnParticle(blockPositionOf(body.position), particle),
                    emitVibration: (_source, vibration) =>
                        this.world.effects.emitGameEvent(`minecraft:${vibration}`, blockPositionOf(body.position), id)
                } satisfies EntityEffects,
                filterContext: (): FilterContext => entityFilterContextOf(body, this),
                random: { next: () => this.world.random.nextFloat() },
                javaStats: content.entities.javaStats,
                javaNavigation: javaEntityNavigation(reference, content.entities.javaNavigation),
                remove: (removed, reason) => this.removeInstance(removed, reason),
                transform: (from, request) => this.transform(from, request),
                spawnEntity: (from, request) => this.spawnFromComponent(from, request),
                route: (trigger, from) => this.route(trigger, from),
                report: (message) => this.report(`${reference}: ${message}`)
            }
        });

        this.spawning = undefined;

        const brainMob = brainMobFor(content.entities.brains, reference);
        const brain = brainMob?.makeBrain({ baby: instance.hasComponent('minecraft:is_baby') });
        const entity = new DataEntity({ body, instance, brainMob, brain, spawnData: options.data });
        this.entities.set(id, entity);
        this.byInstance.set(instance, entity);
        // After the index, and with the hook set last: everything a component did while the
        // instance was being built moved a body nothing was watching yet, and the grid files
        // where the body ended up rather than where it started.
        this.grid.add(entity);
        body.onMove = () => this.grid.refile(entity);
        if (options.pool !== undefined) this.pools.set(id, options.pool);

        if (brain !== undefined) {
            brain.delaySensorStarts((bound) => this.world.random.nextInt(bound));
            brainMob?.initMemories?.({ world: this.brainWorld(), body: brainMobOf(entity, brain, this) });
        }

        return entity;
    }

    /** Creates the child or item requested by an active entity component. */
    private spawnFromComponent(source: EntityInstance, request: EntitySpawnRequest): boolean {
        const parent = this.byInstance.get(source);
        if (parent === undefined) return false;

        const at = parent.position;
        let spawned = false;
        for (let index = 0; index < request.count; index += 1) {
            if (request.kind === 'item') {
                const identifier = legacy_item_aliases[request.identifier] ?? request.identifier;
                if (!this.content().items.registry.has(identifier)) {
                    this.report(`${parent.identifier} asks to spawn unknown item ${request.identifier}`);
                    continue;
                }
                this.host.drop(blockPositionOf(at), { identifier, count: 1 });
                if (request.itemEvent !== undefined)
                    source.raise(request.itemEvent.event, request.itemEvent.target, 'minecraft:spawn_entity');
                spawned = true;
            } else {
                const child = this.spawn(request.identifier, at, {
                    cause: request.cause,
                    event: request.event
                });
                if (child === undefined) continue;
                if (request.shouldLeash)
                    this.report(
                        `${parent.identifier} asks to leash spawned ${child.identifier}, which the runtime does not track`
                    );
                spawned = true;
            }

            if (request.sound !== undefined && request.sound.length > 0)
                this.world.effects.playSound(blockPositionOf(at), request.sound);
        }

        return spawned;
    }

    /** Takes an entity out of the world. */
    public remove(id: number, reason: string): void {
        const entity = this.entities.get(id);
        if (entity === undefined) return;
        entity.removed = reason;
        this.entities.delete(id);
        this.pendingDeaths.delete(id);
        this.byInstance.delete(entity.instance);
        this.grid.remove(entity);
        entity.body.onMove = undefined;
        this.pools.delete(id);
        this.merchants.delete(id);
        this.fallingBlocks.delete(id);
        this.projectiles.delete(id);
        this.rides.remove(id);
        this.onRemove(entity, reason);
    }

    /**
     * Runs one server tick for every live entity.
     *
     * @param tick - The world's tick counter, which is what the spawner's
     *   per-pool cadence is measured against.
     */
    public tick(tick: number): void {
        const entities = this.all();
        let widest = 0;
        let tallest = 0;
        for (const entity of entities) {
            widest = Math.max(widest, entity.facts.box.width);
            tallest = Math.max(tallest, entity.facts.box.height);
        }

        for (const entity of entities) {
            if (entity.removed !== undefined) continue;
            if (this.pendingDeaths.delete(entity.id)) {
                entity.instance.applyQueuedEvents();
                if (entity.removed !== undefined) continue;
                if (!entity.instance.hasComponent('minecraft:behavior.dragondeath')) {
                    this.kill(entity);
                    continue;
                }
            }
            this.updateMedium(entity);
            this.tickTimers(entity.body);
            entity.instance.tick();
            this.tickBrain(entity);
            tickBrainNavigation(entity);
            this.coast(entity);
            if (entity.removed !== undefined) continue;
            this.step(entity);
            this.updateMedium(entity);
            this.updateGrounded(entity);
            this.carryRiders(entity);
            if (entity.removed !== undefined) continue;
            this.pushIntersectingEntity(entity, widest, tallest);
        }
        this.runSpawnCycle(tick);
        this.runDespawnCycle();
    }

    /**
     * Starts the spawn loop.
     *
     * The `SpawnWorld` comes from the caller rather than from here because
     * `src/content/world/views.ts` already projects it out of the assembled
     * adapter, and projecting it twice would be two places for the spawn
     * rules to read a different world.
     */
    public startSpawning(world: SpawnWorld): void {
        this.spawnWorld = world;
        this.spawner = new Spawner({
            rules: this.content().spawnRules,
            world,
            random: this.world.random,
            onUnanswered: (test, reason) => this.report(`a spawn rule's ${test.test} test was ${reason}`)
        });
    }

    /**
     * The entities the spawner asked for on this tick, after they were created.
     *
     * `doMobSpawning` stops the cycle rather than the spawn, which is what Java's
     * `NaturalSpawner` does with it: the despawn pass still runs, so turning the rule off
     * empties a world instead of freezing it at whatever was already standing in it.
     */
    private runSpawnCycle(tick: number): readonly SpawnRequest[] {
        const spawner = this.spawner;
        if (spawner === undefined) return [];
        if (!ruleIsOn(this.world.level, SPAWN_MOBS)) return [];

        const requests = spawner.tick(tick);
        for (const request of requests)
            this.spawn(request.identifier, request.position, { event: request.spawnEvent, pool: request.pool });
        return requests;
    }

    /**
     * Takes out every entity the population rules say should not be there.
     *
     * Only entities a spawn rule produced, which is what the pool record
     * distinguishes: an animal a player bred and a villager that belongs to a
     * village are nobody's to cull, and vanilla keeps them for the same
     * reason. The two rules are `@jsprismarine/spawning`'s, so the Y floor and
     * the simulation edge are one number each rather than one per caller.
     */
    private runDespawnCycle(): void {
        const world = this.spawnWorld;
        if (world === undefined) return;

        for (const entity of this.all()) {
            if (!this.pools.has(entity.id)) continue;
            const reason = despawnReason({ position: blockPositionOf(entity.position) }, world);
            if (reason !== undefined) this.remove(entity.id, reason);
        }
    }

    /** Updates the liquid conditions every entity's components read this tick. */
    private updateMedium(entity: DataEntity): void {
        const { body, facts } = entity;
        const navigation = this.navigation();
        const inWater = bodyIntersectsMedium(body.position, facts.box, navigation.isWater);
        const inLava = bodyIntersectsMedium(body.position, facts.box, navigation.isLava);
        const head = blockPositionOf({
            x: body.position.x,
            y: body.position.y + facts.box.height - MOVEMENT_EPSILON,
            z: body.position.z
        });

        setCondition(body.conditions, 'in_water', inWater);
        setCondition(body.conditions, 'in_contact_with_water', inWater);
        setCondition(body.conditions, 'in_lava', inLava);
        setCondition(body.conditions, 'is_underwater', navigation.isWater(head));
    }

    /** Rechecks support after AI movement, so packets describe the position clients receive. */
    private updateGrounded(entity: DataEntity): void {
        const physics = entity.instance.componentParams('minecraft:physics');
        const hasCollision = !isRecord(physics) || physics.hasCollision !== false;
        const grounded =
            hasCollision &&
            entity.body.velocity.y <= 0 &&
            isSupported(entity.position, entity.facts.box, this.navigation());
        setCondition(entity.body.conditions, 'on_ground', grounded);
    }

    /** Runs one brain mob's activity update and then its brain. */
    private tickBrain(entity: DataEntity): void {
        const brain = entity.brain;
        const definition = entity.brainMob;
        if (brain === undefined || definition === undefined) return;

        // The context is rebuilt each tick because `BrainMob` is a view over live state rather
        // than a stored object, which is what keeps it from going stale after a position change.
        const context = { world: this.brainWorld(), body: brainMobOf(entity, brain, this) };
        definition.updateActivity(context);
        brain.tick(context);
    }

    /**
     * The blocks as the path finder reads them.
     *
     * One view for the whole runtime rather than one per query. The view
     * closes over nothing that changes, and it memoizes the block reads a
     * path search repeats thousands of times per tick, which a view rebuilt
     * per call would throw away each time.
     */
    public navigation(): NavigationView {
        this.navigationView ??= navigationViewOf(this.world.blocks, () => this.content());
        return this.navigationView;
    }

    /**
     * The body one `EntityInstance` drives.
     *
     * Every instance the runtime made is in the index, except the one being
     * constructed now, which is why {@link EntityRuntime.spawning} exists.
     */
    public bodyOf(instance: EntityInstance): MobBody | undefined {
        return this.byInstance.get(instance)?.body ?? this.spawning;
    }

    /** The goal world for one instance, or undefined when it runs no goals. */
    public goalWorldFor(instance: EntityInstance): GoalWorld | undefined {
        const body = this.bodyOf(instance);
        if (body === undefined) return undefined;
        const entity = this.byInstance.get(instance);
        if (entity !== undefined && !entity.runsGoals) return undefined;
        return goalWorldOf(body, this);
    }

    /** The movement and look control for one instance. */
    public actuatorFor(instance: EntityInstance): EntityActuator | undefined {
        const body = this.bodyOf(instance);
        return body === undefined ? undefined : actuatorOf(body, this);
    }

    /** The one level the twenty brain mobs read. */
    public brainWorld() {
        return brainWorldOf(this);
    }

    /**
     * Item stacks lying within a radius, nearest first.
     *
     * Dropped items are the item subsystem's entities rather than this
     * runtime's, so they come from the host. A host with no item index finds
     * none, and the pickup goals stay asleep rather than reaching for
     * something that is not there.
     */
    public items(center: EntityPosition, radius: number): readonly GoalItem[] {
        return (this.host.items?.() ?? [])
            .filter((lying) => distance(center, lying.position) <= radius)
            .sort((a, b) => distance(center, a.position) - distance(center, b.position))
            .map((lying) => ({
                id: lying.id,
                position: () => lying.position,
                identifier: () => lying.item.identifier,
                count: () => lying.item.count
            }));
    }

    /** One entity or player, by runtime id, as a goal sees it. */
    public mobById(id: number): GoalMob | undefined {
        const entity = this.entities.get(id);
        if (entity !== undefined) return goalMobOf(entity, this);

        const player = this.host.players().find((candidate) => candidate.id === id);
        return player === undefined ? undefined : playerGoalMob(player.id, player.identifier, player.position);
    }

    /** The nearest point of interest of a kind, for the eleven goals that ask. */
    public poi(kind: string, center: EntityPosition, radius: number): EntityPosition | undefined {
        // Once per kind, because a goal asks every tick and the gap is worth naming once.
        if (!this.interest.knows(kind) && !this.unindexedPoi.has(kind)) {
            this.unindexedPoi.add(kind);
            this.report(`nothing indexes the ${kind} points of interest, so the goals that want one wait`);
        }
        return this.interest.nearest(kind, center, radius);
    }

    /**
     * Records a point of interest nothing in the blocks marks.
     *
     * The warden's `suspicious_location` and the dolphin's `buried_treasure`
     * arrive this way, from the subsystem that knows where they are.
     */
    public recordPointOfInterest(kind: string, at: EntityPosition): void {
        this.interest.record(kind, at);
    }

    /** Every block matching a query around a position, nearest first. */
    public blocks(center: EntityPosition, query: BlockQuery): readonly GoalBlock[] {
        const wanted = query.identifiers === undefined ? undefined : new Set(query.identifiers);
        const found: GoalBlock[] = [];
        const origin = blockPositionOf(center);

        for (let dy = -query.height; dy <= query.height; dy += 1) {
            for (let dx = -query.range; dx <= query.range; dx += 1) {
                for (let dz = -query.range; dz <= query.range; dz += 1) {
                    const position = { x: origin.x + dx, y: origin.y + dy, z: origin.z + dz };
                    const block = this.world.blocks.get(position);
                    if (block === undefined) continue;
                    if (wanted !== undefined && !wanted.has(block.identifier)) continue;
                    found.push({ position, identifier: block.identifier });
                }
            }
        }

        return found.sort((a, b) => distance(center, a.position) - distance(center, b.position));
    }

    /**
     * Deals one entity's melee damage to another.
     *
     * A target this index does not hold is a player, and a player's health is
     * the server's rather than the runtime's, so the blow goes out through
     * {@link EntityHostFacts.hurt}. A host that supplies no route for it is
     * told once per swing rather than letting the mob connect with nothing.
     */
    public attack(attacker: MobBody, target: GoalMob): void {
        if (typeof target.id !== 'number') return;
        const damage = attacker.facts.attackDamage;

        const other = this.entities.get(target.id);
        if (other !== undefined) {
            this.hurt(other, attacker.id, 'entity_attack', damage);
            return;
        }

        if (this.host.hurt === undefined) {
            this.report(`${attacker.identifier} hit entity ${target.id}, which nothing routes damage to`);
            return;
        }
        this.host.hurt(target.id, damage, 'entity_attack', attacker.id);
    }

    /**
     * Takes health off one entity and remembers who took it.
     *
     * The record is what `hurt_by_target`, `panic`, `play_dead` and the
     * wither's targeting read, so every path that deals damage goes through
     * here rather than writing the attribute itself.
     */
    public hurt(entity: DataEntity, sourceId: number | undefined, cause: string, amount: number): void {
        if (this.pendingDeaths.has(entity.id)) return;
        if (entity.instance.attributes.get('health') === undefined) return;

        if (sourceId !== undefined && ['entity_attack', 'entity_explosion', 'projectile'].includes(cause)) {
            const attacker = this.entities.get(sourceId);
            if (attacker !== undefined && !canEntityAttack(attacker.instance, entity.instance)) return;
        }

        const damager = sourceId === undefined ? undefined : this.mobById(sourceId)?.view();
        const result = entity.instance.damage({ cause, amount, damager });
        if (result.amount > 0) entity.body.damage.record(sourceId, cause, result.amount);
        if (result.died) {
            if (entity.instance.queued().length > 0) this.pendingDeaths.add(entity.id);
            else this.kill(entity);
        }
    }

    /** Knocks a mob away from the entity, scaled by what the target resists. */
    public knockback(source: MobBody, target: GoalMob, horizontal: number, vertical: number): void {
        const other = typeof target.id === 'number' ? this.entities.get(target.id) : undefined;
        if (other === undefined) return;

        const resisted = 1 - other.facts.knockbackResistance;
        if (resisted <= 0) return;

        const away = distance(source.position, other.position) || 1;
        other.position = {
            x: other.position.x + ((other.position.x - source.position.x) / away) * horizontal * resisted,
            y: other.position.y + vertical * resisted,
            z: other.position.z + ((other.position.z - source.position.z) / away) * horizontal * resisted
        };
        // Being knocked about is what `minecraft:behavior.target_when_pushed` answers to, and
        // it is a separate record from the damage, because a push is not damage.
        other.body.lastPusher = source.id;
    }

    /**
     * Fires one entity's projectile at a mob.
     *
     * The projectile the goal named wins, and `minecraft:shooter` is the
     * fallback, which is where every vanilla shooter writes it. The arrow is
     * created at the shooter's eye with the velocity that points it at the
     * target. Flight and impact are then handled by its `minecraft:projectile`
     * component.
     */
    public shoot(shooter: MobBody, target: GoalMob, projectile: string | undefined): void {
        const identifier = projectile ?? this.shooterDefinitionOf(shooter);
        if (identifier === undefined) {
            this.report(`${shooter.identifier} has no projectile to shoot, and its goal named none`);
            return;
        }

        const from = {
            x: shooter.position.x,
            y: shooter.position.y + shooter.facts.box.height * PROJECTILE_EYE_HEIGHT_FRACTION,
            z: shooter.position.z
        };
        const at = target.position();
        const away = distance(from, at) || 1;
        this.launchProjectile(
            identifier,
            from,
            { x: (at.x - from.x) / away, y: (at.y - from.y) / away, z: (at.z - from.z) / away },
            PROJECTILE_SPEED,
            0,
            shooter.id
        );
    }

    /**
     * Spawns a projectile with its owner and launch velocity recorded in the live entity runtime.
     *
     * Its flight is read from `minecraft:projectile`; a type without that component is refused
     * instead of leaving a body that can only fall like an ordinary entity.
     *
     * @param identifier - The projectile entity definition to instantiate.
     * @param at - The launch position, in world coordinates.
     * @param direction - The direction of travel; it is normalized before speed is applied.
     * @param speed - Launch speed, in blocks per tick.
     * @param inaccuracy - Gaussian spread in degrees, as Java's projectile launch uses it.
     * @param owner - The runtime id responsible for this projectile.
     * @param data - Item-specific payload, such as arrow enchantments or potion contents.
     * @returns The launched projectile, or undefined when its definition is unavailable or invalid.
     */
    public launchProjectile(
        identifier: string,
        at: EntityPosition,
        direction: EntityPosition,
        speed: number,
        inaccuracy: number,
        owner: number,
        data?: Readonly<Record<string, unknown>>
    ): DataEntity | undefined {
        const entity = this.spawn(identifier, at, data === undefined ? undefined : { data });
        if (entity === undefined) return undefined;
        if (!entity.instance.hasComponent('minecraft:projectile')) {
            this.report(`${identifier} was launched without a minecraft:projectile component`);
            this.remove(entity.id, 'invalid_projectile');
            return undefined;
        }

        const velocity = projectileVelocity(direction, speed, inaccuracy, this.world.random);
        entity.body.velocity = velocity;
        entity.body.owner = owner;
        entity.body.lookAt({ x: at.x + velocity.x, y: at.y + velocity.y, z: at.z + velocity.z });
        this.projectiles.set(entity.id, { age: 0, stuck: false, hitEntities: new Set() });
        return entity;
    }

    /**
     * Detonates an entity, which is what `minecraft:behavior.swell` stands
     * still for.
     *
     * Java's ray cast through {@link detonate}, so a creeper now carves the
     * hole it should: the blocks it can reach come out through their own loot
     * tables, everything in range is hurt by how much of the blast it can see,
     * and the entity itself goes with it.
     *
     * `mobGriefing` decides whether the hole is carved at all, which is what
     * Java's `Mob.explode` does with it. With the rule off the blast still
     * hurts and still shoves, because the rule is about the world rather than
     * about the damage.
     */
    public explode(source: MobBody): void {
        const params = this.entities.get(source.id)?.instance.componentParams('minecraft:explode');
        const power = isRecord(params) && typeof params.power === 'number' ? params.power : DEFAULT_EXPLOSION_POWER;

        this.world.effects.playSound(blockPositionOf(source.position), 'random.explode');

        const blast = detonate(this.world, {
            center: source.position,
            power,
            candidates: this.all().filter((caught) => caught.id !== source.id),
            breaksBlocks: ruleIsOn(this.world.level, MOB_GRIEFING),
            content: this.content(),
            // The blocks a blast breaks are still blocks, so `doTileDrops` decides whether they
            // leave anything behind. No sink, and `detonate` rolls no loot at all.
            drop: ruleIsOn(this.world.level, BLOCK_DROPS) ? (at, item) => this.host.drop(at, item) : undefined,
            // The server's own destruction path, which raises each block's `onBreak` before
            // the blast writes over it; that is what spills the chest a creeper caught.
            destroy: (at) =>
                this.host.destroyBlock?.(at, {
                    explosionRadius: power,
                    dropsBlock: ruleIsOn(this.world.level, BLOCK_DROPS)
                }) ?? false
        });

        for (const hit of blast.hits) {
            this.hurt(hit.entity, source.id, 'entity_explosion', hit.damage);
            hit.entity.body.push(hit.knockback);
        }

        const self = this.entities.get(source.id);
        if (self !== undefined) this.remove(self.id, 'explosion');
    }

    /** Puts an entity on a mob as a rider, if the mob has a seat free for it. */
    public mount(rider: MobBody, vehicle: GoalMob): void {
        if (typeof vehicle.id !== 'number') return;
        const mount = this.entities.get(vehicle.id);
        if (mount === undefined) return;
        if (this.rides.ridersOf(mount.id).length >= seatCountOf(mount)) return;
        this.rides.mount(rider.id, mount.id);
    }

    /** Takes an entity off whatever it rides. */
    public dismount(rider: MobBody): void {
        this.rides.dismount(rider.id);
    }

    /** What an entity rides, or undefined when it rides nothing. */
    public vehicleOf(rider: MobBody): GoalMob | undefined {
        const vehicle = this.rides.vehicleOf(rider.id);
        return vehicle === undefined ? undefined : this.mobById(vehicle);
    }

    /** Who rides an entity, in the order they got on. */
    public ridersOf(vehicle: MobBody): readonly GoalMob[] {
        return this.rides.ridersOf(vehicle.id).flatMap((rider) => {
            const mob = this.mobById(rider);
            return mob === undefined ? [] : [mob];
        });
    }

    /** Takes an item stack lying in the world into an entity's inventory. */
    public pickUp(taker: MobBody, item: GoalItem): void {
        if (typeof item.id !== 'number') return;
        const taken = this.host.takeItem?.(item.id);
        if (taken === undefined) return;
        for (let index = 0; index < taken.count; index += 1) taker.inventory.push(taken.identifier);
    }

    /**
     * Moves one item from an entity's inventory to another entity.
     *
     * A taker this runtime does not hold, such as a player, gets the stack
     * dropped at its feet, which is what the allay and the villager do in
     * vanilla: they throw the item rather than reaching into a container.
     */
    public giveItem(giver: MobBody, taker: GoalMob, identifier: string): void {
        const held = giver.inventory.indexOf(identifier);
        if (held === -1) return;
        giver.inventory.splice(held, 1);

        const other = typeof taker.id === 'number' ? this.entities.get(taker.id) : undefined;
        if (other === undefined) {
            this.host.drop(blockPositionOf(taker.position()), { identifier, count: 1 });
            return;
        }
        other.body.inventory.push(identifier);
    }

    /**
     * Breaks a block and drops what its loot table rolls.
     *
     * Only a mob ever reaches this, through the goal world, so `mobGriefing` decides whether the
     * block goes at all and `doTileDrops` whether it leaves anything behind. A zombie at a door
     * with the rule off stands there instead of coming through.
     *
     * The host's destruction is the same one a blast and a piston go through: it raises the
     * block's `onBreak`, so a chest a villager harvested over spills what it held, and it rolls
     * Java's table with the position and the level view the conditions read. The write stays
     * here, and it comes after, because a family reads the block entity it is about to lose.
     */
    public breakBlock(at: EntityPosition): void {
        if (!ruleIsOn(this.world.level, MOB_GRIEFING)) return;

        const position = blockPositionOf(at);
        const block = this.world.blocks.get(position);
        if (block === undefined || block.identifier === AIR) return;

        const dropsBlock = ruleIsOn(this.world.level, BLOCK_DROPS);
        const destroyed = this.host.destroyBlock?.(position, { dropsBlock }) ?? false;

        this.world.blocks.set(position, { identifier: AIR, states: {} }, true);
        if (destroyed || !dropsBlock) return;

        // No live world behind the host, so there is no hook to raise and no level view to
        // roll against. The bare table stands in, and a block the loot registry has no table
        // for drops nothing rather than reporting, because that is most of the palette.
        const table = javaBlockLootIdOf(block.identifier);
        if (this.content().loot.table(table) === undefined) return;
        for (const drop of this.rolled(table)) this.host.drop(position, drop);
    }

    /**
     * Opens one entity's trade screen for a player.
     *
     * The merchant is built on the first ask and kept, so the offers a player
     * sees are the ones the entity has had all along.
     */
    public openTrade(trader: MobBody, player: GoalMob): void {
        if (typeof player.id !== 'number') return;
        const entity = this.entities.get(trader.id);
        if (entity === undefined) return;
        if (this.merchant(entity) === undefined) {
            this.report(`${trader.identifier} was asked to trade, and it carries no trade table`);
            return;
        }
        trader.tradingPlayer = player.id;
    }

    /** Whether two entities may breed with each other now. */
    public canBreedWith(parent: MobBody, mate: GoalMob): boolean {
        const self = this.entities.get(parent.id);
        const other = typeof mate.id === 'number' ? this.entities.get(mate.id) : undefined;
        if (self === undefined || other === undefined) return false;
        return canBreed(self, other);
    }

    /**
     * Produces the offspring of a successful breeding.
     *
     * The child is born halfway between its parents and runs
     * `minecraft:entity_born`, which is the event that makes it a baby. Both
     * parents spend their love and start their cooldown.
     */
    public breedWith(parent: MobBody, mate: GoalMob): void {
        const self = this.entities.get(parent.id);
        const other = typeof mate.id === 'number' ? this.entities.get(mate.id) : undefined;
        if (self === undefined || other === undefined || !canBreed(self, other)) return;

        const child = offspringOf(self, other);
        if (child === undefined) return;

        spendLove(self);
        spendLove(other);
        this.spawn(child.identifier, midpoint(self.position, other.position), {
            cause: 'born',
            ...(child.event === undefined ? {} : { event: child.event })
        });
    }

    /**
     * Records who tamed an entity.
     *
     * The taming interaction is what calls this; nothing in the server reads
     * `minecraft:tameable` yet, so until it does an owner is set from a test
     * or from a loaded world and the pet goals follow whoever it names.
     */
    public setOwner(id: number, owner: number | undefined): void {
        const entity = this.entities.get(id);
        if (entity !== undefined) entity.body.owner = owner;
    }

    /**
     * Puts an entity in love for a number of ticks, which is what feeding it
     * a breeding item does in Java's `Animal.setInLove`.
     */
    public setInLove(id: number, ticks: number): void {
        const entity = this.entities.get(id);
        if (entity !== undefined) entity.body.loveTicks = Math.max(0, ticks);
    }

    /**
     * Applies one player-held item through the entity's active data components.
     *
     * @param id - Runtime id of the entity being interacted with.
     * @param owner - Runtime id of the player or entity holding the item.
     * @param itemIdentifier - Identifier of the held item.
     * @param other - The holder's filter view, supplied for live players that are outside this runtime.
     * @returns Whether the interaction was accepted, and any change to the held item.
     */
    public interactWithItem(
        id: number,
        owner: number,
        itemIdentifier: string,
        other?: FilterEntityView
    ): EntityItemInteraction {
        const entity = this.entities.get(id);
        if (entity === undefined || entity.removed !== undefined) return { accepted: false };

        const tameable = entity.instance.componentParams('minecraft:tameable');
        const tameItem = isRecord(tameable) ? componentItem(tameable.tame_items, itemIdentifier) : undefined;
        if (
            isRecord(tameable) &&
            !entity.instance.hasComponent('minecraft:is_tamed') &&
            entity.body.owner === undefined &&
            tameItem !== undefined
        ) {
            const probability = typeof tameable.probability === 'number' ? tameable.probability : 1;
            if (this.world.random.nextFloat() < Math.min(1, Math.max(0, probability))) {
                const resultItem = resultItemOf(tameItem);
                entity.body.owner = owner;
                entity.body.conditions.add('is_tamed');
                fireTameEvent(entity, tameable.tame_event);
                return resultItem === undefined ? { accepted: true } : { accepted: true, resultItem };
            }
            return { accepted: true };
        }

        const breeding = breedableOf(entity.instance);
        const breedable = entity.instance.componentParams('minecraft:breedable');
        const health = entity.instance.attributes.get('health');
        const breedingItem = isRecord(breedable) ? componentItem(breedable.breed_items, itemIdentifier) : undefined;
        if (
            breeding !== undefined &&
            isRecord(breedable) &&
            breedingItem !== undefined &&
            !entity.instance.hasComponent('minecraft:is_baby') &&
            entity.body.loveTicks <= 0 &&
            entity.body.breedCooldown <= 0 &&
            (!breeding.requireTame ||
                entity.instance.hasComponent('minecraft:is_tamed') ||
                entity.body.owner !== undefined) &&
            (!breeding.requireFullHealth || (health !== undefined && health.current >= health.max))
        ) {
            const resultItem = resultItemOf(breedingItem);
            entity.body.loveTicks = 600;
            return resultItem === undefined ? { accepted: true } : { accepted: true, resultItem };
        }

        const healable = entity.instance.componentParams('minecraft:healable');
        if (isRecord(healable)) {
            const item = componentItem(healable.items, itemIdentifier);
            if (item !== undefined && !itemHasEffects(item)) {
                const currentHealth = entity.instance.attributes.get('health');
                const filtersPass =
                    healable.filters === undefined ||
                    evaluateFilter(parseFilter(healable.filters), entity.instance.filterContext());
                if (
                    filtersPass &&
                    currentHealth !== undefined &&
                    (currentHealth.current < currentHealth.max || healable.force_use === true)
                ) {
                    const amount = isRecord(item) && typeof item.heal_amount === 'number' ? item.heal_amount : 1;
                    const resultItem = resultItemOf(item);
                    if (amount > 0) entity.instance.attributes.set('health', currentHealth.current + amount);
                    return resultItem === undefined ? { accepted: true } : { accepted: true, resultItem };
                }
            }
        }

        const interaction = entity.instance.interactWithItemResult(
            itemIdentifier,
            other ?? this.mobById(owner)?.view()
        );
        if (interaction === false) return { accepted: false };
        if (typeof interaction === 'object') {
            const { playSounds, ...itemEffect } = interaction;
            for (const sound of playSounds ?? []) this.world.effects.playSound(blockPositionOf(entity.position), sound);
            return { accepted: true, ...itemEffect };
        }
        const ageable = entity.instance.componentParams('minecraft:ageable');
        const feedItem = isRecord(ageable) ? componentItem(ageable.feedItems, itemIdentifier) : undefined;
        const resultItem = resultItemOf(feedItem);
        return resultItem === undefined ? { accepted: true } : { accepted: true, resultItem };
    }

    /**
     * Kills an entity: drops what its `minecraft:loot` table rolls, then
     * removes it.
     *
     * `doMobLoot` decides whether the table is rolled, which is the rule the
     * class-based `Mob.onDeath` already reads.
     */
    public kill(entity: DataEntity): void {
        // Live, which puts the active component first. Of the 128 vanilla entity files, 29
        // declare `minecraft:loot` only inside a component group: the cow carries it in
        // `minecraft:cow_adult`, so a type-level read finds nothing and a grown cow drops
        // what a calf does, which is nothing.
        const table = entity.facts.lootTable;
        if (table !== undefined && ruleIsOn(this.world.level, MOB_DROPS)) this.dropLoot(table, entity.position);
        this.remove(entity.id, 'death');
    }

    /**
     * Gives one entity what its `minecraft:equipment` table rolls.
     *
     * Only on a spawn. {@link EntityRuntime.restore} deliberately does not call this, for the
     * reason it does not re-run the spawn event either: the save already holds what the first
     * roll produced, and rolling again would re-arm a mob a player had disarmed.
     *
     * A component with no `table` is not a mistake - the villager carries one purely to declare
     * that its main hand never drops - so a missing table equips nothing and reports nothing.
     */
    private equip(entity: DataEntity): void {
        const table = entity.instance.equipment()?.table;
        if (table === undefined) return;

        const content = this.content();
        entity.body.setEquipment(
            rollMobEquipment({
                content,
                table,
                itemOf: (drop) => itemOfDrop(drop, content),
                report: (message) => this.report(`${entity.identifier}: ${message}`)
            })
        );
    }

    /**
     * Rolls one loot table and drops what it produced.
     *
     * The table is named the way a behavior pack names one,
     * `loot_tables/entities/cow.json`; `ServerContent.loot` is Java's
     * registry, so the path is rewritten into the id that registry carries.
     */
    public dropLoot(table: string, at: EntityPosition): void {
        const id = javaLootIdOf(table);
        if (id === undefined) {
            this.report(`${table} is not a loot table path`);
            return;
        }

        const position = blockPositionOf(at);
        for (const drop of this.rolled(id)) this.host.drop(position, drop);
    }

    /**
     * One loot table's result, as drops the rest of the server carries.
     *
     * Every table here is Java's, so every id out of one is a Java id and every
     * component on a rolled stack is Java's too. `dropOfRolledStack` reads the
     * enchantments, the durability, the name, the lore and the contents off the
     * stack, and `bedrockItemDrops` renames the five ids the two editions spell
     * differently. The three other roll sites, the block break, the mob death
     * and `/loot`, go through the same pair.
     */
    private rolled(table: string): readonly ContentItemDrop[] {
        return bedrockItemDrops(
            this.content()
                .loot.roll(table)
                .filter((stack) => stack.count > 0)
                .map(dropOfRolledStack)
        );
    }

    /** Fires an entity event on a named subject, which a `trigger` with a target does. */
    public trigger(source: MobBody, event: string, target: string): void {
        const self = this.entities.get(source.id);
        if (target === 'self') {
            self?.instance.fire(event);
            return;
        }
        const other = source.target === undefined ? undefined : this.entities.get(source.target);
        if (target === 'target' && other !== undefined) {
            other.instance.fire(event);
            return;
        }
        this.report(`${source.identifier} triggers ${event} on ${target}, which nothing routes`);
    }

    /**
     * The merchant one entity trades through.
     *
     * Built on first ask and kept, because `persist_trades` means a villager's
     * offers are drawn once and survive until it dies. An entity that carries
     * neither trade component, or names a table the stack has no file for,
     * gets no merchant and does not trade.
     */
    public merchant(entity: DataEntity): Merchant | undefined {
        const cached = this.merchants.get(entity.id);
        if (cached !== undefined) return cached;

        const built = merchantFor(entity.instance, {
            content: this.content(),
            random: this.world.random,
            report: (code, message) => this.report(`${entity.identifier} trade table ${code}: ${message}`)
        });
        if (built !== undefined) this.merchants.set(entity.id, built);
        return built;
    }

    /** Records what the runtime met and could not carry out. */
    public report(message: string): void {
        this.onReport(message);
    }

    /** Counts down the two timers the body keeps: being in love and waiting to breed again. */
    private tickTimers(body: MobBody): void {
        if (body.loveTicks > 0) body.loveTicks -= 1;
        if (body.breedCooldown > 0) body.breedCooldown -= 1;
    }

    /**
     * Spends one tick of an entity's impulse and configured gravity.
     *
     * The numbers are Java's `LivingEntity.travel`: 0.08 of gravity a tick
     * and 0.91 of horizontal drag. Gravity and collision follow the active
     * `minecraft:physics` component, and the entity lands on a non-passable
     * cell, which is the ground model this runtime has.
     */
    private coast(entity: DataEntity): void {
        const { body, instance } = entity;
        const projectile = instance.componentParams('minecraft:projectile');
        if (isRecord(projectile)) {
            this.coastProjectile(entity, projectile);
            return;
        }

        const fallingBlock = instance.componentParams('jsprismarine:falling_block');
        if (isRecord(fallingBlock)) {
            this.coastFallingBlock(entity, fallingBlock);
            return;
        }

        const buoyant = instance.componentParams('minecraft:buoyant');
        if (isRecord(buoyant)) {
            this.coastBuoyant(entity, buoyant);
            return;
        }

        const physics = instance.componentParams('minecraft:physics');
        const hasGravity = isRecord(physics) && physics.hasGravity === true;
        const hasCollision = !isRecord(physics) || physics.hasCollision !== false;
        const position = body.position;
        const navigation = this.navigation();
        const grounded = hasCollision && body.velocity.y <= 0 && isSupported(position, entity.facts.box, navigation);
        const inWater = body.conditions.has('in_water');
        const inLava = body.conditions.has('in_lava');
        const inFluid = inWater || inLava;
        const horizontalDrag = inWater ? WATER_DRAG : inLava ? LAVA_DRAG : DRAG;
        const verticalDrag = inFluid ? FLUID_DRAG : DRAG;
        const gravity = hasGravity ? (inFluid ? FLUID_GRAVITY : GRAVITY) : 0;

        if (grounded) body.conditions.add('on_ground');
        else body.conditions.delete('on_ground');

        if (!body.airborne && (!hasGravity || grounded)) return;

        const velocity = body.velocity;
        const fallingY = grounded && velocity.y <= 0 ? 0 : velocity.y - gravity;
        const nextY = position.y + (grounded && velocity.y <= 0 ? 0 : fallingY);
        const canOccupy = (at: EntityPosition) => !hasCollision || bodyCanOccupy(at, entity.facts.box, navigation);
        let next = moveOnAxis(position, position.x + velocity.x, 'x', canOccupy);
        next = moveOnAxis(next, position.z + velocity.z, 'z', canOccupy);
        const nextVertical = moveOnAxis(next, nextY, 'y', canOccupy);
        const hitVerticalCollision = Math.abs(nextVertical.y - nextY) > MOVEMENT_EPSILON;

        if (hitVerticalCollision) {
            if (fallingY <= 0) {
                const landed = { ...nextVertical, y: Math.floor(nextVertical.y + MOVEMENT_EPSILON) };
                body.position = landed;
                body.land();
                return;
            }

            next = nextVertical;
            body.velocity = { x: velocity.x * horizontalDrag, y: 0, z: velocity.z * horizontalDrag };
        } else {
            next = nextVertical;
            body.velocity = {
                x: Math.abs(next.x - (position.x + velocity.x)) > MOVEMENT_EPSILON ? 0 : velocity.x * horizontalDrag,
                y: fallingY * verticalDrag,
                z: Math.abs(next.z - (position.z + velocity.z)) > MOVEMENT_EPSILON ? 0 : velocity.z * horizontalDrag
            };
        }

        body.position = next;
    }

    /** Applies projectile gravity, swept collisions, and the active component's hit actions. */
    private coastProjectile(entity: DataEntity, params: Record<string, unknown>): void {
        const state = this.projectiles.get(entity.id) ?? { age: 0, stuck: false, hitEntities: new Set<number>() };
        this.projectiles.set(entity.id, state);
        state.age += 1;

        const lifetime = typeof params.max_life === 'number' ? params.max_life : PROJECTILE_MAX_LIFE;
        if (state.age > lifetime) {
            this.remove(entity.id, 'projectile_expired');
            return;
        }
        if (state.stuck) return;

        const { body } = entity;
        const from = body.position;
        const velocity = body.velocity;
        const to = { x: from.x + velocity.x, y: from.y + velocity.y, z: from.z + velocity.z };
        const distance = Math.hypot(velocity.x, velocity.y, velocity.z);
        const steps = Math.max(1, Math.ceil(distance / PROJECTILE_SWEEP_STEP));
        const navigation = this.navigation();
        const physics = entity.instance.componentParams('minecraft:physics');
        const hasCollision = !isRecord(physics) || physics.hasCollision !== false;
        let lastSafe = from;

        for (let step = 1; step <= steps; step += 1) {
            const fraction = step / steps;
            const at = {
                x: from.x + (to.x - from.x) * fraction,
                y: from.y + (to.y - from.y) * fraction,
                z: from.z + (to.z - from.z) * fraction
            };
            const target = this.projectileTargetAt(entity, at, state);
            if (target !== undefined && this.hitProjectile(entity, target, params, at)) {
                if (entity.removed !== undefined) return;
            }

            if (hasCollision && !bodyCanOccupy(at, entity.facts.box, navigation)) {
                const onHit = isRecord(params.on_hit) ? params.on_hit : {};
                this.applyProjectileHitEffects(onHit, at, false);
                const sound = typeof params.hit_ground_sound === 'string' ? params.hit_ground_sound : undefined;
                if (sound !== undefined) this.world.effects.playSound(blockPositionOf(at), sound);

                if (isRecord(onHit.stick_in_ground)) {
                    body.position = lastSafe;
                    body.land();
                    state.stuck = true;
                } else {
                    this.remove(entity.id, 'projectile_hit_block');
                }
                return;
            }

            lastSafe = at;
        }

        body.position = lastSafe;
        const inFluid = body.conditions.has('in_water') || body.conditions.has('in_lava');
        const inertia = inFluid
            ? typeof params.liquid_inertia === 'number'
                ? params.liquid_inertia
                : 0.6
            : typeof params.air_inertia === 'number'
              ? params.air_inertia
              : typeof params.inertia === 'number'
                ? params.inertia
                : 0.99;
        const gravity = typeof params.gravity === 'number' ? params.gravity : 0.03;
        body.velocity = {
            x: velocity.x * inertia,
            y: (velocity.y - gravity) * inertia,
            z: velocity.z * inertia
        };
    }

    /** Finds the first entity whose current hitbox intersects the projectile. */
    private projectileTargetAt(
        projectile: DataEntity,
        at: EntityPosition,
        state: ProjectileState
    ): DataEntity | ContentEntity | undefined {
        const projectileBox = projectile.facts.box;
        const owner = projectile.body.owner;
        for (const target of this.grid.within(at, 16)) {
            if (
                target.id === projectile.id ||
                target.instance.hasComponent('minecraft:projectile') ||
                (target.id === owner && state.age <= PROJECTILE_OWNER_GRACE) ||
                state.hitEntities.has(target.id)
            )
                continue;
            if (projectileOverlaps(at, projectileBox, target.position, target.facts.box.width, target.facts.box.height))
                return target;
        }

        for (const target of this.host.players()) {
            if (
                (target.id === owner && state.age <= PROJECTILE_OWNER_GRACE) ||
                target.creative === true ||
                target.spectator === true ||
                state.hitEntities.has(target.id)
            )
                continue;
            const feet = { ...target.position, y: target.position.y - PLAYER_EYE_HEIGHT };
            if (projectileOverlaps(at, projectileBox, feet, PLAYER_WIDTH, PLAYER_HEIGHT)) return target;
        }

        return undefined;
    }

    /** Runs an entity hit through the damage route and hit actions in its projectile data. */
    private hitProjectile(
        projectile: DataEntity,
        target: DataEntity | ContentEntity,
        params: Record<string, unknown>,
        at: EntityPosition
    ): boolean {
        const onHit = isRecord(params.on_hit) ? params.on_hit : {};
        const impact = isRecord(onHit.impact_damage) ? onHit.impact_damage : undefined;
        let damage = 0;

        if (impact !== undefined && this.projectileFilterAllows(impact.filter, target)) {
            const range = isRecord(impact.damage) ? impact.damage : {};
            const minimum =
                typeof range.min === 'number' ? range.min : typeof range.range_min === 'number' ? range.range_min : 0;
            const maximum =
                typeof range.max === 'number'
                    ? range.max
                    : typeof range.range_max === 'number'
                      ? range.range_max
                      : minimum;
            const powerMultiplier = typeof impact.power_multiplier === 'number' ? impact.power_multiplier : 0;
            if (minimum === 0 && maximum === 0 && powerMultiplier > 0) {
                const speed = Math.hypot(
                    projectile.body.velocity.x,
                    projectile.body.velocity.y,
                    projectile.body.velocity.z
                );
                damage = Math.ceil(speed * powerMultiplier);
                if (projectile.spawnData?.['critical'] === true)
                    damage += this.world.random.nextInt(Math.floor(damage / 2) + 2);
                const power = projectile.spawnData?.['power'];
                if (typeof power === 'number' && power > 0) damage += power * 0.5 + 0.5;
            } else if (maximum >= minimum) {
                damage = minimum + this.world.random.nextInt(Math.floor(maximum - minimum) + 1);
            }

            if (damage > 0) {
                if ('instance' in target) this.hurt(target, projectile.body.owner, 'projectile', damage);
                else if (this.host.hurtByProjectile !== undefined)
                    this.host.hurtByProjectile(target.id, damage, projectile.id, projectile.body.owner);
                else this.host.hurt?.(target.id, damage, 'projectile', projectile.body.owner);
            }
        }

        this.projectiles.get(projectile.id)?.hitEntities.add(target.id);
        this.applyProjectileHitEffects(onHit, at, true);
        const sound = typeof params.hit_sound === 'string' ? params.hit_sound : undefined;
        if (sound !== undefined) this.world.effects.playSound(blockPositionOf(at), sound);

        if (impact?.knockback === true && 'instance' in target) {
            const resistance = Math.min(1, Math.max(0, target.facts.knockbackResistance));
            const punch = typeof projectile.spawnData?.['punch'] === 'number' ? projectile.spawnData['punch'] : 0;
            const strength = (PROJECTILE_KNOCKBACK + Math.max(0, punch) * 0.5) * (1 - resistance);
            const flatSpeed = Math.hypot(projectile.body.velocity.x, projectile.body.velocity.z) || 1;
            target.body.push({
                x: (projectile.body.velocity.x / flatSpeed) * strength,
                y: PROJECTILE_KNOCKBACK_LIFT * (1 - resistance),
                z: (projectile.body.velocity.z / flatSpeed) * strength
            });
            target.body.lastPusher = projectile.body.owner;
        } else if (impact?.knockback === true && damage === 0 && !('instance' in target)) {
            const flatSpeed = Math.hypot(projectile.body.velocity.x, projectile.body.velocity.z) || 1;
            this.host.knockback?.(
                target.id,
                projectile.body.velocity.x / flatSpeed,
                projectile.body.velocity.z / flatSpeed,
                PROJECTILE_KNOCKBACK
            );
        }

        const destroyOnHit = impact?.destroy_on_hit === true || onHit.remove_on_hit !== undefined;
        if (destroyOnHit) this.remove(projectile.id, 'projectile_hit_entity');
        return destroyOnHit;
    }

    /** Applies the particle and child-spawn actions carried by `on_hit`. */
    private applyProjectileHitEffects(onHit: Record<string, unknown>, at: EntityPosition, entityHit: boolean): void {
        const particle = isRecord(onHit.particle_on_hit) ? onHit.particle_on_hit : undefined;
        const showParticle =
            particle !== undefined && (entityHit ? particle.on_entity_hit === true : particle.on_other_hit === true);
        if (showParticle && typeof particle.particle_type === 'string') {
            const count =
                typeof particle.num_particles === 'number' ? Math.max(1, Math.floor(particle.num_particles)) : 1;
            for (let index = 0; index < count; index += 1) this.world.effects.spawnParticle(at, particle.particle_type);
        }

        const spawn = isRecord(onHit.spawn_chance) ? onHit.spawn_chance : undefined;
        if (spawn === undefined || typeof spawn.spawn_definition !== 'string') return;
        const firstChance = typeof spawn.first_spawn_chance === 'number' ? spawn.first_spawn_chance : 0;
        if (this.world.random.nextFloat() >= Math.max(0, Math.min(1, firstChance))) return;

        let count = typeof spawn.first_spawn_count === 'number' ? Math.max(1, Math.floor(spawn.first_spawn_count)) : 1;
        const secondChance = typeof spawn.second_spawn_chance === 'number' ? spawn.second_spawn_chance : 0;
        if (secondChance > 0 && this.world.random.nextFloat() < Math.min(1, secondChance))
            count =
                typeof spawn.second_spawn_count === 'number'
                    ? Math.max(1, Math.floor(spawn.second_spawn_count))
                    : count;

        const cause = spawn.spawn_baby === true ? 'born' : 'spawned';
        for (let index = 0; index < count; index += 1) this.spawn(spawn.spawn_definition, at, { cause });
    }

    /** Applies a component's family filter to the entity the projectile hit. */
    private projectileFilterAllows(filter: unknown, target: DataEntity | ContentEntity): boolean {
        if (typeof filter !== 'string' || filter.length === 0) return true;
        if ('instance' in target) return target.instance.families().includes(filter);
        return target.identifier === filter || target.identifier === `minecraft:${filter}`;
    }

    /** Applies the block's configured falling motion and turns it back into a block on landing. */
    private coastFallingBlock(entity: DataEntity, params: Record<string, unknown>): void {
        const blockName = entity.spawnData?.['block'];
        if (typeof blockName !== 'string') {
            this.report(`${entity.identifier} has no block payload and was removed`);
            this.remove(entity.id, 'invalid_spawn_data');
            return;
        }

        let state = this.fallingBlocks.get(entity.id);
        if (state === undefined) {
            const fallThrough = new Set(
                Array.isArray(params['fall_through'])
                    ? params['fall_through'].filter((name): name is string => typeof name === 'string')
                    : []
            );
            state = { startY: entity.position.y, fallThrough };
            this.fallingBlocks.set(entity.id, state);
        }

        const gravity = typeof params['gravity'] === 'number' ? params['gravity'] : 0.04;
        const drag = typeof params['drag'] === 'number' ? params['drag'] : 0.02;
        const maxFallDistance = typeof params['max_fall_distance'] === 'number' ? params['max_fall_distance'] : 512;
        const position = entity.position;
        const velocity = entity.body.velocity;
        const fallingY = (velocity.y - gravity) * (1 - drag);
        const nextY = position.y + fallingY;

        if (position.y - state.startY < -maxFallDistance || nextY < this.world.level.minY) {
            this.remove(entity.id, 'fell_out_of_world');
            return;
        }

        const target = {
            x: Math.floor(position.x),
            y: Math.floor(nextY),
            z: Math.floor(position.z)
        };
        const occupying = this.world.blocks.get(target);
        if (occupying === undefined) return;

        if (!state.fallThrough.has(occupying.identifier)) {
            const landing = { ...target, y: target.y + 1 };
            const resting = this.world.blocks.get(landing);
            if (resting === undefined) return;

            this.remove(entity.id, 'landed');
            if (state.fallThrough.has(resting.identifier)) {
                if (resting.identifier !== AIR) this.world.blocks.destroy?.(landing);
                this.world.blocks.set(landing, { identifier: blockName, states: {} }, true);
            } else {
                this.host.drop(
                    { x: landing.x + 0.5, y: landing.y + 0.5, z: landing.z + 0.5 },
                    { identifier: blockName, count: 1 }
                );
            }
            return;
        }

        entity.body.velocity = { x: velocity.x * (1 - drag), y: fallingY, z: velocity.z * (1 - drag) };
        entity.body.position = { ...position, y: nextY };
    }

    /** Applies Java's boat float step when the active definition declares buoyancy. */
    private coastBuoyant(entity: DataEntity, buoyant: Record<string, unknown>): void {
        const { body } = entity;
        const position = body.position;
        const box = entity.facts.box;
        const names = new Set(
            Array.isArray(buoyant.liquid_blocks)
                ? buoyant.liquid_blocks.filter((name): name is string => typeof name === 'string')
                : []
        );
        const minX = Math.floor(position.x - box.width / 2 + MOVEMENT_EPSILON);
        const maxX = Math.floor(position.x + box.width / 2 - MOVEMENT_EPSILON);
        const minZ = Math.floor(position.z - box.width / 2 + MOVEMENT_EPSILON);
        const maxZ = Math.floor(position.z + box.width / 2 - MOVEMENT_EPSILON);
        const minY = Math.floor(position.y);
        const maxY = Math.floor(position.y + box.height);
        let liquidSurface: number | undefined;
        let underwaterSource = false;
        let underwaterFlowing = false;

        for (let x = minX; x <= maxX; x += 1) {
            for (let z = minZ; z <= maxZ; z += 1) {
                for (let y = minY; y <= maxY; y += 1) {
                    const block = this.world.blocks.get({ x, y, z });
                    if (block === undefined || !names.has(block.identifier)) continue;
                    const fluid = fluidStateOf({ name: block.identifier, states: block.states });
                    if (fluid === undefined) continue;

                    const surface = y + (fluid.source || fluid.falling ? 1 : fluid.amount / 9);
                    if (surface > position.y && y < position.y + box.height) {
                        liquidSurface = Math.max(liquidSurface ?? Number.NEGATIVE_INFINITY, surface);
                    }
                    if (surface > position.y + box.height + MOVEMENT_EPSILON) {
                        if (fluid.source) underwaterSource = true;
                        else underwaterFlowing = true;
                    }
                }
            }
        }

        const physics = entity.instance.componentParams('minecraft:physics');
        const hasCollision = !isRecord(physics) || physics.hasCollision !== false;
        const grounded = hasCollision && body.velocity.y <= 0 && isSupported(position, box, this.navigation());
        if (grounded) body.conditions.add('on_ground');
        else body.conditions.delete('on_ground');

        const applyGravity = buoyant.apply_gravity !== false;
        const baseBuoyancy = typeof buoyant.base_buoyancy === 'number' ? buoyant.base_buoyancy : 1;
        const submerged = underwaterFlowing ? 'flowing' : underwaterSource ? 'source' : undefined;
        const inLiquid = submerged === undefined && liquidSurface !== undefined;
        const gravity =
            !applyGravity || (grounded && !submerged && !inLiquid)
                ? 0
                : submerged === 'flowing'
                  ? -0.0007
                  : -BUOYANT_GRAVITY;
        const horizontalDrag = submerged === 'source' ? 0.45 : BUOYANT_DRAG;
        const verticalDrag = inLiquid || submerged === 'source' ? BUOYANT_WATER_VERTICAL_DRAG : 1;
        const buoyancy =
            submerged === 'source'
                ? 0.01
                : inLiquid && liquidSurface !== undefined
                  ? ((liquidSurface - position.y) / box.height) * baseBuoyancy
                  : 0;
        const velocity = body.velocity;
        const fallingY = grounded ? 0 : velocity.y + gravity + buoyancy * (BUOYANT_GRAVITY / BUOYANT_STEADY_FRACTION);
        const nextVelocity = {
            x: velocity.x * horizontalDrag,
            y: fallingY * verticalDrag,
            z: velocity.z * horizontalDrag
        };
        const nextY = position.y + nextVelocity.y;
        const canOccupy = (at: EntityPosition) => !hasCollision || bodyCanOccupy(at, box, this.navigation());
        let next = moveOnAxis(position, position.x + nextVelocity.x, 'x', canOccupy);
        next = moveOnAxis(next, position.z + nextVelocity.z, 'z', canOccupy);
        const nextVertical = moveOnAxis(next, nextY, 'y', canOccupy);
        const hitVerticalCollision = Math.abs(nextVertical.y - nextY) > MOVEMENT_EPSILON;

        if (hitVerticalCollision && fallingY <= 0) {
            const landed = { ...nextVertical, y: Math.floor(nextVertical.y + MOVEMENT_EPSILON) };
            body.position = landed;
            body.land();
            return;
        }

        body.velocity = {
            x: Math.abs(next.x - (position.x + nextVelocity.x)) > MOVEMENT_EPSILON ? 0 : nextVelocity.x,
            y: hitVerticalCollision ? 0 : fallingY * verticalDrag,
            z: Math.abs(next.z - (position.z + nextVelocity.z)) > MOVEMENT_EPSILON ? 0 : nextVelocity.z
        };
        body.position = nextVertical;
    }

    /** Moves a body along its current waypoint using its active navigation rules. */
    private step(entity: DataEntity): void {
        if (entity.instance.hasComponent('minecraft:projectile')) return;

        const navigation = this.navigation();
        const profile = navigationProfile(entity.instance);
        const feet = blockPositionOf(entity.position);
        const inLiquid = navigation.isWater(feet) || navigation.isLava(feet);
        const swims = inLiquid && (profile.canSwim || profile.canFloat || profile.isAmphibious);
        const climbs = profile.kind === 'climb' && navigation.isClimbable?.(feet) === true;
        const physics = entity.instance.componentParams('minecraft:physics');
        const hasCollision = !isRecord(physics) || physics.hasCollision !== false;

        entity.step({
            allowVertical: profile.canFly || profile.kind === 'fly' || profile.kind === 'hover' || swims || climbs,
            canJump: profile.canJump,
            stepHeight: profile.stepHeight,
            canOccupy: (position) => !hasCollision || bodyCanOccupy(position, entity.facts.box, navigation)
        });
    }

    /** Applies Java's horizontal push impulse after this entity has moved for the tick. */
    private pushIntersectingEntity(first: DataEntity, widest: number, tallest: number): void {
        if (!this.hasEntityCollision(first)) return;

        const horizontalReach = (first.facts.box.width + widest) / 2;
        const verticalReach = (first.facts.box.height + tallest) / 2;
        const searchRadius = Math.hypot(horizontalReach * Math.SQRT2, verticalReach);
        for (const second of this.grid.within(first.position, searchRadius)) {
            if (first.id === second.id || !this.hasEntityCollision(second)) continue;
            const firstVehicle = this.rides.vehicleOf(first.id);
            const secondVehicle = this.rides.vehicleOf(second.id);
            if (firstVehicle === second.id || secondVehicle === first.id) continue;
            if (firstVehicle !== undefined && firstVehicle === secondVehicle) continue;

            const dx = second.position.x - first.position.x;
            const dz = second.position.z - first.position.z;
            const collisionReach = (first.facts.box.width + second.facts.box.width) / 2;
            if (
                Math.abs(dx) >= collisionReach ||
                Math.abs(dz) >= collisionReach ||
                first.position.y >= second.position.y + second.facts.box.height ||
                second.position.y >= first.position.y + first.facts.box.height
            )
                continue;

            const pushableFirst = this.isPushable(first);
            const pushableSecond = this.isPushable(second);
            if (!pushableFirst && !pushableSecond) continue;
            const largestDifference = Math.max(Math.abs(dx), Math.abs(dz));
            if (largestDifference < 0.01) continue;

            const root = Math.sqrt(largestDifference);
            const scale = Math.min(1, 1 / root);
            const impulse = {
                x: (dx / root) * scale * 0.05,
                y: 0,
                z: (dz / root) * scale * 0.05
            };
            if (pushableFirst) first.body.push({ x: -impulse.x, y: 0, z: -impulse.z });
            if (pushableSecond) second.body.push(impulse);
        }
    }

    /** Whether the entity's active definition lets it collide with entities. */
    private hasEntityCollision(entity: DataEntity): boolean {
        const physics = entity.instance.componentParams('minecraft:physics');
        return !isRecord(physics) || physics.hasCollision !== false;
    }

    /** Whether Java's entity type or its active custom component allows pushing. */
    private isPushable(entity: DataEntity): boolean {
        const java = entity.instance.javaNavigation;
        if (java !== undefined) return java.pushable;

        const component = entity.instance.componentParams('minecraft:pushable');
        if (isRecord(component) && typeof component.isPushable === 'boolean') return component.isPushable;
        return entity.instance.attributes.get('health') !== undefined;
    }

    /** Keeps every rider where its vehicle is, which is what being carried means. */
    private carryRiders(vehicle: DataEntity): void {
        for (const rider of this.rides.ridersOf(vehicle.id)) {
            const carried = this.entities.get(rider);
            if (carried === undefined) continue;
            carried.position = vehicle.position;
            carried.body.stopMoving();
        }
    }

    /** The `def` of the entity's `minecraft:shooter`, which names what it fires. */
    private shooterDefinitionOf(shooter: MobBody): string | undefined {
        const params = this.entities.get(shooter.id)?.instance.componentParams('minecraft:shooter');
        if (!isRecord(params)) return undefined;
        return typeof params.def === 'string' ? params.def : undefined;
    }

    /** Routes an event one entity triggered on another. */
    private route(trigger: OutgoingTrigger, from: EntityInstance): void {
        const source = this.bodyOf(from);
        if (source === undefined) return;
        this.trigger(source, trigger.event, trigger.target);
    }

    /** Takes an entity out, by the instance the component asking holds. */
    private removeInstance(instance: EntityInstance, reason: string): void {
        const entity = this.byInstance.get(instance);
        if (entity !== undefined) this.remove(entity.id, reason);
    }

    /** Replaces an entity with another type, which `minecraft:transformation` asks for. */
    private transform(instance: EntityInstance, request: TransformRequest): void {
        const entity = this.byInstance.get(instance);
        if (entity === undefined) return;

        const replacement = this.spawn(request.identifier, entity.position, {
            cause: 'transformed',
            event: request.event
        });
        if (replacement !== undefined)
            for (const group of request.addGroups) replacement.instance.applyEffects(addGroup(group));
        this.remove(entity.id, 'transformation');
    }
}

/** The effects of adding one component group, with nothing else in them. */
const addGroup = (group: string) => ({ ...noEffects('minecraft:transformation'), addGroups: [group] });

/** Finds one component item by its identifier, with or without its default namespace. */
const componentItem = (items: unknown, identifier: string): unknown => {
    const itemNames = Array.isArray(items) ? items : items === undefined ? [] : [items];
    const normalized = identifier.includes(':') ? identifier : `minecraft:${identifier}`;
    return itemNames.find((item) => {
        const name =
            typeof item === 'string' ? item : isRecord(item) && typeof item.item === 'string' ? item.item : undefined;
        if (name === undefined) return false;
        return (name.includes(':') ? name : `minecraft:${name}`) === normalized;
    });
};

/** The normalized replacement item a successful component interaction returns, if declared. */
const resultItemOf = (item: unknown): string | undefined => {
    if (!isRecord(item)) return undefined;
    const identifier =
        typeof item.result_item === 'string'
            ? item.result_item
            : typeof item.transform_to_item === 'string'
              ? item.transform_to_item
              : undefined;
    if (identifier === undefined) return undefined;
    return identifier.includes(':') ? identifier : `minecraft:${identifier}`;
};

/** Whether a healable item asks for status effects the entity runtime does not apply yet. */
const itemHasEffects = (item: unknown): boolean =>
    isRecord(item) && Array.isArray(item.effects) && item.effects.length > 0;

/** Fires the optional `minecraft:tameable` event on the target it declares. */
const fireTameEvent = (entity: DataEntity, value: unknown): void => {
    const event = typeof value === 'string' ? value : isRecord(value) ? value.event : undefined;
    if (typeof event !== 'string') return;

    const requestedTarget = isRecord(value) ? value.target : undefined;
    const target: EventTarget = EVENT_TARGETS.find((candidate) => candidate === requestedTarget) ?? 'self';
    if (target === 'self') entity.instance.fire(event);
    else entity.instance.raise(event, target, 'minecraft:tameable');
};

/** Adds or clears one environmental condition on an entity's body. */
const setCondition = (conditions: Set<string>, name: string, active: boolean): void => {
    if (active) conditions.add(name);
    else conditions.delete(name);
};

/** Epsilon for checking whether a collision sweep reached its requested coordinate. */
const MOVEMENT_EPSILON = 1e-7;

/** How fast a fired projectile leaves the shooter, from Java's `AbstractArrow` launch velocity. */
const PROJECTILE_SPEED = 1.6;

/** Java's `LivingEntity` gravity, in blocks per tick per tick. */
const GRAVITY = 0.08;

/** Java's horizontal drag on an airborne entity, applied once a tick. */
const DRAG = 0.91;

/** Java's horizontal drag in water, applied once per tick. */
const WATER_DRAG = 0.8;

/** Java's horizontal drag in lava, applied once per tick. */
const LAVA_DRAG = 0.5;

/** Java's vertical drag in either liquid, applied once per tick. */
const FLUID_DRAG = 0.8;

/** Java reduces downward acceleration to one sixteenth in a liquid. */
const FLUID_GRAVITY = GRAVITY / 16;

/** Java's `AbstractBoat.getDefaultGravity`. */
const BUOYANT_GRAVITY = 0.04;

/** Java's boat horizontal damping outside a water column. */
const BUOYANT_DRAG = 0.9;

/** Java damps vertical velocity after applying the water surface impulse. */
const BUOYANT_WATER_VERTICAL_DRAG = 0.75;

/** The waterline fraction `AbstractBoat.floatBoat` uses to counter gravity. */
const BUOYANT_STEADY_FRACTION = 0.65;

/** The `power` a `minecraft:explode` with none declared uses, which is the creeper's. */
const DEFAULT_EXPLOSION_POWER = 3;

/** The identifier a broken block leaves behind. */
const AIR = 'minecraft:air';

/** Java's loot table id for one block, which is where its drops are declared. */
const javaBlockLootIdOf = (identifier: string): string =>
    `minecraft:blocks/${identifier.startsWith('minecraft:') ? identifier.slice('minecraft:'.length) : identifier}`;

/** How many riders an entity's `minecraft:rideable` seats, or none when it carries none. */
const seatCountOf = (vehicle: DataEntity): number => {
    const params = vehicle.instance.componentParams('minecraft:rideable');
    if (params === null || typeof params !== 'object' || !('seatCount' in params)) return 0;
    return typeof params.seatCount === 'number' ? params.seatCount : 0;
};

/** Halfway between two positions, which is where a child is born. */
const midpoint = (from: EntityPosition, to: EntityPosition): EntityPosition => ({
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
    z: (from.z + to.z) / 2
});

export type { EntityFacts };
