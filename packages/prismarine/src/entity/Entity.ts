import { Vector3 } from '@jsprismarine/math';
import type { Item } from '../item/Item';
import { LevelSoundEvent } from '@jsprismarine/minecraft';
import type { NBTTagCompound } from '@jsprismarine/nbt';
import type Server from '../Server';
import type PlayerSession from '../network/PlayerSession';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import { ActorEvent } from '../network/packet/ActorEventPacket';
import { SyncedProperties } from '../network/type/SyncedProperties';
import type { Attribute } from './Attribute';
import { AttributeIds, Attributes } from './Attribute';
import { reduceDamage } from './Damage';
import { DamageCause } from './DamageCause';
import { DamageSource } from './DamageSource';
import EntityDamageEvent from '../events/entity/EntityDamageEvent';
import EntityDeathEvent from '../events/entity/EntityDeathEvent';
import { advancementDamage, advancementKill } from '../advancement/triggers';
import { enchantmentProtection } from '../enchantment/mitigation';
import type { EntityBox } from './data/facts';
import { boxOf } from './data/facts';
import { Metadata, MetadataFlag } from './Metadata';
import type { ViewableEquipment } from './predicateView';
import type { StatusEffect, StatusEffectChange, StatusEffectInput } from './StatusEffect';
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

/** What an entity's health tops out at when it has no health attribute to ask. */
const DEFAULT_MAX_HEALTH = 20;

/**
 * Ticks of grace after a hit lands, during which a weaker one is ignored.
 *
 * Half a second, as in vanilla, and it is what stops a mob standing in a cactus from dying in
 * a fifth of a second - or two players from trading twenty hits a second. A harder blow still
 * gets through while it runs; see {@link Entity.damage}.
 */
const INVULNERABILITY_TICKS = 10;

/** The shove a plain hit gives, before sprint or enchantments add to it. */
const BASE_KNOCKBACK = 0.4;

/** What each level of sprint-or-Knockback adds on top. */
const KNOCKBACK_PER_LEVEL = 0.5;

/**
 * How much of what an entity was already doing survives a shove.
 *
 * Vanilla halves the existing horizontal motion for each `knockback` call it makes - one for a
 * plain hit, two for a sprint hit, since the attack adds its own on top of the one being hurt
 * already gave. Two halvings leave a quarter, which is why a sprint hit both throws harder *and*
 * cancels more of the run the target was making.
 */
const SINGLE_DAMPING = 0.5;
const COMPOUND_DAMPING = 0.25;

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
     */
    protected position: Position;

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
    public readonly attributes: Attributes = new Attributes(this.getDefaultAttributes());

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
        headYaw = 0
    }: {
        position: Position;
        pitch?: number;
        yaw?: number;
        headYaw?: number;
    }) {
        Entity.runtimeIdCount += 1n;
        this.runtimeId = Entity.runtimeIdCount;
        this.position = position;
        this.server = position.getWorld().getServer();

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
     * Called during field initialization, so it must not read any instance state - it
     * describes the type, not the individual.
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

        this.tickStatusEffects();
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
        this.attributes.setValue(AttributeIds.Health, health);

        // Only on the transition: something that is already dead does not die again, and
        // health being set to zero twice should not run a death twice.
        if (alive && !this.isAlive()) await this.onDeath(DamageSource.of(source));
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
        if (fresh) {
            this.invulnerableTicks = INVULNERABILITY_TICKS;

            // Both, and they are not the same thing: the flash is the client's own animation and
            // makes no noise, so health arriving as a smaller number with only the event sent was
            // a silent hit.
            await this.getWorld().sendActorEvent(this, ActorEvent.HURT_ANIMATION);
            await this.getWorld().sendActorSound(this, LevelSoundEvent.HURT);

            this.knockbackFrom(damageSource);
        }

        await this.setHealth(this.getHealth() - taken, damageSource);

        // After the health, so that a criterion asking how hurt the player is
        // sees the answer this blow produced. Both numbers go, because Java's
        // `DamagePredicate` compares `dealt` before armor and `taken` after and
        // a criterion may name either.
        advancementDamage(this, damageSource, landed, taken, false);
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
        this.attributes.setValue(AttributeIds.Absorption, absorption - absorbed);

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

        const resistance = Math.min(1, Math.max(0, this.attributes.getValue(AttributeIds.KnockbackResistence)));
        const base = BASE_KNOCKBACK * (1 - resistance);
        const bonus = source.knockbackLevels * KNOCKBACK_PER_LEVEL * (1 - resistance);

        // Vanilla shoves *twice* for a sprint hit and once for a plain one, and each shove halves
        // whatever the last one left before adding its own. One combined impulse of `0.4 + 0.5`
        // is not the same thing and is noticeably stronger - it sent a sheep half again as far as
        // vanilla does. Composed here rather than issued as two calls because a player is *sent*
        // their knockback, and two packets in one tick would only overwrite each other.
        const strength = bonus > 0 ? base / 2 + bonus : base;
        const damping = bonus > 0 ? COMPOUND_DAMPING : SINGLE_DAMPING;
        if (strength <= 0) return;

        let dx = this.position.getX() - origin.getX();
        let dz = this.position.getZ() - origin.getZ();
        let distance = Math.hypot(dx, dz);

        if (distance < Number.EPSILON) {
            // Standing exactly inside whatever hit it. Any direction will do so long as it is
            // the same one each time, or the shove would jitter - the runtime id gives that
            // for free.
            const angle = (Number(this.runtimeId % 8n) / 8) * Math.PI * 2;
            dx = Math.cos(angle);
            dz = Math.sin(angle);
            distance = 1;
        }

        this.applyKnockback(dx / distance, dz / distance, strength, damping);
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

    /** Armor points worn by this actor. */
    public getArmorDefensePoints(): number {
        const equipment = this.getEquipment();
        return (
            (equipment.head?.getArmorDefensePoints() ?? 0) +
            (equipment.chest?.getArmorDefensePoints() ?? 0) +
            (equipment.legs?.getArmorDefensePoints() ?? 0) +
            (equipment.feet?.getArmorDefensePoints() ?? 0) +
            (equipment.body?.getArmorDefensePoints() ?? 0)
        );
    }

    /** Armor toughness worn, which softens what a hard blow does to that armor. */
    public getArmorToughness(): number {
        const equipment = this.getEquipment();
        return (
            (equipment.head?.getArmorToughness() ?? 0) +
            (equipment.chest?.getArmorToughness() ?? 0) +
            (equipment.legs?.getArmorToughness() ?? 0) +
            (equipment.feet?.getArmorToughness() ?? 0) +
            (equipment.body?.getArmorToughness() ?? 0)
        );
    }

    /**
     * What this entity is wearing and holding, by equipment slot.
     *
     * Data-driven entities mirror equipment tables and interactions here. A `Human` overrides
     * it from the armor container, the hand and the off hand.
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

    /** Counts down finite effects and tells clients when one expires. */
    private tickStatusEffects(): void {
        for (const effect of this.getStatusEffects()) {
            if (effect.durationTicks < 0) continue;
            if (effect.durationTicks <= 1) {
                this.removeStatusEffect(effect.id);
                continue;
            }
            this.statusEffectMap().set(effect.id, { ...effect, durationTicks: effect.durationTicks - 1 });
        }
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

        return this.attributes.addValue(AttributeIds.Health, amount);
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
        this.position = this.position.withX(x);
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
        this.position = this.position.withY(y);
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
        this.position = this.position.withZ(z);
        if (!suppress && !this.broadcastsOwnMovement()) await this.getWorld().broadcastMove(this);
    }

    /**
     * Set the entity's position and notify the clients.
     * @param {object} options - The position options.
     * @param {Vector3} options.position - The position.
     * @param {number} [options.pitch] - The pitch.
     * @param {number} [options.yaw] - The yaw.
     * @param {number} [options.headYaw] - The head yaw.
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
        headYaw = this.headYaw
    }: {
        position: Vector3;
        pitch?: number;
        yaw?: number;
        headYaw?: number;
    }): Promise<void> {
        const coordinates = [position.getX(), position.getY(), position.getZ()];
        if (!coordinates.every(Number.isFinite))
            throw new RangeError(`Cannot move ${this.getName()} to a non-finite position (${coordinates.join(', ')})`);

        this.pitch = pitch;
        this.yaw = yaw;
        this.headYaw = headYaw;

        this.position =
            position instanceof Position ? position : Position.fromVector3(position, this.position.getWorld());

        await this.getWorld().broadcastMove(this);
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
