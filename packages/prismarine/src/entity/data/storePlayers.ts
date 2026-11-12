/**
 * Players in the entity store, and how other clients are shown them.
 *
 * A store player is a {@link StorePlayer}: the `minecraft:player` entity, which holds the
 * position, the look, the health, the status effects and the metadata its components project,
 * and beside it the parts the store does not model yet, such as the identity, the inventory, the
 * game mode and the head yaw. {@link StorePlayerActor} is how its own session and the world code
 * read it ({@link ShownPlayer}).
 *
 * Other clients are shown it from the change log, as a mob is: its entity enters the log with
 * what they are shown of it beside its saved form (`entity/playerShown.ts`), and every move,
 * metadata change and equipment change after that is replicated from the entries, at most one
 * move a tick. Its leaving entry hides it from every client that was shown it, which covers a
 * leave and a dimension change.
 *
 * A store player outlives its entity (`entity/storePlayer.ts`): {@link enterStore} gives it an
 * entity in a store under the id it was filed by, and {@link leaveStore} takes the entity out
 * again and keeps what the next store needs, so a dimension change is a leave and an enter with
 * the same id.
 *
 * Every live player is a store player, built at the login and entered at
 * `SetLocalPlayerAsInitialized` (`World.addPlayer`). Before that, and between the two stores of a
 * dimension change, it is in no store, and its own client is shown it through a
 * {@link DetachedPlayerView}.
 */
import type { EntityPosition } from '@jsprismarine/entities';
import { Gametype } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import { Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';
import type { Metadata } from '@jsprismarine/protocol/wire/structures/Metadata';
import { SyncedProperties } from '@jsprismarine/protocol/wire/structures/SyncedProperties';
import type Skin from '@jsprismarine/protocol/wire/structures/skin/Skin';
import type UUID from '@jsprismarine/protocol/wire/structures/UUID';

import type Device from '../../utils/Device';
import type { ShownPlayer } from '../../world/ShownPlayer';
import type { PortalRule } from '../../world/portal/rules';
import type { World } from '../../world/World';
import { mayFlyIn } from '../playerComponents';
import { cancelMeal } from '../playerMeal';
import { clientOwnsMovement, PLAYER_IDENTIFIER } from '../playerOverlay';
import { PORTAL_COOLDOWN_TICKS, PORTAL_TRANSITION_TICKS } from '../PortalContact';
import type { StatusEffect } from '../StatusEffect';
import type { ViewableEquipment } from '../predicateView';
import type { EntityBox } from './facts';
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
 *   no store, and filed only if it was before.
 */
export const enterStore = (
    runtime: EntityRuntime,
    players: StorePlayers,
    player: StorePlayer
): DataEntity | undefined => {
    // A live player is filed from its login on, and stays filed if this fails.
    const filed = players.of(player.id) === player;
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
    if (entity === undefined && !filed) players.delete(player.id);
    return entity;
};

/**
 * Takes a store player's entity out of its store and keeps what the next store needs: the
 * position, the look, the health, and the entity's record, tags and status effects. The player
 * stays filed, because it is the same player in the next store; `StorePlayers.delete` forgets it
 * once it leaves the server. An unfinished meal ends here: it counts on this store's tick, and the
 * next store's clock is another one.
 *
 * @param reason - Why the entity left, as `EntityRuntime.remove` takes it.
 * @returns Whether the player had an entity in `runtime`'s store.
 */
export const leaveStore = (runtime: EntityRuntime, player: StorePlayer, reason: string): boolean => {
    const { entity } = player;
    if (entity === undefined || runtime.store.get(entity.id) !== entity) return false;
    const components = player.getComponents();
    if (components.get('consumption.meal') !== null) cancelMeal(components);
    player.detach(dataEntityRecordOf(entity, runtime.poolOf(entity.id), runtime.leashHolderIdentityOf(entity.id)));
    runtime.remove(entity.id, reason);
    return true;
};

/**
 * What a runtime's `onPlayerReentered` runs: hands a player's entity that an undo or a replay adds
 * back to the store player it belongs to, which the leave detached and kept filed, so the slot and
 * field entries written back after it find the player's parts. A store player that holds an entity
 * in another store by then is left as it is.
 *
 * @returns The callback to set as the runtime's `onPlayerReentered`.
 */
export const reattachStorePlayer =
    (runtime: EntityRuntime, players: StorePlayers) =>
    (entity: DataEntity): void => {
        const player = players.of(entity.id);
        if (player !== undefined && player.entity === undefined) player.attach(entity, runtime.playerSystems);
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
 * One store player as the network layer and the world code read it.
 *
 * The position, the look and the status effects come from the store, as a mob's do, and the
 * identity, the head yaw, the game mode, flight and equipment from the {@link StorePlayer}.
 * Where a player and a mob differ in how they are shown, this follows what a client expects of
 * a player.
 */
export class StorePlayerActor extends StoreActor implements ShownPlayer {
    /**
     * None: other clients were never sent a legacy player's attributes, and its own client is
     * sent them by its session.
     */
    public override get attributes(): Attributes {
        return this.noAttributes;
    }

    private readonly noAttributes = new Attributes([]);

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
        super(entity, world, blows);
    }

    /**
     * The projection of the entity's components, then what the player's components decide about
     * its metadata, which the projection knows nothing of: air and breathing, which the breath
     * system keeps, sprinting, and whether it may fly, which its game mode decides, as a legacy
     * player writes them into its own metadata.
     */
    public override get metadata(): Metadata {
        const metadata = super.metadata;
        const components = this.player.getComponents();
        metadata.setSprinting(components.get('movement.sprinting'));
        metadata.setCanFly(mayFlyIn(components.get('abilities.gamemode')));
        metadata.setAir(components.get('vitals.air'));
        metadata.setBreathing(components.get('vitals.breathing'));
        return metadata;
    }

    /** Claims the player's one update of a tick, which an actor in another world shares. */
    public override claimUpdate(tick: number): boolean {
        return this.player.claimUpdate(tick);
    }

    /**
     * The entity's part of the tick, then the player's own: its session, its attribute sync and
     * its triggers, which run for the player the session speaks for.
     */
    public override update(tick: number): void {
        super.update(tick);
        this.getWorld().viewerOf(this.getRuntimeId())?.updatePlayer(tick);
    }

    /** A status effect's tick, and what the hunger and saturation effects do to the components. */
    protected override applyStatusEffectTick(effect: StatusEffect, clock: number): void {
        super.applyStatusEffectTick(effect, clock);
        this.getWorld().dataEntities().runtime.playerSystems.statusEffectTicked(this.entity, effect);
    }

    /**
     * Ticks this player has to stand in a portal before going through.
     *
     * Vanilla reads `players_nether_portal_creative_delay` (0) for a creative player and
     * `players_nether_portal_default_delay` (80) for everyone else; the game rules are not
     * modeled yet, so the portal rule's defaults are the answer. An end portal's rule says 0
     * for both.
     * @param rule - The rule of the portal stood in. Without one, a nether portal is assumed.
     */
    public override getPortalTransitionTicks(rule?: PortalRule): number {
        const creative = this.player.gamemode === Gametype.CREATIVE;
        if (rule !== undefined) return creative ? rule.delayTicks.creative : rule.delayTicks.survival;
        return creative ? PORTAL_TRANSITION_TICKS.creative : PORTAL_TRANSITION_TICKS.player;
    }

    /** Half a second, where a mob waits fifteen: `Player.getDimensionChangingDelay` in vanilla. */
    public override getDefaultPortalCooldown(): number {
        return PORTAL_COOLDOWN_TICKS.player;
    }

    /** The player's cooldown, which it keeps from one store to the next and in its record. */
    public override getPortalCooldown(): number {
        return this.player.getPortalCooldown();
    }

    /** @inheritdoc */
    public override setPortalCooldown(ticks: number = this.getDefaultPortalCooldown()): void {
        this.player.setPortalCooldown(ticks);
    }

    /**
     * Holds the cooldown while the client is still loading into the last dimension change, as
     * `ServerPlayer.processPortalCooldown` holds it while `isChangingDimension`, so the ten ticks
     * start once the loading screen has closed.
     */
    protected override holdsPortalCooldown(): boolean {
        return this.getWorld().viewerOf(this.getRuntimeId())?.pendingDimensionChange() !== undefined;
    }

    /** Where the player's eyes are, which is where a client draws a player and where a legacy player is. */
    public override getPosition(): Vector3 {
        return this.player.getPosition();
    }

    /** The head turns apart from the body, as the client reports it. */
    public override get headYaw(): number {
        return this.player.headYaw;
    }

    /** What the player holds and wears, from its inventory. */
    public override getEquipment(): ViewableEquipment {
        return this.player.getInventory().getEquipment();
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

    /** Whether the permission service lists the player as an operator. */
    public isOp(): boolean {
        return this.getServer().getPermissionManager().isOp(this.getUUID().toString());
    }

    /** @inheritdoc */
    public isFlying(): boolean {
        return this.player.isFlying();
    }
}

/**
 * A store player in no store, as its own client is shown it: from the login to
 * `SetLocalPlayerAsInitialized`, and between the two stores of a dimension change. Its position,
 * look and status effects are what the player holds of its entity, its metadata the components'
 * own, and nobody else is shown it, because no world holds it.
 */
export class DetachedPlayerView implements ShownPlayer {
    /**
     * @param player - The store player.
     * @param facts - What the view cannot read off the player: the type's box, which the metadata
     *   carries, and whether the permission service lists the player as an operator.
     */
    public constructor(
        public readonly player: StorePlayer,
        private readonly facts: { box(): EntityBox; isOp(): boolean }
    ) {}

    /** @inheritdoc */
    public getRuntimeId(): bigint {
        return BigInt(this.player.id);
    }

    /** @inheritdoc */
    public getType(): string {
        return PLAYER_IDENTIFIER;
    }

    /** @inheritdoc */
    public getPosition(): Vector3 {
        return this.player.getPosition();
    }

    /** A body in no store does not move. */
    public getVelocity(): Vector3 {
        return new Vector3(0, 0, 0);
    }

    public get pitch(): number {
        return this.player.pitch;
    }

    public get yaw(): number {
        return this.player.yaw;
    }

    public get headYaw(): number {
        return this.player.headYaw;
    }

    /** The components' metadata, with the player's box and whether its game mode lets it fly. */
    public get metadata(): Metadata {
        const { metadata } = this.player;
        const { width, height } = this.facts.box();
        metadata.setBoundingBox(width, height);
        metadata.setCanFly(mayFlyIn(this.player.gamemode));
        return metadata;
    }

    /** None, as a player's type declares none. */
    public getSyncedProperties(): SyncedProperties {
        return new SyncedProperties();
    }

    /** The client's attribute table. */
    public get attributes(): Attributes {
        return this.player.attributes;
    }

    /** @inheritdoc */
    public getEquipment(): ViewableEquipment {
        return this.player.getInventory().getEquipment();
    }

    /** @inheritdoc */
    public getStatusEffects(): readonly StatusEffect[] {
        return this.player.heldEntity.statusEffects;
    }

    /** @inheritdoc */
    public isOnGround(): boolean {
        return this.player.isOnGround();
    }

    /** @inheritdoc */
    public getUUID(): UUID {
        return this.player.getUUID();
    }

    /** @inheritdoc */
    public getName(): string {
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

    /** @inheritdoc */
    public isOp(): boolean {
        return this.facts.isOp();
    }

    /** @inheritdoc */
    public isFlying(): boolean {
        return this.player.isFlying();
    }
}
