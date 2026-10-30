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
import { Vector3 } from '@jsprismarine/math';
import type { LaunchProjectileAction } from '@jsprismarine/item-behaviors';
import type { EntityPosition, EquipmentSlot, FilterEntityView, FilterItemView } from '@jsprismarine/entities';
import { ActorEvent, LevelSoundEvent } from '@jsprismarine/minecraft';

import { singleDimension } from '../../content/world/adapter';
import type { ContentEntityAccess, ServerWorldAdapter } from '../../content/world/adapter';
import type { ServerContent } from '../../content/ServerContent';
import { contentWorldViews } from '../../content/world/views';
import { destroyBlock } from '../../world/blockDestroy';
import type { World } from '../../world/World';
import { damageCauseOf, DamageCause } from '../DamageCause';
import { DamageSource } from '../DamageSource';
import { Entity } from '../Entity';
import { GenericEntity } from '../GenericEntity';
import AnimatePacket, { AnimateAction } from '../../network/packet/AnimatePacket';
import { actorMotionIn } from './persistence';
import { lookVector } from '../Archery';
import Player from '../../Player';
import { MetadataFlag } from '@jsprismarine/protocol/wire/structures/Metadata';
import type { ContentItemDrop } from '../../content/world/adapter';
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
    item === undefined
        ? undefined
        : {
              identifier: () => item.getName(),
              data: () => item.getMeta(),
              tags: () => item.getTags(),
              enchantment: (name) => item.getEnchantmentLevel(name),
              hasComponent: (name) => item.hasComponent(name),
              damaged: () => item.getMaxDurability() > 0 && item.getDurability() < item.getMaxDurability()
          };

/** The live player's family and equipment, which `minecraft:interact` filters inspect. */
const playerFilterView = (player: Player): FilterEntityView => {
    const inventory = player.getInventory();
    const armorSlots = new Map<EquipmentSlot, number>([
        ['head', 0],
        ['torso', 1],
        ['leg', 2],
        ['feet', 3]
    ]);
    const equipment = (slot: EquipmentSlot, index: number): FilterItemView | undefined => {
        if (slot === 'any') {
            if (index === 0) return filterItemOf(inventory.getItemInHand());
            if (index === 1) return filterItemOf(inventory.getOffhand().getEntry(0)?.getItem());
            const armorSlotCount = inventory.getArmor().getSlotCount();
            if (index >= 2 && index < 2 + armorSlotCount)
                return filterItemOf(
                    inventory
                        .getArmor()
                        .getEntry(index - 2)
                        ?.getItem()
                );
            return filterItemOf(inventory.getEntry(index - 2 - armorSlotCount)?.getItem());
        }
        if (slot === 'main_hand') return index === 0 ? filterItemOf(inventory.getItemInHand()) : undefined;
        if (slot === 'hand') {
            if (index === 0) return filterItemOf(inventory.getItemInHand());
            return index === 1 ? filterItemOf(inventory.getOffhand().getEntry(0)?.getItem()) : undefined;
        }
        if (slot === 'off_hand')
            return index === 0 ? filterItemOf(inventory.getOffhand().getEntry(0)?.getItem()) : undefined;
        if (slot === 'inventory') return filterItemOf(inventory.getEntry(index)?.getItem());
        if (slot === 'armor') return filterItemOf(inventory.getArmor().getEntry(index)?.getItem());
        const armorIndex = armorSlots.get(slot);
        return armorIndex === undefined
            ? undefined
            : index === 0
              ? filterItemOf(inventory.getArmor().getEntry(armorIndex)?.getItem())
              : undefined;
    };
    const capacity = (slot: EquipmentSlot): number => {
        switch (slot) {
            case 'any':
                return 2 + inventory.getArmor().getSlotCount() + inventory.getSlotCount();
            case 'armor':
                return inventory.getArmor().getSlotCount();
            case 'feet':
            case 'head':
            case 'leg':
            case 'main_hand':
            case 'off_hand':
                return 1;
            case 'hand':
                return 2;
            case 'inventory':
                return inventory.getSlotCount();
            case 'torso':
                return 1;
        }
    };
    return {
        id: () => Number(player.getRuntimeId()),
        names: (name) => (name === 'is_family' ? ['player'] : name === 'has_tag' ? player.getTags() : undefined),
        flag: (name) => {
            if (name === 'is_sneaking' || name === 'is_sneak_held') return player.isSneaking();
            if (name === 'is_sleeping') return player.isSleeping();
            return undefined;
        },
        equipment,
        slotFill: (slot) => {
            const slots = capacity(slot);
            let filled = 0;
            for (let index = 0; index < slots; index += 1) {
                if (equipment(slot, index) !== undefined) filled += 1;
            }
            return { filled, capacity: slots };
        },
        carries: (matches) => {
            const slots = capacity('any');
            for (let index = 0; index < slots; index += 1) {
                const item = equipment('any', index);
                if (item !== undefined && matches(item)) return true;
            }
            return false;
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
 * somebody else - is left out rather than reported as an empty pile. The
 * height is where the stack lies, 0.125 below the position a client is told.
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
            position: { x: at.getX(), y: entity.getFeetY(), z: at.getZ() },
            item: { identifier: held.getItem().getName(), count: held.getCount() },
            filterView: filterItemOf(held.getItem())
        });
    }
    return found;
};

/** The host facts over one live world. */
const liveHost = (options: LiveEntityOptions, bodies: LiveBodies): EntityHostFacts => ({
    players: () => options.entities.players(),
    playerView: (id) => {
        const player = options.liveWorld()?.getEntity(BigInt(id));
        return player instanceof Player ? playerFilterView(player) : undefined;
    },
    playerIdentityOf: (id) => {
        const player = options.liveWorld()?.getEntity(BigInt(id));
        return player instanceof Player ? player.getUUID().toString() : undefined;
    },
    playerIdForIdentity: (identity) => {
        const player = options
            .liveWorld()
            ?.getPlayers()
            .find((candidate) => candidate.getUUID().toString() === identity);
        return player === undefined ? undefined : Number(player.getRuntimeId());
    },
    drop: (at, item) => options.entities.drop(at, item),
    destroyBlock: (at, destruction) => {
        const world = options.liveWorld();
        if (world === undefined) return false;

        destroyBlock({ world, position: at, ...destruction });
        return true;
    },
    items: () => lyingItemsIn(options.liveWorld()),
    takeItem: (id, count) => {
        const world = options.liveWorld();
        const entity = world?.getEntity(BigInt(id));
        if (world === undefined || !(entity instanceof ItemEntity)) return undefined;

        const held = entity.getItem();
        if (held === undefined) return undefined;

        const available = held.getCount();
        const taken = Math.min(available, count === undefined ? available : Math.max(0, Math.floor(count)));
        if (taken <= 0) return undefined;

        const remaining = available - taken;
        if (remaining === 0) {
            void world.removeEntity(entity).catch((error: unknown) => options.report(String(error)));
        } else {
            held.getItem().count = remaining;
            held.setCount(remaining);
            void world
                .sendActorEvent(entity, ActorEvent.UPDATE_STACK_SIZE, remaining)
                .catch((error: unknown) => options.report(String(error)));
        }
        return { identifier: held.getItem().getName(), count: taken };
    },
    hurt: (id, amount, cause, sourceId, deathMessageOverride) => {
        const world = options.liveWorld();
        const target = world?.getEntity(BigInt(id));
        if (target === null || target === undefined) return;

        // The attacker travels with the blow, so a player who was bitten knows what bit them
        // and the death message names it.
        const attacker = sourceId === undefined ? null : (world?.getEntity(BigInt(sourceId)) ?? null);
        const damageCause = damageCauseOf(cause);
        const source =
            attacker === null && deathMessageOverride === undefined
                ? DamageSource.of(damageCause)
                : new DamageSource({ cause: damageCause, attacker, deathMessageOverride });
        void target.damage(amount, source).catch((error: unknown) => options.report(String(error)));
    },
    attackSound: (id) => {
        const world = options.liveWorld();
        const attacker = bodies.bodyOf(id);
        if (world === undefined || attacker === undefined) return;
        void world
            .sendActorSound(attacker, LevelSoundEvent.ATTACK)
            .catch((error: unknown) => options.report(String(error)));
    },
    applyStatusEffect: (id, effect) => {
        const target = options.liveWorld()?.getEntity(BigInt(id));
        if (target !== null && target !== undefined) target.addStatusEffect(effect);
    },
    applyStatusEffectIfChanged: (id, effect) => {
        const target = options.liveWorld()?.getEntity(BigInt(id));
        return target !== null && target !== undefined ? target.addStatusEffect(effect) : false;
    },
    removeStatusEffect: (id, identifier) => {
        const target = options.liveWorld()?.getEntity(BigInt(id));
        return target !== null && target !== undefined ? target.removeStatusEffect(identifier) : false;
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
    hurtFeedback: (id) => {
        const world = options.liveWorld();
        const target = bodies.bodyOf(id);
        if (world === undefined || target === undefined) return;

        void Promise.all([
            world.sendActorEvent(target, ActorEvent.HURT_ANIMATION),
            world.sendActorSound(target, LevelSoundEvent.HURT)
        ]).catch((error: unknown) => options.report(String(error)));
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
            host: liveHost(options, this.bodies),
            report: options.report,
            onSpawn: (entity) => this.bodies.add(entity, this.runtime.leashHolderIdOf(entity.id)),
            onRemove: (entity) => this.bodies.drop(entity),
            gameEvents: {
                add: (listener) => options.liveWorld()?.addGameEventListener(listener),
                move: (listener) => options.liveWorld()?.moveGameEventListener(listener)
            },
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
     * Runs one server tick for eligible entities, then mirrors them to live bodies.
     *
     * The spawn loop starts on the first tick because it reads the loaded spawn rules.
     *
     * @param tick - The world's tick counter, which the pools' cadences use.
     * @param shouldTick - Optional chunk eligibility rule; omitted callers tick every entity.
     */
    public async tick(tick: number, shouldTick?: (position: EntityPosition) => boolean): Promise<void> {
        if (!this.started && this.spawnWorld !== undefined) {
            this.runtime.startSpawning(this.spawnWorld);
            this.started = true;
        }

        this.runtime.tick(tick, shouldTick);
        await Promise.all(this.bodies.sync(this.runtime, shouldTick));
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

    /** Attaches a live entity or player as holder of a data-driven entity's leash. */
    public attachLead(holderId: number, targetId: number): boolean {
        return this.runtime.attachLead(holderId, targetId);
    }

    /**
     * Whether this live body is a data-driven entity that accepts a name tag.
     *
     * @param target - The client-facing body.
     * @returns Whether its runtime entity accepts name tags.
     */
    public canNameEntity(target: Entity): boolean {
        const id = this.bodies.entityIdOf(target);
        return id !== undefined && this.runtime.canNameEntity(id);
    }

    /**
     * Names a live body through its data-driven runtime entity.
     *
     * @param target - The client-facing body.
     * @param name - The custom name being assigned.
     * @returns Whether the runtime accepted the name tag.
     */
    public nameEntity(target: Entity, name: string): boolean {
        const id = this.bodies.entityIdOf(target);
        return id !== undefined && this.runtime.nameEntity(id, name);
    }

    /**
     * Whether this live body is a data-driven entity that accepts the requested dye.
     *
     * @param target - The client-facing body.
     * @param color - The dye color name.
     * @returns Whether the runtime entity accepts the dye.
     */
    public canDyeEntity(target: Entity, color: string): boolean {
        const id = this.bodies.entityIdOf(target);
        return id !== undefined && this.runtime.canDyeEntity(id, color);
    }

    /**
     * Applies a supported dye through the live data-driven entity runtime.
     *
     * @param target - The client-facing body.
     * @param color - The dye color name.
     * @returns Whether the runtime changed the color.
     */
    public dyeEntity(target: Entity, color: string): boolean {
        const id = this.bodies.entityIdOf(target);
        return id !== undefined && this.runtime.dyeEntity(id, color);
    }

    /** Applies a held item to a data-driven entity and carries out its world, item, and animation effects. */
    public interactWithItem(
        target: Entity,
        player: Entity,
        itemIdentifier: string,
        heldItem?: ContentItemDrop
    ): EntityItemInteraction {
        const id = this.bodies.entityIdOf(target);
        if (id === undefined) return { accepted: false };

        const previousLoveTicks = this.runtime.byId(id)?.body.loveTicks ?? 0;
        const interaction = this.runtime.interactWithItem(
            id,
            Number(player.getRuntimeId()),
            itemIdentifier,
            player instanceof Player ? playerFilterView(player) : undefined,
            heldItem
        );
        if (interaction.accepted) {
            for (const effect of interaction.statusEffects ?? []) target.addStatusEffect(effect);
        }
        const particle = interaction.accepted ? interaction.particleOnStart : undefined;
        if (particle !== undefined && particle.particleType !== 'none') {
            const targetPosition = target.getPosition();
            const interactorPosition = player.getPosition();
            const x = particle.offsetTowardsInteractor
                ? (targetPosition.getX() + interactorPosition.getX()) / 2
                : targetPosition.getX();
            const y = targetPosition.getY() + particle.yOffset;
            const z = particle.offsetTowardsInteractor
                ? (targetPosition.getZ() + interactorPosition.getZ()) / 2
                : targetPosition.getZ();

            target.getWorld().spawnNamedParticleAt(new Vector3(x, y, z), particle.particleType);
        }
        if (interaction.accepted && interaction.swing === true && player instanceof Player) {
            const runtimeEntityId = player.getRuntimeId();
            const watchers = player
                .getWorld()
                .getPlayers()
                .filter((viewer) => viewer !== player)
                .filter((viewer) => viewer.getNetworkSession().tracks(runtimeEntityId));

            void Promise.all(
                watchers.map(async (viewer) => {
                    const animation = new AnimatePacket();
                    animation.runtimeEntityId = runtimeEntityId;
                    animation.action = AnimateAction.Swing;
                    animation.swingSource = 'interact';
                    await viewer.getNetworkSession().send(animation);
                })
            ).catch((error: unknown) => this.options.report(String(error)));
        }
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
     * the same body recursively. This covers a provider's lightweight entity snapshot when a
     * chunk actor record replaces it, and explicit world removals such as `/kill`.
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
        if (body !== undefined) {
            body.persistentNbt = stored.persistentNbt;
            entity.body.nameTag ??= stored.metadata.nameTag || undefined;
            for (const tag of stored.getTags()) body.addTag(tag);
            for (const effect of stored.getStatusEffects()) body.addStatusEffect(effect, false);
        }
        return entity;
    }

    /**
     * Migrates an existing body without runtime state when its pack type is available.
     *
     * This covers entities saved by an older class-based runtime as well as generic actors rebuilt
     * from a provider's lightweight entity snapshot. The type's spawn event initializes current
     * components, goals, and physics, while the original actor tags stay on the replacement body
     * for fields the runtime does not model yet.
     */
    public restoreExisting(stored: Entity): DataEntity | undefined {
        const identifier = stored.getType();
        const type = this.runtime.content().entities.registry.get(identifier);
        if (type === undefined) return undefined;

        const position = stored.getPosition();
        const fuse = stored.metadata.getPropertyValue(MetadataFlag.FUSE_TIME);
        const motion = stored.persistentNbt === null ? undefined : actorMotionIn(stored.persistentNbt);
        const isProjectile = type.declaredComponents.includes('minecraft:projectile');
        if (!(stored instanceof GenericEntity) && typeof fuse !== 'number' && !isProjectile) return undefined;
        const blockName =
            identifier === 'minecraft:falling_block'
                ? stored.persistentNbt?.getString('JSPBlockName', '') ||
                  stored.persistentNbt?.getString('Block', '') ||
                  ''
                : '';
        const entity = this.runtime.spawn(
            identifier,
            { x: position.getX(), y: position.getY(), z: position.getZ() },
            {
                yaw: stored.yaw,
                pitch: stored.pitch,
                ...(blockName.length > 0 || typeof fuse === 'number'
                    ? {
                          data: {
                              ...(blockName.length > 0 ? { block: blockName } : {}),
                              ...(typeof fuse === 'number' ? { fuse } : {})
                          }
                      }
                    : {})
            }
        );
        if (entity === undefined) return undefined;
        if (entity.instance.hasComponent('minecraft:projectile') && motion !== undefined) entity.body.velocity = motion;

        const health = entity.instance.attributes.get('health');
        if (health !== undefined) entity.instance.attributes.set('health', Math.min(health.max, stored.getHealth()));

        const body = this.bodies.bodyOf(entity.id);
        if (body !== undefined) {
            body.persistentNbt = stored.persistentNbt;
            entity.body.nameTag = stored.metadata.nameTag || undefined;
            for (const tag of stored.getTags()) body.addTag(tag);
            for (const effect of stored.getStatusEffects()) body.addStatusEffect(effect, false);
        }
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

    /** Forgets every runtime, which is what a server shutdown does once the worlds are down. */
    public closeAll(): void {
        for (const dimension of [...this.byDimension.keys()]) this.close(dimension);
    }
}
