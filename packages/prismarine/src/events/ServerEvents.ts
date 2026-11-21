import type { EventBus } from '@jsprismarine/kernel';

import type ChatEvent from './chat/ChatEvent';
import type EntityDamageEvent from './entity/EntityDamageEvent';
import type EntityDeathEvent from './entity/EntityDeathEvent';
import type EntityHurtEvent from './entity/EntityHurtEvent';
import type EntityPortalEnterEvent from './entity/EntityPortalEnterEvent';
import type EntitySpawnEvent from './entity/EntitySpawnEvent';
import type EntityRemoveEvent from './entity/EntityRemoveEvent';
import type EntityHitEntityEvent from './entity/EntityHitEntityEvent';
import type ProjectileHitEvent from './entity/ProjectileHitEvent';
import type EntityTriggerEvent from './entity/EntityTriggerEvent';
import type EntityTameEvent from './entity/EntityTameEvent';
import type EntityTamedEvent from './entity/EntityTamedEvent';
import type EntityItemDropEvent from './entity/EntityItemDropEvent';
import type EntityItemPickupEvent from './entity/EntityItemPickupEvent';
import type EntityItemPickedUpEvent from './entity/EntityItemPickedUpEvent';
import type EntityEffectAddEvent from './entity/EntityEffectAddEvent';
import type EntityHealEvent from './entity/EntityHealEvent';
import type EntityHealedEvent from './entity/EntityHealedEvent';
import type EntityHealthChangedEvent from './entity/EntityHealthChangedEvent';
import type EntityEffectAddedEvent from './entity/EntityEffectAddedEvent';
import type PlayerAttackEntityEvent from './player/PlayerAttackEntityEvent';
import type EntityRemovedEvent from './entity/EntityRemovedEvent';
import type TickEvent from './other/TickEvent';
import type ExplosionEvent from './other/ExplosionEvent';
import type ExplodedEvent from './other/ExplodedEvent';
import type GameRuleChangedEvent from './other/GameRuleChangedEvent';
import type LevelAttachedEvent from './level/LevelAttachedEvent';
import type LevelDetachedEvent from './level/LevelDetachedEvent';
import type LevelDetachingEvent from './level/LevelDetachingEvent';
import type RedstoneActivatedEvent from './other/RedstoneActivatedEvent';
import type PlayerBlockBrokenEvent from './player/PlayerBlockBrokenEvent';
import type PlayerBlockActionEvent from './player/PlayerBlockActionEvent';
import type PlayerBlockInteractedEvent from './player/PlayerBlockInteractedEvent';
import type PlayerBreakBlockEvent from './player/PlayerBreakBlockEvent';
import type PlayerChangeDimensionEvent from './player/PlayerChangeDimensionEvent';
import type PlayerDimensionChangedEvent from './player/PlayerDimensionChangedEvent';
import type PlayerConnectEvent from './player/PlayerConnectEvent';
import type PlayerDespawnEvent from './player/PlayerDespawnEvent';
import type PlayerEmoteEvent from './player/PlayerEmoteEvent';
import type PlayerSwingEvent from './player/PlayerSwingEvent';
import type PlayerNameEntityEvent from './player/PlayerNameEntityEvent';
import type PlayerContainerEvent from './player/PlayerContainerEvent';
import type PlayerScriptMessageEvent from './player/PlayerScriptMessageEvent';
import type PlayerCraftEvent from './player/PlayerCraftEvent';
import type PlayerButtonInputEvent from './player/PlayerButtonInputEvent';
import type PlayerInputModeChangeEvent from './player/PlayerInputModeChangeEvent';
import type PlayerDisconnectEvent from './player/PlayerDisconnectEvent';
import type PlayerEntityInteractedEvent from './player/PlayerEntityInteractedEvent';
import type PlayerInteractBlockEvent from './player/PlayerInteractBlockEvent';
import type PlayerInteractEntityEvent from './player/PlayerInteractEntityEvent';
import type PlayerItemUsedEvent from './player/PlayerItemUsedEvent';
import type PlayerItemUseStageEvent from './player/PlayerItemUseStageEvent';
import type PlayerMoveEvent from './player/PlayerMoveEvent';
import type PlayerSetGamemodeEvent from './player/PlayerSetGamemodeEvent';
import type PlayerGamemodeChangedEvent from './player/PlayerGamemodeChangedEvent';
import type PlayerSpawnEvent from './player/PlayerSpawnEvent';
import type PlayerToggleFlightEvent from './player/PlayerToggleFlightEvent';
import type PlayerToggleOperatorEvent from './player/PlayerToggleOperatorEvent';
import type PlayerToggleSprintEvent from './player/PlayerToggleSprintEvent';
import type PlayerUseItemEvent from './player/PlayerUseItemEvent';
import type PlayerBlockPlacedEvent from './player/PlayerBlockPlacedEvent';
import type PlayerPlaceBlockEvent from './player/PlayerPlaceBlockEvent';
import type RaknetConnectEvent from './raknet/RaknetConnectEvent';
import type RaknetDisconnectEvent from './raknet/RaknetDisconnectEvent';
import type RaknetEncapsulatedPacketEvent from './raknet/RaknetEncapsulatedPacketEvent';

/**
 * The server's lifecycle events, by name, with the one event object each listener receives.
 * They go out on the kernel's event bus; `Server.on` subscribes to them.
 *
 * A type alias rather than an interface, so it fits the kernel's `EventMap` without an index
 * signature that would let any name through.
 */
export type ServerEvents = {
    chat: [ChatEvent];
    levelAttached: [LevelAttachedEvent];
    levelDetaching: [LevelDetachingEvent];
    levelDetached: [LevelDetachedEvent];
    tick: [TickEvent];
    explosion: [ExplosionEvent];
    exploded: [ExplodedEvent];
    gameRuleChanged: [GameRuleChangedEvent];
    redstoneActivated: [RedstoneActivatedEvent];
    entityDamage: [EntityDamageEvent];
    entityHurt: [EntityHurtEvent];
    entityDeath: [EntityDeathEvent];
    entitySpawn: [EntitySpawnEvent];
    entityRemove: [EntityRemoveEvent];
    entityHitEntity: [EntityHitEntityEvent];
    projectileHit: [ProjectileHitEvent];
    entityTrigger: [EntityTriggerEvent];
    entityTame: [EntityTameEvent];
    entityTamed: [EntityTamedEvent];
    entityItemDrop: [EntityItemDropEvent];
    entityItemPickup: [EntityItemPickupEvent];
    entityItemPickedUp: [EntityItemPickedUpEvent];
    entityEffectAdd: [EntityEffectAddEvent];
    entityHeal: [EntityHealEvent];
    entityHealed: [EntityHealedEvent];
    entityHealthChanged: [EntityHealthChangedEvent];
    entityEffectAdded: [EntityEffectAddedEvent];
    playerAttackEntity: [PlayerAttackEntityEvent];
    entityRemoved: [EntityRemovedEvent];
    entityPortalEnter: [EntityPortalEnterEvent];
    playerChangeDimension: [PlayerChangeDimensionEvent];
    playerDimensionChanged: [PlayerDimensionChangedEvent];
    playerConnect: [PlayerConnectEvent];
    playerDisconnect: [PlayerDisconnectEvent];
    playerSpawn: [PlayerSpawnEvent];
    playerDespawn: [PlayerDespawnEvent];
    playerEmote: [PlayerEmoteEvent];
    playerSwing: [PlayerSwingEvent];
    playerNameEntity: [PlayerNameEntityEvent];
    playerContainer: [PlayerContainerEvent];
    playerScriptMessage: [PlayerScriptMessageEvent];
    playerCraft: [PlayerCraftEvent];
    playerButtonInput: [PlayerButtonInputEvent];
    playerInputModeChange: [PlayerInputModeChangeEvent];
    playerMove: [PlayerMoveEvent];
    playerToggleFlight: [PlayerToggleFlightEvent];
    playerToggleSprint: [PlayerToggleSprintEvent];
    playerToggleOperator: [PlayerToggleOperatorEvent];
    playerSetGamemode: [PlayerSetGamemodeEvent];
    playerGamemodeChanged: [PlayerGamemodeChangedEvent];
    playerBreakBlock: [PlayerBreakBlockEvent];
    playerBlockBroken: [PlayerBlockBrokenEvent];
    playerBlockAction: [PlayerBlockActionEvent];
    playerUseItem: [PlayerUseItemEvent];
    playerItemUsed: [PlayerItemUsedEvent];
    playerItemUseStage: [PlayerItemUseStageEvent];
    playerInteractBlock: [PlayerInteractBlockEvent];
    playerBlockInteracted: [PlayerBlockInteractedEvent];
    playerInteractEntity: [PlayerInteractEntityEvent];
    playerEntityInteracted: [PlayerEntityInteractedEvent];
    playerPlaceBlock: [PlayerPlaceBlockEvent];
    playerBlockPlaced: [PlayerBlockPlacedEvent];
    raknetConnect: [RaknetConnectEvent];
    raknetDisconnect: [RaknetDisconnectEvent];
    raknetEncapsulatedPacket: [RaknetEncapsulatedPacketEvent];
};

/** The name of a server event. */
export type ServerEventName = keyof ServerEvents;

/** The event object a listener of `name` receives. */
export type ServerEventOf<K extends ServerEventName> = ServerEvents[K][0];

/** The kernel's event bus, typed with the server's events. */
export type ServerEventBus = EventBus<ServerEvents>;
