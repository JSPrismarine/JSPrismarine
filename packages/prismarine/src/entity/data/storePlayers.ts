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
 * A store player outlives its entity (`entity/storePlayer.ts`): {@link enterStore} gives it an
 * entity in a store under the id it was filed by, and {@link leaveStore} takes the entity out
 * again and keeps what the next store needs, so a dimension change is a leave and an enter with
 * the same id.
 *
 * No live player is a store entity yet. C4h's H-B2 builds one at the login and enters it. Slice 7
 * then replaces the comparisons in `sync` with replication from the change log.
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
import { breathWorthSending } from '../playerBreath';
import type { ShownBreath } from '../playerBreath';
import { mayFlyIn } from '../playerComponents';
import { clientOwnsMovement } from '../playerOverlay';
import { StorePlayer } from '../storePlayer';
import type { StorePlayerIdentity } from '../storePlayer';
import type { DataEntity } from './DataEntity';
import type { EntityRuntime } from './EntityRuntime';
import { dataEntityRecordOf } from './persistence';
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

    /** Files a store player under its id, which every entity of the player is given. */
    public add(player: StorePlayer): void {
        this.byId.set(player.id, player);
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
        return player?.entity === entity ? new StorePlayerActor(player, entity, world, blows) : undefined;
    }
}

/**
 * Gives a store player an entity in a store, under the player's id, and files the player.
 *
 * The player's first entity is spawned; a later one, after a dimension change, is restored from
 * the record its last entity left with. Either way the player is attached before the entity is
 * announced, so the clients in range are sent a player's `AddPlayer` with its skin, game mode and
 * equipment from the start, and what the player held is part of the form the entity enters the
 * change log with. The name is also the entity's name tag, as a legacy player's name is its
 * metadata's.
 *
 * @returns The entity, or undefined when the content declares no player; the player is then in
 *   no store and not filed.
 */
export const enterStore = (
    runtime: EntityRuntime,
    players: StorePlayers,
    player: StorePlayer
): DataEntity | undefined => {
    players.add(player);
    const { position, yaw, pitch, record } = player.heldEntity;
    const prepare = (entity: DataEntity): void => {
        entity.body.nameTag = player.getName();
        player.attach(entity, runtime.playerSystems);
    };
    const entity =
        record === undefined
            ? runtime.spawnPlayer(player.id, position, { yaw, pitch, prepare })
            : runtime.restore({ ...record, yaw, pitch }, position, player.id, prepare);
    if (entity === undefined) players.delete(player.id);
    return entity;
};

/**
 * Takes a store player's entity out of its store and keeps what the next store needs: the
 * position, the look, the health, and the entity's record, tags and status effects. The player
 * stays filed, because it is the same player in the next store; `StorePlayers.delete` forgets it
 * once it leaves the server.
 *
 * @param reason - Why the entity left, as `EntityRuntime.remove` takes it.
 * @returns Whether the player had an entity in `runtime`'s store.
 */
export const leaveStore = (runtime: EntityRuntime, player: StorePlayer, reason: string): boolean => {
    const { entity } = player;
    if (entity === undefined || runtime.store.get(entity.id) !== entity) return false;
    player.detach(dataEntityRecordOf(entity, runtime.poolOf(entity.id), runtime.leashHolderIdentityOf(entity.id)));
    runtime.remove(entity.id, reason);
    return true;
};

/**
 * Applies a move a store player's client reported: the body's position, look and ground through
 * `EntityRuntime.applyClientMovement`, which charges the walk and pays for a landing, and the head
 * yaw, which the player keeps beside its entity because the body has none.
 *
 * @returns Whether the player's entity is in `runtime`'s store.
 */
export const moveStorePlayer = (
    runtime: EntityRuntime,
    player: StorePlayer,
    movement: Parameters<EntityRuntime['applyClientMovement']>[1] & { readonly headYaw: number }
): boolean => {
    if (!runtime.applyClientMovement(player.id, movement)) return false;
    player.headYaw = movement.headYaw;
    return true;
};

/**
 * Builds a store player under an id from the runtime's pool, fills it, and enters it into the
 * store, which is a login and a first spawn in one call.
 *
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
    const player = new StorePlayer(runtime.nextEntityId(), identity);
    player.standAt(at);
    fill?.(player);
    return enterStore(runtime, players, player) === undefined ? undefined : player;
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

    /**
     * @param player - The store player behind the actor.
     * @param entity - The player's entity in this actor's store.
     */
    public constructor(
        public readonly player: StorePlayer,
        entity: DataEntity,
        world: World,
        blows: StoreActorBlows
    ) {
        super(entity, world, undefined, blows);
        this.showPlayerState();
    }

    /**
     * The breath the player's viewers were last sent, or undefined before the first projection;
     * see {@link StorePlayerActor.showPlayerState}.
     */
    private shownBreath: ShownBreath | undefined;

    /**
     * Writes what the player's components decide about its metadata: air and breathing, which
     * the breath system keeps, sprinting, and whether it may fly, which its game mode decides, as
     * a legacy player writes them into its own metadata. Called after the projection of the
     * entity's components, which knows nothing of these, so these win.
     *
     * @returns Whether viewers should be sent the metadata again: sprinting or flight changed, or
     *   the breath moved far enough to show, as `breathWorthSending` judges it for a legacy player.
     */
    public showPlayerState(): boolean {
        const components = this.player.getComponents();
        const { metadata } = this;
        const sprinting = components.get('movement.sprinting');
        const canFly = mayFlyIn(components.get('abilities.gamemode'));
        const changed = metadata.sprinting !== sprinting || metadata.canFly !== canFly;
        metadata.setSprinting(sprinting);
        metadata.setCanFly(canFly);

        const breath = this.breathOf();
        metadata.setAir(breath.air);
        metadata.setBreathing(breath.breathing);
        const breathMoved =
            this.shownBreath === undefined || breathWorthSending(this.shownBreath, breath, components.maxAir());
        if (breathMoved) this.shownBreath = breath;
        return changed || breathMoved;
    }

    private breathOf(): ShownBreath {
        const components = this.player.getComponents();
        return { air: components.get('vitals.air'), breathing: components.get('vitals.breathing') };
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
