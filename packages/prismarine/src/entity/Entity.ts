import { Vector3 } from '@jsprismarine/math';
import type { EntityPosition } from '@jsprismarine/entities';
import type { Item } from '../item/Item';
import { ActorEvent, LevelSoundEvent } from '@jsprismarine/minecraft';
import type { NBTTagCompound } from '@jsprismarine/nbt';
import type Server from '../Server';
import type PlayerSession from '../network/PlayerSession';
import { Position } from '../world/Position';
import { logLegacyWrite } from './legacyAdapter';
import type { World } from '../world/World';
import type { PlainData } from '../world/changelog/PlainData';
import { SyncedProperties } from '@jsprismarine/protocol/wire/structures/SyncedProperties';
import type { Attribute } from '@jsprismarine/protocol/wire/structures/Attribute';
import { AttributeIds, Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';
import { INVULNERABILITY_TICKS, reduceDamage } from './Damage';
import { DamageCause } from './DamageCause';
import { DamageSource } from './DamageSource';
import EntityDamageEvent from '../events/entity/EntityDamageEvent';
import EntityDeathEvent from '../events/entity/EntityDeathEvent';
import { advancementDamage, advancementKill } from '../advancement/triggers';
import { knockbackOf, SINGLE_DAMPING } from './knockback';
import { wornArmorOf } from './equipment';
import { enchantmentProtection } from '../enchantment/mitigation';
import type { EntityBox } from './data/facts';
import { boxOf } from './data/facts';
import { Metadata, MetadataFlag } from '@jsprismarine/protocol/wire/structures/Metadata';
import type { ViewableEquipment } from './predicateView';
import type { StatusEffect, StatusEffectChange, StatusEffectInput } from './StatusEffect';
import { effectHealthChange, tickStatusEffects } from './StatusEffectTick';
import { PORTAL_COOLDOWN_TICKS, PORTAL_TRANSITION_TICKS, PortalContact } from './PortalContact';
import type { PortalBlockRef } from '../world/portal/DimensionTravel';
import { portalRuleOf } from '../world/portal/rules';
import type { PortalRule } from '../world/portal/rules';
import {
    bedrockMobEffectId,
    mergeStatusEffect,
    normalizeStatusEffectId,
    removeStatusEffectFromMap
} from './StatusEffect';

/**
 * Re-exported so that `import { DamageCause } from './entity/Entity'` keeps resolving.
 *
 * It used to be declared here. It moved to a file of its own the moment `DamageSource` needed
 * both it and `Entity`, because leaving it here would have made the two modules import each
 * other at runtime - see `DamageCause.ts`.
 */
export { DamageCause };

/** Where {@link Entity.setPosition} moves an entity, and how clients should get there. */
export interface EntityPositionOptions {
    /** The new position; a bare `Vector3` keeps the entity's current world. */
    readonly position: Vector3;
    /** The new pitch, or the current one when left out. */
    readonly pitch?: number;
    /** The new yaw, or the current one when left out. */
    readonly yaw?: number;
    /** The new head yaw, or the current one when left out. */
    readonly headYaw?: number;
    /** Whether clients should snap to the new position instead of interpolating to it. */
    readonly teleport?: boolean;
}

/** What an entity's health tops out at when it has no health attribute to ask. */
const DEFAULT_MAX_HEALTH = 20;

/**
 * An entity class that can be built from a position and nothing else.
 *
 * What spawning by name needs. Looking a class up by its `MOB_ID` in the whole union of entity
 * constructors makes the options it accepts the *intersection* of theirs - so one entity that
 * takes an extra required argument, as a falling block takes the block it is, makes every by-name
 * spawn fail to compile even though none of them wants that entity.
 *
 * `writtenEntities()` in `Entities.ts` is the list of classes with this shape. Spawning by name
 * - a thrown egg, a dropped stack, anything restored from a save - looks there, and an entity
 * that cannot exist without more than a place to be is created directly by whatever knows the
 * rest.
 */
export type SpawnableEntityClass = (new (options: {
    position: Position;
    pitch?: number;
    yaw?: number;
    headYaw?: number;
}) => Entity) & { MOB_ID: string };

/**
 * The base class for all entities including `Player`.
 * @class
 * @public
 */
export class Entity {
    /**
     * TypeScript types `this.constructor` as `Function`. Declaring it as the class itself lets
     * {@link Entity.getType} read the static `MOB_ID` the subclass set. Emits nothing.
     */
    declare ['constructor']: typeof Entity;

    /**
     * The global runtime id counter.
     * @internal
     */
    public static runtimeIdCount = 0n;

    /**
     * The entity's namespace ID.
     */
    protected static MOB_ID: string = 'jsprismarine:unknown_entity';

    protected readonly runtimeId: bigint;
    protected readonly server: Server;

    /**
     * Where the entity is, and in which world.
     *
     * Held rather than inherited: an entity is not a point, it is a thing that has one. The
     * old arrangement had `Entity` extend `Position`, which forced the constructor to take
     * the shape of a position's - so an entity could not be built at a coordinate, and the
     * base was entered at `(0, 0, 0)` with a `// TODO` beside it. Everything restored from
     * disk therefore appeared at the origin.
     *
     * Private, and written only through {@link Entity.relocate}, so no write can miss the
     * world's entity index.
     */
    private position: Position;

    public pitch: number;
    public yaw: number;
    public headYaw: number;

    /**
     * Entity metadata.
     */
    public readonly metadata = new Metadata();

    /**
     * The `/tag` tags this entity carries - see {@link Entity.addTag}.
     *
     * Persisted in the actor's `Tags` list.
     */
    private readonly tags = new Set<string>();

    /**
     * Entity attributes.
     *
     * What is in it is decided by {@link Entity.getDefaultAttributes}, which subclasses
     * override - a player has a food bar, a cow does not.
     */
    public readonly attributes: Attributes;

    /**
     * Everything the world file said about this entity that the server does not model.
     *
     * Vanilla actor NBT carries a `definitions` list naming the behavior pack component groups
     * the entity was built from, along with its attributes, tags and variant. An actor written
     * back without them spawns broken or despawns on sight, so the remainder is kept here and
     * written out again by `EntitySerializer`. Null for an entity that was never read from disk.
     */
    public persistentNbt: NBTTagCompound | null = null;

    /**
     * What this entity is holding and wearing, by slot, with empty slots absent.
     *
     * Data-driven equipment affects both what the client draws and armor protection. A record
     * keeps the five positional armor slots together for `MobArmorEquipmentPacket`.
     */
    private equipment: ViewableEquipment = {};

    /** Active effects, shared with a data entity body when one owns this actor. */
    private readonly statusEffects = new Map<string, StatusEffect>();
    /** Ticks this entity has had effects ticked, which times an effect that never expires. */
    private statusEffectAge = 0;

    /**
     * Whether this entity is standing on something rather than being carried through the air.
     *
     * Named apart from `Player.onGround`, which is the client's own report of the same fact for
     * the entity it is controlling, and is set from its move packets rather than from the tick.
     */
    private grounded = false;

    /** Ticks left of the grace period after the last hit. Counted down in {@link Entity.update}. */
    protected invulnerableTicks = 0;

    /**
     * Ticks left before this entity may enter a portal again. Counted down in {@link Entity.update}.
     *
     * Set on departure, and wound back to its full length by every {@link Entity.touchPortal}
     * while it runs, so the destination portal only counts it down once the entity has stepped
     * out. Bedrock stores it as the actor's `PortalCooldown` tag, and the serializer carries it
     * through a save.
     */
    protected portalCooldown = 0;

    /**
     * The server tick a world last claimed this entity's update for; see {@link Entity.claimUpdate}.
     */
    private lastUpdatedTick = -1;

    /**
     * The portal this entity is standing in, or undefined when it is in none.
     *
     * Created by the first {@link Entity.touchPortal}, advanced each tick in {@link Entity.update},
     * and dropped once its time inside has decayed to nothing.
     */
    private portalContactState: PortalContact | undefined;

    /**
     * The size of the hit that started the current grace period.
     *
     * Kept because vanilla's rule is not "ignore everything for half a second" but "ignore
     * anything no worse than what you already took" - so a zombie punching a burning player
     * still lands, for the difference. The raw blow is stored, before armor: that is the number
     * the next hit is compared against.
     */
    protected lastDamageTaken = 0;

    /**
     * What last hurt this entity, for as long as anyone might ask.
     *
     * Read by the retaliation goals, and by the death message. Kept past the grace period on
     * purpose - a mob that is hit and then chased for ten seconds is still fighting whoever hit
     * it, not whoever it happens to be standing next to.
     */
    protected lastDamageSource: DamageSource | null = null;

    /**
     * Entity constructor.
     * @param {object} options - The entity options.
     * @param {Position} options.position - Where the entity is, and in which world.
     * @param {number} [options.pitch=0] - The pitch.
     * @param {number} [options.yaw=0] - The yaw.
     * @param {number} [options.headYaw=0] - The head yaw.
     * @param {Attribute[]} [options.attributes] - Initial attributes, or this entity's defaults when omitted.
     * @param {bigint} [options.runtimeId] - An id already drawn from the shared counter, or a new one when omitted.
     * @returns {Entity} The entity instance.
     * @remarks The server is taken from the position's world rather than passed alongside
     * it, so the two can never disagree about which server the entity belongs to.
     * @example
     * ```typescript
     * const world = server.getWorldManager().getDefaultWorld();
     * const entity = new Entity({ position: new Position(0, 64, 0, world) });
     * ```
     */
    public constructor({
        position,
        pitch = 0,
        yaw = 0,
        headYaw = 0,
        attributes,
        runtimeId
    }: {
        position: Position;
        pitch?: number;
        yaw?: number;
        headYaw?: number;
        attributes?: Attribute[];
        /**
         * An id already drawn from {@link Entity.runtimeIdCount}, for a body whose entity was
         * given its id elsewhere: a data-driven mob's runtime draws from the same counter, and
         * its body takes that id so the mob has one id rather than two.
         */
        runtimeId?: bigint;
    }) {
        if (runtimeId === undefined) {
            // Hot world and tracking indexes use Number(runtimeId), so refuse the first id that
            // cannot be represented exactly as a JavaScript number.
            if (Entity.runtimeIdCount >= BigInt(Number.MAX_SAFE_INTEGER)) {
                throw new RangeError('Entity runtime id counter exceeded Number.MAX_SAFE_INTEGER');
            }
            Entity.runtimeIdCount += 1n;
        }
        this.runtimeId = runtimeId ?? Entity.runtimeIdCount;
        this.position = position;
        this.server = position.getWorld().getServer();
        this.attributes = new Attributes(attributes ?? this.getDefaultAttributes());

        this.pitch = pitch;
        this.yaw = yaw;
        this.headYaw = headYaw;

        this.applySize();
    }

    /**
     * How big this entity is, in blocks.
     *
     * Read from the `minecraft:collision_box` of its type in the running content build rather
     * than from a table in this repository, so the one number is whatever the pack stack says.
     * @returns {EntityBox} The box, centered on the position and extending up from the feet.
     */
    public getBox(): EntityBox {
        return boxOf(this.server.getContent().entities.registry, this.getType());
    }

    /**
     * Tells the client how big this entity is.
     *
     * Safe to call from the constructor because {@link Entity.getType} reads a static, and statics
     * are already bound to the subclass while the base constructor runs. `GenericEntity` is the
     * exception and calls this again for itself - see there.
     */
    protected applySize(): void {
        const { width, height } = this.getBox();
        this.metadata.setBoundingBox(width, height);
    }

    /**
     * What this entity is holding, for whoever has to draw it.
     * @returns {Item | null} The item, or null for empty hands.
     */
    public getHeldItem(): Item | null {
        return this.equipment.mainhand ?? null;
    }

    /**
     * Puts something in this entity's hand.
     *
     * Stored rather than broadcast, because an entity is often given its item before it is in a
     * world and there is nobody to tell. Everyone who can see it is told when it is spawned to
     * them - see `PlayerSession.sendAddActor`.
     * @param {Item | null} item - What to hold.
     * @returns {this} The entity, so a caller can chain.
     */
    public setHeldItem(item: Item | null): this {
        return this.setEquipment({ ...this.equipment, mainhand: item ?? undefined });
    }

    /**
     * Replaces everything this entity is holding and wearing.
     *
     * Stored rather than broadcast, for the reason {@link Entity.setHeldItem} is. The two
     * places that put it on the wire are `PlayerSession.sendAddActor`, for a client being shown
     * the entity, and `WorldChangeSink.entityEquipmentChanged`, for one already holding it.
     * @param {ViewableEquipment} equipment - The new set, replacing the old one whole.
     * @returns {this} The entity, so a caller can chain.
     */
    public setEquipment(equipment: ViewableEquipment): this {
        this.equipment = equipment;
        return this;
    }

    /**
     * Whether this entity is standing on something.
     *
     * What `MoveActorAbsolutePacket`'s on-ground flag carries, and what the `is_on_ground`
     * predicate reads. False for anything nothing keeps the state for, which is every entity
     * but a data-driven mob and a player: a projectile in flight and a dropped item are both
     * drawn by the client from its own guess, as they were before the flag was sent at all.
     * @returns {boolean} Whether it is grounded.
     */
    public isOnGround(): boolean {
        return this.grounded;
    }

    /**
     * Records whether this entity is standing on something.
     *
     * Named apart from `Player.setOnGround`, which is the client reporting it for its own
     * entity and which also pays out the fall damage the landing earned. This one is the
     * server's own answer for an entity it is moving itself.
     * @param {boolean} grounded - Whether it is standing on something.
     * @returns {this} The entity, so a caller can chain.
     */
    public setGrounded(grounded: boolean): this {
        this.grounded = grounded;
        return this;
    }

    /**
     * The attributes this kind of entity has, used to build {@link Entity.attributes}.
     *
     * Called during construction, before subclass fields initialize, so it must not read any
     * instance state - it describes the type, not the individual.
     * @returns {Attribute[]} The attributes, freshly built.
     */
    protected getDefaultAttributes(): Attribute[] {
        return Attributes.getDefaults();
    }

    /**
     * Get the entity type.
     * @returns {string} The entity's namespace ID.
     * @example
     * ```typescript
     * const entityType = entity.getType();
     * console.log(`Entity type: ${entityType}`);
     * ```
     */
    public get [Symbol.toStringTag](): string {
        return `Entity(${this.toString()})`;
    }

    public getType(): string {
        return this.constructor.MOB_ID;
    }

    /**
     * Convert to a string representation.
     * @returns {string} The string.
     * ```typescript
     * console.log(entity.toString());
     * ```
     */
    public toString() {
        return `id: §a${this.getRuntimeId()}§r, name: §b${this.getName()}§r, type: §b${this.getType()}§r, ${this.position.toString()}`;
    }

    /**
     * Get the entity's runtime id.
     * @returns {bigint} The entity's runtime id.
     * @example
     * ```typescript
     * const entityId = entity.getRuntimeId();
     * console.log(entityId); // Ex. Output: 1n
     * ```
     */
    public getRuntimeId(): bigint {
        return this.runtimeId;
    }

    /**
     * Get the entity's position.
     * @returns {Position} Where the entity is, and in which world.
     * @remarks The stored position, not a copy. It is safe to hand out because a position
     * derives new instances instead of mutating itself, so a caller cannot move the entity
     * through it. Previously this built a fresh `Vector3` on every call - one allocation per
     * packet - and that vector had dropped the world, so `getWorld()` on it was unavailable.
     * @example
     * ```typescript
     * const position = entity.getPosition();
     * ```
     */
    public getPosition(): Position {
        return this.position;
    }

    /**
     * The actor's current velocity in blocks per tick, or zero when it has none.
     * @returns {Vector3} The actor's current velocity.
     */
    public getVelocity(): Vector3 {
        return Vector3.ZERO;
    }

    /**
     * Gets the world the entity is currently in.
     * @returns {World} The world.
     */
    public getWorld(): World {
        return this.position.getWorld();
    }

    /**
     * Returns the nearest entity from the current entity.
     * @todo Customizable radius
     * @param {Entity[]} [entities=this.getWorld().getEntities()] - The entities to compare the distance between.
     * @returns {Entity[]} The nearest entity.
     * @example
     * ```typescript
     * const nearestEntity = entity.getNearestEntity();
     * console.log('Nearest entity:', nearestEntity);
     * ```
     */
    public getNearestEntity(entities: Entity[] = this.getWorld().getEntities()): Entity[] {
        const distance = (a: Vector3, b: Vector3) =>
            Math.hypot(b.getX() - a.getX(), b.getY() - a.getY(), b.getZ() - a.getZ());

        const closest = (target: Vector3, points: Entity[], eps = 0.00001) => {
            const distances = points.map((e) => distance(target, e.getPosition()));
            const closest = Math.min(...distances);
            return points.find((_e, i) => distances[i]! - closest < eps)!;
        };

        return [
            closest(
                this.position,
                entities.filter((entity) => entity.getRuntimeId() !== this.runtimeId)
            )
        ];
    }

    /**
     * Fired every tick by the world.
     *
     * Subclasses that override this must call up, or the grace period after a hit never runs
     * down and the entity becomes permanently unhurtable after the first blow.
     * @param {number} _tick - The current world-tick.
     * @returns {Promise<void>} A promise that resolves when the update is complete.
     * @example
     * ```typescript
     * entity.update(10);
     * ```
     */
    public async update(_tick: number): Promise<void> {
        if (this.invulnerableTicks > 0) {
            this.invulnerableTicks--;

            // Forgotten with the timer, so the next hit is judged on its own rather than against
            // something that landed seconds ago.
            if (this.invulnerableTicks === 0) this.lastDamageTaken = 0;
        }

        this.processPortalCooldown();

        const contact = this.portalContactState;
        if (contact !== undefined) {
            const portal = contact.getPortal();
            const rule = portal === undefined ? undefined : portalRuleOf(portal.block);
            const ready = contact.tick(this.getPortalTransitionTicks(rule));
            if (ready && portal !== undefined) {
                // Spent either way: a trip that goes nowhere, an item with no portal on the
                // other side, starts over from the world's next touch rather than retrying
                // every tick from here.
                this.portalContactState = undefined;
                const travel = this.server.getDimensionTravel();
                const arrival = await travel.resolve(this, portal);
                if (arrival !== undefined) await travel.transfer(this, arrival);
            } else if (!ready && contact.hasExpired()) this.portalContactState = undefined;
        }

        await this.tickStatusEffects();
    }

    /**
     * Counts the portal cooldown down by one tick, as Java's `Entity.processPortalCooldown`.
     *
     * `Player` holds the count while its client is still loading into the last dimension
     * change, so the arrival portal is met with the full cooldown once the screen closes.
     */
    protected processPortalCooldown(): void {
        if (this.portalCooldown > 0) this.portalCooldown--;
    }

    /**
     * Ticks this entity has to stand in a portal before it goes through.
     *
     * Zero for everything that is not a player, as in vanilla: an item or a mob travels on the
     * first contact tick. `Player` answers from its game mode and the portal's own delays.
     * @param _rule - The rule of the portal the entity stands in, when known. A nether portal
     * holds a player for 80 ticks in survival and an end portal for none.
     * @returns The delay in ticks, from {@link PORTAL_TRANSITION_TICKS}.
     */
    public getPortalTransitionTicks(_rule?: PortalRule): number {
        return PORTAL_TRANSITION_TICKS.other;
    }

    /**
     * How long this entity refuses portals after a dimension change.
     *
     * Vanilla's `getDimensionChangingDelay`: 300 ticks for an entity, and `Player` overrides it
     * with 10.
     * @returns The cooldown in ticks, from {@link PORTAL_COOLDOWN_TICKS}.
     */
    public getDefaultPortalCooldown(): number {
        return PORTAL_COOLDOWN_TICKS.entity;
    }

    /**
     * Ticks left before this entity may enter a portal again.
     */
    public getPortalCooldown(): number {
        return this.portalCooldown;
    }

    /**
     * Starts the portal cooldown.
     *
     * Called on departure, and by the serializer when restoring a saved actor.
     * @param ticks - The cooldown in ticks. Defaults to {@link Entity.getDefaultPortalCooldown}.
     */
    public setPortalCooldown(ticks: number = this.getDefaultPortalCooldown()): void {
        this.portalCooldown = Math.max(0, Math.floor(ticks));
    }

    /**
     * Whether this entity is still refusing portals after a recent dimension change.
     */
    public isOnPortalCooldown(): boolean {
        return this.portalCooldown > 0;
    }

    /**
     * Claims this entity's one update of a server tick for the world asking.
     *
     * The level ticks its worlds one after another, and a portal trip moves an entity from
     * the world being ticked into one that is ticked later in the same pass. That world finds
     * the arrival in its roster and would update it a second time. The first world claims the
     * tick before updating; the second sees the claim and leaves the entity for the next tick.
     *
     * @param tick - The server's tick counter.
     * @returns True the first time a world asks for a given tick, false for every later ask.
     */
    public claimUpdate(tick: number): boolean {
        if (this.lastUpdatedTick === tick) return false;
        this.lastUpdatedTick = tick;
        return true;
    }

    /**
     * The portal this entity is currently in contact with, if any.
     */
    public portalContact(): PortalContact | undefined {
        return this.portalContactState;
    }

    /**
     * Records that this entity overlaps a portal block on the current tick.
     *
     * The world calls this once per tick for each entity whose box overlaps a portal. The first
     * call opens the contact; later calls refresh it. A touch while on cooldown opens nothing
     * and winds the cooldown back to its full length instead, as Java's
     * `Entity.setAsInsidePortal` does, so an entity that has just arrived only travels again
     * after it has left the portal for the whole cooldown and stepped back in.
     * @param at - Where the entity stands, kept as the contact's entry position.
     * @param portal - The portal block overlapped, which the trip is resolved from. Without
     * one the contact counts but never travels.
     */
    public touchPortal(at: Vector3, portal?: PortalBlockRef): void {
        if (this.isOnPortalCooldown()) {
            this.setPortalCooldown();
            return;
        }

        this.portalContactState ??= new PortalContact(at);
        this.portalContactState.touch(at, portal);
    }

    /**
     * Whether other entities are kept out of the space this one is in.
     *
     * False for nearly everything, and deliberately: an arrow in flight, an item on the floor and
     * a painting on the wall are all things you walk through, and shoving a mob aside for them
     * would be both wrong and expensive. `Human` overrides it, which is what shoves a mob out of
     * a player's way.
     * @returns {boolean} Whether this entity displaces others.
     */
    public occupiesSpace(): boolean {
        return false;
    }

    /**
     * The world height the bottom of this entity's body sits at.
     *
     * The same as its position for everything the server moves itself, and deliberately a method
     * rather than a read of `position.getY()` at each call site: a player's position is not its
     * feet - see `Human` - so any comparison of one body against another has to go through this.
     * @returns {number} Where the body starts, in world coordinates.
     */
    public getFeetY(): number {
        return this.position.getY();
    }

    /**
     * Whether the world should include this entity in saved actor records.
     *
     * Most entities survive a world save. A data-driven entity can opt out
     * with Bedrock's `minecraft:transient` component.
     * @returns Whether this entity should be persisted.
     */
    public shouldPersist(): boolean {
        return true;
    }

    /**
     * The entity's health, out of {@link Entity.getMaxHealth}.
     *
     * Health is an attribute, not a field beside one: it is the same number the client draws
     * its hearts from, so there is nowhere for the two to disagree.
     * @returns {number} The health.
     */
    public getHealth(): number {
        return this.attributes.getValue(AttributeIds.Health);
    }

    /**
     * The most health this entity can have.
     * @returns {number} The maximum health.
     */
    public getMaxHealth(): number {
        return this.attributes.getAttribute(AttributeIds.Health)?.getMax() ?? DEFAULT_MAX_HEALTH;
    }

    /**
     * Whether the entity has any health left.
     * @returns {boolean} `true` while it is alive.
     */
    public isAlive(): boolean {
        return this.getHealth() > 0;
    }

    /**
     * The active effects this entity currently carries.
     * @returns A snapshot of the active effect instances.
     */
    public getStatusEffects(): readonly StatusEffect[] {
        return [...this.statusEffectMap().values()];
    }

    /**
     * Reads one active effect by its namespaced id or bare Bedrock effect name.
     * @param {string} identifier - The effect name.
     * @returns The active effect, or undefined when it is absent.
     */
    public getStatusEffect(identifier: string): StatusEffect | undefined {
        return this.statusEffectMap().get(normalizeStatusEffectId(identifier));
    }

    /**
     * Whether one status effect is active.
     * @param {string} identifier - The effect name.
     * @returns Whether it is active.
     */
    public hasStatusEffect(identifier: string): boolean {
        return this.getStatusEffect(identifier) !== undefined;
    }

    /**
     * Applies or refreshes a status effect.
     *
     * A stronger Bedrock effect replaces the weaker one. An equal-strength effect only replaces
     * the current value when it lasts longer or changes its visible state.
     *
     * @param input - The effect and its duration, potency, and display flags.
     * @param notify - Whether to send an effect packet for an accepted change.
     * @returns Whether the effect changed.
     */
    public addStatusEffect(input: StatusEffectInput, notify = true): boolean {
        const id = normalizeStatusEffectId(input.id);
        if (bedrockMobEffectId(id) === undefined || !this.acceptsStatusEffect(id)) return false;
        const effects = this.statusEffectMap();
        const change = mergeStatusEffect(effects, input);
        if (change === undefined) return false;
        const effect = effects.get(id);
        if (effect !== undefined && notify) this.announceStatusEffect(effect, change);
        return true;
    }

    /**
     * Removes one status effect.
     * @param {string} identifier - The effect name.
     * @param {boolean} [notify=true] - Whether to send a removal packet.
     * @returns Whether an active effect was removed.
     */
    public removeStatusEffect(identifier: string, notify = true): boolean {
        const effects = this.statusEffectMap();
        const previous = removeStatusEffectFromMap(effects, identifier);
        if (previous === undefined) return false;

        if (notify) this.announceStatusEffect(previous, 'remove');
        return true;
    }

    /**
     * Removes every active status effect.
     * @param {boolean} [notify=true] - Whether to send a removal packet for each effect.
     * @returns The number of effects cleared.
     */
    public clearStatusEffects(notify = true): number {
        let cleared = 0;
        for (const effect of this.getStatusEffects()) {
            if (this.removeStatusEffect(effect.id, notify)) cleared += 1;
        }
        return cleared;
    }

    /**
     * Set the entity's health, killing it if that leaves it at zero.
     * @param {number} health - The wanted health; clamped to the attribute's bounds.
     * @param {DamageCause | DamageSource} [source=DamageCause.Generic] - What to report as the
     * cause if this kills it.
     */
    public async setHealth(health: number, source: DamageCause | DamageSource = DamageCause.Generic): Promise<void> {
        const alive = this.isAlive();
        const before = this.getHealth();
        this.attributes.setValue(AttributeIds.Health, health);
        logLegacyWrite(this, 'health', before, this.getHealth());

        // Only on the transition: something that is already dead does not die again, and
        // health being set to zero twice should not run a death twice.
        if (alive && !this.isAlive()) {
            // Recorded as the last damage source, so a kill written straight onto the health -
            // `/kill` - reaches whoever asks what did it with its real cause, the way a blow
            // through `damage` already does.
            const damageSource = DamageSource.of(source);
            this.lastDamageSource = damageSource;
            await this.onDeath(damageSource);
        }
    }

    /**
     * Hurt the entity.
     *
     * The whole pipeline, in vanilla's order: grace period, then the cancellable event, then
     * armor and its enchantments, then resistance, then absorption, and only what is left of
     * all that comes off the health.
     *
     * Takes a bare {@link DamageCause} as readily as a full {@link DamageSource}, which is what
     * let the attacker be threaded through without touching any of the call sites - falling,
     * drowning and starving never had one and still do not need one.
     *
     * The blow commits before the returned promise first waits: the health, the grace period,
     * the death and the advancement triggers are written by the time this returns, and the
     * promise covers only the packets. The entity store hands a mob's blow on a player to this
     * without awaiting it, and the commit lands inside the blow that caused it.
     * @param {number} amount - Half-hearts of damage, before any reduction. Ignored if not positive.
     * @param {DamageCause | DamageSource} [source=DamageCause.Generic] - What did it, and who.
     * @returns {Promise<boolean>} `true` if the blow landed.
     * @example
     * ```typescript
     * await player.damage(2, DamageCause.Drowning);
     * await zombie.damage(7, DamageSource.entity(player));
     * ```
     */
    public async damage(amount: number, source: DamageCause | DamageSource = DamageCause.Generic): Promise<boolean> {
        if (amount <= 0 || !this.isAlive()) return false;

        const damageSource = DamageSource.of(source);

        // Vanilla's grace rule, and it is not simply "ignore everything for half a second": a
        // harder blow than the one still running gets through, for the difference. That is what
        // makes swinging a better weapon at a freshly-hit target worth doing, and what stops
        // standing in a cactus from being fatal in a fifth of a second.
        const fresh = this.invulnerableTicks <= 0 || damageSource.bypassesInvulnerability();
        if (!fresh && amount <= this.lastDamageTaken) return false;

        const event = new EntityDamageEvent(this, amount, damageSource);
        this.server.post(['entityDamage', event]);
        if (event.isCanceled()) return false;

        const raw = event.getAmount();
        if (raw <= 0) return false;

        // Raw blows are what the grace period compares, before armor: it is measuring how hard
        // something hit, not how well this entity happened to be dressed for it.
        const landed = fresh ? raw : raw - this.lastDamageTaken;
        this.lastDamageTaken = raw;
        this.lastDamageSource = damageSource;

        const taken = this.absorb(this.mitigate(landed, damageSource));

        // The flash, the shove and the timer belong to the hit that started the grace period.
        // A follow-up that only lands the difference is not a second hit to look at.
        const sends: Promise<void>[] = [];
        if (fresh) {
            this.invulnerableTicks = INVULNERABILITY_TICKS;

            // Both, and they are not the same thing: the flash is the client's own animation and
            // makes no noise, so health arriving as a smaller number with only the event sent was
            // a silent hit.
            sends.push(this.getWorld().sendActorEvent(this, ActorEvent.HURT_ANIMATION));
            sends.push(this.getWorld().sendActorSound(this, LevelSoundEvent.HURT));

            this.knockbackFrom(damageSource);
        }

        // Started, not awaited, so the health and a death commit before this method waits.
        sends.push(this.setHealth(this.getHealth() - taken, damageSource));

        // After the health, so that a criterion asking how hurt the player is
        // sees the answer this blow produced. Both numbers go, because Java's
        // `DamagePredicate` compares `dealt` before armor and `taken` after and
        // a criterion may name either.
        advancementDamage(this, damageSource, landed, taken, false);
        await Promise.all(sends);
        return true;
    }

    /**
     * What armor, enchantments and effects leave of a blow.
     *
     * Split out so a subclass can change how well something is protected without reimplementing
     * the order the reductions happen in - see {@link Damage.reduceDamage} for why that order is
     * load-bearing.
     * @param {number} amount - The raw blow.
     * @param {DamageSource} source - What did it, which decides what gets skipped.
     * @returns {number} What reaches the health.
     */
    protected mitigate(amount: number, source: DamageSource): number {
        return reduceDamage(amount, {
            defensePoints: this.getArmorDefensePoints(),
            toughness: this.getArmorToughness(),
            enchantmentProtection: this.getEnchantmentProtection(source),
            resistance: this.getResistanceLevel(),
            bypassesArmor: source.bypassesArmor(),
            bypassesEnchantments: source.bypassesEnchantments()
        });
    }

    /**
     * Spends the absorption attribute before the health.
     *
     * Extra hearts sit in front of the real ones and are not restored when they run out, which
     * is what makes a golden apple a one-off rather than a bigger health bar.
     * @param {number} amount - What got past the armor.
     * @returns {number} What is left for the health to take.
     */
    private absorb(amount: number): number {
        const absorption = this.attributes.getValue(AttributeIds.Absorption);
        if (absorption <= 0 || amount <= 0) return amount;

        const absorbed = Math.min(absorption, amount);
        this.setAttributeValue(AttributeIds.Absorption, absorption - absorbed);

        return amount - absorbed;
    }

    /**
     * Works out which way the blow pushes, and how hard, then hands it to
     * {@link Entity.applyKnockback}.
     *
     * The resistance attribute is spent here rather than in each override, so an iron golem is
     * as hard to shove whether a player punched it or an arrow hit it.
     * @param {DamageSource} source - What did it; environmental sources push nobody.
     */
    protected knockbackFrom(source: DamageSource): void {
        const origin = source.getKnockbackOrigin();
        if (!origin) return;

        const shove = knockbackOf({
            target: { x: this.position.getX(), z: this.position.getZ() },
            origin: { x: origin.getX(), z: origin.getZ() },
            resistance: this.attributes.getValue(AttributeIds.KnockbackResistence),
            levels: source.knockbackLevels,
            tieBreak: Number(this.runtimeId % 8n)
        });
        if (shove !== undefined) this.applyKnockback(shove.directionX, shove.directionZ, shove.strength, shove.damping);
    }

    /**
     * Shove this entity away from whatever hit it.
     *
     * A no-op here, because the base entity has no velocity to shove. The two things that do
     * override it, and they could hardly differ more: the body of a data-driven entity hands
     * the impulse to the entity behind it and lets the runtime carry it, while a `Player` has
     * to be *asked* - a player's position comes from their own client, so a server that moved
     * them would be overruled on the next movement packet and read as rubber-banding.
     * @param {number} _directionX - Unit vector away from the blow, x.
     * @param {number} _directionZ - Unit vector away from the blow, z.
     * @param {number} _strength - How hard, with knockback resistance already taken off.
     * @param {number} [_damping=SINGLE_DAMPING] - How much of the existing motion survives.
     */
    public applyKnockback(
        _directionX: number,
        _directionZ: number,
        _strength: number,
        _damping: number = SINGLE_DAMPING
    ): void {}

    /** Applies a world-space impulse to an entity with a movement owner. */
    public applyImpulse(_impulse: EntityPosition): void {}

    /** Armor points worn by this actor. */
    public getArmorDefensePoints(): number {
        return wornArmorOf(this.getEquipment()).defensePoints;
    }

    /** Armor toughness worn, which softens what a hard blow does to that armor. */
    public getArmorToughness(): number {
        return wornArmorOf(this.getEquipment()).toughness;
    }

    /**
     * What this entity is wearing and holding, by equipment slot.
     *
     * A `Human` overrides it from the armor container, the hand and the off hand. A store
     * entity's actor answers from the store's equipment.
     */
    public getEquipment(): ViewableEquipment {
        return this.equipment;
    }

    /**
     * The properties this actor sends alongside its metadata.
     *
     * Most entities do not have data-driven properties. Data-driven entity bodies override
     * this with their current client-synced values.
     * @returns The actor's current property snapshot.
     */
    public getSyncedProperties(): SyncedProperties {
        return new SyncedProperties();
    }

    /**
     * The summed Enchantment Protection Factor of whatever is worn.
     *
     * Run out of the `minecraft:damage_protection` components of the
     * enchantments actually on the armor, so Protection, Fire Protection,
     * Blast Protection, Projectile Protection and Feather Falling each decide
     * for themselves whether this blow is one they answer - through the
     * `damage_source_properties` condition each of their files carries. This
     * was a literal zero, which made the whole Protection family inert.
     *
     * @param {DamageSource} source - What did the damage, and who.
     * @returns {number} The factor, capped later by the damage formula.
     */
    protected getEnchantmentProtection(source: DamageSource): number {
        return enchantmentProtection({
            content: this.server.getContent(),
            victim: this,
            equipment: this.getEquipment(),
            source
        });
    }

    /** The Resistance effect's level, or zero when it is absent. */
    protected getResistanceLevel(): number {
        const resistance = this.getStatusEffect('minecraft:resistance');
        return resistance === undefined ? 0 : resistance.amplifier + 1;
    }

    /** The map a live data-driven body shares with its component runtime. */
    protected statusEffectMap(): Map<string, StatusEffect> {
        return this.statusEffects;
    }

    /** Whether the active entity definition allows an effect. */
    protected acceptsStatusEffect(_identifier: string): boolean {
        return true;
    }

    /** Ticks this entity's status effects, and tells clients when one expires. */
    private async tickStatusEffects(): Promise<void> {
        this.statusEffectAge++;
        await tickStatusEffects({
            effects: this.statusEffectMap(),
            age: this.statusEffectAge,
            apply: async (effect, clock) => this.applyStatusEffectTick(effect, clock),
            remove: (id) => this.removeStatusEffect(id)
        });
    }

    /**
     * What one effect does this tick. Health effects are handled here; a subclass adds the ones
     * that belong to it, such as a player's hunger, and calls up.
     * @param effect - The effect as it stands, with its duration before this tick.
     * @param clock - What its repeat interval counts; see {@link effectHealthChange}.
     */
    protected async applyStatusEffectTick(effect: StatusEffect, clock: number): Promise<void> {
        const change = effectHealthChange(effect.id, effect.amplifier, clock, this.getHealth(), this.getMaxHealth());
        if (change === undefined) return;

        if (change.kind === 'heal') await this.heal(change.amount);
        else await this.damage(change.amount, change.cause);
    }

    /** Announces one accepted effect change to the world's network sink. */
    private announceStatusEffect(effect: StatusEffect, change: StatusEffectChange): void {
        void this.getWorld()
            .sendStatusEffect(this, effect, change)
            .catch((error: unknown) => this.server.getLogger().error(error));
    }

    /**
     * What last hurt this entity, if anything has.
     *
     * How a mob knows who to fight back against, and how a death is reported as the work of
     * somebody rather than of nothing in particular.
     * @returns {DamageSource | null} The last source, or null if it has never been hurt.
     */
    public getLastDamageSource(): DamageSource | null {
        return this.lastDamageSource;
    }

    /** Whether the entity is still inside the grace period after a hit. */
    public isInvulnerableToHits(): boolean {
        return this.invulnerableTicks > 0;
    }

    /**
     * Heal the entity, up to its maximum.
     * @param {number} amount - Half-hearts to restore. Ignored if not positive.
     * @returns {Promise<boolean>} `true` if any health was actually restored.
     */
    public async heal(amount: number): Promise<boolean> {
        if (amount <= 0 || !this.isAlive()) return false;

        const before = this.getHealth();
        const healed = this.attributes.addValue(AttributeIds.Health, amount);
        logLegacyWrite(this, 'health', before, this.getHealth());
        return healed;
    }

    /**
     * Called once, when the entity's health reaches zero.
     *
     * Subclasses that override this have to call up, or nothing will hear the death.
     * @param {DamageSource} source - What killed it, and who is answerable for it.
     */
    protected async onDeath(source: DamageSource): Promise<void> {
        this.server.post(['entityDeath', new EntityDeathEvent(this, source)]);

        // Raised from both sides of the kill: Java has one trigger for the
        // killer and another for the victim, and a player killed by a player
        // raises both.
        advancementKill(this, source);
    }

    /**
     * Get the server instance.
     * @returns {Server} The server instance.
     * @example
     * ```typescript
     * const server = entity.getServer();
     * // Do things with the server.
     * ```
     */
    public getServer(): Server {
        return this.server;
    }

    /**
     * Whether this entity announces its own movement to clients.
     *
     * A client-controlled entity does: its session broadcasts each move with the movement
     * type that produced it, and a generic position packet layered on top would fight that.
     * Everything else leaves the announcing to the position setters below.
     * @returns {boolean} `true` if the entity broadcasts its own moves.
     * @internal
     */
    protected broadcastsOwnMovement(): boolean {
        return false;
    }

    /**
     * How far clients follow this entity, in chunks.
     *
     * Per type rather than one number for everything, which is how vanilla does it: a client
     * is told about players as far as it can see, ordinary mobs a little less far, and dropped
     * items less far still. Items are the reason the distinction matters - they are by far the
     * most numerous entity and the least interesting at a distance, so a single radius means a
     * mob farm streams thousands of them to everyone in range.
     *
     * Always narrowed by the recipient's own view distance, so this can never widen an
     * audience past the terrain that client actually holds.
     * @returns {number} The tracking radius in chunks.
     */
    public getTrackingRange(): number {
        return 8;
    }

    /**
     * Ticks between visibility passes for this entity.
     *
     * Only governs entities approaching a *standing* player: a player who moves crosses a
     * chunk boundary and forces a pass regardless. Things that never move on their own can
     * afford a long interval.
     * @returns {number} The interval in ticks.
     */
    public getTrackingInterval(): number {
        return 3;
    }

    /**
     * Shows this entity to one client.
     *
     * The entity names the call that represents it and nothing more: it builds no packet and
     * does not go looking for an audience. Deciding who is shown what belongs to the world,
     * and what that looks like on the wire belongs to the session.
     *
     * A subclass overrides this when it appears as something other than a generic actor -
     * which is why this is a method and not a type test inside the session.
     * @param {PlayerSession} session - The client to show it to.
     * @returns {Promise<void>} A promise that resolves once the client has been told.
     */
    public async spawnTo(session: PlayerSession): Promise<void> {
        await session.sendAddActor(this);
    }

    /**
     * Takes this entity off one client.
     * @param {PlayerSession} session - The client to remove it from.
     * @returns {Promise<void>} A promise that resolves once the client has been told.
     */
    public async despawnFrom(session: PlayerSession): Promise<void> {
        await session.sendRemoveActor(this);
    }

    /**
     * Moves the entity, and refiles it in the entity index of the world it is now in.
     *
     * The one place a position is written after construction, so a query later in the same
     * tick sees the entity where it moved to, whether or not the move is announced (ADR 0007).
     * Synchronous on purpose: the refile happens before anything else can run.
     * @param {Position} position - Where the entity now is.
     * @internal
     */
    protected relocate(position: Position): void {
        const before = this.position;
        this.position = position;
        position.getWorld().entityRelocated(this, before);
    }

    /**
     * Moves the entity without telling a client. Only the entity store's undo calls this,
     * through the legacy adapter, to write a logged position back.
     * @param {Position} position - The position to put back.
     */
    public restorePosition(position: Position): void {
        this.relocate(position);
    }

    /**
     * Sets one attribute's value, clamped to its bounds. A player logs the write.
     * @param {string} name - The attribute's namespaced id.
     * @param {number} value - The wanted value.
     * @returns {boolean} `true` if the value changed.
     */
    public setAttributeValue(name: string, value: number): boolean {
        return this.attributes.setValue(name, value);
    }

    /**
     * Writes a logged value back to a field this entity logs besides its position and health,
     * such as a player's food. Only the entity store's undo calls this, through the legacy adapter.
     * @param {string} _field - The field an entry names.
     * @param {PlainData} _value - The value to put back.
     * @returns {boolean} Whether this entity logs a field of that name. A plain entity logs none.
     */
    public restoreLoggedField(_field: string, _value: PlainData): boolean {
        return false;
    }

    /**
     * Writes a logged value back to one slot of a container this entity carries, such as a
     * player's armor. Only the entity store's undo calls this, through the legacy adapter.
     * @param {string} _container - The container an entry names.
     * @param {number} _slot - The slot.
     * @param {PlainData} _value - The stack to put back, or null for an empty slot.
     * @returns {boolean} Whether this entity has that slot. A plain entity carries no container.
     */
    public restoreLoggedSlot(_container: string, _slot: number, _value: PlainData): boolean {
        return false;
    }

    /**
     * Set the `x` position.
     * @param {number} x - The `x` coordinate.
     * @param {boolean} [suppress=false] - If true, the client won't be notified about the position change.
     * @returns {Promise<void>} A promise that resolves when the x position is set.
     * @example
     * ```typescript
     * await entity.setX(10);
     * ```
     * @remarks This method will also send the position update to the client if `suppress` is `false`.
     * The test read the flag the wrong way round, so it notified only when asked not to -
     * which, since nothing passed the flag, meant an entity could be moved anywhere without a
     * single client hearing about it.
     */
    public async setX(x: number, suppress = false): Promise<void> {
        this.relocate(this.position.withX(x));
        if (!suppress && !this.broadcastsOwnMovement()) await this.getWorld().broadcastMove(this);
    }

    /**
     * Set the `y` position.
     * @param {number} y - The `y` coordinate.
     * @param {boolean} [suppress=false] - If true, the client won't be notified about the position change.
     * @returns {Promise<void>} A promise that resolves when the y position is set.
     * @example
     * ```typescript
     * await entity.setY(10);
     * ```
     * @remarks This method will also send the position update to the client if `suppress` is `false`.
     */
    public async setY(y: number, suppress = false): Promise<void> {
        this.relocate(this.position.withY(y));
        if (!suppress && !this.broadcastsOwnMovement()) await this.getWorld().broadcastMove(this);
    }

    /**
     * Set the `z` position.
     * @param {number} z - The `z` coordinate.
     * @param {boolean} [suppress=false] - If true, the client won't be notified about the position change.
     * @returns {Promise<void>} A promise that resolves when the z position is set.
     * @example
     * ```typescript
     * await entity.setZ(10);
     * ```
     * @remarks This method will also send the position update to the client if `suppress` is `false`.
     */
    public async setZ(z: number, suppress = false): Promise<void> {
        this.relocate(this.position.withZ(z));
        if (!suppress && !this.broadcastsOwnMovement()) await this.getWorld().broadcastMove(this);
    }

    /**
     * Set the entity's position and notify the clients.
     * @param {object} options - The position options.
     * @param {Vector3} options.position - The position.
     * @param {number} [options.pitch] - The pitch.
     * @param {number} [options.yaw] - The yaw.
     * @param {number} [options.headYaw] - The head yaw.
     * @param {boolean} [options.teleport] - Whether clients should snap to the new position.
     * @returns {Promise<void>} A promise that resolves when the position is set.
     * @throws {RangeError} When a coordinate is NaN or infinite. The entity stays where it was,
     * since a position like that cannot be encoded for the client anyway.
     * @remarks A bare `Vector3` is taken to mean the same world the entity is already in;
     * moving between worlds goes through the world change on `Player`, not through here.
     */
    public async setPosition({
        position,
        pitch = this.pitch,
        yaw = this.yaw,
        headYaw = this.headYaw,
        teleport = false
    }: EntityPositionOptions): Promise<void> {
        const coordinates = [position.getX(), position.getY(), position.getZ()];
        if (!coordinates.every(Number.isFinite))
            throw new RangeError(`Cannot move ${this.getName()} to a non-finite position (${coordinates.join(', ')})`);

        this.pitch = pitch;
        this.yaw = yaw;
        this.headYaw = headYaw;

        this.relocate(
            position instanceof Position ? position : Position.fromVector3(position, this.position.getWorld())
        );

        await this.getWorld().broadcastMove(this, teleport);
    }

    /**
     * Get the entity's (potentially custom) name.
     * @returns {string} The entity's name without formatting (usually prefix & suffix).
     * @example
     * ```typescript
     * const name = entity.getName();
     * console.log(`Entity name: ${name}`);
     * ```
     */
    public getName(): string {
        return this.getFormattedUsername();
    }

    /**
     * Set the entity's name.
     * @param {string} name - The name.
     * @example
     * ```typescript
     * entity.setName('Mr. Sheep');
     * ```
     */
    public setName(name: string): void {
        this.metadata.setNameTag(name);
    }

    /**
     * Adds one of `/tag`'s arbitrary string tags.
     *
     * Java's `/tag` is exactly this and nothing more: a set of strings on the
     * entity that `@e[tag=...]` tests and nothing else reads. The Bedrock
     * client has no notion of it, so it never reaches the wire.
     * @param {string} tag - The tag.
     * @returns {boolean} `true` when the entity did not already carry it.
     */
    public addTag(tag: string): boolean {
        if (this.tags.has(tag)) return false;

        this.tags.add(tag);
        return true;
    }

    /**
     * Removes one of `/tag`'s tags.
     * @param {string} tag - The tag.
     * @returns {boolean} `true` when the entity carried it.
     */
    public removeTag(tag: string): boolean {
        return this.tags.delete(tag);
    }

    /** The `/tag` tags this entity carries, in the order they were added. */
    public getTags(): readonly string[] {
        return [...this.tags];
    }

    /**
     * Get the entity's formatted name.
     * @returns {string} The entity's formatted name (including prefix & suffix).
     * @example
     * ```typescript
     * const formattedName = entity.getFormattedUsername();
     * console.log(`Entity formatted name: ${formattedName}`); // Entity formatted name: Sheep
     * ```
     */
    public getFormattedUsername(): string {
        return (
            this.metadata.getString(MetadataFlag.NAMETAG) ||
            // Replace all '_' with a ' ' and capitalize each word afterwards,
            // should probably be replaced with regex.
            (this.getType() || 'Unknown Entity')
                .split(':')[1]!
                .replaceAll('_', ' ')
                .split(' ')
                .map((word) => word[0]!.toUpperCase() + word.slice(1, word.length))
                .join(' ')
        );
    }
}
