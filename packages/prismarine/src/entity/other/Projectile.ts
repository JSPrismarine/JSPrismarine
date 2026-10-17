import { Vector3 } from '@jsprismarine/math';
import type { Position } from '../../world/Position';
import BlockView from '../ai/BlockView';
import { distanceToBody } from '../Combat';
import { DamageSource } from '../DamageSource';
import { Entity } from '../Entity';

/**
 * Something thrown or fired, on its way.
 *
 * A projectile is not a mob with the thinking removed: it has no goals, no pathfinding and no
 * business being shoved by its neighbours, and it needs one thing a mob does not - to notice what
 * it passes *through* rather than only what it ends up inside. An arrow moving three blocks a tick
 * would step straight over a player standing between the two positions, so a check at the
 * destination alone finds nothing. Hence the sweep.
 *
 * Everything a projectile is told about the world comes through `BlockView`, the same synchronous
 * reader the pathfinder uses, for the same reason: this runs several times per tick per arrow, and
 * awaiting a chunk load in the middle of a flight would both stall the tick and quietly generate
 * terrain by shooting at it.
 */

/**
 * How far apart the samples are along a tick's flight, in blocks.
 *
 * A quarter of a block. Small enough that nothing thinner than that is missed, and coarse enough
 * that a fast arrow costs a dozen lookups rather than a hundred.
 */
const SWEEP_STEP = 0.25;

/** How much of a target's body counts as a hit, past its own edges. Vanilla inflates the box too. */
const HIT_MARGIN = 0.3;

/**
 * Ticks before the shooter can be hit by their own shot.
 *
 * An arrow starts inside the bow that fired it, so without this every shot would hit the archer on
 * the tick it was loosed and nothing would ever leave the string.
 */
const OWNER_GRACE = 5;

/** How long anything airborne is allowed to stay so, in ticks - a minute. */
const MAX_LIFE = 1200;

export abstract class Projectile extends Entity {
    /** Blocks per tick, in each axis. */
    protected velocity: Vector3;

    /** Who fired it, blamed for what it does and immune to it for the first few ticks. */
    protected readonly owner: Entity | null;

    protected readonly view: BlockView;

    /** Ticks since it was loosed, for the owner's grace and for giving up on one that never lands. */
    private life = 0;

    public constructor({
        position,
        velocity = new Vector3(0, 0, 0),
        owner = null,
        pitch = 0,
        yaw = 0,
        headYaw = 0
    }: {
        position: Position;
        velocity?: Vector3;
        owner?: Entity | null;
        pitch?: number;
        yaw?: number;
        headYaw?: number;
    }) {
        super({ position, pitch, yaw, headYaw });

        this.velocity = velocity;
        this.owner = owner;
        this.view = new BlockView(position.getWorld());

        this.metadata.setAffectedByGravity(true);
        this.metadata.setCollidable(false);

        this.faceTravel();
    }

    /** Blocks per tick squared. An arrow's is lighter than a thrown egg's. */
    protected abstract get gravity(): number;

    /** What fraction of its speed survives each tick. */
    protected abstract get drag(): number;

    /** What this does to something it hits. Returning `false` lets it carry on through. */
    protected abstract hit(target: Entity): Promise<boolean>;

    /** Its current velocity, in blocks per tick. */
    public getVelocity(): Vector3 {
        return this.velocity;
    }

    /** Who is answerable for it. */
    public getOwner(): Entity | null {
        return this.owner;
    }

    /** The source to blame for anything this hits. */
    protected damageSource(): DamageSource {
        return DamageSource.projectileFrom(this, this.owner);
    }

    public override async update(tick: number): Promise<void> {
        await super.update(tick);

        // Given up on rather than followed for ever: one fired into open sky would otherwise cost
        // a movement packet to every player in range, once a tick, until the server stopped.
        if (++this.life > MAX_LIFE) {
            await this.getWorld().removeEntity(this);
            return;
        }

        const from = this.getPosition();
        const to = new Vector3(
            from.getX() + this.velocity.getX(),
            from.getY() + this.velocity.getY(),
            from.getZ() + this.velocity.getZ()
        );

        const stopped = await this.sweep(from, to);
        if (stopped) return;

        await this.setPosition({ position: to, pitch: this.pitch, yaw: this.yaw, headYaw: this.headYaw });

        this.velocity = new Vector3(
            this.velocity.getX() * this.drag,
            (this.velocity.getY() - this.gravity) * this.drag,
            this.velocity.getZ() * this.drag
        );

        this.faceTravel();
    }

    /**
     * Walks this tick's flight, looking for the first thing in the way.
     * @returns {Promise<boolean>} `true` if the flight ended, and the caller should not move it.
     */
    private async sweep(from: Vector3, to: Vector3): Promise<boolean> {
        const dx = to.getX() - from.getX();
        const dy = to.getY() - from.getY();
        const dz = to.getZ() - from.getZ();
        const length = Math.hypot(dx, dy, dz);
        if (length < Number.EPSILON) return false;

        const steps = Math.max(1, Math.ceil(length / SWEEP_STEP));
        const nearby = this.getWorld().getEntityGrid().near(from.getX(), from.getZ());

        for (let step = 1; step <= steps; step++) {
            const t = step / steps;
            const at = new Vector3(from.getX() + dx * t, from.getY() + dy * t, from.getZ() + dz * t);

            // Entities before blocks: something standing in a doorway should be hit rather than
            // the wall behind it, and at a quarter of a block the two can fall on the same sample.
            const struck = await this.firstEntityAt(at, nearby);
            if (struck) return true;

            if (this.view.isSolid(Math.floor(at.getX()), Math.floor(at.getY()), Math.floor(at.getZ()))) {
                await this.land(at);
                return true;
            }
        }

        return false;
    }

    /** Whoever this point is inside, and what happens to them. */
    private async firstEntityAt(at: Vector3, nearby: readonly Entity[]): Promise<boolean> {
        for (const candidate of nearby) {
            if (candidate === this || !candidate.isAlive()) continue;
            if (candidate === this.owner && this.life <= OWNER_GRACE) continue;
            if (candidate instanceof Projectile) continue;

            if (distanceToBody(at, candidate) > HIT_MARGIN) continue;

            if (await this.hit(candidate)) return true;
        }

        return false;
    }

    /**
     * Shoves a target away from where this struck it, and vanishes.
     *
     * What the harmless throwables do. It cannot go through `Entity.damage`, which refuses a blow
     * of zero and would take the knockback with it - and a snowball that neither hurt nor moved
     * anybody would be indistinguishable from one the server had ignored.
     * @param {Entity} target - What was hit.
     * @param {number} strength - How hard to shove it.
     * @returns {Promise<boolean>} Always `true`: the flight is over either way.
     */
    protected async shoveAndVanish(target: Entity, strength: number): Promise<boolean> {
        const origin = this.getPosition();
        const at = target.getPosition();

        const dx = at.getX() - origin.getX();
        const dz = at.getZ() - origin.getZ();
        const flat = Math.hypot(dx, dz);

        if (flat > Number.EPSILON) target.applyKnockback(dx / flat, dz / flat, strength);

        await this.getWorld().removeEntity(this);
        return true;
    }

    /**
     * What happens when it meets a block.
     *
     * Gone by default, which is right for anything that breaks on impact. An arrow overrides it to
     * stop where it is and stay there.
     * @param {Vector3} _at - Where it struck.
     */
    protected async land(_at: Vector3): Promise<void> {
        await this.getWorld().removeEntity(this);
    }

    /** Points the projectile along its own flight, so it does not fly sideways. */
    protected faceTravel(): void {
        const flat = Math.hypot(this.velocity.getX(), this.velocity.getZ());
        if (flat < Number.EPSILON && Math.abs(this.velocity.getY()) < Number.EPSILON) return;

        this.yaw = (Math.atan2(this.velocity.getZ(), this.velocity.getX()) * 180) / Math.PI - 90;
        this.headYaw = this.yaw;
        this.pitch = (-Math.atan2(this.velocity.getY(), flat) * 180) / Math.PI;
    }

    /**
     * Reported every tick, unlike a mob.
     *
     * A projectile crosses several blocks a tick, so the three-tick default that keeps mobs cheap
     * would have an arrow arrive in three visible jumps - and a client interpolating between them
     * would draw it passing through the wall it actually stopped at.
     */
    public override getTrackingInterval(): number {
        return 1;
    }

    /**
     * Nothing walks into an arrow, and an arrow shoves nothing aside.
     *
     * Overriding this to `false` is not an optimisation: a projectile that occupied space would be
     * pushed out of the way by everything it was about to hit.
     */
    public override occupiesSpace(): boolean {
        return false;
    }
}

export default Projectile;
