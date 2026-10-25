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
import type {
    EntityActuator,
    EntityPosition,
    FilterContext,
    OutgoingTrigger,
    TransformRequest
} from '@jsprismarine/entities';
import { EntityInstance, isRecord, noEffects } from '@jsprismarine/entities';
import type { BlockQuery, GoalBlock, GoalItem, GoalMob, GoalWorld, NavigationView } from '@jsprismarine/entity-goals';
import type { SpawnRequest, SpawnWorld } from '@jsprismarine/spawning';
import { Spawner, despawnReason } from '@jsprismarine/spawning';
import type { Merchant } from '@jsprismarine/trading';

import { BLOCK_DROPS, MOB_DROPS, MOB_GRIEFING, SPAWN_MOBS, ruleIsOn } from '../../content/world/gameRules';
import type { ServerContent } from '../../content/ServerContent';
import { canBreed, offspringOf, spendLove } from './breeding';
import { DataEntity, MobBody, distance } from './DataEntity';
import { detonate } from './explosion';
import { EntityFactsLookup, javaLootIdOf } from './facts';
import type { EntityFacts } from './facts';
import { actuatorOf, blockPositionOf, goalMobOf, goalWorldOf, playerGoalMob } from './goalWorld';
import { brainMobOf, brainWorldOf } from './brainWorld';
import { entityFilterContextOf } from './filterView';
import type { EntityHostFacts, EntityWorldFacts } from './host';
import { navigationViewOf } from './navigationView';
import { PointsOfInterest } from './poi';
import { RideIndex } from './riding';
import type { EntityScene, SpawnOptions } from './scene';
import { merchantFor } from './trading';

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

        const id = this.drawId();

        // The body comes first: a goal component builds its support while the instance is being
        // constructed, and that reads the actuator straight away.
        const body = new MobBody(id, at, facts);
        this.spawning = body;
        const instance = new EntityInstance(registry.holder(reference), {
            id,
            environment: {
                actuator: actuatorOf(body, this),
                filterContext: (): FilterContext => entityFilterContextOf(body, this),
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
        // After the spawn event, so the body a client is sent already carries whatever the
        // event added: a baby is born a baby rather than growing into one on the next tick.
        this.onSpawn(entity);
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
        this.merchants.delete(id);
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
        for (const entity of this.all()) {
            if (entity.removed !== undefined) continue;
            this.tickTimers(entity.body);
            entity.instance.tick();
            this.tickBrain(entity);
            this.coast(entity.body);
            entity.step();
            this.carryRiders(entity);
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
        const health = entity.instance.attributes.get('health');
        if (health === undefined) return;

        entity.body.damage.record(sourceId, cause, amount);
        const remaining = health.current - amount;
        entity.instance.attributes.set('health', remaining);
        if (remaining <= 0) this.kill(entity);
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
     * target; what it does on arrival belongs to the projectile component and
     * not here.
     */
    public shoot(shooter: MobBody, target: GoalMob, projectile: string | undefined): void {
        const identifier = projectile ?? this.shooterDefinitionOf(shooter);
        if (identifier === undefined) {
            this.report(`${shooter.identifier} has no projectile to shoot, and its goal named none`);
            return;
        }

        const from = {
            x: shooter.position.x,
            y: shooter.position.y + shooter.facts.box.height * EYE_HEIGHT,
            z: shooter.position.z
        };
        const arrow = this.spawn(identifier, from);
        if (arrow === undefined) return;

        const at = target.position();
        const away = distance(from, at) || 1;
        arrow.body.push({
            x: ((at.x - from.x) / away) * PROJECTILE_SPEED,
            y: ((at.y - from.y) / away) * PROJECTILE_SPEED,
            z: ((at.z - from.z) / away) * PROJECTILE_SPEED
        });
        arrow.body.owner = shooter.id;
        arrow.body.lookAt(at);
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
            drop: ruleIsOn(this.world.level, BLOCK_DROPS) ? (at, item) => this.host.drop(at, item) : undefined
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
     */
    public breakBlock(at: EntityPosition): void {
        if (!ruleIsOn(this.world.level, MOB_GRIEFING)) return;

        const position = blockPositionOf(at);
        const block = this.world.blocks.get(position);
        if (block === undefined || block.identifier === AIR) return;

        this.world.blocks.set(position, { identifier: AIR, states: {} }, true);
        if (!ruleIsOn(this.world.level, BLOCK_DROPS)) return;

        // A block the loot registry has no table for drops nothing rather than reporting,
        // because a block with no table is the normal case for most of the palette.
        const table = javaBlockLootIdOf(block.identifier);
        if (this.content().loot.table(table) === undefined) return;
        for (const stack of this.content().loot.roll(table))
            this.host.drop(position, { identifier: stack.id, count: stack.count });
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
     * Kills an entity: drops what its `minecraft:loot` table rolls, then
     * removes it.
     *
     * `doMobLoot` decides whether the table is rolled, which is the rule the
     * class-based `Mob.onDeath` already reads.
     */
    public kill(entity: DataEntity): void {
        const table = entity.facts.lootTable;
        if (table !== undefined && ruleIsOn(this.world.level, MOB_DROPS)) this.dropLoot(table, entity.position);
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
     * Spends one tick of whatever impulse a leap, a charge or a ram gave the
     * entity.
     *
     * The numbers are Java's `LivingEntity.travel`: 0.08 of gravity a tick
     * and 0.91 of horizontal drag. The entity lands when the cell it is
     * falling into is not passable, which is the only ground model this
     * runtime has.
     */
    private coast(body: MobBody): void {
        if (!body.airborne) return;

        const velocity = body.velocity;
        const next = {
            x: body.position.x + velocity.x,
            y: body.position.y + velocity.y,
            z: body.position.z + velocity.z
        };

        const navigation = this.navigation();
        if (velocity.y <= 0 && !navigation.isPassable(blockPositionOf(next))) {
            body.position = { x: next.x, y: Math.floor(next.y) + 1, z: next.z };
            body.land();
            return;
        }

        body.position = next;
        body.velocity = { x: velocity.x * DRAG, y: velocity.y - GRAVITY, z: velocity.z * DRAG };
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

/** Where an entity's eyes are up its hitbox, which is Java's 0.85 for a standing mob. */
const EYE_HEIGHT = 0.85;

/** How fast a fired projectile leaves the shooter, from Java's `AbstractArrow` launch velocity. */
const PROJECTILE_SPEED = 1.6;

/** Java's `LivingEntity` gravity, in blocks per tick per tick. */
const GRAVITY = 0.08;

/** Java's horizontal drag on an airborne entity, applied once a tick. */
const DRAG = 0.91;

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
