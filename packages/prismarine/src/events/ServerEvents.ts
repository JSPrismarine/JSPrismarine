import type { EventBus } from '@jsprismarine/kernel';

import type ChatEvent from './chat/ChatEvent';
import type EntityDamageEvent from './entity/EntityDamageEvent';
import type EntityDeathEvent from './entity/EntityDeathEvent';
import type EntityHurtEvent from './entity/EntityHurtEvent';
import type EntityPortalEnterEvent from './entity/EntityPortalEnterEvent';
import type EntitySpawnEvent from './entity/EntitySpawnEvent';
import type TickEvent from './other/TickEvent';
import type PlayerBlockBrokenEvent from './player/PlayerBlockBrokenEvent';
import type PlayerBlockInteractedEvent from './player/PlayerBlockInteractedEvent';
import type PlayerBreakBlockEvent from './player/PlayerBreakBlockEvent';
import type PlayerChangeDimensionEvent from './player/PlayerChangeDimensionEvent';
import type PlayerConnectEvent from './player/PlayerConnectEvent';
import type PlayerDespawnEvent from './player/PlayerDespawnEvent';
import type PlayerDisconnectEvent from './player/PlayerDisconnectEvent';
import type PlayerEntityInteractedEvent from './player/PlayerEntityInteractedEvent';
import type PlayerInteractBlockEvent from './player/PlayerInteractBlockEvent';
import type PlayerInteractEntityEvent from './player/PlayerInteractEntityEvent';
import type PlayerItemUsedEvent from './player/PlayerItemUsedEvent';
import type PlayerMoveEvent from './player/PlayerMoveEvent';
import type PlayerSetGamemodeEvent from './player/PlayerSetGamemodeEvent';
import type PlayerSpawnEvent from './player/PlayerSpawnEvent';
import type PlayerToggleFlightEvent from './player/PlayerToggleFlightEvent';
import type PlayerToggleOperatorEvent from './player/PlayerToggleOperatorEvent';
import type PlayerToggleSprintEvent from './player/PlayerToggleSprintEvent';
import type PlayerUseItemEvent from './player/PlayerUseItemEvent';
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
    tick: [TickEvent];
    entityDamage: [EntityDamageEvent];
    entityHurt: [EntityHurtEvent];
    entityDeath: [EntityDeathEvent];
    entitySpawn: [EntitySpawnEvent];
    entityPortalEnter: [EntityPortalEnterEvent];
    playerChangeDimension: [PlayerChangeDimensionEvent];
    playerConnect: [PlayerConnectEvent];
    playerDisconnect: [PlayerDisconnectEvent];
    playerSpawn: [PlayerSpawnEvent];
    playerDespawn: [PlayerDespawnEvent];
    playerMove: [PlayerMoveEvent];
    playerToggleFlight: [PlayerToggleFlightEvent];
    playerToggleSprint: [PlayerToggleSprintEvent];
    playerToggleOperator: [PlayerToggleOperatorEvent];
    playerSetGamemode: [PlayerSetGamemodeEvent];
    playerBreakBlock: [PlayerBreakBlockEvent];
    playerBlockBroken: [PlayerBlockBrokenEvent];
    playerUseItem: [PlayerUseItemEvent];
    playerItemUsed: [PlayerItemUsedEvent];
    playerInteractBlock: [PlayerInteractBlockEvent];
    playerBlockInteracted: [PlayerBlockInteractedEvent];
    playerInteractEntity: [PlayerInteractEntityEvent];
    playerEntityInteracted: [PlayerEntityInteractedEvent];
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
