/**
 * The data-driven entity runtime, over a running server.
 *
 * `EntityRuntime` is written against two seams and no server: `EntityWorldFacts`
 * for the blocks, the clock and the random draws, and `EntityHostFacts` for
 * the things an entity index does not hold - players, item stacks on the
 * ground, and damage going out to either. This module supplies both from a
 * live {@link World}, gives every entity a body a client can see through
 * {@link LiveBodies}, and hands the whole thing to `World.tick` as one call.
 *
 * {@link EntityRuntimes} is the registry the two ends meet in. The content
 * world adapter builds one runtime per dimension while it assembles that
 * dimension's groups, because the groups are projections of the runtime; the
 * world of that dimension looks its own up by name and ticks it. Neither has
 * to know how the other got there.
 */
import type { SpawnWorld } from '@jsprismarine/spawning';
import type { LaunchProjectileAction } from '@jsprismarine/item-behaviors';
import type { EquipmentSlot, FilterEntityView, FilterItemView } from '@jsprismarine/entities';
import { ActorEvent } from '@jsprismarine/minecraft';

import { singleDimension } from '../../content/world/adapter';
import type { ContentEntityAccess, ServerWorldAdapter } from '../../content/world/adapter';
import type { ServerContent } from '../../content/ServerContent';
import { contentWorldViews } from '../../content/world/views';
import { destroyBlock } from '../../world/blockDestroy';
import type { World } from '../../world/World';
import { DamageCause } from '../DamageCause';
import { DamageSource } from '../DamageSource';
import { Entity } from '../Entity';
import { lookVector } from '../Archery';
import Player from '../../Player';
import type { GenericEntity } from '../GenericEntity';
import type { DataEntity } from './DataEntity';
import type { EntityItemInteraction } from './itemInteraction';
import type { ContentItemEntity, EntityHostFacts, EntityWorldFacts } from './host';
import { EntityRuntime, PROJECTILE_EYE_HEIGHT_FRACTION } from './EntityRuntime';
import { LiveBodies } from './liveBodies';
import type { DataEntityRecord } from './persistence';
import { Item as ItemEntity } from '../other/Item';
import type { Item } from '../../item/Item';

/** A held or equipped item as the entity filter language reads it. */
const filterItemOf = (item: Item | undefined): FilterItemView | undefined =>
    item === undefined ? undefined : { identifier: () => item.getName(), data: () => item.getMeta() };

/** The live player's family and equipment, which `minecraft:interact` filters inspect. */
const playerFilterView = (player: Player): FilterEntityView => {
    const inventory = player.getInventory();
    const armorSlots = new Map<EquipmentSlot, number>([
        ['head', 0],
        ['torso', 1],
        ['leg', 2],
        ['feet', 3]
    ]);
    return {
        id: () => Number(player.getRuntimeId()),
        names: (name) => (name === 'is_family' ? ['player'] : undefined),
        equipment: (slot, index) => {
            if (slot === 'main_hand' || slot === 'hand' || slot === 'any')
                return index === 0 ? filterItemOf(inventory.getItemInHand()) : undefined;
            if (slot === 'off_hand') return filterItemOf(inventory.getOffhand().getEntry(index)?.getItem());
            if (slot === 'inventory') return filterItemOf(inventory.getEntry(index)?.getItem());
            const armorIndex = armorSlots.get(slot);
            if (armorIndex !== undefined)
                return index === 0 ? filterItemOf(inventory.getArmor().getEntry(armorIndex)?.getItem()) : undefined;
            if (slot === 'armor') return filterItemOf(inventory.getArmor().getEntry(index)?.getItem());
            return undefined;
        }
    };
};

/** What {@link EntityRuntimes.open} is given for one dimension. */
export interface LiveEntityOptions {
    /** The namespaced dimension identifier, such as `minecraft:overworld`. */
    readonly dimension: string;
    /** The built content, read at call time; the runtime outlives any one build. */
    content(): ServerContent;
    /** The groups the blocks, world and effects subsystems own, for this dimension. */
    readonly world: EntityWorldFacts;
    /**
     * The live world's own entity group.
     *
     * Players and item drops come from here rather than from the runtime,
     * because a player is driven by a network session and a dropped stack by
     * the item subsystem. Neither is a component set.
     */
    readonly entities: ContentEntityAccess;
    /** The live world of this dimension, or undefined when none is loaded. */
    liveWorld(): World | undefined;
    /** Receives everything the runtime met and could not carry out. */
    report(message: string): void;
}

/**
 * Every item stack lying in one world, as the pickup goals read them.
 *
 * The server's item entities are `minecraft:item` bodies with a
 * `ContainerEntry` on them. One that has lost its stack - taken this tick by
 * somebody else - is left out rather than reported as an empty pile.
 */
const lyingItemsIn = (world: World | undefined): readonly ContentItemEntity[] => {
    if (world === undefined) return [];

    const found: ContentItemEntity[] = [];
    for (const entity of world.getEntities()) {
        if (!(entity instanceof ItemEntity)) continue;
        const held = entity.getItem();
        if (held === undefined) continue;

        const at = entity.getPosition();
        found.push({
            id: Number(entity.getRuntimeId()),
            position: { x: at.getX(), y: at.getY(), z: at.getZ() },
            item: { identifier: held.getItem().getName(), count: held.getCount() }
        });
    }
    return found;
};

/** The host facts over one live world. */
const liveHost = (options: LiveEntityOptions): EntityHostFacts => ({
    players: () => options.entities.players(),
    drop: (at, item) => options.entities.drop(at, item),
    destroyBlock: (at, destruction) => {
        const world = options.liveWorld();
        if (world === undefined) return false;

        destroyBlock({ world, position: at, ...destruction });
        return true;
    },
    items: () => lyingItemsIn(options.liveWorld()),
    takeItem: (id) => {
        const world = options.liveWorld();
        const entity = world?.getEntity(BigInt(id));
        if (world === undefined || !(entity instanceof ItemEntity)) return undefined;

        const held = entity.getItem();
        if (held === undefined) return undefined;

        void world.removeEntity(entity).catch((error: unknown) => options.report(String(error)));
        return { identifier: held.getItem().getName(), count: held.getCount() };
    },
    hurt: (id, amount, _cause, sourceId) => {
        const world = options.liveWorld();
        const target = world?.getEntity(BigInt(id));
        if (target === null || target === undefined) return;

        // The attacker travels with the blow, so a player who was bitten knows what bit them
        // and the death message names it.
        const attacker = sourceId === undefined ? null : (world?.getEntity(BigInt(sourceId)) ?? null);
        const source = attacker === null ? DamageSource.of(DamageCause.Attack) : DamageSource.entity(attacker);
        void target.damage(amount, source).catch((error: unknown) => options.report(String(error)));
    },
    hurtByProjectile: (id, amount, projectileId, ownerId) => {
        const world = options.liveWorld();
        const target = world?.getEntity(BigInt(id));
        const projectile = world?.getEntity(BigInt(projectileId));
        if (target === null || target === undefined) return;

        const owner = ownerId === undefined ? null : (world?.getEntity(BigInt(ownerId)) ?? null);
        const source =
            projectile === null || projectile === undefined
                ? DamageSource.of(DamageCause.Projectile)
                : DamageSource.projectileFrom(projectile, owner);
        void target.damage(amount, source).catch((error: unknown) => options.report(String(error)));
    },
    knockback: (id, directionX, directionZ, strength) => {
        const target = options.liveWorld()?.getEntity(BigInt(id));
        target?.applyKnockback(directionX, directionZ, strength);
    },
    // Nothing on this server runs the pillager patrol or the village raid, so no named mob
    // event is ever active. Said as a fact rather than guessed: the rules that gate on one
    // refuse, which is what keeps a patrol from spawning every cycle.
    mobEventActive: () => false,
    structureSpawnOverrideAt: (identifier, at) => {
        const world = options.liveWorld();
        if (world === undefined) return undefined;

        const generator = world.getGenerator();
        return generator.structureSpawnOverrideAt?.(identifier, at, world.getSeed());
    }
});

/**
 * One dimension's data-driven entities, and everything that drives them.
 *
 * The deep part of this module: a caller holds one of these and calls
 * {@link LiveEntityRuntime.tick} once a tick. Behind that are the runtime, the
 * spawn loop, the despawn pass and the bodies the clients are sent, and none
 * of them has to be started, stopped or ordered by the caller.
 */
export class LiveEntityRuntime {
    /** The entities themselves, for the content adapter's three groups and for tests. */
    public readonly runtime: EntityRuntime;

    /** The body each entity shows a client. */
    public readonly bodies: LiveBodies;

    private readonly options: LiveEntityOptions;
    /** The world the spawn rules read, which is not known until the adapter is assembled. */
    private spawnWorld: SpawnWorld | undefined;
    private started = false;

    public constructor(options: LiveEntityOptions) {
        this.options = options;
        this.bodies = new LiveBodies({ world: options.liveWorld, report: options.report });
        this.runtime = new EntityRuntime({
            content: options.content,
            world: options.world,
            host: liveHost(options),
            report: options.report,
            onSpawn: (entity) => this.bodies.add(entity),
            onRemove: (entity) => this.bodies.drop(entity),
            // One pool of runtime ids with the server's own entities, so a goal that holds
            // the id of a player cannot be handed a data-driven mob that happens to share it.
            nextId: () => {
                Entity.runtimeIdCount += 1n;
                return Number(Entity.runtimeIdCount);
            }
        });
    }

    /**
     * Takes the assembled adapter for this dimension, which is where the spawn
     * rules read the world from.
     *
     * Separate from the constructor because the adapter holds groups projected
     * out of this runtime, so the runtime exists first. The spawn world is
     * `src/content/world/views.ts`'s projection rather than another one written
     * here, so a spawn rule and a block behavior read the same world.
     */
    public attach(adapter: ServerWorldAdapter): void {
        this.spawnWorld = contentWorldViews(
            singleDimension(adapter),
            this.options.content,
            this.options.dimension
        ).spawnWorld;
    }

    /**
     * Runs one server tick: the entities, the spawn cycle, the despawn pass,
     * and then the bodies.
     *
     * The spawn loop starts on the first tick rather than on construction,
     * because it reads the loaded spawn rules and the content finishes
     * building after the adapter that made this runtime.
     *
     * @param tick - The world's tick counter, which the pools' cadences are
     *   measured against.
     */
    public async tick(tick: number): Promise<void> {
        if (!this.started && this.spawnWorld !== undefined) {
            this.runtime.startSpawning(this.spawnWorld);
            this.started = true;
        }

        this.runtime.tick(tick);
        await Promise.all(this.bodies.sync(this.runtime));
    }

    /**
     * Launches an item projectile from its live source through the data-driven runtime.
     *
     * A player's position is already at eye height; other entity positions are at their feet.
     * The entity definition supplies flight and hit behavior through `minecraft:projectile`.
     *
     * @param action - The item behavior's projectile identifier, speed, spread, and payload.
     * @param shooter - The live entity that used the item.
     * @returns The spawned projectile, or undefined when its loaded definition is not a projectile.
     */
    public launchProjectile(action: LaunchProjectileAction, shooter: Entity): DataEntity | undefined {
        const position = shooter.getPosition();
        const eyeOffset =
            shooter.getType() === 'minecraft:player' ? 0 : shooter.getBox().height * PROJECTILE_EYE_HEIGHT_FRACTION;
        const at = { x: position.getX(), y: position.getY() + eyeOffset, z: position.getZ() };
        const direction = lookVector(shooter.yaw, shooter.pitch);

        return this.runtime.launchProjectile(
            action.identifier,
            at,
            { x: direction.getX(), y: direction.getY(), z: direction.getZ() },
            action.power,
            action.inaccuracy,
            Number(shooter.getRuntimeId()),
            action.data
        );
    }

    /** Applies a held item to a data-driven entity and returns any item result it declares. */
    public interactWithItem(target: Entity, player: Entity, itemIdentifier: string): EntityItemInteraction {
        const id = this.bodies.entityIdOf(target);
        if (id === undefined) return { accepted: false };

        const previousLoveTicks = this.runtime.byId(id)?.body.loveTicks ?? 0;
        const interaction = this.runtime.interactWithItem(
            id,
            Number(player.getRuntimeId()),
            itemIdentifier,
            player instanceof Player ? playerFilterView(player) : undefined
        );
        const loveTicks = this.runtime.byId(id)?.body.loveTicks ?? 0;
        if (interaction.accepted && previousLoveTicks <= 0 && loveTicks > 0) {
            const world = this.options.liveWorld();
            if (world !== undefined)
                void world
                    .sendActorEvent(target, ActorEvent.LOVE_HEARTS)
                    .catch((error: unknown) => this.options.report(String(error)));
        }

        return interaction;
    }

    /**
     * Writes every entity's component state onto its body, ready for a save.
     *
     * Called by `World.saveChunks` before it writes anything, because a data
     * entity's state lives in the runtime and the chunk serializer only ever
     * sees the body.
     */
    public persist(): void {
        this.bodies.persist(this.runtime);
    }

    /**
     * Suspends a data-driven entity whose chunk is leaving memory.
     *
     * The caller writes the entity's NBT to its chunk before calling this, so removing the
     * runtime instance here does not make it a death or a despawn.
     */
    public unload(body: Entity): boolean {
        if (!this.removeBody(body, 'chunk unload')) return false;
        void body
            .getWorld()
            .removeEntity(body)
            .catch((error: unknown) => this.options.report(String(error)));
        return true;
    }

    /**
     * Removes a body's data entity when the world removes the body directly.
     *
     * Detaching first lets the runtime's removal callback run without asking the world to remove
     * the same body recursively. This covers copies from `level.json` that a chunk actor record
     * replaces, and explicit world removals such as `/kill`.
     *
     * @param body - The body being removed from its world.
     * @param reason - Why the runtime entity is being removed.
     * @returns Whether this runtime owned the body.
     */
    public removeBody(body: Entity, reason = 'body removed'): boolean {
        const id = this.bodies.detach(body);
        if (id === undefined) return false;

        this.runtime.remove(id, reason);
        return true;
    }

    /**
     * Brings one saved entity back into the runtime.
     *
     * The body built from the file is not the body that ends up in the world:
     * the runtime makes its own, so that one entity is not driven by two
     * systems. Everything the file carried that this server does not model,
     * the actor's `UniqueID` first among them, moves onto the new body, so the
     * next save addresses the same actor rather than writing a second one.
     *
     * @param stored - The body `EntitySerializer` built from the actor NBT.
     * @returns The entity, or undefined when no loaded pack declares its type,
     *   in which case the caller keeps the body it was given.
     */
    public restore(record: DataEntityRecord, stored: Entity): DataEntity | undefined {
        const at = stored.getPosition();
        const entity = this.runtime.restore(record, { x: at.getX(), y: at.getY(), z: at.getZ() });
        if (entity === undefined) return undefined;

        const body = this.bodies.bodyOf(entity.id);
        if (body !== undefined) body.persistentNbt = stored.persistentNbt;
        return entity;
    }

    /**
     * Migrates a generic body without runtime state when its pack type is available.
     *
     * This covers actor records from earlier server versions and copies rebuilt from `level.json`.
     * Their type's spawn event initializes current components, goals, and physics, while the
     * original actor tags stay on the replacement body for fields the runtime does not model yet.
     */
    public restoreGeneric(stored: GenericEntity): DataEntity | undefined {
        const identifier = stored.getType();
        if (!this.runtime.content().entities.registry.has(identifier)) return undefined;

        const position = stored.getPosition();
        const entity = this.runtime.spawn(
            identifier,
            { x: position.getX(), y: position.getY(), z: position.getZ() },
            { yaw: stored.yaw, pitch: stored.pitch }
        );
        if (entity === undefined) return undefined;

        const body = this.bodies.bodyOf(entity.id);
        if (body !== undefined) body.persistentNbt = stored.persistentNbt;
        return entity;
    }
}

/**
 * The data-driven entity runtimes of a server, one per dimension.
 *
 * Held by the server rather than by either end: the content world adapter
 * opens one while it assembles a dimension's groups, and that dimension's
 * `World` looks it up by name to tick it.
 */
export class EntityRuntimes {
    private readonly byDimension = new Map<string, LiveEntityRuntime>();

    /**
     * The runtime for one dimension, built on first ask and kept.
     *
     * @returns The existing runtime when the dimension already has one, so an
     *   adapter rebuilt for the same dimension drives the same entities.
     */
    public open(options: LiveEntityOptions): LiveEntityRuntime {
        const existing = this.byDimension.get(options.dimension);
        if (existing !== undefined) return existing;

        const created = new LiveEntityRuntime(options);
        this.byDimension.set(options.dimension, created);
        return created;
    }

    /** The runtime of one dimension, or undefined when nothing opened one. */
    public at(dimension: string): LiveEntityRuntime | undefined {
        return this.byDimension.get(dimension);
    }

    /** Forgets one dimension's runtime, which is what closing its world does. */
    public close(dimension: string): void {
        this.byDimension.get(dimension)?.bodies.clear();
        this.byDimension.delete(dimension);
    }
}
