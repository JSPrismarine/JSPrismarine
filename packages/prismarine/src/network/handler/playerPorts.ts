/**
 * How a packet handler reaches the player its session speaks for.
 *
 * A handler reads the player's state from its store player, and changes it through the homes
 * package H-B3 of the entity and tick re-architecture named: a client operation on the session,
 * and an input, such as a sprint or a jump, through the entity runtime of the session's world. It
 * calls a `Player` method only where that method posts a player event, or where the callee takes
 * a `Player`.
 */
import type { DisconnectReason } from '@jsprismarine/minecraft';
import type { Vector3 } from '@jsprismarine/math';

import type CraftingInput from '../../crafting/CraftingInput';
import type HumanInventory from '../../inventory/HumanInventory';
import type { World } from '../../world/World';
import type { EntityRuntime } from '../../entity/data/EntityRuntime';
import type { StorePlayer } from '../../entity/storePlayer';
import type PlayerSession from '../PlayerSession';

/**
 * The store player a session speaks for: its entity while it is in a store, and the inventory,
 * crafting grid, components, look and identity beside it.
 * @param session - The sender's session.
 * @returns The store player.
 * @throws {Error} Once the session has forgotten its player.
 */
export const storePlayerOf = (session: Pick<PlayerSession, 'getPlayer'>): StorePlayer =>
    session.getPlayer().getStorePlayer();

/**
 * The entity runtime that takes the inputs of a session's player: the runtime of the session's
 * world, which writes through its player systems while the player's entity is in its store, and
 * onto the store player's components while it is in none.
 * @param session - The sender's session.
 * @returns The runtime.
 */
export const playerInputsOf = (session: Pick<PlayerSession, 'getWorld'>): EntityRuntime =>
    session.getWorld().dataEntities().runtime;

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

/** The crafting grid in a player's own inventory screen, which closing the screen empties. */
export interface CraftingHolder {
    getCraftingInput(): CraftingInput;
}

/** A player's flight, which the client asks to toggle. */
export interface FlyingPlayer {
    isFlying(): boolean;
    /** Starts or stops flying, or sends the unchanged abilities back when the player may not fly. */
    setFlying(flying: boolean): Promise<void>;
}
