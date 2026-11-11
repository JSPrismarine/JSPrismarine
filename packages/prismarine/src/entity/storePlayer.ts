/**
 * A player as a store entity: the `minecraft:player` entity in the store, and the player parts
 * the store does not model yet beside it.
 *
 * [ADR 0008](../../../../docs/adr/0008-one-entity-model.md) makes a player an entity with
 * components for vitals, inventory, game mode and abilities. The entity holds the position, the
 * look and the health. {@link StorePlayer} holds the rest in the objects a live `Player` holds
 * them in, so the saved record (`world/playerRecord.ts`) is projected from either one the same
 * way: the client's attribute table, which carries food, saturation and experience, the
 * {@link PlayerComponents}, the {@link HumanInventory}, the game mode and the portal cooldown.
 *
 * Live players are still legacy `Player` objects until C4h moves them into the store, so nothing
 * builds one of these outside tests yet. Built with the runtime's player systems
 * (`entity/data/playerSystems.ts`), its components are theirs: logged through the store, undone by
 * the runtime's inverse writer, and run by the survival systems. Built without them, its component
 * writes are not logged. Its inventory is not logged either way.
 */
import { Gametype } from '@jsprismarine/minecraft';
import { Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';
import type UUID from '@jsprismarine/protocol/wire/structures/UUID';
import type Skin from '@jsprismarine/protocol/wire/structures/skin/Skin';
import { Vector3 } from '@jsprismarine/math';

import HumanInventory from '../inventory/HumanInventory';
import type Device from '../utils/Device';
import type { PlayerRecordSource, PlayerRecordTarget, RecordedPosition } from '../world/playerRecord';
import type { StoredSpawnPoint } from '../world/RespawnPoint';
import type { DataEntity } from './data/DataEntity';
import { EYE_HEIGHT } from './playerEyes';
import { portalCooldownOf } from './PortalContact';
import { PlayerComponents } from './playerComponents';
import { setSaturation } from './playerHunger';
import type { PlayerSystems } from './data/playerSystems';

/** Who a store player is, as the login named them. */
export interface StorePlayerIdentity {
    readonly uuid: UUID;
    readonly name: string;
    /** The Xbox Live id, or an empty string when the login carried none. */
    readonly xuid: string;
}

/** A store player entity and its player parts. */
export class StorePlayer implements PlayerRecordSource, PlayerRecordTarget {
    /** The client's attribute table. Its health entry is not read: health is the entity's. */
    public readonly attributes = new Attributes(Attributes.getPlayerDefaults());
    public gamemode: Gametype = Gametype.WORLD_DEFAULT;
    /** Where the head looks, which the client reports apart from the body's yaw. */
    public headYaw = 0;
    /** The skin the login carried, which a skin change replaces. */
    public skin: Skin | null = null;
    /** The device the login named, or null when it said nothing. */
    public device: Device | null = null;
    /** The platform chat id, which the login handler does not read yet and leaves empty. */
    public platformChatId = '';

    private readonly components: PlayerComponents;
    private readonly inventory = new HumanInventory();
    private portalCooldown = 0;

    /**
     * @param entity - The `minecraft:player` entity in the store.
     * @param identity - Who the player is.
     * @param systems - The player systems of the runtime the entity is in, which then hold its
     *   components; left out, the components log nothing.
     */
    public constructor(
        public readonly entity: DataEntity,
        private readonly identity: StorePlayerIdentity,
        systems?: Pick<PlayerSystems, 'attach'>
    ) {
        this.components =
            systems?.attach(entity, this.attributes) ?? new PlayerComponents(this.attributes, () => undefined);
    }

    /** The protocol identity the login carried. */
    public getUUID(): UUID {
        return this.identity.uuid;
    }

    /** The display name. */
    public getName(): string {
        return this.identity.name;
    }

    /** The XUID, or null when the login carried none, as `keyOfPlayer` reads it. */
    public getXUID(): string | null {
        return this.identity.xuid || null;
    }

    /** The eye, {@link EYE_HEIGHT} above the entity's feet, which is what a player reports. */
    public getPosition(): Vector3 {
        const { x, y, z } = this.entity.position;
        return new Vector3(x, y + EYE_HEIGHT, z);
    }

    public get pitch(): number {
        return this.entity.body.pitch;
    }

    public get yaw(): number {
        return this.entity.body.yaw;
    }

    /**
     * Puts the entity where a record says the player's eyes were.
     * @param recorded - The eye position and the look.
     */
    public placeAt(recorded: RecordedPosition): void {
        this.entity.body.yaw = recorded.yaw;
        this.entity.body.pitch = recorded.pitch;
        this.headYaw = recorded.headYaw;
        this.entity.position = { x: recorded.x, y: recorded.y - EYE_HEIGHT, z: recorded.z };
    }

    /** Everything the player carries. */
    public getInventory(): HumanInventory {
        return this.inventory;
    }

    /** The entity's health. */
    public getHealth(): number {
        return this.entity.instance.attributes.get('health')?.current ?? 0;
    }

    /** The most health the entity can have, which its type decides. */
    public getMaxHealth(): number {
        return this.entity.instance.attributes.get('health')?.max ?? 0;
    }

    /** Writes the entity's health, held to its maximum. */
    public restoreHealth(health: number): void {
        const current = this.entity.instance.attributes.get('health');
        if (current !== undefined) this.entity.instance.attributes.set('health', Math.min(current.max, health));
    }

    /** Whether the player is flying. */
    public isFlying(): boolean {
        return this.components.get('abilities.flying');
    }

    /** Writes the flying flag; nothing is sent. */
    public restoreFlying(flying: boolean): void {
        this.components.set('abilities.flying', flying);
    }

    /** Food, out of 20. */
    public getFood(): number {
        return this.components.get('vitals.food');
    }

    /** Writes food, held inside the attribute's bounds. */
    public setFood(food: number): void {
        this.components.set('vitals.food', food);
    }

    /** The hidden buffer spent before food. */
    public getSaturation(): number {
        return this.components.get('vitals.saturation');
    }

    /** Writes saturation, which never exceeds food, as a live player's does. */
    public setSaturation(saturation: number): void {
        setSaturation(this.components, saturation);
    }

    /** The player's own spawn point, or undefined for the world spawn. */
    public getSpawnPoint(): StoredSpawnPoint | undefined {
        return this.components.get('respawn.spawnPoint') ?? undefined;
    }

    /** Moves the player's own spawn point, or clears it back to the world spawn. */
    public setSpawnPoint(spawn: StoredSpawnPoint | undefined): void {
        this.components.set('respawn.spawnPoint', spawn ?? null);
    }

    /** Whether the player has watched the end credits. */
    public hasSeenCredits(): boolean {
        return this.components.get('respawn.seenCredits');
    }

    /** Records whether the player has watched the end credits. */
    public setSeenCredits(seen: boolean): void {
        this.components.set('respawn.seenCredits', seen);
    }

    /** Ticks left before the player may enter a portal again. */
    public getPortalCooldown(): number {
        return this.portalCooldown;
    }

    /** Starts the portal cooldown, in whole ticks and never below zero, as a live player's. */
    public setPortalCooldown(ticks: number): void {
        this.portalCooldown = portalCooldownOf(ticks);
    }
}
