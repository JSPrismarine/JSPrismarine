/**
 * Players in the entity store, shown to other clients as a legacy player is shown.
 *
 * A store player is a {@link StorePlayer}: the `minecraft:player` entity, which holds the
 * position, the look, the health, the status effects and the metadata its components project,
 * and beside it the parts the store does not model yet, such as the identity, the inventory, the
 * game mode and the head yaw. {@link StorePlayerActor} shows it through the same
 * `PlayerSession.sendAddPlayer`, abilities, armor and player list entry a legacy player goes
 * through ({@link ShownPlayer}).
 *
 * Every move, metadata change and equipment change reaches clients through `StoreActors.sync`,
 * as a mob's does, at most one move a tick. Removal from the store hides the player from every
 * client that was shown it, which covers a leave and a dimension change.
 *
 * No live player is a store entity yet. Package C4h of the entity and tick re-architecture
 * spawns one with {@link spawnStorePlayer}. Slice 7 then replaces the comparisons in `sync` with
 * replication from the change log.
 */
import type { EntityPosition } from '@jsprismarine/entities';
import type { Gametype } from '@jsprismarine/minecraft';
import type { Vector3 } from '@jsprismarine/math';
import { Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';
import type Skin from '@jsprismarine/protocol/wire/structures/skin/Skin';
import type UUID from '@jsprismarine/protocol/wire/structures/UUID';

import type PlayerSession from '../../network/PlayerSession';
import type Device from '../../utils/Device';
import type { ShownPlayer } from '../../world/ShownPlayer';
import { PLAYER_TRACKING_RANGE_CHUNKS } from '../../world/ShownPlayer';
import type { World } from '../../world/World';
import { sameEquipmentItems } from '../equipment';
import { clientOwnsMovement, PLAYER_IDENTIFIER } from '../playerOverlay';
import { StorePlayer } from '../storePlayer';
import type { StorePlayerIdentity } from '../storePlayer';
import type { DataEntity } from './DataEntity';
import type { EntityRuntime } from './EntityRuntime';
import { StoreActor } from './storeActors';
import type { StoreActorBlows } from './storeActors';

/**
 * The server's store players, by entity id.
 *
 * One for the server, not one for each dimension, because a player that changes dimension
 * leaves one store and enters another with the same id and is still the same player.
 */
export class StorePlayers {
    private readonly byId = new Map<number, StorePlayer>();

    /** The store player of one entity, or undefined when the id names none. */
    public of(id: number): StorePlayer | undefined {
        return this.byId.get(id);
    }

    /** Files a store player under its entity's id, which its actor is built from. */
    public add(player: StorePlayer): void {
        this.byId.set(player.entity.id, player);
    }

    /** Forgets a player that left the server. @returns Whether it was filed. */
    public delete(id: number): boolean {
        return this.byId.delete(id);
    }

    /**
     * The actor of a store entity that is a filed player, for `StoreActors`.
     * @returns The actor, or undefined for any other entity.
     */
    public actorOf(entity: DataEntity, world: World, blows: StoreActorBlows): StorePlayerActor | undefined {
        if (!clientOwnsMovement(entity.identifier)) return undefined;
        const player = this.byId.get(entity.id);
        return player === undefined ? undefined : new StorePlayerActor(player, world, blows);
    }
}

/**
 * Puts a player into the store and files it.
 *
 * The player is filed and filled before the entity is announced, so the clients in range are
 * sent a player's `AddPlayer` with its skin, game mode and equipment from the start. The name
 * is also the entity's name tag, as a legacy player's name is its metadata's, so it enters the
 * change log with the entity.
 * @param at - Where the player's feet are. A client reports its eyes, `EYE_HEIGHT` higher.
 * @param fill - Writes the player's parts before it is shown, such as a saved record or the
 *   skin the login carried.
 * @returns The player, or undefined when the content declares no player.
 */
export const spawnStorePlayer = (
    runtime: EntityRuntime,
    players: StorePlayers,
    at: EntityPosition,
    identity: StorePlayerIdentity,
    fill?: (player: StorePlayer) => void
): StorePlayer | undefined => {
    let spawned: StorePlayer | undefined;
    runtime.spawn(PLAYER_IDENTIFIER, at, {
        prepare: (entity) => {
            entity.body.nameTag = identity.name;
            spawned = new StorePlayer(entity, identity);
            fill?.(spawned);
            players.add(spawned);
        }
    });
    return spawned;
};

/**
 * One store player as the network layer and the legacy world code read it.
 *
 * The position, the look and the status effects come from the store, as a mob's do, and the
 * identity, the head yaw, the game mode, flight and equipment from the {@link StorePlayer}.
 * Where a legacy player and a mob differ in how they are shown, this follows the legacy player.
 */
export class StorePlayerActor extends StoreActor implements ShownPlayer {
    /**
     * None: other clients were never sent a legacy player's attributes, and its own client is
     * sent them by its session.
     */
    public override readonly attributes = new Attributes([]);

    public constructor(
        /** The store player behind the actor. */
        public readonly player: StorePlayer,
        world: World,
        blows: StoreActorBlows
    ) {
        super(player.entity, world, undefined, blows);
    }

    /** Where the player's eyes are, which is where a client draws a player and where a legacy player is. */
    public override getPosition(): Vector3 {
        return this.player.getPosition();
    }

    /** The head turns apart from the body, as the client reports it. */
    public override get headYaw(): number {
        return this.player.headYaw;
    }

    /** @inheritdoc */
    public override getTrackingRange(): number {
        return PLAYER_TRACKING_RANGE_CHUNKS;
    }

    /** A player appears to other clients as a player, not as a generic actor. */
    public override async spawnTo(session: PlayerSession): Promise<void> {
        await session.sendAddPlayer(this);
    }

    /** Reads the inventory's equipment. @returns Whether a client would see different equipment. */
    public override writeEquipment(): boolean {
        const worn = this.player.getInventory().getEquipment();
        if (sameEquipmentItems(this.equipment, worn)) return false;
        this.equipment = worn;
        return true;
    }

    /** @inheritdoc */
    public getUUID(): UUID {
        return this.player.getUUID();
    }

    /** The name the login carried. */
    public override getName(): string {
        return this.player.getName();
    }

    public get xuid(): string {
        return this.player.getXUID() ?? '';
    }

    public get platformChatId(): string {
        return this.player.platformChatId;
    }

    public get device(): Device | null {
        return this.player.device;
    }

    public get skin(): Skin | null {
        return this.player.skin;
    }

    public get gamemode(): Gametype {
        return this.player.gamemode;
    }

    /** Whether the permission service lists the player as an operator, as `Player.isOp` asks it. */
    public isOp(): boolean {
        return this.getServer().getPermissionManager().isOp(this.getUUID().toString());
    }

    /** @inheritdoc */
    public isFlying(): boolean {
        return this.player.isFlying();
    }
}
