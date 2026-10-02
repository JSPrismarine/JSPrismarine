import { Vector3 } from '@jsprismarine/math';
import { LevelSoundEvent } from '@jsprismarine/minecraft';
import { randomOf } from '../block/DropTable';
import type { Item } from '../item/Item';
import { ActorEvent } from '../network/packet/ActorEventPacket';
import { GameRules } from '../world/GameRuleManager';
import { Position } from '../world/Position';
import { Attribute, AttributeIds, Attributes } from './Attribute';
import { DamageCause } from './DamageCause';
import type { DamageSource } from './DamageSource';
import { scaleForDifficulty } from './Difficulty';
import { Entity } from './Entity';
import { FALL_GRACE, isAllowed } from './Environment';
import { freshEnvironment, tickEnvironment } from './MobEnvironment';
import { type EntitySize, sizeOf } from './EntitySize';
import { lootOf } from './LootTables';
import { MetadataFlag } from './Metadata';
import { statsOf } from './MobStats';
import BlockView, { STEP_HEIGHT } from './ai/BlockView';
import { wanderingBrain } from './ai/Brains';
import type GoalSelector from './ai/GoalSelector';
import { PathFollower, findPath } from './ai/Navigator';
import { WALK_SPEED } from './ai/Speed';

/**
 * A living thing that moves under its own steam.
 *
 * Everything here exists to answer one requirement: that mobs move fluidly rather than in jerks.
 * A server that decides "the mob is now one block north" and tells the client so produces exactly
 * the stuttering everyone recognises, and no amount of work on the client can hide it. Smooth
 * movement has to be smooth on the server first, which means three things, all of them here:
 *
 * - **Velocity, not teleportation.** A mob has a speed and a heading, integrated every tick into a
 *   fraction of a block. Its position between two waypoints is a real position it actually passed
 *   through, not an interpolation between two decisions.
 * - **Acceleration, not switching.** The velocity chases the desired velocity rather than being
 *   assigned it, so a mob leans into a turn over several ticks. Instantly reversing a mob's heading
 *   is what makes it look mechanical even when the positions themselves are smooth.
 * - **A turn rate.** Facing chases the heading at a few degrees per tick, taking the short way
 *   round. A mob that snaps to face its destination is the other half of the same problem.
 *
 * The route the mob follows is straightened and looked ahead along - see `Navigator` - so the
 * curve it steers through has no corners in it to be smoothed out in the first place.
 */

/**
 * How much of last tick's velocity is carried into this one.
 *
 * The whole of the acceleration model, in one number. Each tick the horizontal velocity becomes
 * `v * smoothing + desired * (1 - smoothing)`, which is an exponential approach: the mob reaches
 * about two thirds of a new speed in three ticks and effectively all of it in ten, so a change of
 * direction is a lean rather than a switch.
 *
 * Deliberately one number rather than an acceleration and a separate friction. Applying both makes
 * the steady state some fraction of the desired velocity instead of the desired velocity itself -
 * so `walkSpeed` would no longer be the speed the mob actually walks at, and every constant derived
 * from it would quietly be wrong.
 */
const GROUND_SMOOTHING = 0.72;

/** The same in mid air, where a mob has much less say in where it is going. */
const AIR_SMOOTHING = 0.92;

/** Blocks per tick squared. Vanilla's is 0.08, and mobs here fall at the same rate. */
const GRAVITY = 0.08;

/** Air resistance, applied to vertical speed so falls reach a terminal velocity. */
const DRAG = 0.98;

/**
 * The upward speed a jump is worth, in blocks per tick. Vanilla's.
 *
 * Against {@link GRAVITY} and {@link DRAG} it produces an arc peaking at 1.252 blocks, which is
 * what makes a one-block step climbable at all - and only just, so anything that spends part of
 * the impulse before it is integrated takes the peak under 1 and stops mobs climbing entirely.
 */
export const JUMP_POWER = 0.42;

/**
 * The most a blow can lift a mob off its feet.
 *
 * Vanilla's cap, and it is what makes knockback a shove rather than a launch: without it a mob
 * hit while already rising would have the blow's lift added to whatever it had, and a zombie
 * caught mid-jump would sail. The cap applies to the total, not to the blow.
 */
const KNOCKBACK_LIFT = 0.4;

/** Below this, a mob is standing still - and standing still exactly matters for staying put. */
const REST_SPEED = 0.003;

/** The most a mob turns in one tick, in degrees - a full circle in a second at twenty ticks. */
const TURN_RATE = 18;

/** The head turns faster than the body, since a mob can glance at something without facing it. */
const HEAD_TURN_RATE = 30;

/** How far a mob may be pushed out of a wall in one tick, to recover from being stuck inside one. */
const UNSTICK_SPEED = 0.2;

/**
 * How far past its own front a mob looks for something to jump, in blocks.
 *
 * Added to the half-width, so it is a distance from the *body* and not from the position. A jump
 * decided from the centre is a jump decided too late for anything but a point: a sheep is 0.9
 * across, so by the time its centre is a fraction from the wall its shoulders are already in it.
 */
const PROBE_REACH = 0.25;

/** How hard entities shove each other apart, per block of overlap, in blocks per tick. */
const PUSH_STRENGTH = 0.08;

/** The most one tick of shoving may add, so a pile-up cannot fire the mob at the bottom of it. */
const MAX_PUSH = 0.1;

/**
 * How many ticks of no progress before a route is abandoned.
 *
 * Mobs get wedged - on a fence post, in a doorway, against another mob - and a mob pressed into a
 * corner forever is worse than one that gives up and wanders off.
 */
const STUCK_TICKS = 40;

/**
 * How long a corpse stays before it is taken away.
 *
 * The client plays its own death animation - the mob rolls over and fades - and takes about a
 * second to do it. Removing the entity the moment its health hit zero deleted it mid-roll, so a
 * killed mob simply vanished. Vanilla's twenty ticks.
 */
const DEATH_TICKS = 20;

/**
 * How long a mob keeps after something it can no longer reach.
 *
 * Five seconds, and it is what stops a target from being either instantly forgotten or never
 * dropped. Without a memory a mob that lost sight of you for one tick went straight back to
 * wandering; without a limit it would follow you across the world for ever. The countdown only
 * runs while the target is out of range, so being chased is not a five second reprieve.
 */
const TARGET_MEMORY_TICKS = 100;

/** How far past its follow range a mob will keep after something before losing interest. */
const TARGET_PURSUIT_MARGIN = 8;

export class Mob extends Entity {
    /** Blocks per tick. Horizontal components are steered; the vertical one is gravity's. */
    protected velocity = new Vector3(0, 0, 0);

    protected onGround = false;

    /** Where the mob is trying to go this tick, in blocks per tick. Set by goals, spent by physics. */
    private desiredVelocity = new Vector3(0, 0, 0);

    /**
     * A blow waiting to be turned into motion, spent by the next {@link Mob.applyPhysics}.
     *
     * Held rather than written straight onto the velocity because a hit does not arrive on the
     * mob's schedule: it can come from a goal mid-tick, or from a packet handler outside the tick
     * altogether. Written directly, a blow that landed after the physics had already run would
     * spend the next tick being smoothed away before it was ever integrated - so a mob hit while
     * charging barely moved. Queued, every blow is spent at the same point in the tick, next to
     * the shove from neighbours and for the same reason.
     */
    private pendingKnockback: { impulse: Vector3; damping: number } | null = null;

    /**
     * Ticks left of the death animation, or -1 while the mob is alive.
     *
     * A mob is not removed the instant its health runs out: the client needs the time to play the
     * roll-over, and something has to hold the entity in the world while it does.
     */
    private deathTicks = -1;

    /**
     * What this mob is currently fighting, or following, or running from.
     *
     * Held on the mob rather than inside a goal, because several goals need the same answer: one
     * picks the target, another walks to it and a third swings at it. A target private to the goal
     * that found it would have to be rediscovered by each of the others, and they would drift
     * apart the moment one of them changed its mind.
     */
    private target: Entity | null = null;

    /** Ticks the target has spent out of range. Reset whenever it comes back into it. */
    private targetTicks = 0;

    /** Burning, drowning and the interval clock - see `MobEnvironment`. */
    private readonly environment = freshEnvironment();

    /**
     * What the mob is holding, if anything.
     *
     * Purely what the client draws: nothing here reads it to decide how hard the mob hits, which
     * comes from the attack attribute. But a skeleton with no bow in its hand fires arrows from an
     * empty fist, and that reads as a bug rather than as an attack.
     */
    private heldItem: Item | null = null;

    /**
     * How far the mob has fallen since it was last on the ground.
     *
     * Unlike a player's, which has to be added up from the positions their client reports, this
     * comes straight out of the velocity - the server simulates a mob's fall, so it knows.
     */
    private fallDistance = 0;

    /** What the mob wants to be looking at, if anything. */
    private lookTarget: Vector3 | null = null;

    /** Whether a goal has already said where to go this tick - see {@link steerTowards}. */
    private steeredThisTick = false;

    /**
     * Built on first use rather than in the constructor.
     *
     * {@link createGoals} is meant to be overridden, and a subclass's own field initialisers do not
     * run until after `super()` has returned - so a brain built in the constructor would be built
     * from a half-initialised mob. By the first tick everything exists.
     */
    private brain: GoalSelector | null = null;

    protected readonly view: BlockView;
    protected readonly follower = new PathFollower();

    /**
     * The box this mob occupies, from `EntitySize`.
     *
     * Read from the table rather than declared per species, so the size the world is collided
     * against and the size the client is told are the same number by construction. They used not
     * to be: every entity announced itself as a player-sized `0.6 x 1.8` while the server treated
     * it as a point, and a sheep could therefore bury half of itself in a wall.
     *
     * Resolved here rather than in the constructor because `getType` reads a static, which is
     * already bound to the subclass while the base constructor runs.
     */
    private readonly size: EntitySize = sizeOf(this.getType());

    /** How wide the mob is, in blocks. Its body reaches half of this either side of its position. */
    protected get bodyWidth(): number {
        return this.size.width;
    }

    /** How tall the mob is, in blocks, measured up from its feet. */
    protected get bodyHeight(): number {
        return this.size.height;
    }

    /**
     * Whether this mob is here on purpose, and so must not be tidied away.
     *
     * The spawner removes mobs nobody is near, which is what keeps a long walk from filling the
     * world with everything that has ever been beside a player. A village's villagers, a mob
     * restored from the save file, and anything a player has named are not the spawner's to remove:
     * they were put there by something that meant it.
     */
    private persistent = false;

    /**
     * Blocks per tick at a walk, and the speed the mob actually settles at.
     *
     * Exactly the settled speed, not an upper bound on it: the velocity model approaches the
     * desired velocity rather than damping it, so what is written here is what gets walked.
     */
    protected walkSpeed: number = WALK_SPEED;

    /** The speed the route in hand is being walked at, which a goal may set faster than a walk. */
    private movementSpeed: number = WALK_SPEED;

    private ticksWithoutProgress = 0;
    private lastProgressPosition: Vector3;

    /** What was last sent to clients, so an unchanged mob costs no packets. */
    private broadcastPosition: Vector3;
    private broadcastYaw = 0;
    private broadcastHeadYaw = 0;
    private broadcastPitch = 0;

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
        super({ position, pitch, yaw, headYaw });

        this.view = new BlockView(position.getWorld());
        this.lastProgressPosition = position;
        this.broadcastPosition = position;
        this.broadcastYaw = yaw;
        this.broadcastHeadYaw = headYaw;
        this.broadcastPitch = pitch;
    }

    /**
     * What this kind of mob wants to do, in priority order.
     *
     * The one method a mob subclass normally overrides. `Brains` has the usual sets; a mob with
     * something particular to do adds its own goals to one of them.
     * @returns {GoalSelector} The mob's goals.
     */
    protected createGoals(): GoalSelector {
        return wanderingBrain();
    }

    /** This mob's goals, built on first use. */
    public getGoals(): GoalSelector {
        this.brain ??= this.createGoals();
        return this.brain;
    }

    /**
     * The base attributes, with this species' own figures written over them.
     *
     * Runs during `Entity`'s field initialisation - before this class's own fields exist - so it
     * reads nothing but the type, which is a static and is already bound to the subclass. That is
     * the same guarantee `applySize` relies on.
     * @returns {Attribute[]} The attributes, freshly built.
     */
    protected override getDefaultAttributes(): Attribute[] {
        const stats = statsOf(this.getType());

        return Attributes.getDefaults().map((attribute) => {
            switch (attribute.getName()) {
                case AttributeIds.Health:
                    return Mob.withStat(attribute, stats.health, stats.health);
                case AttributeIds.AttackDamage:
                    return Mob.withStat(attribute, attribute.getMax(), stats.attackDamage);
                case AttributeIds.KnockbackResistence:
                    return Mob.withStat(attribute, attribute.getMax(), stats.knockbackResistance);
                case AttributeIds.FollowRange:
                    return Mob.withStat(attribute, attribute.getMax(), stats.followRange);
                default:
                    return attribute;
            }
        });
    }

    /**
     * One default attribute with a new ceiling and starting value.
     *
     * Rebuilt rather than assigned into, because an attribute's bounds are readonly - a mob with
     * a hundred health needs the *maximum* raised, not just the value, or it would be clamped
     * straight back down to twenty.
     */
    private static withStat(attribute: Attribute, max: number, value: number): Attribute {
        return new Attribute({ name: attribute.getName(), min: attribute.getMin(), max, def: value });
    }

    public getVelocity(): Vector3 {
        return this.velocity;
    }

    /**
     * Queues the shove a blow gives, to be spent by the next {@link Mob.applyPhysics}.
     *
     * A mob is the easy half of knockback: it has a velocity of its own and the physics here will
     * carry it, stop it against walls and let gravity bring it back down. The hard half is the
     * player, whose position is theirs and not the server's - see `Player.applyKnockback`.
     *
     * The lift is capped against the *total*, not against the blow, so a mob hit while already
     * rising is not launched by the two adding up.
     * @param {number} directionX - Unit vector away from the blow, x.
     * @param {number} directionZ - Unit vector away from the blow, z.
     * @param {number} strength - How hard, with knockback resistance already taken off.
     * @param {number} [damping=0.5] - How much of the mob's own motion survives - see `Entity`.
     */
    public override applyKnockback(directionX: number, directionZ: number, strength: number, damping = 0.5): void {
        const lift = this.onGround
            ? Math.min(KNOCKBACK_LIFT, this.velocity.getY() * damping + strength)
            : this.velocity.getY();

        this.pendingKnockback = { impulse: new Vector3(directionX * strength, lift, directionZ * strength), damping };
    }

    public isOnGround(): boolean {
        return this.onGround;
    }

    public getBlockView(): BlockView {
        return this.view;
    }

    /**
     * This mob's own pace, before any goal's multiplier.
     *
     * Goals scale this rather than carrying absolute speeds, so a species that is quicker than
     * average is quicker at everything it does - which is how vanilla expresses it too, and means
     * tuning one number moves the whole mob rather than half of it.
     * @returns {number} Blocks per tick.
     */
    public getWalkSpeed(): number {
        return this.walkSpeed;
    }

    public getFollower(): PathFollower {
        return this.follower;
    }

    /** Whether the mob spawner may remove this mob when nobody is near - see {@link persistent}. */
    public isPersistent(): boolean {
        return this.persistent;
    }

    /** Marks this mob as one that stays. */
    public setPersistent(persistent = true): this {
        this.persistent = persistent;
        return this;
    }

    /**
     * Points the mob at somewhere to walk.
     *
     * The route is planned once and then followed. It is deliberately *not* re-planned on a timer:
     * a search is the most expensive thing a mob does, and for the overwhelmingly common case - a
     * mob strolling to a spot that is not going anywhere - re-planning every second is a full A\*
     * per mob per second to arrive at the same answer. Enough mobs doing that at once makes the
     * tick run late, and a late tick is visible as stuttering whatever the movement model does.
     *
     * A goal chasing something that moves calls this again itself, which is where the knowledge
     * that the target has moved actually lives.
     * @param {Vector3} destination - Where to go.
     * @param {number} [speed] - Blocks per tick; the mob's walking speed by default.
     * @returns {boolean} `false` when there is no route, which is a normal answer.
     */
    public moveTo(destination: Vector3, speed = this.walkSpeed): boolean {
        const path = findPath(this.view, this.getPosition(), destination, {
            height: this.bodyHeight,
            width: this.bodyWidth
        });
        if (!path) return false;

        this.follower.setPath(path);
        this.movementSpeed = speed;
        this.ticksWithoutProgress = 0;
        this.lastProgressPosition = this.getPosition();

        return true;
    }

    /** Whether the mob is currently walking a route. */
    public isMoving(): boolean {
        return !this.follower.isDone();
    }

    /** Abandons the current route and coasts to a halt. */
    public stopMoving(): void {
        this.follower.clear();
        this.desiredVelocity = new Vector3(0, 0, 0);
    }

    /** Turns the head towards a point for this tick. Cleared each tick, so goals must keep asking. */
    public lookAt(target: Vector3): void {
        this.lookTarget = target;
    }

    /**
     * Pushes the mob in a direction for this tick, without a route.
     *
     * For the things that are a direction rather than a destination - being shoved, drifting in a
     * current, backing away from something - where planning a path would be both wasted work and
     * the wrong shape of answer. Like {@link lookAt} it lasts one tick, so a goal that means it has
     * to keep asking; that is what lets it take precedence over a route without having to cancel
     * one, and hand control straight back when it stops.
     * @param {number} dx - Direction on x; the length is ignored, only the heading is used.
     * @param {number} dz - Direction on z.
     * @param {number} [speed] - Blocks per tick to aim for.
     */
    public steerTowards(dx: number, dz: number, speed = this.walkSpeed): void {
        const length = Math.hypot(dx, dz);
        this.steeredThisTick = true;

        this.desiredVelocity =
            length < 1e-6 ? new Vector3(0, 0, 0) : new Vector3((dx / length) * speed, 0, (dz / length) * speed);
    }

    /**
     * One tick: decide, then move, then tell anyone watching.
     *
     * The order matters. Goals run first and only ever express intent - a destination, something to
     * look at - and never move the mob themselves. Physics then turns that intent into an actual
     * position. Keeping the two apart is what stops a goal from teleporting a mob and undoing
     * everything this class exists to do.
     */
    public override async update(tick: number): Promise<void> {
        // Before the chunk check below, so the grace period after a hit keeps running down for a
        // mob standing in an unloaded chunk. It would otherwise be unhurtable for as long as
        // nobody was looking at it.
        await super.update(tick);

        // Before the chunk check too. A mob whose target has died must let go of it whether or not
        // anybody is watching - otherwise it holds a reference to a corpse for as long as the area
        // stays unloaded, and picks the fight back up with a dead thing when it returns.
        this.tickTarget();

        // Also before it, and for the same kind of reason: a dead mob has no goals to run and no
        // physics worth running, and one that died in a chunk that then unloaded would otherwise
        // never reach the end of its animation and never be taken away.
        if (this.deathTicks >= 0) {
            await this.tickDeath();
            return;
        }

        // A mob whose chunk is not in memory has nothing to walk on: every block around it reads as
        // solid, so it would wedge itself and thrash against walls that are not there. Standing
        // still until the area is loaded again is both the correct answer and the cheap one.
        const position = this.getPosition();
        if (!this.view.isLoaded(Math.floor(position.getX()), Math.floor(position.getZ()))) return;

        this.getGoals().tick(this);

        this.followPath();
        this.applyPhysics();
        this.turnTowardsMotion();
        this.steeredThisTick = false;

        // After the physics, so both judge where the mob *ended up* rather than where it set off
        // from: a mob that walked into lava this tick burns this tick, and one that landed this
        // tick is charged for the drop this tick.
        await this.tickFall();
        await tickEnvironment(this, this.environment);

        await this.broadcastIfMoved();
    }

    /**
     * Adds up the drop, and charges for it on landing.
     *
     * Straight out of the velocity, which is the one thing a mob has and a player does not: a
     * player's movement is their own client's and has to be reconstructed from position reports,
     * while a mob's fall is simulated right here.
     */
    private async tickFall(): Promise<void> {
        if (!this.onGround) {
            // Only the downward part. Rising resets it, so a jump is measured from its peak rather
            // than from the ground it started on.
            const climb = this.velocity.getY();
            if (climb > 0) this.fallDistance = 0;
            else this.fallDistance -= climb;

            return;
        }

        const fallen = this.fallDistance;
        this.fallDistance = 0;

        if (fallen <= FALL_GRACE || !isAllowed(this.getWorld(), DamageCause.Fall)) return;

        // Landing in water, or on anything else that breaks a fall, costs nothing.
        const position = this.getPosition();
        if (this.landedOnSomethingSoft(position)) return;

        await this.damage(Math.floor(fallen - FALL_GRACE), DamageCause.Fall);
    }

    /** Whether what the mob came to rest in, or on, is something that breaks a fall. */
    private landedOnSomethingSoft(position: Position): boolean {
        const x = Math.floor(position.getX());
        const z = Math.floor(position.getZ());
        const feet = Math.floor(this.getFeetY());

        // The block it is standing *in* as well as the one below: water breaks a fall from inside
        // it, and a hay bale from on top of it.
        return this.view.breaksAFall(x, feet, z) || this.view.breaksAFall(x, feet - 1, z);
    }

    /**
     * What happens when a mob runs out of health.
     *
     * The mob stops being a mob: its goals are stopped so nothing keeps steering a corpse, and it
     * stands still for the length of the client's death animation before it is taken away and
     * leaves whatever it was carrying.
     * @param {DamageSource} source - What killed it, and who is answerable for it.
     */
    protected override async onDeath(source: DamageSource): Promise<void> {
        await super.onDeath(source);

        this.deathTicks = DEATH_TICKS;

        this.stopMoving();
        this.getGoals().stopAll(this);

        await this.getWorld().sendActorEvent(this, ActorEvent.DEATH_ANIMATION);
        await this.getWorld().sendActorSound(this, LevelSoundEvent.DEATH);
    }

    /** Whether the mob is dead and running out its animation. */
    public isDying(): boolean {
        return this.deathTicks >= 0;
    }

    /** What the mob is holding, for whoever has to draw it. */
    public getHeldItem(): Item | null {
        return this.heldItem;
    }

    /**
     * Puts something in the mob's hand.
     *
     * Set in the subclass constructor rather than broadcast from here, because at construction
     * time the mob is not in a world yet and there is nobody to tell. Everyone who can see it is
     * told when it is spawned to them - see `PlayerSession.sendAddActor`.
     * @param {Item | null} item - What to hold.
     * @returns {this} The mob, so a constructor can chain.
     */
    public setHeldItem(item: Item | null): this {
        this.heldItem = item;
        return this;
    }

    /**
     * Whether the mob is drawing or holding its item - the client's pose comes from this.
     *
     * Sent only on the change, because it is asked for every tick a bow is held and the packet
     * carries the entity's whole metadata each time.
     * @param {boolean} usingItem - Whether the item is up.
     */
    public setUsingItem(usingItem: boolean): void {
        if (this.metadata.getDataFlag(MetadataFlag.INDEX, BigInt(MetadataFlag.USINGITEM)) === usingItem) return;

        this.metadata.setUsingItem(usingItem);

        this.server
            .getLogger()
            .verbose(
                `${this.getType()} ${this.getRuntimeId()} ${usingItem ? 'raised' : 'lowered'} its item`,
                'Mob/setUsingItem'
            );

        // Reported rather than dropped. This is a fire-and-forget send in the middle of a goal's
        // synchronous tick, so a failure here has nowhere to be thrown to - and a silently
        // swallowed one looks exactly like a client that is ignoring the flag.
        this.getWorld()
            .sendActorMetadata(this)
            .catch((error: unknown) => this.server.getLogger().error(error));
    }

    /** How far this mob notices things, in blocks. */
    public getFollowRange(): number {
        return this.attributes.getValue(AttributeIds.FollowRange);
    }

    /**
     * Half-hearts one of this mob's blows is worth, scaled for the difficulty.
     *
     * Scaled here rather than in the attribute, so the number a plugin reads off a zombie is the
     * zombie's own and not one that silently depends on a server setting.
     * @returns {number} The damage, before the target's armour.
     */
    public getAttackDamage(): number {
        return scaleForDifficulty(
            this.attributes.getValue(AttributeIds.AttackDamage),
            this.server.getConfig().getDifficulty()
        );
    }

    /** What this mob is fighting, following or fleeing, if anything. */
    public getTarget(): Entity | null {
        return this.target;
    }

    /**
     * Points the mob at something, or at nothing.
     * @param {Entity | null} target - What to go after.
     */
    public setTarget(target: Entity | null): void {
        const changed = this.target !== target;

        this.target = target;
        this.targetTicks = 0;

        if (changed) this.publishTarget();
    }

    /**
     * Tells every watching client what this mob is attacking.
     *
     * The client needs it to pose the mob at all. Mojang's skeleton animation controller enters
     * its attack state on `query.has_target`, and reads that from this metadata field - so a
     * skeleton whose target the client has not been told about keeps its bow at its side no
     * matter what else the server sends. It was the missing half of the bow animation.
     */
    private publishTarget(): void {
        this.metadata.setTargetEntityId(this.target?.getRuntimeId() ?? 0n);

        // Reported rather than dropped: this is fire-and-forget from inside a goal's synchronous
        // tick, so a failure has nowhere to be thrown to, and a swallowed one is indistinguishable
        // from a client that is ignoring the field.
        this.getWorld()
            .sendActorMetadata(this)
            .catch((error: unknown) => this.server.getLogger().error(error));
    }

    /**
     * Drops a target that is dead, gone, or has been out of reach for long enough.
     *
     * Done here rather than in the goal that chose it, because every goal that reads the target
     * would otherwise have to repeat the same checks - and a target that had died would be walked
     * to by one goal while another had already given up on it.
     */
    private tickTarget(): void {
        const target = this.target;
        if (!target) return;

        if (!target.isAlive() || target.getWorld() !== this.getWorld()) {
            this.setTarget(null);
            return;
        }

        const reach = this.attributes.getValue(AttributeIds.FollowRange) + TARGET_PURSUIT_MARGIN;
        const from = this.getPosition();
        const at = target.getPosition();

        // Flat distance: a player on a roof two blocks up is not further away in any sense the
        // mob cares about, and counting the height would have it lose interest looking upwards.
        if (Math.hypot(at.getX() - from.getX(), at.getZ() - from.getZ()) <= reach) {
            this.targetTicks = 0;
            return;
        }

        if (++this.targetTicks >= TARGET_MEMORY_TICKS) this.setTarget(null);
    }

    /** Counts the animation down, then drops what the mob was carrying and removes it. */
    private async tickDeath(): Promise<void> {
        if (this.deathTicks > 0) {
            this.deathTicks--;
            return;
        }

        // Before the removal, so the drops are made while the mob still knows where it is - and
        // marked spent first, so a second tick arriving during the await cannot drop them twice.
        this.deathTicks = -1;

        await this.dropLoot();
        await this.getWorld().removeEntity(this);
    }

    /**
     * Leaves behind whatever this kind of mob leaves behind.
     *
     * Rolled through the same {@link DropTable} a block's drops go through, because they are the
     * same problem: a declarative table that can be read against the game beats a `Math.random()`
     * buried in a method per species.
     */
    private async dropLoot(): Promise<void> {
        const world = this.getWorld();

        const [enabled] = world.getGameRuleManager().getGameRule(GameRules.DoMobLoot) ?? [true];
        if (!enabled) return;

        const table = lootOf(this.getType());
        if (!table) return;

        await world.dropContents(this.getPosition(), table.roll(randomOf(this.getServer())));
    }

    /** Turns the route into a desired velocity, and gives up on it if the mob is going nowhere. */
    private followPath(): void {
        // A goal that steered directly this tick has the final say: it is reacting to something
        // now, and a route was planned some ticks ago.
        if (this.steeredThisTick) return;

        if (this.follower.isDone()) {
            this.desiredVelocity = new Vector3(0, 0, 0);
            return;
        }

        const position = this.getPosition();
        const steerAt = this.follower.steerFrom(position);
        if (!steerAt) {
            this.stopMoving();
            return;
        }

        const dx = steerAt.getX() - position.getX();
        const dz = steerAt.getZ() - position.getZ();
        const distance = Math.hypot(dx, dz);

        if (distance < 1e-4) {
            this.desiredVelocity = new Vector3(0, 0, 0);
            return;
        }

        this.desiredVelocity = new Vector3(
            (dx / distance) * this.movementSpeed,
            0,
            (dz / distance) * this.movementSpeed
        );

        // A step up is taken by rising, not by teleporting: the mob is given upward speed and the
        // ordinary collision code carries it over.
        if (this.onGround && this.blockedAhead(dx / distance, dz / distance)) {
            this.velocity = this.velocity.withY(JUMP_POWER);
            this.onGround = false;
        }

        this.detectStuck(position);
    }

    /**
     * Whether the thing in the mob's way is worth jumping at.
     *
     * Probed from the *front of the body* rather than from its centre, which is the difference
     * between jumping while still walking and jumping after having already been stopped dead.
     * Sampling one point out from the centre missed obstacles entirely on a diagonal - the point
     * landed in the open cell beside the corner - so the mob walked into the corner instead, lost
     * its speed to the wall, and only then noticed. Testing the whole body cannot miss a corner it
     * is about to hit.
     */
    private blockedAhead(dirX: number, dirZ: number): boolean {
        const position = this.getPosition();
        const reach = this.bodyWidth / 2 + PROBE_REACH;
        const aheadX = position.getX() + dirX * reach;
        const aheadZ = position.getZ() + dirZ * reach;
        const feet = position.getY();

        if (!this.blocksBoxAt(aheadX, feet, aheadZ)) return false;

        // A low step is walked up, not jumped - see {@link stepOver}. Jumping at a slab makes a
        // mob bounce over ground it should have strolled across.
        if (this.stepOver(aheadX, feet, aheadZ) !== null) return false;

        // Only worth jumping if there is somewhere to land. This is also what stops a mob throwing
        // itself at a fence forever: at one and a half blocks, the body still does not fit a block
        // higher up, so there is nothing to jump onto.
        return !this.blocksBoxAt(aheadX, feet + 1, aheadZ);
    }

    /** Gives up on a route the mob has stopped making progress along. */
    private detectStuck(position: Vector3): void {
        const moved = Math.hypot(
            position.getX() - this.lastProgressPosition.getX(),
            position.getZ() - this.lastProgressPosition.getZ()
        );

        if (moved > 0.25) {
            this.lastProgressPosition = position;
            this.ticksWithoutProgress = 0;
            return;
        }

        this.ticksWithoutProgress++;
        if (this.ticksWithoutProgress >= STUCK_TICKS) this.stopMoving();
    }

    /**
     * Integrates one tick of movement.
     *
     * Axis by axis, so running into a wall along one of them costs the mob that axis and not the
     * other - which is what makes a mob slide along a wall instead of stopping dead against it.
     *
     * The move happens *before* gravity is applied, and the order is not a detail. Taking gravity
     * off the velocity first spends the whole first tick of a jump before it is ever integrated:
     * the 0.42 an upward impulse is worth arrives at `slideAlongWalls` as 0.3332, and the resulting
     * arc peaks at 0.832 blocks instead of vanilla's 1.252. Which is to say it cannot reach the top
     * of a block - so a mob would jump at a one-block step, fall short, land, and jump again until
     * {@link STUCK_TICKS} sent it somewhere else. Every constant here is vanilla's; only the order
     * was wrong.
     */
    private applyPhysics(): void {
        const position = this.getPosition();

        // Chase the desired velocity rather than taking it. This is the smoothing that matters: a
        // mob asked to reverse takes several ticks to come about, as a thing with mass would.
        const smoothing = this.onGround ? GROUND_SMOOTHING : AIR_SMOOTHING;
        let vx = this.velocity.getX() * smoothing + this.desiredVelocity.getX() * (1 - smoothing);
        let vz = this.velocity.getZ() * smoothing + this.desiredVelocity.getZ() * (1 - smoothing);

        // Below this the mob is standing still, and standing exactly still is what stops an idle
        // mob from drifting a thousandth of a block a tick forever and reporting it to everyone.
        if (Math.abs(vx) < REST_SPEED) vx = 0;
        if (Math.abs(vz) < REST_SPEED) vz = 0;

        // After the smoothing rather than before it, so being shoved is not two thirds absorbed by
        // the acceleration model on its way through. A shove is something happening *to* the mob;
        // the smoothing is about how the mob changes its own mind. A blow is the same kind of
        // thing, and is spent in the same place.
        const shove = this.pushFromNeighbours();
        const blow = this.pendingKnockback;
        this.pendingKnockback = null;

        let vy = this.velocity.getY();

        if (blow) {
            // Vanilla keeps a fraction of whatever the mob was doing and adds the blow on top, so
            // being hit while charging does not simply continue the charge at the same speed. The
            // fraction is a half for a plain hit and a quarter for a sprint one, because vanilla
            // shoves twice for the latter - see `Entity.knockbackFrom`.
            vx = vx * blow.damping + blow.impulse.getX();
            vz = vz * blow.damping + blow.impulse.getZ();
            vy = blow.impulse.getY();
        }

        this.velocity = new Vector3(vx + shove.getX(), vy, vz + shove.getZ());
        this.position = this.slideAlongWalls(position);

        this.applyGravity();
    }

    /**
     * How hard this mob is being shoved out of everything it is standing inside.
     *
     * Mobs push each other apart in vanilla, and without it a herd walking to the same place ends
     * up as one sheep-shaped pile of six sheep. Only this mob is moved, never the other one: both
     * of them run this, so they separate from each other; and a player must not be moved by the
     * server at all, since their position comes from their own client and anything the server does
     * to it comes back as rubber-banding.
     *
     * The result goes through the velocity rather than straight onto the position, so a mob shoved
     * towards a wall is stopped by the wall like anything else.
     * @returns {Vector3} A horizontal nudge, at most {@link MAX_PUSH} long.
     */
    private pushFromNeighbours(): Vector3 {
        const position = this.getPosition();
        const feet = this.getFeetY();
        const neighbours = this.getWorld().getEntityGrid().near(position.getX(), position.getZ());

        let pushX = 0;
        let pushZ = 0;

        for (const other of neighbours) {
            if (other === this || !other.occupiesSpace()) continue;

            const at = other.getPosition();
            const theirs = sizeOf(other.getType());

            // Bodies that do not overlap vertically are not touching, however close they look from
            // above: one is on the roof and the other is in the room.
            //
            // Through `getFeetY` and not the position, because a player's position is its eyes.
            // Taken at face value it puts their feet at chest height, and then the only mobs that
            // overlap a player at all are the ones taller than 1.62 - which is exactly how this
            // came to be reported: villagers could be shoved and cows, sheep, chickens and spiders
            // could not.
            const theirFeet = other.getFeetY();
            if (feet >= theirFeet + theirs.height) continue;
            if (theirFeet >= feet + this.bodyHeight) continue;

            const reach = (this.bodyWidth + theirs.width) / 2;
            let dx = position.getX() - at.getX();
            let dz = position.getZ() - at.getZ();
            let distance = Math.hypot(dx, dz);
            if (distance >= reach) continue;

            if (distance < 1e-4) {
                // Exactly on top of one another - spawned together, or dropped on the same spot.
                // The direction comes from the ids rather than at random so that the two of them
                // pick different ways out and stay picking them, instead of jittering in place.
                const angle = (Number(this.getRuntimeId() % 8n) / 8) * Math.PI * 2;
                dx = Math.cos(angle);
                dz = Math.sin(angle);
                distance = 1;
            }

            const overlap = reach - distance;
            pushX += (dx / distance) * overlap;
            pushZ += (dz / distance) * overlap;
        }

        const magnitude = Math.hypot(pushX, pushZ);
        if (magnitude < 1e-6) return new Vector3(0, 0, 0);

        // Gentle and capped. A shove strong enough to separate a pile in one tick is also strong
        // enough to fire the mob at the bottom of it across the field.
        const scale = Math.min(magnitude * PUSH_STRENGTH, MAX_PUSH) / magnitude;
        return new Vector3(pushX * scale, 0, pushZ * scale);
    }

    /** Living things displace each other - see {@link Entity.occupiesSpace}. */
    public override occupiesSpace(): boolean {
        return true;
    }

    /**
     * Pulls the mob down for the next tick, or floats it if it is in water.
     *
     * Read from where the mob has *just* moved to rather than where it started, so a mob that
     * stepped into water this tick floats this tick.
     */
    private applyGravity(): void {
        const position = this.getPosition();
        const submerged = this.view.isSubmerged(
            Math.floor(position.getX()),
            Math.floor(position.getY()),
            Math.floor(position.getZ())
        );

        const vy = this.velocity.getY();

        // Buoyancy: enough to float up out of water, and heavily damped so it does not bob.
        this.velocity = this.velocity.withY(submerged ? (vy + 0.03) * 0.8 : (vy - GRAVITY) * DRAG);
    }

    /**
     * Applies the velocity one axis at a time, stopping each where it meets something solid.
     *
     * Per axis rather than all at once, because a mob walking diagonally into a wall should slide
     * along it: the axis into the wall is lost and the one along it is kept. Moving all three
     * together would refuse the whole step and stop the mob dead against the wall.
     * @returns {Position} Where the mob ends up.
     */
    private slideAlongWalls(from: Position): Position {
        let x = from.getX();
        let y = from.getY();
        let z = from.getZ();

        // Vertical first, so a mob that lands this tick is standing on the ground when its
        // horizontal move is tested, and walks along it rather than into it.
        const nextY = y + this.velocity.getY();
        if (!this.blocksBoxAt(x, nextY, z)) {
            y = nextY;
            this.onGround = false;
        } else {
            if (this.velocity.getY() <= 0) {
                // The fall was stopped by something below, so the feet come to rest on top of it -
                // on top of *it*, not on top of its cell, which is the difference between standing
                // on a slab and standing in the air half a block above one.
                y = this.view.groundUnder(x, y, z, this.bodyWidth, Math.max(1, y - nextY + 1)) ?? y;
                this.onGround = true;
            } else {
                // Head into a ceiling: the rise is simply cancelled.
                this.onGround = false;
            }

            this.velocity = this.velocity.withY(0);
        }

        const nextX = x + this.velocity.getX();
        if (!this.blocksBoxAt(nextX, y, z)) {
            x = nextX;
        } else {
            const stepped = this.stepOver(nextX, y, z);
            if (stepped === null) {
                this.velocity = this.velocity.withX(0);
            } else {
                x = nextX;
                y = stepped;
            }
        }

        const nextZ = z + this.velocity.getZ();
        if (!this.blocksBoxAt(x, y, nextZ)) {
            z = nextZ;
        } else {
            const stepped = this.stepOver(x, y, nextZ);
            if (stepped === null) {
                this.velocity = this.velocity.withZ(0);
            } else {
                z = nextZ;
                y = stepped;
            }
        }

        // A mob that has ended up inside geometry - spawned into it, or had a block placed on it -
        // is eased upwards rather than left buried in it.
        if (this.blocksBoxAt(x, y, z) && !this.blocksBoxAt(x, y + 1, z)) y += UNSTICK_SPEED;

        return new Position(x, y, z, from.getWorld());
    }

    /** Whether the mob's body, with its feet here, runs into anything. */
    private blocksBoxAt(x: number, y: number, z: number): boolean {
        return this.view.blocksBox(x, y, z, this.bodyWidth, this.bodyHeight);
    }

    /**
     * The height the mob's feet would end up at by walking up whatever is in its way, or null if
     * that is not something it can walk up.
     *
     * A slab, a carpet, a layer of snow, the front of a staircase: things a mob crosses at a walk
     * in vanilla and would look ridiculous hopping over. Anything taller than {@link STEP_HEIGHT}
     * is not a step and is left to the jump.
     *
     * The rise happens in the same tick as the forward move, deliberately. Spreading it over
     * several would read better in isolation, but it deadlocks: the mob cannot move forward until
     * it has cleared the obstacle, so a partial rise leaves it in exactly the position it started
     * in, and gravity takes the height back before the next tick. Rising *with* the step is also
     * what vanilla does, and half a block while walking is not the discontinuity this file is
     * concerned with - that is about horizontal position skipping between waypoints.
     */
    private stepOver(x: number, y: number, z: number): number | null {
        const surface = this.view.groundUnder(x, y + STEP_HEIGHT, z, this.bodyWidth, STEP_HEIGHT + 1);
        if (surface === null || surface <= y + 1e-7 || surface - y > STEP_HEIGHT) return null;

        // No use stepping up into a ceiling.
        return this.blocksBoxAt(x, surface, z) ? null : surface;
    }

    /**
     * Eases the facing towards where the mob is going, or towards what it is looking at.
     *
     * Both the body and the head take the short way round the circle, which is the whole point:
     * turning from 350 degrees to 10 is a twenty degree turn, and a mob that goes the long way -
     * or worse, snaps - is the thing that reads as robotic however smooth its path is.
     */
    private turnTowardsMotion(): void {
        const speed = Math.hypot(this.velocity.getX(), this.velocity.getZ());

        if (speed > REST_SPEED) {
            const heading = Mob.headingOf(this.velocity.getX(), this.velocity.getZ());
            this.yaw = Mob.turnTowards(this.yaw, heading, TURN_RATE);
        }

        if (this.lookTarget) {
            const position = this.getPosition();
            const dx = this.lookTarget.getX() - position.getX();
            const dy = this.lookTarget.getY() - (position.getY() + this.bodyHeight * 0.85);
            const dz = this.lookTarget.getZ() - position.getZ();
            const flat = Math.hypot(dx, dz);

            this.headYaw = Mob.turnTowards(this.headYaw, Mob.headingOf(dx, dz), HEAD_TURN_RATE);
            this.pitch = Mob.turnTowards(this.pitch, -Math.atan2(dy, flat) * (180 / Math.PI), HEAD_TURN_RATE);
            this.lookTarget = null;
            return;
        }

        // With nothing to look at, the head follows the body.
        this.headYaw = Mob.turnTowards(this.headYaw, this.yaw, HEAD_TURN_RATE);
    }

    /** The yaw, in Minecraft's degrees, of a horizontal direction. */
    private static headingOf(dx: number, dz: number): number {
        return (Math.atan2(dz, dx) * 180) / Math.PI - 90;
    }

    /**
     * The signed angle from one heading to another, in (-180, 180].
     *
     * The short way round, which is the whole point: 350 degrees to 10 degrees is a twenty degree
     * turn to the right, not a three hundred and forty degree one to the left.
     */
    public static angleBetween(from: number, to: number): number {
        return ((((to - from) % 360) + 540) % 360) - 180;
    }

    /** Moves `from` towards `to` by at most `limit` degrees, the short way round. */
    public static turnTowards(from: number, to: number, limit: number): number {
        return from + Math.max(-limit, Math.min(limit, Mob.angleBetween(from, to)));
    }

    /**
     * Tells clients where the mob is and which way it is facing, if any of that has changed enough
     * to be worth a packet.
     *
     * A world full of idle mobs would otherwise cost a packet each per tick to say nothing. The
     * thresholds are well below what is visible, so this saves the packets nobody would have seen
     * without ever holding back one they would.
     *
     * *Every* part of the facing counts, not just the body. A villager standing still and watching
     * you move past changes only its head and its pitch - so a check on position and body yaw alone
     * finds nothing to report and the head sits frozen at whatever angle it last happened to be
     * sent at, which is precisely what it looks like.
     */
    private async broadcastIfMoved(): Promise<void> {
        const position = this.getPosition();
        const movedBy = Math.hypot(
            position.getX() - this.broadcastPosition.getX(),
            position.getY() - this.broadcastPosition.getY(),
            position.getZ() - this.broadcastPosition.getZ()
        );

        const turnedBy = Math.max(
            Math.abs(Mob.angleBetween(this.broadcastYaw, this.yaw)),
            Math.abs(Mob.angleBetween(this.broadcastHeadYaw, this.headYaw)),
            Math.abs(Mob.angleBetween(this.broadcastPitch, this.pitch))
        );

        // A degree is below what the byte the rotation travels in can even represent - it carries
        // 360 degrees in 256 steps - so nothing visible is ever held back.
        if (movedBy < 0.002 && turnedBy < 1) return;

        this.broadcastPosition = position;
        this.broadcastYaw = this.yaw;
        this.broadcastHeadYaw = this.headYaw;
        this.broadcastPitch = this.pitch;

        await this.getWorld().broadcastMove(this);
    }
}

export default Mob;
