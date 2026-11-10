/**
 * What more than one packet handler reads or changes of the player its session speaks for.
 *
 * A handler reaches the player through `PlayerSession.getPlayer()` and names only the part it
 * uses, so the handler compiles against any player that has that part. A legacy `Player`
 * satisfies each port as it is. Package C4h of the entity and tick re-architecture hands the
 * session a store player instead, and the plan's C4f notes list what a store player still lacks
 * for each port. A port only one handler needs lives in that handler's module.
 */
import type { DisconnectReason } from '@jsprismarine/minecraft';
import type { Vector3 } from '@jsprismarine/math';

import type HumanInventory from '../../inventory/HumanInventory';
import type { World } from '../../world/World';

/** A player as a handler that kicks it sees it. */
export interface KickedPlayer {
    /** Tells the client why and closes its connection. */
    kick(reason: string, code: DisconnectReason): Promise<void>;
}

/** Where a player stands, for a handler that checks a distance or acts on its world. */
export interface PlacedPlayer {
    /** The player's eyes, which is the position a client reports. */
    getPosition(): Vector3;
    getWorld(): World;
}

/** A player's own inventory, for a handler that reads or moves its stacks. */
export interface InventoryHolder {
    getInventory(): HumanInventory;
}

/** A player's flight, which the client asks to toggle. */
export interface FlyingPlayer {
    isFlying(): boolean;
    /** Starts or stops flying, or sends the unchanged abilities back when the player may not fly. */
    setFlying(flying: boolean): Promise<void>;
}
