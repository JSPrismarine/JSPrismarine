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
import type {
    EntityInstance,
    EntityPosition,
    EquipmentSlot,
    FilterEntityView,
    FilterItemView
} from '@jsprismarine/entities';
import { ActorEvent, LevelSoundEvent } from '@jsprismarine/minecraft';
import { NBTTagCompound } from '@jsprismarine/nbt';

import { singleDimension } from '../../content/world/adapter';
import type { ContentEntityAccess, ServerWorldAdapter } from '../../content/world/adapter';
import type { ServerContent } from '../../content/ServerContent';
import { contentWorldViews } from '../../content/world/views';
import { destroyBlock } from '../../world/blockDestroy';
import type { World } from '../../world/World';
import type { WorldActor } from '../../world/WorldActor';
import { damageCauseOf, DamageCause } from '../DamageCause';
import { DamageSource } from '../DamageSource';
import { Entity } from '../Entity';
import { GenericEntity } from '../GenericEntity';
import AnimatePacket, { AnimateAction } from '@jsprismarine/protocol/packet/AnimatePacket';
import { actorMotionIn, dataEntityRecordOf, writeDataEntityRecord } from './persistence';
import { lookVector } from '../Archery';
import Player from '../../Player';
import { MetadataFlag } from '@jsprismarine/protocol/wire/structures/Metadata';
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import type { ContentItemDrop, ContentPosition } from '../../content/world/adapter';
import type { DataEntity } from './DataEntity';
import type { EntityItemInteraction } from './itemInteraction';
import type { ContentItemEntity, EntityHostFacts, EntityWorldFacts } from './host';
import { EntityRuntime, PROJECTILE_EYE_HEIGHT_FRACTION } from './EntityRuntime';
import { LiveBodies } from './liveBodies';
import { StoreActor, StoreActors } from './storeActors';
import type { StoreActorBlows } from './storeActors';
import { tradeDisplayNameOf } from './trading';
import type { DataEntityRecord } from './persistence';
import EntityDamageEvent from '../../events/entity/EntityDamageEvent';
import EntityDeathEvent from '../../events/entity/EntityDeathEvent';
import { enchantmentProtection } from '../../enchantment/mitigation';
import { viewableEquipmentOf, wornArmorOf } from '../equipment';
import { PASS, VETO, replaceAmount } from './damagePipeline';
import type { DamageOutcome, DamageRoute } from './damagePipeline';
import { intentOfHealthWrite, intentOfLegacyBlow, legacySourceOfIntent, viewableDataEntity } from './legacyDamage';
import type { Item } from '../../item/Item';
import type { StatusEffect } from '../StatusEffect';
import { advancementDamage, advancementKill, advancementPickedUpItem } from '../../advancement/triggers';
import { itemDropOf, itemOfDrop } from '../../inventory/persistence';
import ContainerEntry from '../../inventory/ContainerEntry';
import { TakeItemActorPacket } from '@jsprismarine/protocol';
import type { DroppedItems, ItemStart } from './droppedItems';
import { isDroppedItem, itemTuningOf, itemViewOf } from './droppedItems';
import { ItemBodies } from './itemBodies';
import type { ItemActorBody } from './itemBodies';
import { storedItemActorOf } from '../EntitySerializer';

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
const playerFilterViews = new WeakMap<Player, FilterEntityView>();

/** Reuses a player's filter closures while they continue to read that player's live state. */
const playerFilterView = (player: Player): FilterEntityView => {
    const cached = playerFilterViews.get(player);
    if (cached !== undefined) return cached;

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
    const view: FilterEntityView = {
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
    playerFilterViews.set(player, view);
    return view;
};

/** What an actor record held apart from an entity's record, which a restored entity keeps. */
export interface KeptActorState {
    /** The actor record tags this server does not model, which the next save writes back. */
    readonly persistentNbt: NBTTagCompound | null;
    /** The name tag, for a record that does not name the entity itself. */
    readonly nameTag?: string;
    /** The `/tag` tags. */
    readonly tags: readonly string[];
    /** The status effects, which the entity's immunities still filter. */
    readonly statusEffects: readonly StatusEffect[];
}

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

/** One dropped stack of the store as the pickup goals read it, at the height where it lies. */
const lyingItemOf = (entity: DataEntity, content: ServerContent): ContentItemEntity | undefined => {
    const view = itemViewOf(entity);
    if (view === undefined || entity.removed !== undefined) return undefined;
    const at = entity.position;
    const item = itemOfDrop(itemDropOf(view.stack), content);
    return {
        id: entity.id,
        position: { x: at.x, y: at.y - itemTuningOf(entity).positionOffset, z: at.z },
        item: itemDropOf(view.stack),
        ...(item === null ? {} : { filterView: filterItemOf(item) })
    };
};

/**
 * The dropped stacks within a pickup radius, from the runtime's index, in ascending runtime id
 * order. Live, so a stack another mob took earlier in the tick has already left it.
 */
const lyingItemsNear = (
    runtime: EntityRuntime,
    center: ContentPosition,
    radius: number
): readonly ContentItemEntity[] => {
    if (radius < 0) return [];
    const found: ContentItemEntity[] = [];
    for (const entity of runtime.index.itemsWithin(center.x, center.z, radius)) {
        const lying = lyingItemOf(entity, runtime.content());
        if (lying !== undefined) found.push(lying);
    }
    return found;
};

/**
 * Gives a dropped stack to a live player: what fits goes into the inventory, the advancement
 * that names the item is earned, and every client that sees both is shown the stack fly in.
 * @returns How many of the stack's items did not fit.
 */
const givePlayerItem = (
    options: LiveEntityOptions,
    playerId: number,
    itemId: number,
    drop: ContentItemDrop
): number => {
    const world = options.liveWorld();
    const taker = world?.getEntity(BigInt(playerId));
    const item = itemOfDrop(drop, options.content());
    if (world === undefined || !(taker instanceof Player) || item === null) return drop.count;

    const entry = new ContainerEntry({ item, count: item.getAmount() });
    const left = taker.getInventory().addItem(entry);
    if (left >= drop.count) return left;

    // Here rather than in the inventory, which has no idea whose it is. Nearly every "get this
    // item" advancement is earned this way: Java has no block-break trigger.
    advancementPickedUpItem(taker, entry.toItemStack());

    const take = new TakeItemActorPacket();
    take.itemRuntimeEntityId = BigInt(itemId);
    take.takerRuntimeEntityId = taker.getRuntimeId();
    // Both actors have to be known to the recipient: the packet animates the item flying into
    // the taker, and a client missing either one has nothing to draw.
    const watchers = world
        .getPlayers()
        .filter((player) => {
            const session = player.getNetworkSession();
            return session.tracks(BigInt(itemId)) && session.tracks(taker.getRuntimeId());
        })
        .map(async (player) => player.getNetworkSession().send(take));
    // The take packet animates the stack; it does not say what the inventory now holds.
    void Promise.all([...watchers, taker.getNetworkSession().sendInventory()]).catch((error: unknown) =>
        options.report(String(error))
    );
    return left;
};

/** The host facts over one live world. */
const liveHost = (
    options: LiveEntityOptions,
    itemBodies: ItemBodies,
    actors: StoreActors,
    runtime: () => EntityRuntime
): EntityHostFacts => ({
    damageMitigation: (target, intent) => {
        const world = options.liveWorld();
        if (world === undefined) return undefined;
        const content = world.getServer().getContent();
        const equipment = viewableEquipmentOf(target.equipment, content);
        const worn = wornArmorOf(equipment);
        const enchantment =
            intent.source.bypassesEnchantments === true
                ? 0
                : enchantmentProtection({
                      content,
                      victim: viewableDataEntity(target),
                      equipment,
                      source: legacySourceOfIntent(world, intent)
                  });
        return { ...worn, enchantmentProtection: enchantment };
    },
    damageCommitted: (commit) => {
        const world = options.liveWorld();
        const victim = actors.actorOf(commit.target.id);
        if (world === undefined || victim === undefined) return;

        // The order the legacy pipeline raised them in: the death, then the blow.
        const source = legacySourceOfIntent(world, commit.intent);
        if (commit.died) {
            world.getServer().post(['entityDeath', new EntityDeathEvent(victim, source)]);
            advancementKill(victim, source);
        }
        advancementDamage(victim, source, commit.dealt, commit.taken, false);
    },
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
    itemsNear: (center, radius) => lyingItemsNear(runtime(), center, radius),
    takeItem: (id, count) => {
        const taken = runtime().droppedItems.take(id, count);
        return taken === undefined ? undefined : itemDropOf(taken);
    },
    givePlayerItem: (playerId, itemId, item) => givePlayerItem(options, playerId, itemId, item),
    itemStackChanged: (itemId, count) => {
        const world = options.liveWorld();
        const body = itemBodies.bodyOf(itemId);
        if (world === undefined || body === undefined) return;
        // There is no packet that updates a dropped stack: `AddItemActor` carries the item and is
        // only sent when the entity appears, so this event is the one way to say the number changed.
        void world
            .sendActorEvent(body, ActorEvent.UPDATE_STACK_SIZE, count)
            .catch((error: unknown) => options.report(String(error)));
    },
    playSoundAt: (at, sound) => options.liveWorld()?.playNamedSoundAt(new Vector3(at.x, at.y, at.z), sound),
    levelEvent: (at, event, data) => {
        void options
            .liveWorld()
            ?.sendWorldEvent(new Vector3(at.x, at.y, at.z), event, data)
            .catch((error: unknown) => options.report(String(error)));
    },
    hurt: (id, amount, cause, sourceId, deathMessageOverride) => {
        const world = options.liveWorld();
        const target = world?.getActor(BigInt(id));
        if (target === null || target === undefined) return;

        // The attacker travels with the blow, so a player who was bitten knows what bit them
        // and the death message names it.
        const attacker = sourceId === undefined ? null : (world?.getActor(BigInt(sourceId)) ?? null);
        const damageCause = damageCauseOf(cause);
        const source =
            attacker === null && deathMessageOverride === undefined
                ? DamageSource.of(damageCause)
                : new DamageSource({ cause: damageCause, attacker, deathMessageOverride });
        void target.damage(amount, source).catch((error: unknown) => options.report(String(error)));
    },
    applySonicBoom: (id, amount, sourceId, impulse) => {
        const world = options.liveWorld();
        const target = world?.getActor(BigInt(id));
        if (target === null || target === undefined) return;

        const attacker = world?.getActor(BigInt(sourceId)) ?? null;
        const source = new DamageSource({ cause: DamageCause.SonicBoom, attacker });
        void target
            .damage(amount, source)
            .then((landed) => {
                if (!landed) return;
                const resistance = Math.min(
                    1,
                    Math.max(0, target.attributes.getValue(AttributeIds.KnockbackResistence))
                );
                const remaining = 1 - resistance;
                target.applyImpulse({
                    x: impulse.x * remaining,
                    y: impulse.y * remaining,
                    z: impulse.z * remaining
                });
            })
            .catch((error: unknown) => options.report(String(error)));
    },
    attackSound: (id) => {
        const world = options.liveWorld();
        const attacker = actors.actorOf(id);
        if (world === undefined || attacker === undefined) return;
        void world
            .sendActorSound(attacker, LevelSoundEvent.ATTACK)
            .catch((error: unknown) => options.report(String(error)));
    },
    applyStatusEffect: (id, effect) => {
        const target = options.liveWorld()?.getActor(BigInt(id));
        if (target !== null && target !== undefined) target.addStatusEffect(effect);
    },
    applyStatusEffectIfChanged: (id, effect) => {
        const target = options.liveWorld()?.getActor(BigInt(id));
        return target !== null && target !== undefined ? target.addStatusEffect(effect) : false;
    },
    removeStatusEffect: (id, identifier) => {
        const target = options.liveWorld()?.getActor(BigInt(id));
        return target !== null && target !== undefined ? target.removeStatusEffect(identifier) : false;
    },
    hurtByProjectile: (id, amount, projectileId, ownerId) => {
        const world = options.liveWorld();
        const target = world?.getActor(BigInt(id));
        const projectile = world?.getActor(BigInt(projectileId));
        if (target === null || target === undefined) return;

        const owner = ownerId === undefined ? null : (world?.getActor(BigInt(ownerId)) ?? null);
        const source =
            projectile === null || projectile === undefined
                ? DamageSource.of(DamageCause.Projectile)
                : DamageSource.projectileFrom(projectile, owner);
        void target.damage(amount, source).catch((error: unknown) => options.report(String(error)));
    },
    hurtFeedback: (id) => {
        const world = options.liveWorld();
        const target = actors.actorOf(id);
        if (world === undefined || target === undefined) return;

        void Promise.all([
            world.sendActorEvent(target, ActorEvent.HURT_ANIMATION),
            world.sendActorSound(target, LevelSoundEvent.HURT)
        ]).catch((error: unknown) => options.report(String(error)));
    },
    startDeathAnimation: (id) => {
        const world = options.liveWorld();
        const target = actors.actorOf(id);
        if (world === undefined || target === undefined) return;

        // `DRAGON_START_DEATH_ANIM` is the unverified Bedrock candidate for Java's dragon death
        // start (docs/plans/end-dragon-fight.md, open question 2); a retail client run decides.
        void world
            .sendActorEvent(target, ActorEvent.DRAGON_START_DEATH_ANIM)
            .catch((error: unknown) => options.report(String(error)));
    },
    knockback: (id, directionX, directionZ, strength) => {
        const target = options.liveWorld()?.getActor(BigInt(id));
        target?.applyKnockback(directionX, directionZ, strength);
    },
    // The village raid is the world's; what a villager's brain reads of it is the same facts
    // Java's `Raid` answers: whether a wave has come, whether the village waits between waves
    // and whether it won.
    villagerRaidStateAt: (at) => {
        const raid = options.liveWorld()?.getRaidManager()?.raidAt(at);
        if (raid === undefined) return undefined;
        return {
            hasStarted: raid.groupsSpawned > 0,
            betweenWaves:
                raid.status === 'ongoing' &&
                raid.groupsSpawned > 0 &&
                raid.raiders.length === 0 &&
                raid.waveCountdown > 0,
            victory: raid.status === 'victory'
        };
    },
    // No pillager patrol runs on this server, so that named mob event is never active. Said as a
    // fact rather than guessed: the rules that gate on one refuse, which is what keeps a patrol
    // from spawning every cycle. A raid is not a named mob event the spawn rules gate on.
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

    /**
     * The legacy body of each entity, which the legacy entity code still reaches it through.
     * Clients are shown {@link LiveEntityRuntime.actors}, not these.
     */
    public readonly bodies: LiveBodies;

    /** The body each dropped stack shows a client. */
    public readonly itemBodies: ItemBodies;

    /** Each entity as the clients are shown it, read from the store. */
    public readonly actors: StoreActors;

    private readonly options: LiveEntityOptions;
    /** The world the spawn rules read, which is not known until the adapter is assembled. */
    private spawnWorld: SpawnWorld | undefined;
    private started = false;
    /** Who hears about removals beyond the body index, such as the End's dragon fight. */
    private readonly removalListeners = new Set<(entity: DataEntity, reason: string) => void>();

    public constructor(options: LiveEntityOptions) {
        this.options = options;
        const blows: StoreActorBlows = {
            hurt: (entity, amount, source, route) =>
                this.landed(this.runtime.damage(intentOfLegacyBlow(entity, amount, source, route))),
            written: (entity, taken, source) => {
                this.runtime.damage(intentOfHealthWrite(entity, taken, source, 'legacy_body'));
            },
            heal: (entity, amount) => this.runtime.heal(entity.id, amount)
        };
        this.actors = new StoreActors({
            world: options.liveWorld,
            report: options.report,
            blows,
            projected: (entity, projection) => this.bodies.project(entity, projection)
        });
        this.bodies = new LiveBodies({ world: options.liveWorld, report: options.report, ...blows });
        this.itemBodies = new ItemBodies({ world: options.liveWorld, report: options.report });
        this.runtime = new EntityRuntime({
            content: options.content,
            world: options.world,
            host: liveHost(options, this.itemBodies, this.actors, () => this.runtime),
            report: options.report,
            onSpawn: (entity) => {
                if (isDroppedItem(entity)) {
                    this.itemBodies.add(entity, this.runtime.droppedItems);
                    return;
                }
                const leashHolderId = this.runtime.leashHolderIdOf(entity.id);
                this.bodies.add(entity);
                this.actors.add(entity, leashHolderId);
            },
            onRemove: (entity, reason) => {
                if (isDroppedItem(entity)) this.itemBodies.drop(entity);
                else {
                    this.actors.remove(entity);
                    this.bodies.drop(entity);
                }
                for (const listener of this.removalListeners) listener(entity, reason);
            },
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
        this.runtime.index.chunkChanged = (chunkX, chunkZ) =>
            options.liveWorld()?.storeEntityChunkChanged(chunkX, chunkZ);
        // The plugin `entityDamage` event is a before-hook: a listener can cancel the blow or
        // change its amount, and anything at or below zero cancels it. A blow the pack already
        // turned aside is not offered, so its sensor event still fires.
        this.runtime.damagePipeline.addBeforeHook('entityDamage', (intent) => {
            if (intent.amount <= 0) return PASS;
            const world = options.liveWorld();
            const victim = this.actors.actorOf(intent.target);
            if (world === undefined || victim === undefined) return PASS;

            const event = new EntityDamageEvent(victim, intent.amount, legacySourceOfIntent(world, intent));
            world.getServer().post(['entityDamage', event]);
            if (event.isCanceled()) return VETO;
            return event.getAmount() === intent.amount ? PASS : replaceAmount(event.getAmount());
        });
    }

    /** The store entity behind an actor of this runtime, or undefined for a legacy entity. */
    private storeEntityOf(target: WorldActor): DataEntity | undefined {
        const id = target instanceof StoreActor ? target.entity.id : this.bodies.entityIdOf(target);
        const entity = id === undefined ? undefined : this.runtime.byId(id);
        return entity?.removed === undefined ? entity : undefined;
    }

    /** Whether a run of the pipeline took health off its target. */
    private landed(outcome: DamageOutcome): boolean {
        return outcome.committed && outcome.taken > 0;
    }

    /**
     * Hurts a data-driven entity through the store's damage pipeline, for a caller that describes
     * the blow with a legacy {@link DamageSource}, such as a player's swing or a legacy blast.
     *
     * @param target - The entity, a store entity through its actor.
     * @param route - Which path the blow came by.
     * @returns Whether it took health off the entity, or undefined when it is not a store entity
     *   and the caller still owns the blow.
     */
    public damageEntity(
        target: WorldActor,
        amount: number,
        source: DamageSource,
        route: DamageRoute
    ): boolean | undefined {
        const entity = this.storeEntityOf(target);
        if (entity === undefined) return undefined;
        if (amount <= 0) return false;
        return this.landed(this.runtime.damage(intentOfLegacyBlow(entity, amount, source, route)));
    }

    /**
     * Kills a data-driven entity through the store's damage pipeline, with a blow of its whole
     * health that ignores armor and the grace period, which is what `/kill` deals.
     *
     * @returns Whether it died, or undefined when it is not a store entity.
     */
    public killEntity(target: WorldActor, source: DamageSource, route: DamageRoute): boolean | undefined {
        const entity = this.storeEntityOf(target);
        if (entity === undefined) return undefined;
        const health = entity.instance.attributes.get('health')?.current;
        if (health === undefined || health <= 0) return false;
        const outcome = this.runtime.damage(intentOfHealthWrite(entity, health, source, route));
        return outcome.committed && outcome.died;
    }

    /**
     * Hears about every entity the runtime removes, after the body is gone.
     *
     * The End's dragon fight learns of its dragon's death through this rather than through a
     * field on the runtime, so the runtime stays ignorant of who is watching. The reason is the
     * removal reason the runtime recorded: `death` and `death_behavior` are deaths,
     * `chunk unload` means the entity still exists in the save.
     *
     * @returns A function that unsubscribes the listener.
     */
    public onEntityRemoved(listener: (entity: DataEntity, reason: string) => void): () => void {
        this.removalListeners.add(listener);
        return () => this.removalListeners.delete(listener);
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
        this.bodies.sync(this.runtime);
        await Promise.all([...this.actors.sync(this.runtime, shouldTick), ...this.itemBodies.sync()]);
    }

    /** The dropped stacks of this dimension. */
    public get droppedItems(): DroppedItems {
        return this.runtime.droppedItems;
    }

    /**
     * Puts a stack on the ground as a store entity.
     * @param lying - Where it lies; it reports itself a little above.
     * @returns The entity, or undefined when the stack is empty or the content declares no item.
     */
    public dropItem(lying: ContentPosition, start: ItemStart): DataEntity | undefined {
        return this.runtime.droppedItems.spawn(lying, start);
    }

    /**
     * Brings a saved dropped stack back as a store entity, from the actor record a chunk or a
     * portal carried.
     *
     * @param stored - A body whose position, tags and kept actor tags the record was read into.
     * @returns The entity, or undefined when the record holds no stack.
     */
    public restoreItem(stored: Entity): DataEntity | undefined {
        const saved = stored.persistentNbt === null ? undefined : storedItemActorOf(stored.persistentNbt);
        return saved === undefined ? undefined : this.restoreItemFrom(stored, saved);
    }

    /**
     * Takes in the body of a stack that left another dimension's store through a portal, with the
     * state it left with, and gives it a body of this dimension's.
     * @returns The entity, or undefined when the body held no stack.
     */
    public adoptItem(arrived: ItemActorBody): DataEntity | undefined {
        const saved = arrived.savedItem();
        if (saved === undefined) return undefined;
        const { motion } = saved;
        return this.restoreItemFrom(arrived, {
            ...saved,
            motion: { x: motion.getX(), y: motion.getY(), z: motion.getZ() }
        });
    }

    /** Spawns a stack where a body reports it, carrying over the actor tags the body kept. */
    private restoreItemFrom(stored: Entity, saved: ItemStart): DataEntity | undefined {
        const at = stored.getPosition();
        const entity = this.runtime.droppedItems.spawn(
            { x: at.getX(), y: at.getY(), z: at.getZ() },
            { ...saved, reported: true }
        );
        if (entity === undefined) return undefined;
        const body = this.itemBodies.bodyOf(entity.id);
        if (body !== undefined) {
            body.persistentNbt = stored.persistentNbt;
            for (const tag of stored.getTags()) body.addTag(tag);
            body.setPortalCooldown(stored.getPortalCooldown());
        }
        return entity;
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
    public launchProjectile(action: LaunchProjectileAction, shooter: WorldActor): DataEntity | undefined {
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
     * Whether an entity rides something or carries a rider.
     *
     * Bedrock sends nothing with passengers through a portal (MCPE-47288), and the only riding
     * the server models is the data-driven `minecraft:rideable` index, so a player on a mob
     * answers through the mob's side and a written entity never rides.
     *
     * @param id - The entity's runtime id.
     */
    public isInRide(id: number): boolean {
        const entity = this.runtime.byId(id);
        if (entity === undefined) return false;
        return this.runtime.vehicleOf(entity.body) !== undefined || this.runtime.ridersOf(entity.body).length > 0;
    }

    /**
     * Whether this live body is a data-driven entity that accepts a name tag.
     *
     * @param target - The entity, a store entity through its actor.
     * @returns Whether its runtime entity accepts name tags.
     */
    public canNameEntity(target: WorldActor): boolean {
        const id = this.storeEntityOf(target)?.id;
        return id !== undefined && this.runtime.canNameEntity(id);
    }

    /**
     * Names a live body through its data-driven runtime entity.
     *
     * @param target - The entity, a store entity through its actor.
     * @param name - The custom name being assigned.
     * @returns Whether the runtime accepted the name tag.
     */
    public nameEntity(target: WorldActor, name: string): boolean {
        const id = this.storeEntityOf(target)?.id;
        return id !== undefined && this.runtime.nameEntity(id, name);
    }

    /**
     * Whether this live body is a data-driven entity that accepts the requested dye.
     *
     * @param target - The entity, a store entity through its actor.
     * @param color - The dye color name.
     * @returns Whether the runtime entity accepts the dye.
     */
    public canDyeEntity(target: WorldActor, color: string): boolean {
        const id = this.storeEntityOf(target)?.id;
        return id !== undefined && this.runtime.canDyeEntity(id, color);
    }

    /**
     * Applies a supported dye through the live data-driven entity runtime.
     *
     * @param target - The entity, a store entity through its actor.
     * @param color - The dye color name.
     * @returns Whether the runtime changed the color.
     */
    public dyeEntity(target: WorldActor, color: string): boolean {
        const id = this.storeEntityOf(target)?.id;
        return id !== undefined && this.runtime.dyeEntity(id, color);
    }

    /**
     * Opens a villager's trade screen for a player who used an empty hand or a non-egg item on it.
     *
     * A spawn egg and a sneaking player are left to the usual interaction, as Java's
     * `Villager.mobInteract` leaves them. Everything else on a trader that has offers opens the
     * screen, and one that has none or is a baby does nothing.
     */
    private openTradeScreen(id: number, trader: WorldActor, player: WorldActor, itemIdentifier: string): boolean {
        if (!(player instanceof Player) || itemIdentifier.endsWith('_spawn_egg') || player.isSneaking()) return false;
        const entity = this.runtime.byId(id);
        if (entity === undefined) return false;
        const merchant = this.runtime.merchant(entity);
        if (merchant === undefined) return false;
        const title = tradeDisplayNameOf(entity.instance);

        const playerId = Number(player.getRuntimeId());
        if (!this.runtime.beginTrade(id, playerId)) return false;

        void player
            .getNetworkSession()
            .openTradeWindow({
                trader,
                source: merchant,
                ...(title === undefined ? {} : { title }),
                context: () => {
                    const hero = player.getStatusEffect('minecraft:village_hero');
                    return {
                        ...this.runtime.curedFacts(id, playerId),
                        ...(hero === undefined ? {} : { heroOfTheVillage: hero.amplifier + 1 })
                    };
                },
                release: () => this.runtime.endTrade(id, playerId),
                traded: (result) => {
                    if (!result.traded) return;
                    // Java's `notifyTrade` plays the villager's yes after every completed trade.
                    void this.options
                        .liveWorld()
                        ?.sendActorSound(trader, LevelSoundEvent.HAGGLE_YES)
                        .catch((error: unknown) => this.options.report(String(error)));
                }
            })
            .then((window) => {
                // Already open on this trader: nothing was opened, so there is nothing to release.
                if (window === undefined) this.runtime.endTrade(id, playerId);
            })
            .catch((error: unknown) => {
                this.runtime.endTrade(id, playerId);
                this.options.report(String(error));
            });
        return true;
    }

    /** Applies a held item to a data-driven entity and carries out its world, item, and animation effects. */
    public interactWithItem(
        target: WorldActor,
        player: WorldActor,
        itemIdentifier: string,
        heldItem?: ContentItemDrop
    ): EntityItemInteraction {
        const id = this.storeEntityOf(target)?.id;
        if (id === undefined) return { accepted: false };

        if (this.openTradeScreen(id, target, player, itemIdentifier))
            return { accepted: true, swing: true, consumeItem: false };

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
     * Writes every entity's record into its actor's tags, ready for a save.
     *
     * Called by `World.saveChunks` before it writes anything, rather than once a tick: the
     * record is a snapshot of state that changes every tick, and nothing reads it until a chunk
     * is written. The chunk serializer reads it from the actor with every other tag it carries.
     */
    public persist(): void {
        for (const [actor, record] of this.savedRecords()) {
            actor.persistentNbt ??= new NBTTagCompound('');
            writeDataEntityRecord(actor.persistentNbt, record);
        }
    }

    /**
     * The record {@link LiveEntityRuntime.persist} would write for each entity that persists, by
     * actor, without writing it, so a replay digest can hash what a save holds and change nothing.
     * @returns {ReadonlyMap<WorldActor, DataEntityRecord>} The records, each keyed by a store actor.
     */
    public savedRecords(): ReadonlyMap<WorldActor, DataEntityRecord> {
        const records = new Map<WorldActor, DataEntityRecord>();
        for (const entity of this.runtime.all()) {
            const actor = this.actors.actorOf(entity.id);
            if (actor === undefined || !actor.shouldPersist()) continue;
            records.set(
                actor,
                dataEntityRecordOf(
                    entity,
                    this.runtime.poolOf(entity.id),
                    this.runtime.leashHolderIdentityOf(entity.id),
                    this.runtime.merchantSnapshotOf(entity)
                )
            );
        }
        return records;
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
        const id = this.bodies.detach(body) ?? this.itemBodies.detach(body);
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
        return this.restoreRecord(
            record,
            { x: at.getX(), y: at.getY(), z: at.getZ() },
            {
                persistentNbt: stored.persistentNbt,
                nameTag: stored.metadata.nameTag || undefined,
                tags: stored.getTags(),
                statusEffects: stored.getStatusEffects()
            }
        );
    }

    /**
     * Brings one entity back into the runtime from its record, at a position, with what the
     * record does not hold: the actor record tags to carry forward, and the name tag, tags and
     * status effects the actor record held apart from it.
     *
     * @returns The entity, or undefined when no loaded pack declares its type.
     */
    public restoreRecord(record: DataEntityRecord, at: EntityPosition, kept: KeptActorState): DataEntity | undefined {
        const entity = this.runtime.restore(record, at);
        if (entity === undefined) return undefined;
        this.keep(entity, kept);
        entity.body.nameTag ??= kept.nameTag;
        return entity;
    }

    /** Puts what an actor record held apart from the entity's record onto the restored entity. */
    private keep(entity: DataEntity, kept: KeptActorState): void {
        const actor = this.actors.actorOf(entity.id);
        if (actor !== undefined) {
            actor.persistentNbt = kept.persistentNbt;
            for (const tag of kept.tags) actor.addTag(tag);
            for (const effect of kept.statusEffects) actor.addStatusEffect(effect, false);
        }
        const body = this.bodies.bodyOf(entity.id);
        if (body !== undefined) body.persistentNbt = kept.persistentNbt;
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

        entity.body.nameTag = stored.metadata.nameTag || undefined;
        this.keep(entity, {
            persistentNbt: stored.persistentNbt,
            tags: stored.getTags(),
            statusEffects: stored.getStatusEffects()
        });
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

    /** Resolves the goal world from whichever dimension owns this instance. */
    public goalWorldFor(instance: EntityInstance) {
        for (const runtime of this.byDimension.values()) {
            const goalWorld = runtime.runtime.goalWorldFor(instance);
            if (goalWorld !== undefined) return goalWorld;
        }
        return undefined;
    }

    /** Forgets one dimension's runtime, which is what closing its world does. */
    public close(dimension: string): void {
        this.byDimension.get(dimension)?.bodies.clear();
        this.byDimension.get(dimension)?.itemBodies.clear();
        this.byDimension.get(dimension)?.actors.clear();
        this.byDimension.delete(dimension);
    }

    /** Forgets every runtime, which is what a server shutdown does once the worlds are down. */
    public closeAll(): void {
        for (const dimension of [...this.byDimension.keys()]) this.close(dimension);
    }
}
