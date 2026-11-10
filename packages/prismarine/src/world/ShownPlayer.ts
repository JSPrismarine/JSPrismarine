/**
 * What the network layer reads of a player to show it to another client.
 *
 * A legacy {@link import('../Player').default} satisfies this as it is. A player in the entity
 * store satisfies it through `entity/data/storePlayerActor.ts`, which answers the entity's
 * position, rotation and metadata from the store and the rest from the player's profile. The
 * `AddPlayer` exchange, the abilities, the armor and the player list entry are built from this,
 * so both kinds of player go on the wire through the same code. Slice 7 of the entity and tick
 * re-architecture replaces these reads with replication from the change log.
 */
import type { Gametype } from '@jsprismarine/minecraft';
import type UUID from '@jsprismarine/protocol/wire/structures/UUID';
import type Skin from '@jsprismarine/protocol/wire/structures/skin/Skin';

import type Device from '../utils/Device';
import type { ShownActor } from './ShownActor';

/**
 * How far clients follow a player, in chunks.
 *
 * Deliberately past any plausible view distance, so the viewer's own radius is always what
 * decides. Vanilla uses the same trick for the same reason.
 */
export const PLAYER_TRACKING_RANGE_CHUNKS = 32;

/** One player as the network layer shows it to other clients. */
export interface ShownPlayer extends ShownActor {
    /** The identity the client logged in with. */
    getUUID(): UUID;
    /** The name other clients see over the player's head and in the player list. */
    getName(): string;
    readonly xuid: string;
    readonly platformChatId: string;
    /** The device the client logged in from, or null when it said nothing. */
    readonly device: Device | null;
    readonly skin: Skin | null;
    readonly gamemode: Gametype;
    /** Whether the player is an operator, which sets the permissions other clients see. */
    isOp(): boolean;
    isFlying(): boolean;
}
