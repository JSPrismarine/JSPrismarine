/**
 * The data-driven entity runtime, over a running server.
 *
 * `EntityRuntime` is written against two seams and no server: `EntityWorldFacts`
 * for the blocks, the clock and the random draws, and `EntityHostFacts` for
 * the things an entity index does not hold - players, item stacks on the
 * ground, and damage going out to either. This module supplies both from a
 * live {@link World}, shows every entity to clients and to the rest of the
 * server through its {@link StoreActor}, and hands the whole thing to
 * `World.tick` as one call.
 *
 * {@link EntityRuntimes} is the registry the two ends meet in. The content
 * world adapter builds one runtime per dimension while it assembles that
 * dimension's groups, because the groups are projections of the runtime; the
 * world of that dimension looks its own up by name and ticks it. Neither has
 * to know how the other got there.
 */
import type { Gametype } from '@jsprismarine/minecraft';
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
import { ActorEvent, DisconnectReason, LevelEvent, LevelSoundEvent } from '@jsprismarine/minecraft';
import { NBTTagCompound } from '@jsprismarine/nbt';

import { singleDimension } from '../../content/world/adapter';
import type { ContentEntityAccess, ServerWorldAdapter } from '../../content/world/adapter';
import type { ServerContent } from '../../content/ServerContent';
import { contentWorldViews } from '../../content/world/views';
import { destroyBlock } from '../../world/blockDestroy';
import { lootLevelOf } from '../../world/lootLevel';
import type { World } from '../../world/World';
import { damageCauseOf, DamageCause } from '../DamageCause';
import { DamageSource } from '../DamageSource';
import { entityIds } from '../entityIds';
import AnimatePacket, { AnimateAction } from '@jsprismarine/protocol/bedrock/packet/AnimatePacket';
import PlayerStartItemCooldownPacket from '@jsprismarine/protocol/bedrock/packet/PlayerStartItemCooldownPacket';
import { actorHealthIn, actorMotionIn, dataEntityRecordOf, writeDataEntityRecord } from './persistence';
import { lookVector } from '../Archery';
import { dispatchStepOn } from '../../world/blockStepOn';
import { AttributeIds } from '@jsprismarine/protocol/bedrock/wire/structures/Attribute';
import type { ContentItemDrop, ContentPosition } from '../../content/world/adapter';
import type { DataEntity } from './DataEntity';
import { EntityBossBars } from './bossBars';
import type { OwnBossBar, ShownBossBar } from './bossBars';
import { BossBar } from '../../player/BossBar';
import { BossBarColor } from '@jsprismarine/protocol/bedrock/packet/BossEventPacket';
import type { EntityItemInteraction } from './itemInteraction';
import type { ContentItemEntity, EntityHostFacts, EntityWorldFacts } from './host';
import { EntityRuntime, PROJECTILE_EYE_HEIGHT_FRACTION } from './EntityRuntime';
import type { StoreActor } from './storeActors';
import { INERT_ACTOR, InertActor, StoreActors } from './storeActors';
import { reattachStorePlayer, StorePlayerActor, StorePlayers } from './storePlayers';
import { storePlayerHostFacts } from './playerHostFacts';
import { REPAIR_SLOTS, repairWithExperience } from '../../enchantment/mending';
import { addExperiencePoints } from '../Experience';
import type { StorePlayer } from '../storePlayer';
import { consumeHeldItem } from '../../item/interaction';
import { clientOwnsMovement } from '../playerOverlay';
import { playerAbilityNames } from '../playerAbilities';
import type { StoreActorBlows } from './storeActors';
import { tradeDisplayNameOf } from './trading';
import type { DataEntityRecord } from './persistence';
import EntityDamageEvent from '../../events/entity/EntityDamageEvent';
import EntityDeathEvent from '../../events/entity/EntityDeathEvent';
import EntityHurtEvent from '../../events/entity/EntityHurtEvent';
import EntitySpawnEvent from '../../events/entity/EntitySpawnEvent';
import EntityRemoveEvent from '../../events/entity/EntityRemoveEvent';
import EntityRemovedEvent from '../../events/entity/EntityRemovedEvent';
import EntityHitEntityEvent from '../../events/entity/EntityHitEntityEvent';
import EntityHealEvent from '../../events/entity/EntityHealEvent';
import EntityTriggerEvent from '../../events/entity/EntityTriggerEvent';
import EntityTameEvent from '../../events/entity/EntityTameEvent';
import EntityTamedEvent from '../../events/entity/EntityTamedEvent';
import ProjectileHitEvent from '../../events/entity/ProjectileHitEvent';
import type { ProjectileHitTarget } from '../../events/entity/ProjectileHitEvent';
import { endItemUse } from '../../item/itemUse';
import EntityItemPickupEvent from '../../events/entity/EntityItemPickupEvent';
import EntityItemPickedUpEvent from '../../events/entity/EntityItemPickedUpEvent';
import ExplosionEvent from '../../events/other/ExplosionEvent';
import ExplodedEvent from '../../events/other/ExplodedEvent';
import EntityHealedEvent from '../../events/entity/EntityHealedEvent';
import EntityHealthChangedEvent from '../../events/entity/EntityHealthChangedEvent';
import { enchantmentProtection } from '../../enchantment/mitigation';
import { wornArmorOf } from '../equipment';
import { PASS, VETO, replaceAmount } from './damagePipeline';
import type { DamageOutcome, DamageRoute } from './damagePipeline';
import { intentOfHealthWrite, intentOfLegacyBlow, legacySourceOfIntent, viewableDataEntity } from './legacyDamage';
import type HumanInventory from '../../inventory/HumanInventory';
import type PlayerSession from '../../player/PlayerSession';
import type { StatusEffect } from '../StatusEffect';
import { advancementDamage, advancementKill, advancementPickedUpItem } from '../../advancement/triggers';
import { raiseAdvancement } from '../../advancement/raise';
import type { AdvancementRaiser } from '../../advancement/raise';
import { itemDropOf, itemOfDrop } from '../../inventory/persistence';
import type { DroppedItems, ItemStart } from './droppedItems';
import { isDroppedItem, itemTuningOf, itemViewOf } from './droppedItems';
import { filterDomainCapacity, filterDomainFill, filterDomainStack, filterItemOf } from './filterView';
import { ItemActor } from './itemActor';
import { storedItemActorOf } from '../EntitySerializer';
import type { StoredActor } from '../EntitySerializer';
import { worldKeyOf } from '../../world/worldKey';
import { scoreDeath } from '../../player/playerScores';

/** What a player's filter view reads of the player. */
interface FilteredPlayer {
    getRuntimeId(): bigint;
    getInventory(): HumanInventory;
    getTags(): readonly string[];
    readonly gamemode: Gametype;
    isSneaking(): boolean;
    isSleeping(): boolean;
}

/** The live player's family and equipment, which `minecraft:interact` filters inspect. */
const playerFilterViews = new WeakMap<FilteredPlayer, FilterEntityView>();

/** Reuses a player's filter closures while they continue to read that player's live state. */
const playerFilterView = (player: FilteredPlayer): FilterEntityView => {
    const cached = playerFilterViews.get(player);
    if (cached !== undefined) return cached;

    const inventory = player.getInventory();
    const equipment = (slot: EquipmentSlot, index: number): FilterItemView | undefined =>
        filterItemOf(filterDomainStack(inventory, slot, index));
    const view: FilterEntityView = {
        id: () => Number(player.getRuntimeId()),
        names: (name) =>
            name === 'is_family'
                ? ['player']
                : name === 'has_tag'
                  ? player.getTags()
                  : name === 'has_ability'
                    ? playerAbilityNames(player.gamemode)
                    : undefined,
        flag: (name) => {
            if (name === 'is_sneaking' || name === 'is_sneak_held') return player.isSneaking();
            if (name === 'is_sleeping') return player.isSleeping();
            return undefined;
        },
        equipment,
        slotFill: (slot) => filterDomainFill(inventory, slot),
        carries: (matches) => {
            const slots = filterDomainCapacity(inventory, 'any');
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

/**
 * The health a saved actor without a data entity record comes back with when its `Attributes` list
 * names none, capped at its type's maximum: `Attributes.getDefaults`' twenty, which the legacy body
 * it used to be read into had.
 */
const SAVED_ACTOR_HEALTH = 20;

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
    /**
     * The `worlds.<name>` level the dimension belongs to, or undefined for the default level,
     * which is the one the content packages address by dimension alone.
     */
    readonly level?: string;
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
        pickupDelay: view.pickupDelay,
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
    const session = world?.viewerOf(BigInt(playerId));
    const item = itemOfDrop(drop, options.content());
    if (world === undefined || session === undefined || item === null) return drop.count;
    // The live player, for the inventory the store does not hold yet.
    const taker = session;

    const { events } = world.getServer().getKernel();
    if (events.hasListeners('entityItemPickup')) {
        const guard = new EntityItemPickupEvent(session.runtimeId, world, BigInt(itemId), item);
        events.post('entityItemPickup', guard);
        if (guard.isCanceled()) return drop.count;
    }
    const left = taker.getInventory().container('inventory').add(item);
    if (left >= drop.count) return left;
    if (events.hasListeners('entityItemPickedUp')) {
        const taken = itemOfDrop({ ...drop, count: drop.count - left }, options.content());
        if (taken !== null)
            events.post('entityItemPickedUp', new EntityItemPickedUpEvent(session.runtimeId, world, taken));
    }

    // The thrower's trigger. The `inventory_changed` the slots raise comes from the inventory.
    advancementPickedUpItem(taker, item);

    // Both actors have to be known to the recipient: the packet animates the item flying into
    // the taker, and a client missing either one has nothing to draw.
    const watchers = world
        .getViewers()
        .filter((viewer) => viewer.tracks(BigInt(itemId)) && viewer.tracks(session.runtimeId))
        .map(async (viewer) => viewer.presenter.showPickUp(BigInt(itemId), session.runtimeId, drop.count - left));
    // The take packet animates the stack; it does not say what the inventory now holds.
    void Promise.all([...watchers, session.sendInventory()]).catch((error: unknown) => options.report(String(error)));
    return left;
};

/**
 * Finishes a store player's meal through the server's item code, which runs the held item's
 * `onConsume` for the player its session speaks for.
 */
const finishMeal = (options: LiveEntityOptions, playerId: number): void => {
    const world = options.liveWorld();
    const session = world?.viewerOf(BigInt(playerId));
    if (world === undefined || session === undefined) return;
    endItemUse(session, 'complete', world.getServer().getTick());
    try {
        consumeHeldItem({
            content: options.content(),
            actors: world.getServer().getContentWorld().actorsAt(options.dimension, options.level),
            player: session
        });
    } catch (error: unknown) {
        options.report(`a meal could not finish: ${String(error)}`);
    }
};

/**
 * Gives a live player one experience orb: Mending repairs what it can of the gear, the rest is
 * experience, and the world hears the pickup sound, as Bedrock plays it for a collected orb.
 *
 * @javaSource ExperienceOrb.playerTouch
 */
const takeExperienceOrb = (
    options: LiveEntityOptions,
    runtime: EntityRuntime,
    player: StorePlayer,
    value: number
): void => {
    const world = options.liveWorld();
    if (world === undefined) return;
    const inventory = player.getInventory();
    const gear = Object.fromEntries(REPAIR_SLOTS.map((slot) => [slot, inventory.equipment(slot)]));
    const { remaining, repaired } = repairWithExperience(options.content().enchantments, gear, value, (bound) =>
        runtime.world.random.nextInt(bound)
    );
    for (const [slot, item] of repaired) inventory.setEquipment(slot, item);
    if (remaining > 0) addExperiencePoints(player.getExperience(), remaining);
    world.sendWorldEvent(player.getPosition(), LevelEvent.SOUND_EXPERIENCE_ORB_PICKUP, 0);
};

/**
 * Tells the players a kill names of it, through their presenters: the player who dealt the
 * blow, and the player who died. A death with no entity behind it, such as a fall, names no one.
 *
 * @param world - The world both players are in.
 * @param victim - What died.
 * @param source - The blow that killed it.
 * @param report - Where a failed send is logged.
 */
export const reportKill = (
    world: Pick<World, 'viewerOf'>,
    victim: StoreActor,
    source: DamageSource,
    report: (message: string) => void
): void => {
    const killer = source.attacker;
    if (killer === null) return;
    const sends: Promise<void>[] = [];
    if (killer instanceof StorePlayerActor) {
        const player = killer.getRuntimeId();
        const presenter = world.viewerOf(player)?.presenter;
        if (presenter !== undefined)
            sends.push(
                presenter.reportKill({
                    kind: 'killedMob',
                    player,
                    victim: victim.getRuntimeId(),
                    cause: source.cause,
                    projectile: source.projectile?.getType()
                })
            );
    }
    if (victim instanceof StorePlayerActor) {
        const player = victim.getRuntimeId();
        const presenter = world.viewerOf(player)?.presenter;
        if (presenter !== undefined)
            sends.push(
                presenter.reportKill({ kind: 'killedBy', player, killer: killer.getType(), cause: source.cause })
            );
    }
    void Promise.all(sends).catch((error: unknown) => report(String(error)));
};

/** The host facts over one live world. */
const liveHost = (
    options: LiveEntityOptions,
    actors: StoreActors,
    runtime: () => EntityRuntime,
    players: StorePlayers
): EntityHostFacts => ({
    ...storePlayerHostFacts(
        players,
        (player) => finishMeal(options, player.id),
        (player, item) => {
            const actor = actors.actorOf(player.id);
            if (actor !== undefined) options.liveWorld()?.showItemBreak(actor, item);
        }
    ),
    damageMitigation: (target, intent) => {
        const world = options.liveWorld();
        if (world === undefined) return undefined;
        const content = world.getServer().getContent();
        // A store player wears what its inventory holds, which the store does not model yet.
        const equipment = players.of(target.id)?.getInventory().getEquipment() ?? target.body.inventory.getEquipment();
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
        // A dropped stack raises no plugin event or trigger, as its legacy body never did.
        if (world === undefined || victim === undefined || victim instanceof ItemActor) return;

        // The order the legacy pipeline raised them in: the death, then the blow. All of it waits
        // for the unit this blow is in to keep its writes: an undo gives the victim its health
        // back, and a plugin told of the death or a kill advancement already earned could not be
        // taken back with it. A mob that died is out of the world by then, so the trigger events
        // are built here, from the victim and the attacker as the blow left them, and the death
        // event carries the actor, which still answers what the mob was when it died.
        const source = legacySourceOfIntent(world, commit.intent);
        const raises: (() => void)[] = [];
        const raiseOnceKept: AdvancementRaiser = (player, trigger, event) =>
            void raises.push(() => raiseAdvancement(player, trigger, event));
        if (commit.died) advancementKill(victim, source, raiseOnceKept);
        advancementDamage(victim, source, commit.dealt, commit.taken, false, raiseOnceKept);

        runtime().store.afterUnit((kept) => {
            if (!kept) return;
            const events = world.getServer().getKernel().events;
            if (commit.dealt > 0) events.post('entityHurt', new EntityHurtEvent(victim, commit.dealt, source));
            if (commit.died)
                world.getServer().getKernel().events.post('entityDeath', new EntityDeathEvent(victim, source));
            for (const raise of raises) raise();
            if (commit.died) scoreDeath(victim, source.attacker);
            // Told only to a client that can earn achievements, which is what it counts kills for.
            if (commit.died && world.getServer().getConfig().getXboxAchievements())
                reportKill(world, victim, source, options.report);

            // A player's death is also its session's: the death message, the respawn search and
            // the death screen. None of that is in the log, so it waits with the rest: a client
            // already sent health 0, the chat line and a respawn would be showing a death that
            // never happened.
            if (commit.died && victim instanceof StorePlayerActor)
                void world
                    .viewerOf(victim.getRuntimeId())
                    ?.die(source)
                    .catch((error: unknown) => options.report(String(error)));
        });
    },
    players: () => options.entities.players(),
    lootLevel: () => {
        const world = options.liveWorld();
        return world === undefined ? undefined : lootLevelOf(world);
    },
    playerView: (id) => {
        const session = options.liveWorld()?.viewerOf(BigInt(id));
        return session === undefined ? undefined : playerFilterView(session.getPlayer());
    },
    playerIdentityOf: (id) => options.liveWorld()?.viewerOf(BigInt(id))?.identity.uuid,
    playerIdForIdentity: (identity) => {
        const session = options
            .liveWorld()
            ?.getViewers()
            .find((candidate) => candidate.identity.uuid === identity);
        return session === undefined ? undefined : Number(session.runtimeId);
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
    takeExperienceOrb: (playerId, _orbId, value) => {
        const player = players.of(playerId);
        if (player !== undefined) takeExperienceOrb(options, runtime(), player, value);
    },
    itemStackChanged: (itemId, count) => {
        const world = options.liveWorld();
        const body = actors.actorOf(itemId);
        if (world === undefined || body === undefined) return;
        // There is no packet that updates a dropped stack: `AddItemActor` carries the item and is
        // only sent when the entity appears, so this event is the one way to say the number changed.
        world.sendActorEvent(body, ActorEvent.UPDATE_STACK_SIZE, count);
        // A Java client has no such event, so its presenter resends the whole stack; a Bedrock
        // presenter sends nothing more.
        const sends = world
            .getViewers()
            .filter((viewer) => viewer.tracks(BigInt(itemId)))
            .map(async (viewer) => viewer.presenter.showItemCount(BigInt(itemId), count));
        void Promise.all(sends).catch((error: unknown) => options.report(String(error)));
    },
    playSoundAt: (at, sound) => options.liveWorld()?.playNamedSoundAt(new Vector3(at.x, at.y, at.z), sound),
    levelEvent: (at, event, data) => options.liveWorld()?.sendWorldEvent(new Vector3(at.x, at.y, at.z), event, data),
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
        world.sendActorSound(attacker, LevelSoundEvent.ATTACK);
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

        world.sendActorEvent(target, ActorEvent.HURT_ANIMATION);
        world.sendActorSound(target, LevelSoundEvent.HURT);
    },
    itemCooldown: (id, category, ticks) => {
        const session = options.liveWorld()?.viewerOf(BigInt(id));
        if (session === undefined) return;
        session.released(
            session
                .getConnection()
                .sendDataPacket(new PlayerStartItemCooldownPacket({ itemCategory: category, durationTicks: ticks }))
        );
    },
    stepOn: (at, entity) => {
        const world = options.liveWorld();
        if (world === undefined) return;
        dispatchStepOn(options.content(), world, at, {
            identifier: entity.identifier,
            entityId: String(entity.id),
            position: {
                x: Math.floor(entity.position.x),
                y: Math.floor(entity.position.y),
                z: Math.floor(entity.position.z)
            },
            yaw: entity.body.yaw,
            pitch: entity.body.pitch
        });
    },
    startDeathAnimation: (id) => {
        const world = options.liveWorld();
        const target = actors.actorOf(id);
        if (world === undefined || target === undefined) return;

        // `DRAGON_START_DEATH_ANIM` is the unverified Bedrock candidate for Java's dragon death
        // start (docs/plans/end-dragon-fight.md, open question 2); a retail client run decides.
        world.sendActorEvent(target, ActorEvent.DRAGON_START_DEATH_ANIM);
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
 * spawn loop, the despawn pass and the actors the clients are shown, and none
 * of them has to be started, stopped or ordered by the caller.
 */
/**
 * A boss bar on the clients' screens for one entity's own bar, purple and darkening the sky as
 * Java's `WitherBoss` builds its `ServerBossEvent`, bound to the entity's actor.
 */
const liveBossBar = (
    entity: DataEntity,
    shown: OwnBossBar,
    report: (message: string) => void
): ShownBossBar<PlayerSession> => {
    const bar = new BossBar({ actorUniqueId: BigInt(entity.id), name: shown.name, color: BossBarColor.Purple });
    const sent = (sends: Promise<void>): void => {
        void sends.catch((error: unknown) => report(`the boss bar of ${entity.identifier} failed: ${String(error)}`));
    };
    sent(bar.setPercent(shown.progress));
    return {
        show: (session) => sent(bar.addPlayer(session)),
        hide: (session) => sent(bar.removePlayer(session)),
        setProgress: (progress) => sent(bar.setPercent(progress)),
        setName: (name) => sent(bar.setName(name)),
        close: () => {
            for (const session of bar.players()) sent(bar.removePlayer(session));
        }
    };
};

/** One dimension's entity runtime over a running server, shown to its clients through store actors. */
export class LiveEntityRuntime {
    /** The entities themselves, for the content adapter's three groups and for tests. */
    public readonly runtime: EntityRuntime;

    /**
     * Each entity as the clients are shown it and the rest of the server reaches it, read from
     * the store: an {@link ItemActor} for a dropped stack and an {@link InertActor} for a saved
     * actor no pack declares.
     */
    public readonly actors: StoreActors;

    private readonly options: LiveEntityOptions;
    /** The world the spawn rules read, which is not known until the adapter is assembled. */
    private spawnWorld: SpawnWorld | undefined;
    private started = false;
    /** Who hears about removals beyond the body index, such as the End's dragon fight. */
    private readonly removalListeners = new Set<(entity: DataEntity, reason: string) => void>();
    /** The saved identifier of each inert entity, by runtime id; see {@link LiveEntityRuntime.restoreInert}. */
    private readonly inertTypes = new Map<number, string>();
    /** The players whose sessions this runtime has disconnected for failing their updates. */
    private readonly failedPlayers = new Set<number>();
    /** The bars a wither carries for itself, on the screens of the players whose clients track it. */
    private readonly bossBars: EntityBossBars<PlayerSession>;

    /**
     * @param players - The server's store players, whose actors show them as players and whose
     *   inventories answer the host's meal and armor facts.
     */
    public constructor(options: LiveEntityOptions, players = new StorePlayers()) {
        this.options = options;
        this.bossBars = new EntityBossBars((entity, shown) => liveBossBar(entity, shown, options.report));
        const blows: StoreActorBlows = {
            hurt: (entity, amount, source, route) =>
                this.landed(this.runtime.damage(intentOfLegacyBlow(entity, amount, source, route))),
            written: (entity, taken, source) => {
                this.runtime.damage(intentOfHealthWrite(entity, taken, source, 'legacy_body'));
            },
            heal: (entity, amount, cause) => this.runtime.heal(entity.id, amount, cause)
        };
        this.actors = new StoreActors({
            world: options.liveWorld,
            report: options.report,
            blows,
            playerActor: (entity, world, actorBlows) => players.actorOf(entity, world, actorBlows),
            builtInActor: (entity, world, actorBlows) => {
                if (isDroppedItem(entity)) return new ItemActor(entity, world, actorBlows, this.runtime.droppedItems);
                const saved = this.inertTypes.get(entity.id);
                return saved === undefined ? undefined : new InertActor(entity, world, actorBlows, saved);
            }
        });
        this.runtime = new EntityRuntime({
            content: options.content,
            world: options.world,
            host: liveHost(options, this.actors, () => this.runtime, players),
            report: options.report,
            onSpawn: (entity, cause) => {
                this.actors.add(entity);
                // A player's arrival is `playerSpawn`'s to tell.
                if (entity.identifier === 'minecraft:player') return;
                const actor = this.actors.actorOf(entity.id);
                const events = options.liveWorld()?.getServer().getKernel().events;
                if (actor !== undefined && events?.hasListeners('entitySpawn') === true)
                    events.post('entitySpawn', new EntitySpawnEvent(actor, cause));
            },
            shownAs: (entity) => this.inertTypes.get(entity.id),
            healGuard: (entity, amount, cause) => {
                const events = options.liveWorld()?.getServer().getKernel().events;
                const actor = this.actors.actorOf(entity.id);
                if (actor === undefined || events?.hasListeners('entityHeal') !== true) return amount;
                const event = new EntityHealEvent(actor, amount, cause);
                events.post('entityHeal', event);
                return event.isCanceled() ? 0 : event.getAmount();
            },
            onHealed: (entity, amount, cause) => {
                const events = options.liveWorld()?.getServer().getKernel().events;
                const actor = this.actors.actorOf(entity.id);
                if (actor !== undefined && events?.hasListeners('entityHealed') === true)
                    events.post('entityHealed', new EntityHealedEvent(actor, amount, cause));
            },
            onHealthChanged: (entity, before, after) => {
                const events = options.liveWorld()?.getServer().getKernel().events;
                const actor = this.actors.actorOf(entity.id);
                if (actor !== undefined && events?.hasListeners('entityHealthChanged') === true)
                    events.post('entityHealthChanged', new EntityHealthChangedEvent(actor, before, after));
            },
            explosionGuard: (source, blocks) => {
                const world = options.liveWorld();
                const events = world?.getServer().getKernel().events;
                if (world === undefined || events?.hasListeners('explosion') !== true) return { blocks };
                const event = new ExplosionEvent(world, this.actors.actorOf(source.id) ?? null, blocks);
                events.post('explosion', event);
                return event.isCanceled() ? { cancel: true } : { blocks: event.getBlocks() };
            },
            onExploded: (source, cleared) => {
                const world = options.liveWorld();
                const events = world?.getServer().getKernel().events;
                if (world === undefined || events?.hasListeners('exploded') !== true) return;
                const blocks = cleared.map(({ identifier, states, position }) => ({
                    ...position,
                    name: identifier,
                    states
                }));
                events.post('exploded', new ExplodedEvent(world, this.actors.actorOf(source.id) ?? null, blocks));
            },
            onProjectileHit: (projectile, hit, at, velocity) => {
                const world = options.liveWorld();
                const events = world?.getServer().getKernel().events;
                if (world === undefined || events?.hasListeners('projectileHit') !== true) return;
                const actor = this.actors.actorOf(projectile.id);
                const ownerId = projectile.body.owner;
                const owner =
                    ownerId === undefined
                        ? undefined
                        : (this.actors.actorOf(ownerId) ?? world.getActor(BigInt(ownerId)) ?? undefined);
                let target: ProjectileHitTarget;
                if ('entity' in hit) {
                    const struck = this.actors.actorOf(hit.entity) ?? world.getActor(BigInt(hit.entity)) ?? undefined;
                    if (struck === undefined) return;
                    target = { entity: struck };
                } else target = { block: hit.block };
                if (actor !== undefined)
                    events.post(
                        'projectileHit',
                        new ProjectileHitEvent(world, actor, owner ?? null, target, at, velocity)
                    );
            },
            tameGuard: (entity, tamer) => {
                const world = options.liveWorld();
                const events = world?.getServer().getKernel().events;
                if (world === undefined || events?.hasListeners('entityTame') !== true) return true;
                const actor = this.actors.actorOf(entity.id);
                const owner = this.actors.actorOf(tamer) ?? world.getActor(BigInt(tamer)) ?? undefined;
                if (actor === undefined || owner === undefined) return true;
                const event = new EntityTameEvent(actor, owner);
                events.post('entityTame', event);
                return !event.isCanceled();
            },
            onTamed: (entity, tamer) => {
                const world = options.liveWorld();
                const events = world?.getServer().getKernel().events;
                if (world === undefined || events?.hasListeners('entityTamed') !== true) return;
                const actor = this.actors.actorOf(entity.id);
                const owner = this.actors.actorOf(tamer) ?? world.getActor(BigInt(tamer)) ?? undefined;
                if (actor !== undefined && owner !== undefined)
                    events.post('entityTamed', new EntityTamedEvent(actor, owner));
            },
            onEntityEvent: (entity, effects) => {
                const events = options.liveWorld()?.getServer().getKernel().events;
                const actor = this.actors.actorOf(entity.id);
                if (actor === undefined || events?.hasListeners('entityTrigger') !== true) return;
                events.post(
                    'entityTrigger',
                    new EntityTriggerEvent(actor, effects.event, effects.addGroups, effects.removeGroups)
                );
            },
            onMeleeHit: (attacker, target) => {
                const events = options.liveWorld()?.getServer().getKernel().events;
                if (events?.hasListeners('entityHitEntity') !== true) return;
                const hitter = this.actors.actorOf(attacker.id);
                const hit = this.actors.actorOf(target) ?? options.liveWorld()?.getActor(BigInt(target)) ?? undefined;
                if (hitter !== undefined && hit !== undefined)
                    events.post('entityHitEntity', new EntityHitEntityEvent(hitter, hit));
            },
            onRemoving: (entity, reason) => {
                if (entity.identifier === 'minecraft:player') return;
                const actor = this.actors.actorOf(entity.id);
                const events = options.liveWorld()?.getServer().getKernel().events;
                if (actor !== undefined && events?.hasListeners('entityRemove') === true)
                    events.post('entityRemove', new EntityRemoveEvent(actor, reason));
            },
            onRemove: (entity, reason) => {
                const world = options.liveWorld();
                const events = world?.getServer().getKernel().events;
                if (
                    world !== undefined &&
                    entity.identifier !== 'minecraft:player' &&
                    events?.hasListeners('entityRemoved') === true
                ) {
                    events.post(
                        'entityRemoved',
                        new EntityRemovedEvent(
                            BigInt(entity.id),
                            this.inertTypes.get(entity.id) ?? entity.identifier,
                            world
                        )
                    );
                }
                this.actors.remove(entity);
                this.inertTypes.delete(entity.id);
                this.failedPlayers.delete(entity.id);
                for (const listener of this.removalListeners) listener(entity, reason);
            },
            gameEvents: {
                add: (listener) => options.liveWorld()?.addGameEventListener(listener),
                move: (listener) => options.liveWorld()?.moveGameEventListener(listener)
            },
            // One pool of runtime ids with the server's own entities.
            nextId: () => entityIds.next()
        });
        // A player is its client's: one whose update keeps throwing is disconnected, and its leave
        // takes the entity out of the store. The runtime asks again on every later failure until
        // then, and the session is disconnected once.
        this.runtime.onPlayerFailed = (entity, error) => {
            if (this.failedPlayers.has(entity.id)) return;
            const session = options.liveWorld()?.viewerOf(BigInt(entity.id));
            if (session === undefined) return;
            this.failedPlayers.add(entity.id);
            options.report(`player ${entity.id} kept failing its update and was disconnected: ${String(error)}`);
            void session
                .getConnection()
                .disconnect('Internal server error', false, DisconnectReason.UNKNOWN)
                .catch((cause: unknown) => options.report(String(cause)));
        };
        this.runtime.onPlayerReentered = reattachStorePlayer(this.runtime, players);
        this.runtime.index.chunkChanged = (chunkX, chunkZ) =>
            options.liveWorld()?.storeEntityChunkChanged(chunkX, chunkZ);
        // The plugin `entityDamage` event is a before-hook: a listener can cancel the blow or
        // change its amount, and anything at or below zero cancels it. A blow the pack already
        // turned aside is not offered, so its sensor event still fires.
        this.runtime.damagePipeline.addBeforeHook('entityDamage', (intent) => {
            if (intent.amount <= 0) return PASS;
            const world = options.liveWorld();
            const victim = this.actors.actorOf(intent.target);
            if (world === undefined || victim === undefined || victim instanceof ItemActor) return PASS;

            const event = new EntityDamageEvent(victim, intent.amount, legacySourceOfIntent(world, intent));
            world.getServer().getKernel().events.post('entityDamage', event);
            if (event.isCanceled()) return VETO;
            return event.getAmount() === intent.amount ? PASS : replaceAmount(event.getAmount());
        });
    }

    /** The store entity behind an actor of this runtime, or undefined once it has left the store. */
    private storeEntityOf(target: StoreActor): DataEntity | undefined {
        const entity = this.runtime.byId(target.entity.id);
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
        target: StoreActor,
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
    public killEntity(target: StoreActor, source: DamageSource, route: DamageRoute): boolean | undefined {
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
     * Runs one server tick for eligible entities. Clients are shown what it changed from the
     * change log, after the world's tick seals.
     *
     * The spawn loop starts on the first tick because it reads the loaded spawn rules.
     *
     * @param tick - The world's tick counter, which the pools' cadences use.
     * @param shouldTick - Optional chunk eligibility rule; omitted callers tick every entity.
     */
    public tick(tick: number, shouldTick?: (position: EntityPosition) => boolean): void {
        if (!this.started && this.spawnWorld !== undefined) {
            this.runtime.startSpawning(this.spawnWorld);
            this.started = true;
        }

        this.runtime.tick(tick, shouldTick);
        const world = this.options.liveWorld();
        if (world !== undefined) this.bossBars.sync(this.runtime.entities(), world.getViewers());
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
     * Brings a saved dropped stack back as a store entity, from the actor record a chunk carried.
     *
     * @returns The entity, or undefined when the record holds no stack.
     */
    public restoreItem(stored: StoredActor): DataEntity | undefined {
        const saved = stored.persistentNbt === null ? undefined : storedItemActorOf(stored.persistentNbt);
        return saved === undefined ? undefined : this.restoreItemFrom(stored.position, saved, stored);
    }

    /**
     * Takes in a stack that left another dimension's store through a portal, with the state it
     * left with, at where it arrives.
     *
     * @param arrived - The stack's actor in the store it left.
     * @param at - Where it arrives, which it reports itself at.
     * @param portalCooldown - The cooldown it arrives with.
     * @returns The entity, or undefined when the actor held no stack.
     */
    public adoptItem(arrived: ItemActor, at: EntityPosition, portalCooldown: number): DataEntity | undefined {
        const saved = arrived.savedItem();
        if (saved === undefined) return undefined;
        const { motion } = saved;
        return this.restoreItemFrom(
            at,
            { ...saved, motion: { x: motion.getX(), y: motion.getY(), z: motion.getZ() } },
            { persistentNbt: arrived.persistentNbt, tags: arrived.getTags(), portalCooldown }
        );
    }

    /** Spawns a stack where it reports itself, carrying over the actor tags it kept. */
    private restoreItemFrom(
        at: EntityPosition,
        saved: ItemStart,
        kept: Pick<StoredActor, 'tags' | 'portalCooldown'> & Pick<KeptActorState, 'persistentNbt'>
    ): DataEntity | undefined {
        const entity = this.runtime.droppedItems.spawn(at, { ...saved, reported: true });
        if (entity === undefined) return undefined;
        const actor = this.actors.actorOf(entity.id);
        if (actor !== undefined) {
            actor.persistentNbt = kept.persistentNbt;
            for (const tag of kept.tags) actor.addTag(tag);
            actor.setPortalCooldown(kept.portalCooldown);
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
    public launchProjectile(action: LaunchProjectileAction, shooter: StoreActor): DataEntity | undefined {
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
    public canNameEntity(target: StoreActor): boolean {
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
    public nameEntity(target: StoreActor, name: string): boolean {
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
    public canDyeEntity(target: StoreActor, color: string): boolean {
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
    public dyeEntity(target: StoreActor, color: string): boolean {
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
    private openTradeScreen(id: number, trader: StoreActor, session: PlayerSession, itemIdentifier: string): boolean {
        const player = session.getPlayer();
        if (itemIdentifier.endsWith('_spawn_egg') || player.isSneaking()) return false;
        const entity = this.runtime.byId(id);
        if (entity === undefined) return false;
        const source = this.runtime.tradeSource(entity);
        if (source === undefined) return false;
        const title = tradeDisplayNameOf(entity.instance);

        const playerId = Number(session.runtimeId);
        if (!this.runtime.beginTrade(id, playerId)) return false;

        void session
            .openTradeWindow({
                trader,
                source,
                ...(title === undefined ? {} : { title }),
                context: () => {
                    const hero = session.getActor()?.getStatusEffect('minecraft:village_hero');
                    return {
                        ...this.runtime.curedFacts(id, playerId),
                        ...(hero === undefined ? {} : { heroOfTheVillage: hero.amplifier + 1 })
                    };
                },
                release: () => this.runtime.endTrade(id, playerId),
                traded: (result) => {
                    if (!result.traded) return;
                    // Java's `notifyTrade` plays the villager's yes after every completed trade.
                    this.options.liveWorld()?.sendActorSound(trader, LevelSoundEvent.HAGGLE_YES);
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
        target: StoreActor,
        player: StoreActor,
        itemIdentifier: string,
        heldItem?: ContentItemDrop
    ): EntityItemInteraction {
        const id = this.storeEntityOf(target)?.id;
        if (id === undefined) return { accepted: false };

        // The interacting player's session, found by entity id; undefined for anything else.
        const session = player.getWorld().viewerOf(player.getRuntimeId());
        if (session !== undefined && this.openTradeScreen(id, target, session, itemIdentifier))
            return { accepted: true, swing: true, consumeItem: false };

        // Java's Entity.interact: a sneaking player moves the leads it holds onto a leashable entity.
        if (
            session?.getPlayer().isSneaking() === true &&
            this.runtime.transferLeashes(Number(player.getRuntimeId()), id)
        ) {
            target.getWorld().sendActorSound(target, LevelSoundEvent.LEAD_LEASH);
            return { accepted: true, swing: true, consumeItem: false };
        }

        const previousLoveTicks = this.runtime.byId(id)?.body.loveTicks ?? 0;
        const interaction = this.runtime.interactWithItem(
            id,
            Number(player.getRuntimeId()),
            itemIdentifier,
            session === undefined ? undefined : playerFilterView(session.getPlayer()),
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
        if (interaction.accepted && interaction.swing === true && session !== undefined) {
            const runtimeEntityId = session.runtimeId;
            const watchers = player
                .getWorld()
                .getViewers()
                .filter((viewer) => viewer.runtimeId !== runtimeEntityId && viewer.tracks(runtimeEntityId));

            void Promise.all(
                watchers.map(async (viewer) => {
                    const animation = new AnimatePacket();
                    animation.runtimeEntityId = runtimeEntityId;
                    animation.action = AnimateAction.Swing;
                    animation.swingSource = 'interact';
                    await viewer.send(animation);
                })
            ).catch((error: unknown) => this.options.report(String(error)));
        }
        const loveTicks = this.runtime.byId(id)?.body.loveTicks ?? 0;
        if (interaction.accepted && previousLoveTicks <= 0 && loveTicks > 0) {
            const world = this.options.liveWorld();
            world?.sendActorEvent(target, ActorEvent.LOVE_HEARTS);
        }

        return interaction;
    }

    /**
     * Writes every entity's record into its actor's tags, ready for a save. A dropped stack's
     * actor record is the item's own tags, which `EntitySerializer.toNBT` writes, and an inert
     * actor keeps the tags it was loaded with, so neither is given a record.
     *
     * Called by `World.saveChunks` before it writes anything, rather than once a tick: the
     * record is a snapshot of state that changes every tick, and nothing reads it until a chunk
     * is written. The chunk serializer reads it from the actor with every other tag it carries.
     */
    public persist(): void {
        for (const [actor, record] of this.savedRecords()) {
            const tags = actor.persistentNbt ?? new NBTTagCompound('');
            writeDataEntityRecord(tags, record);
            actor.persistentNbt = tags;
        }
    }

    /**
     * The record {@link LiveEntityRuntime.persist} would write for each entity that persists, by
     * actor, without writing it, so a replay digest can hash what a save holds and change nothing.
     * @returns {ReadonlyMap<StoreActor, DataEntityRecord>} The records, each keyed by a store actor.
     */
    public savedRecords(): ReadonlyMap<StoreActor, DataEntityRecord> {
        const records = new Map<StoreActor, DataEntityRecord>();
        for (const entity of this.runtime.entities()) {
            const actor = this.actors.actorOf(entity.id);
            // A player is saved as its player record, never with a chunk.
            if (
                actor === undefined ||
                !actor.shouldPersist() ||
                actor instanceof ItemActor ||
                actor instanceof InertActor ||
                clientOwnsMovement(entity.identifier)
            )
                continue;
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
     * Brings one saved entity back into the runtime.
     *
     * The store entity is what enters the world, shown through its actor.
     * Everything the file carried that this server does not model, the actor's
     * `UniqueID` first among them, moves onto the actor, so the next save
     * addresses the same actor rather than writing a second one.
     *
     * @param stored - What `EntitySerializer` read from the actor NBT.
     * @returns The entity, or undefined when no loaded pack declares its type.
     */
    public restore(record: DataEntityRecord, stored: StoredActor): DataEntity | undefined {
        const entity = this.restoreRecord(record, stored.position, stored);
        if (entity !== undefined) this.actors.actorOf(entity.id)?.setPortalCooldown(stored.portalCooldown);
        return entity;
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
        return entity;
    }

    /**
     * Puts what an actor record held apart from the entity's record onto the restored entity. A
     * name the entity's record holds wins over the actor record's.
     */
    private keep(entity: DataEntity, kept: KeptActorState): void {
        entity.body.nameTag ??= kept.nameTag;
        const actor = this.actors.actorOf(entity.id);
        if (actor !== undefined) {
            actor.persistentNbt = kept.persistentNbt;
            for (const tag of kept.tags) actor.addTag(tag);
            for (const effect of kept.statusEffects) actor.addStatusEffect(effect, false);
        }
    }

    /**
     * Migrates a saved actor without runtime state when its pack type is available.
     *
     * This covers entities saved by an older class-based runtime as well as actors rebuilt from a
     * provider's lightweight entity snapshot. The type's spawn event initializes current
     * components, goals, and physics, while the original actor tags stay on the actor for fields
     * the runtime does not model yet.
     */
    public restoreExisting(stored: StoredActor): DataEntity | undefined {
        const { identifier, fuse, persistentNbt } = stored;
        if (!this.runtime.content().entities.registry.has(identifier)) return undefined;

        const motion = persistentNbt === null ? undefined : actorMotionIn(persistentNbt);
        const blockName =
            identifier === 'minecraft:falling_block'
                ? persistentNbt?.getString('JSPBlockName', '') || persistentNbt?.getString('Block', '') || ''
                : '';
        const entity = this.runtime.spawn(identifier, stored.position, {
            yaw: stored.yaw,
            pitch: stored.pitch,
            ...(blockName.length > 0 || fuse !== undefined
                ? {
                      data: {
                          ...(blockName.length > 0 ? { block: blockName } : {}),
                          ...(fuse === undefined ? {} : { fuse })
                      }
                  }
                : {})
        });
        if (entity === undefined) return undefined;
        if (entity.instance.hasComponent('minecraft:projectile') && motion !== undefined) entity.body.velocity = motion;

        // The health the actor record's `Attributes` hold, as a world Bedrock Dedicated Server saved
        // writes it, capped at the type's maximum. A record that lists none keeps the legacy body's
        // default.
        const health = entity.instance.attributes.get('health');
        if (health !== undefined) {
            const saved = (persistentNbt === null ? undefined : actorHealthIn(persistentNbt)) ?? SAVED_ACTOR_HEALTH;
            entity.instance.attributes.set('health', Math.min(health.max, saved));
        }

        this.keep(entity, stored);
        this.actors.actorOf(entity.id)?.setPortalCooldown(stored.portalCooldown);
        return entity;
    }

    /**
     * Brings back a saved actor that no loaded pack declares, or whose type would not spawn, as
     * an inert store entity: it keeps its identifier, its position, its tags, its portal
     * cooldown, a TNT's fuse and every actor record tag, a data entity record among them, is
     * shown to clients as itself and runs nothing. The next save writes it back as it was loaded, so a world loaded once without the
     * pack that declares its mobs still has them when the pack comes back.
     *
     * @returns The entity, or undefined when the content has no inert type either.
     */
    public restoreInert(stored: StoredActor): DataEntity | undefined {
        const entity = this.runtime.spawn(INERT_ACTOR, stored.position, {
            yaw: stored.yaw,
            pitch: stored.pitch,
            // Before the actor is built, which reads the saved identifier.
            prepare: (prepared) => this.inertTypes.set(prepared.id, stored.identifier)
        });
        if (entity === undefined) return undefined;
        this.keep(entity, stored);
        const actor = this.actors.actorOf(entity.id);
        if (actor !== undefined) {
            actor.setPortalCooldown(stored.portalCooldown);
            // Primed and counting, as the legacy body showed a saved TNT, and saved with its fuse.
            // An inert actor's fuse never burns down, so it is shown as the fuse a body holds.
            if (stored.fuse !== undefined) entity.body.fuseTicks = stored.fuse;
        }
        return entity;
    }
}

/**
 * The data-driven entity runtimes of a server, one per world: each dimension of each level.
 *
 * Held by the server rather than by either end: the content world adapter
 * opens one while it assembles a world's groups, and that `World` looks it up
 * by its dimension and level to tick it. Keyed by both, as `worldKeyOf`
 * says why.
 */
export class EntityRuntimes {
    private readonly byWorld = new Map<string, LiveEntityRuntime>();

    /** The server's store players, which every world's actors read. */
    public readonly players = new StorePlayers();

    /**
     * The runtime for one world, built on first ask and kept.
     *
     * @returns The existing runtime when the world already has one, so an
     *   adapter rebuilt for the same world drives the same entities.
     */
    public open(options: LiveEntityOptions): LiveEntityRuntime {
        const key = worldKeyOf(options.dimension, options.level);
        const existing = this.byWorld.get(key);
        if (existing !== undefined) return existing;

        const created = new LiveEntityRuntime(options, this.players);
        this.byWorld.set(key, created);
        return created;
    }

    /**
     * The runtime of one world, or undefined when nothing opened one.
     * @param dimension - The namespaced dimension identifier.
     * @param level - The level's name, or undefined for the default level.
     */
    public at(dimension: string, level?: string): LiveEntityRuntime | undefined {
        return this.byWorld.get(worldKeyOf(dimension, level));
    }

    /** Resolves the goal world from whichever world owns this instance. */
    public goalWorldFor(instance: EntityInstance) {
        for (const runtime of this.byWorld.values()) {
            const goalWorld = runtime.runtime.goalWorldFor(instance);
            if (goalWorld !== undefined) return goalWorld;
        }
        return undefined;
    }

    /**
     * Forgets one world's runtime, which is what closing it does.
     * @param dimension - The namespaced dimension identifier.
     * @param level - The level's name, or undefined for the default level.
     */
    public close(dimension: string, level?: string): void {
        const key = worldKeyOf(dimension, level);
        this.byWorld.get(key)?.actors.clear();
        this.byWorld.delete(key);
    }

    /** Forgets every runtime, which is what a server shutdown does once the worlds are down. */
    public closeAll(): void {
        for (const runtime of this.byWorld.values()) runtime.actors.clear();
        this.byWorld.clear();
    }
}
