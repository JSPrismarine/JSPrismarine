import type { Vector3 } from '@jsprismarine/math';
import { LevelSoundEvent } from '@jsprismarine/minecraft';
import type { NBTTagCompound } from '@jsprismarine/nbt';
import type Server from '../Server';
import type PlayerSession from '../network/PlayerSession';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import { ActorEvent } from '../network/packet/ActorEventPacket';
import type { Attribute } from './Attribute';
import { AttributeIds, Attributes } from './Attribute';
import { reduceDamage } from './Damage';
import { DamageCause } from './DamageCause';
import { DamageSource } from './DamageSource';
import EntityDamageEvent from '../events/entity/EntityDamageEvent';
import EntityDeathEvent from '../events/entity/EntityDeathEvent';
import { sizeOf } from './EntitySize';
import { Metadata, MetadataFlag } from './Metadata';

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
 * The base class for all entities including `Player`.
 * @class
 * @public
 */
/**
 * An entity class that can be built from a position and nothing else.
 *
 * What spawning by name needs. Looking a class up by its `MOB_ID` gives TypeScript the whole union
 * of entity constructors, and the options it will accept are then the *intersection* of theirs - so
 * one entity that takes an extra required argument, as a falling block takes the block it is,
 * makes every by-name spawn fail to compile even though none of them wants that entity.
 *
 * The cast this type exists for is sound for what actually uses it - villagers, animals, and mobs
 * restored from a save - and would not be for an entity that cannot exist without more than a
 * place to be. Those are created directly by whatever knows the rest.
 */
export type SpawnableEntityClass = (new (options: {
    position: Position;
    pitch?: number;
    yaw?: number;
    headYaw?: number;
}) => Entity) & { MOB_ID: string };

export class Entity {
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
     * Entity attributes.
     *
     * What is in it is decided by {@link Entity.getDefaultAttributes}, which subclasses
     * override - a player has a food bar, a cow does not.
     */
    public readonly attributes: Attributes = new Attributes(this.getDefaultAttributes());

    /**
     * Everything the world file said about this entity that the server does not model.
     *
     * Vanilla actor NBT carries a `definitions` list naming the behaviour pack component groups
     * the entity was built from, along with its attributes, tags and variant. An actor written
     * back without them spawns broken or despawns on sight, so the remainder is kept here and
     * written out again by `EntitySerializer`. Null for an entity that was never read from disk.
     */
    public persistentNbt: NBTTagCompound | null = null;

    /** Ticks left of the grace period after the last hit. Counted down in {@link Entity.update}. */
    protected invulnerableTicks = 0;

    /**
     * The size of the hit that started the current grace period.
     *
     * Kept because vanilla's rule is not "ignore everything for half a second" but "ignore
     * anything no worse than what you already took" - so a zombie punching a burning player
     * still lands, for the difference. The raw blow is stored, before armour: that is the number
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
        this.runtimeId = Entity.runtimeIdCount += 1n;
        this.position = position;
        this.server = position.getWorld().getServer();

        this.pitch = pitch;
        this.yaw = yaw;
        this.headYaw = headYaw;

        this.applySize();
    }

    /**
     * Tells the client how big this entity is.
     *
     * Safe to call from the constructor because {@link Entity.getType} reads a static, and statics
     * are already bound to the subclass while the base constructor runs. `GenericEntity` is the
     * exception and calls this again for itself - see there.
     */
    protected applySize(): void {
        const { width, height } = sizeOf(this.getType());
        this.metadata.setBoundingBox(width, height);
    }

    /**
     * The attributes this kind of entity has, used to build {@link Entity.attributes}.
     *
     * Called during field initialisation, so it must not read any instance state - it
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
    public getType(): string {
        return (this.constructor as any).MOB_ID;
    }

    public get [Symbol.toStringTag](): string {
        return `Entity(${this.toString()})`;
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
        if (this.invulnerableTicks <= 0) return;

        this.invulnerableTicks--;

        // Forgotten with the timer, so the next hit is judged on its own rather than against
        // something that landed seconds ago.
        if (this.invulnerableTicks === 0) this.lastDamageTaken = 0;
    }

    /**
     * Whether other entities are kept out of the space this one is in.
     *
     * False for nearly everything, and deliberately: an arrow in flight, an item on the floor and
     * a painting on the wall are all things you walk through, and shoving a mob aside for them
     * would be both wrong and expensive. Living things override it - see `Mob` and `Human` - which
     * is what stops a herd from standing inside itself.
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
     * armour and its enchantments, then resistance, then absorption, and only what is left of
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
        if (event.isCancelled()) return false;

        const raw = event.getAmount();
        if (raw <= 0) return false;

        // Raw blows are what the grace period compares, before armour: it is measuring how hard
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
        return true;
    }

    /**
     * What armour, enchantments and effects leave of a blow.
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
     * @param {number} amount - What got past the armour.
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
            // the same one each time, or the shove would jitter - the runtime id gives that for
            // free, which is the trick `Mob.pushFromNeighbours` already uses.
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
     * override it, and they could hardly differ more: a `Mob` writes its own velocity and lets
     * the physics carry it, while a `Player` has to be *asked* - a player's position comes from
     * their own client, so a server that moved them would be overruled on the next movement
     * packet and read as rubber-banding.
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

    /** Armour points worn. Nothing but a player wears any, yet. */
    public getArmorDefensePoints(): number {
        return 0;
    }

    /** Armour toughness worn, which softens what a hard blow does to that armour. */
    public getArmorToughness(): number {
        return 0;
    }

    /**
     * The summed Enchantment Protection Factor of whatever is worn.
     * @param {DamageSource} _source - What did the damage, since Fire and Blast Protection only
     * count against the thing they name.
     * @returns {number} The factor, capped later by the damage formula.
     */
    protected getEnchantmentProtection(_source: DamageSource): number {
        return 0;
    }

    /** The level of the Resistance effect. Zero until there is an effect system. */
    protected getResistanceLevel(): number {
        return 0;
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
            (((this.constructor as any)?.MOB_ID as string) || 'Unknown Entity')
                .split(':')[1]!
                .replaceAll('_', ' ')
                .split(' ')
                .map((word) => word[0]!.toUpperCase() + word.slice(1, word.length))
                .join(' ')
        );
    }
}
