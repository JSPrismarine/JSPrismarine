/**
 * A player as a store entity: the `minecraft:player` entity in the store, and the player parts
 * the store does not model yet beside it.
 *
 * [ADR 0008](../../../../docs/adr/0008-one-entity-model.md) makes a player an entity with
 * components for vitals, inventory, game mode and abilities. The entity holds the position, the
 * look and the health. {@link StorePlayer} holds the rest in objects of its own, and the saved
 * record (`world/playerRecord.ts`) is projected from them: the client's attribute table, which
 * carries food, saturation and experience, the {@link PlayerComponents}, which carry the game
 * mode, the {@link HumanInventory}, the crafting grid and the portal cooldown.
 *
 * A store player outlives its entity. It is filed by the id drawn at its login, and from the login
 * to its first entry into a store, and between the two stores of a dimension change, it is in
 * none: it holds the position, the look and the health itself, and the entity's record once it
 * has had one, and it logs nothing ([ADR 0011](../../../../docs/adr/0011-a-world-exchanges-only-plain-data.md)).
 * Its entity enters a store through `enterStore` (`entity/data/storePlayers.ts`), which attaches
 * the two: the player's writes are then logged in that store and undone by its runtime, and the
 * runtime's player systems run its survival. `leaveStore` detaches them again.
 *
 * Every live player is one: the session holds its store player from the login on.
 */
import type { Gametype } from '@jsprismarine/minecraft';
import { AttributeIds, Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';
import { Metadata } from '@jsprismarine/protocol/wire/structures/Metadata';
import type UUID from '@jsprismarine/protocol/wire/structures/UUID';
import type Skin from '@jsprismarine/protocol/wire/structures/skin/Skin';
import { Vector3 } from '@jsprismarine/math';
import type { EntityPosition } from '@jsprismarine/entities';

import type { ServerContent } from '../content/ServerContent';
import CraftingInput from '../crafting/CraftingInput';
import HumanInventory from '../inventory/HumanInventory';
import { itemOfSlotValue, playerContainerNamed } from '../inventory/slotLog';
import type Device from '../utils/Device';
import type { PlainData } from '../world/changelog/PlainData';
import type { PlayerRecordSource, PlayerRecordTarget, RecordedPosition } from '../world/playerRecord';
import type { StoredSpawnPoint } from '../world/RespawnPoint';
import type { StatusEffect } from './StatusEffect';
import type { DataEntity } from './data/DataEntity';
import type { DataEntityRecord } from './data/persistence';
import type { PlayerLog, PlayerSystems } from './data/playerSystems';
import type { ExperienceHolder } from './Experience';
import type { ViewableEquipment } from './predicateView';
import { EYE_HEIGHT } from './playerEyes';
import { PLAYER_IDENTIFIER } from './playerOverlay';
import { portalCooldownOf } from './PortalContact';
import { PlayerComponents } from './playerComponents';
import { addFood, setSaturation } from './playerHunger';
import { HAND_SLOT_FIELD, HEAD_YAW_FIELD, SHOWN_PLAYER_COMPONENTS, SHOWN_PLAYER_SLOTS, slotKey } from './playerShown';
import type { PlayerShownForm } from './playerShown';

/** Who a store player is, as the login named them. */
export interface StorePlayerIdentity {
    readonly uuid: UUID;
    readonly name: string;
    /** The Xbox Live id, or an empty string when the login carried none. */
    readonly xuid: string;
}

/** What a store player keeps of its entity while it is in no store. */
export interface HeldEntity {
    /** Where the feet are. */
    readonly position: EntityPosition;
    readonly yaw: number;
    readonly pitch: number;
    /**
     * The entity as it left its last store, which the next store restores, or undefined before
     * its first entry, when the next store spawns it.
     */
    readonly record: DataEntityRecord | undefined;
    readonly tags: readonly string[];
    readonly statusEffects: readonly StatusEffect[];
}

/** A store player, with its entity while one is in a store. */
export class StorePlayer implements PlayerRecordSource, PlayerRecordTarget {
    /**
     * The client's attribute table. While the player is in a store its health entry is not read,
     * because health is the entity's; while it is in none, the entry holds it.
     */
    public readonly attributes = new Attributes(Attributes.getPlayerDefaults());
    /** The skin the login carried, which a skin change replaces. */
    public skin: Skin | null = null;
    /** The device the login named, or null when it said nothing. */
    public device: Device | null = null;
    /** The platform chat id, which the login handler does not read yet and leaves empty. */
    public platformChatId = '';
    /**
     * The actor metadata the components keep air, breathing and sprinting in, and which the
     * player's own client is shown while the player is in no store. In a store, clients are shown
     * the actor's metadata, which reads these from the components.
     */
    public readonly metadata = new Metadata();

    private readonly components = new PlayerComponents(
        this.attributes,
        (field, before, after) => this.log?.field(field, before, after),
        this.metadata
    );
    private readonly inventory = new HumanInventory();
    private readonly craftingInput = new CraftingInput();
    private portalCooldown = 0;
    private lookingHeadYaw = 0;
    /** The last tick an actor of this player was updated in; see {@link StorePlayer.claimUpdate}. */
    private updatedTick = -1;
    private attached: DataEntity | undefined;
    /** Where writes are logged while the entity is in a store. */
    private log: PlayerLog | undefined;
    private held: HeldEntity = {
        position: { x: 0, y: 0, z: 0 },
        yaw: 0,
        pitch: 0,
        record: undefined,
        tags: [],
        statusEffects: []
    };

    /**
     * @param id - The entity id drawn at the login, which every entity of this player is given.
     * @param identity - Who the player is.
     */
    public constructor(
        public readonly id: number,
        private readonly identity: StorePlayerIdentity
    ) {
        this.metadata.setNameTag(identity.name);
        this.inventory.observeCarried({
            slot: (container, slot, before, after) => this.log?.slot(container, slot, before, after),
            handSlot: (before, after) => this.log?.field(HAND_SLOT_FIELD, before, after)
        });
        this.craftingInput.observe((slot, before, after) => this.log?.slot('crafting', slot, before, after));
    }

    /** Where the head looks, which the client reports apart from the body's yaw. Logged while in a store. */
    public get headYaw(): number {
        return this.lookingHeadYaw;
    }

    public set headYaw(headYaw: number) {
        const before = this.lookingHeadYaw;
        this.lookingHeadYaw = headYaw;
        this.log?.field(HEAD_YAW_FIELD, before, headYaw);
    }

    /** The `minecraft:player` entity while the player is in a store, or undefined while it is in none. */
    public get entity(): DataEntity | undefined {
        return this.attached;
    }

    /** What the player keeps of its entity while it is in no store, which its next entry starts from. */
    public get heldEntity(): HeldEntity {
        return this.held;
    }

    /**
     * Takes an entity that is entering a store as this player's, before it enters: the position,
     * the look, the health, the tags and the status effects the player held are written onto it,
     * and from now on the player's writes are logged there and the store's systems run it.
     *
     * @param entity - The entity, built with this player's id and not yet entered.
     * @param systems - The player systems of the entity's runtime; left out, nothing is logged.
     * @throws {Error} When the entity has another id, or the player already has an entity.
     */
    public attach(entity: DataEntity, systems?: Pick<PlayerSystems, 'attach'>): void {
        if (entity.id !== this.id) throw new Error(`store player ${this.id} cannot take entity ${entity.id}`);
        if (this.attached !== undefined) throw new Error(`store player ${this.id} is already in a store`);
        const { position, yaw, pitch, tags, statusEffects } = this.held;
        const health = this.attributes.getValue(AttributeIds.Health);
        entity.position = position;
        entity.body.yaw = yaw;
        entity.body.pitch = pitch;
        // Only an entity that has been in a store before has tags and effects of its own to carry.
        if (this.held.record !== undefined) {
            entity.body.tags.replace(tags);
            entity.body.statusEffects.replace(statusEffects.map((effect) => [effect.id, effect]));
        }
        this.attached = entity;
        this.restoreHealth(health);
        this.log = systems?.attach(entity, {
            components: this.components,
            shownForm: () => this.shownForm(),
            restoreField: (field, value) => this.restoreField(field, value),
            restoreSlot: (container, slot, value, content) => this.restoreSlot(container, slot, value, content)
        });
    }

    /**
     * Lets go of the entity before it leaves its store, keeping what the next store needs: the
     * position, the look, the health, and the entity's record, tags and status effects.
     *
     * @param record - The entity's record as it is now, which the next store restores.
     * @returns Whether the player had an entity.
     */
    public detach(record: DataEntityRecord): boolean {
        const entity = this.attached;
        if (entity === undefined) return false;
        const health = this.getHealth();
        this.held = {
            position: { ...entity.position },
            yaw: entity.body.yaw,
            pitch: entity.body.pitch,
            record,
            tags: [...entity.body.tags],
            statusEffects: [...entity.body.statusEffects.values()].map((effect) => ({ ...effect }))
        };
        this.log = undefined;
        this.attached = undefined;
        this.attributes.setValue(AttributeIds.Health, health);
        return true;
    }

    /** The entity id as the wire carries it, which every entity query knows the player by. */
    public getRuntimeId(): bigint {
        return BigInt(this.id);
    }

    /** The type of the player's entity, `minecraft:player`. */
    public getType(): string {
        return PLAYER_IDENTIFIER;
    }

    /** The game mode, a logged component field the survival systems read. */
    public get gamemode(): Gametype {
        return this.components.get('abilities.gamemode');
    }

    public set gamemode(gamemode: Gametype) {
        this.components.set('abilities.gamemode', gamemode);
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

    /** The eye, {@link EYE_HEIGHT} above the feet, which is what a player reports. */
    public getPosition(): Vector3 {
        const { x, y, z } = this.attached?.position ?? this.held.position;
        return new Vector3(x, y + EYE_HEIGHT, z);
    }

    public get pitch(): number {
        return this.attached?.body.pitch ?? this.held.pitch;
    }

    public get yaw(): number {
        return this.attached?.body.yaw ?? this.held.yaw;
    }

    /**
     * Puts the player where a record says its eyes were.
     * @param recorded - The eye position and the look.
     */
    public placeAt(recorded: RecordedPosition): void {
        const position = { x: recorded.x, y: recorded.y - EYE_HEIGHT, z: recorded.z };
        this.headYaw = recorded.headYaw;
        if (this.attached === undefined) {
            this.held = { ...this.held, position, yaw: recorded.yaw, pitch: recorded.pitch };
            return;
        }
        this.attached.body.yaw = recorded.yaw;
        this.attached.body.pitch = recorded.pitch;
        this.attached.position = position;
    }

    /** The bottom of the player's body, the eye height below what it reports. */
    public getFeetY(): number {
        return (this.attached?.position ?? this.held.position).y;
    }

    /** Puts the player's feet at a position, keeping the look. */
    public standAt(feet: EntityPosition): void {
        if (this.attached === undefined) this.held = { ...this.held, position: { ...feet } };
        else this.attached.position = feet;
    }

    /**
     * Whether the client last reported the player on the ground: the body's `on_ground`
     * condition, false while the player is in no store.
     */
    public isOnGround(): boolean {
        return this.attached?.body.conditions.has('on_ground') ?? false;
    }

    /** Everything the player carries. */
    public getInventory(): HumanInventory {
        return this.inventory;
    }

    /** What is sitting in the crafting slots, whether the inventory's four or a table's nine. */
    public getCraftingInput(): CraftingInput {
        return this.craftingInput;
    }

    /** What the player wears and holds. */
    public getEquipment(): ViewableEquipment {
        return this.inventory.getEquipment();
    }

    /** The player's logged component state, which the survival rules write through. */
    public getComponents(): PlayerComponents {
        return this.components;
    }

    /** The `/tag` tags the player carries, the entity's while it is in a store. */
    public getTags(): readonly string[] {
        return this.attached === undefined ? this.held.tags : [...this.attached.body.tags];
    }

    /** The status effects on the player, the entity's while it is in a store. */
    public getStatusEffects(): readonly StatusEffect[] {
        return this.attached === undefined ? this.held.statusEffects : [...this.attached.body.statusEffects.values()];
    }

    /** Whether the client last reported the player sprinting. */
    public isSprinting(): boolean {
        return this.components.get('movement.sprinting');
    }

    /** Whether the client last reported the player sneaking. */
    public isSneaking(): boolean {
        return this.components.get('movement.sneaking');
    }

    /** Whether the client has reported the player asleep in a bed. */
    public isSleeping(): boolean {
        return this.components.get('movement.sleeping');
    }

    /**
     * How far the player has fallen since it was last supported. A blow struck while this is
     * above zero is a critical: a player rising through a jump is not falling.
     */
    public getFallDistance(): number {
        return this.components.get('vitals.fallDistance');
    }

    /** The experience, as the level and the bar the client is sent, written through logged setters. */
    public getExperience(): ExperienceHolder {
        return this.components.experience();
    }

    /**
     * Sets an attribute, through the component field it is kept in when it has one, so the write
     * is logged.
     * @returns Whether the value changed.
     */
    public setAttributeValue(name: string, value: number): boolean {
        const before = this.attributes.getValue(name);
        if (!this.components.setAttribute(name, value)) return this.attributes.setValue(name, value);
        return this.attributes.getValue(name) !== before;
    }

    /**
     * Notes that the player started holding an item down. Bedrock says only "started" and later
     * "released", so the charge of a bow is the time between them, measured here.
     * @param tick - The server tick it began on.
     */
    public beginItemUse(tick: number): void {
        this.components.set('itemUse.startedAt', tick);
    }

    /**
     * How long the current use has lasted, in ticks, and forgets it.
     * @param tick - The server tick it ended on.
     * @returns Ticks held, or zero if nothing was being held.
     */
    public takeItemUseTicks(tick: number): number {
        const started = this.components.get('itemUse.startedAt');
        this.components.set('itemUse.startedAt', null);
        return started === null ? 0 : Math.max(0, tick - started);
    }

    /** The health, the entity's while the player is in a store. */
    public getHealth(): number {
        if (this.attached === undefined) return this.attributes.getValue(AttributeIds.Health);
        return this.attached.instance.attributes.get('health')?.current ?? 0;
    }

    /** The most health the player can have, which the entity's type decides while it is in a store. */
    public getMaxHealth(): number {
        if (this.attached === undefined) return this.attributes.getAttribute(AttributeIds.Health)?.getMax() ?? 0;
        return this.attached.instance.attributes.get('health')?.max ?? 0;
    }

    /** Writes the health, held to its maximum. */
    public restoreHealth(health: number): void {
        if (this.attached === undefined) {
            this.attributes.setValue(AttributeIds.Health, health);
            return;
        }
        const current = this.attached.instance.attributes.get('health');
        if (current !== undefined) this.attached.instance.attributes.set('health', Math.min(current.max, health));
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

    /** Feeds the player, as eating does. */
    public addFood(food: number, saturation = 0): void {
        addFood(this.components, food, saturation);
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

    /**
     * Claims the player's one actor update of a server tick. The player keeps the claim rather
     * than its actor, because a dimension change mid-tick gives it a new actor in a world the
     * level ticks later, which would otherwise update it a second time.
     *
     * @returns Whether this is the first claim of `tick`.
     */
    public claimUpdate(tick: number): boolean {
        if (this.updatedTick === tick) return false;
        this.updatedTick = tick;
        return true;
    }

    /** Ticks left before the player may enter a portal again. */
    public getPortalCooldown(): number {
        return this.portalCooldown;
    }

    /** Starts the portal cooldown, in whole ticks and never below zero, as a live player's. */
    public setPortalCooldown(ticks: number): void {
        this.portalCooldown = portalCooldownOf(ticks);
    }

    /**
     * What clients are shown of the player beside its entity, which its entity enters the change
     * log with (`entity/playerShown.ts`).
     */
    private shownForm(): PlayerShownForm {
        const fields: Record<string, PlainData> = {
            [HEAD_YAW_FIELD]: this.lookingHeadYaw,
            [HAND_SLOT_FIELD]: this.inventory.getHandSlotIndex()
        };
        for (const field of SHOWN_PLAYER_COMPONENTS) fields[field] = this.components.get(field);
        const slots: Record<string, PlainData> = {};
        for (const { container, slot } of SHOWN_PLAYER_SLOTS)
            slots[slotKey(container, slot)] = this.inventory.slotValue(container, slot);
        return { fields, slots };
    }

    /** Writes back a logged field the player keeps beside its components: the hand slot or the head yaw. */
    private restoreField(field: string, value: PlainData): boolean {
        if (field !== HAND_SLOT_FIELD && field !== HEAD_YAW_FIELD) return false;
        if (typeof value !== 'number') throw new TypeError(`${field} cannot hold ${String(value)}`);
        if (field === HEAD_YAW_FIELD) this.lookingHeadYaw = value;
        else this.inventory.setHandSlot(value);
        return true;
    }

    /** Writes a logged stack back into a slot of a container the player carries. */
    private restoreSlot(container: string, slot: number, value: PlainData, content: ServerContent): boolean {
        const named = playerContainerNamed(container);
        if (named === undefined) return false;
        if (named !== 'crafting') return this.inventory.restoreSlot(named, slot, value, content);
        if (!Number.isInteger(slot) || slot < 0 || slot >= CraftingInput.SLOTS) return false;
        this.craftingInput.set(slot, itemOfSlotValue(value, content));
        return true;
    }
}
