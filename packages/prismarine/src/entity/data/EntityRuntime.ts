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
import type { EntityActuator, EntityPosition, OutgoingTrigger, TransformRequest } from '@jsprismarine/entities';
import { EntityInstance, noEffects } from '@jsprismarine/entities';
import type { BlockQuery, GoalBlock, GoalItem, GoalMob, GoalWorld, NavigationView } from '@jsprismarine/entity-goals';
import type { SpawnRequest, SpawnWorld } from '@jsprismarine/spawning';
import { Spawner } from '@jsprismarine/spawning';

import type { ServerContent } from '../../content/ServerContent';
import { DataEntity, MobBody, distance } from './DataEntity';
import { EntityFactsLookup, javaLootIdOf } from './facts';
import type { EntityFacts } from './facts';
import { actuatorOf, blockPositionOf, goalWorldOf } from './goalWorld';
import { brainMobOf, brainWorldOf } from './brainWorld';
import type { EntityHostFacts, EntityWorldFacts } from './host';
import { navigationViewOf } from './navigationView';
import type { EntityScene, SpawnOptions } from './scene';

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
}

/** The live entities of one dimension, and the AI that drives them. */
export class EntityRuntime implements EntityScene {
    public readonly world: EntityWorldFacts;
    public readonly host: EntityHostFacts;

    private readonly entities = new Map<number, DataEntity>();
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
    private readonly lookupContent: () => ServerContent;
    private readonly onReport: (message: string) => void;
    private facts: EntityFactsLookup | undefined;
    private factsGeneration = -1;
    private spawner: Spawner | undefined;
    private nextId = 1;

    public constructor(options: EntityRuntimeOptions) {
        this.lookupContent = options.content;
        this.world = options.world;
        this.host = options.host;
        this.onReport = options.report ?? (() => undefined);
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

    public byId(id: number): DataEntity | undefined {
        return this.entities.get(id);
    }

    /** Every live entity within a radius of a position. */
    public near(center: EntityPosition, radius: number): readonly DataEntity[] {
        return this.all().filter((entity) => distance(center, entity.position) <= radius);
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
        const content = this.content();
        const registry = content.entities.registry;
        const reference = identifier.includes('<') ? identifier.slice(0, identifier.indexOf('<')) : identifier;
        if (!registry.has(reference)) {
            this.report(`asked to spawn ${reference}, which the content declares no entity type for`);
            return undefined;
        }

        const facts = this.typeFacts().get(reference);
        if (facts === undefined) return undefined;

        const id = this.nextId;
        this.nextId += 1;

        // The body comes first: a goal component builds its support while the instance is being
        // constructed, and that reads the actuator straight away.
        const body = new MobBody(id, at, facts);
        this.spawning = body;
        const instance = new EntityInstance(registry.holder(reference), {
            id,
            environment: {
                actuator: actuatorOf(body, this),
                random: { next: () => this.world.random.nextFloat() },
                remove: (removed, reason) => this.removeInstance(removed, reason),
                transform: (from, request) => this.transform(from, request),
                route: (trigger, from) => this.route(trigger, from),
                report: (message) => this.report(`${reference}: ${message}`)
            }
        });

        this.spawning = undefined;

        const brainMob = content.entities.brains.get(reference);
        const brain = brainMob?.makeBrain({ baby: instance.hasComponent('minecraft:is_baby') });
        const entity = new DataEntity({ body, instance, brainMob, brain });
        this.entities.set(id, entity);
        this.byInstance.set(instance, entity);
        if (options.pool !== undefined) this.pools.set(id, options.pool);

        if (brain !== undefined) {
            brain.delaySensorStarts((bound) => this.world.random.nextInt(bound));
            brainMob?.initMemories?.({ world: this.brainWorld(), body: brainMobOf(entity, brain, this) });
        }

        instance.spawn(options.cause ?? 'spawned', options.event);
        return entity;
    }

    /** Takes an entity out of the world. */
    public remove(id: number, reason: string): void {
        const entity = this.entities.get(id);
        if (entity === undefined) return;
        entity.removed = reason;
        this.entities.delete(id);
        this.byInstance.delete(entity.instance);
        this.pools.delete(id);
    }

    /**
     * Runs one server tick for every live entity.
     *
     * @param tick - The world's tick counter, which is what the spawner's
     *   per-pool cadence is measured against.
     */
    public tick(tick: number): void {
        for (const entity of this.all()) {
            if (entity.removed !== undefined) continue;
            entity.instance.tick();
            this.tickBrain(entity);
            entity.step();
        }
        this.runSpawnCycle(tick);
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
        this.spawner = new Spawner({
            rules: this.content().spawnRules,
            world,
            random: this.world.random,
            onUnanswered: (test, reason) => this.report(`a spawn rule's ${test.test} test was ${reason}`)
        });
    }

    /** The entities the spawner asked for on this tick, after they were created. */
    private runSpawnCycle(tick: number): readonly SpawnRequest[] {
        const spawner = this.spawner;
        if (spawner === undefined) return [];

        const requests = spawner.tick(tick);
        for (const request of requests)
            this.spawn(request.identifier, request.position, { event: request.spawnEvent, pool: request.pool });
        return requests;
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

    /** The blocks as the path finder reads them. */
    public navigation(): NavigationView {
        return navigationViewOf(this.world.blocks, () => this.content());
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
     * Item stacks lying within a radius.
     *
     * Dropped items are the item subsystem's entities rather than this
     * runtime's, so nothing is found yet and the pickup goals stay asleep
     * rather than picking up something that is not there.
     */
    public items(): readonly GoalItem[] {
        return [];
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

    /** Deals one entity's melee damage to another. */
    public attack(attacker: MobBody, target: GoalMob): void {
        const other = typeof target.id === 'number' ? this.entities.get(target.id) : undefined;
        if (other === undefined) return;

        const health = other.instance.attributes.get('health');
        if (health === undefined) return;
        const remaining = health.current - attacker.facts.attackDamage;
        other.instance.attributes.set('health', remaining);
        if (remaining <= 0) this.kill(other);
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
    }

    /**
     * Kills an entity: drops what its `minecraft:loot` table rolls, then
     * removes it.
     */
    public kill(entity: DataEntity): void {
        if (entity.facts.lootTable !== undefined) this.dropLoot(entity.facts.lootTable, entity.position);
        this.remove(entity.id, 'death');
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
        for (const stack of this.content().loot.roll(id))
            this.host.drop(position, { identifier: stack.id, count: stack.count });
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

    /** Records what the runtime met and could not carry out. */
    public report(message: string): void {
        this.onReport(message);
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

export type { EntityFacts };
