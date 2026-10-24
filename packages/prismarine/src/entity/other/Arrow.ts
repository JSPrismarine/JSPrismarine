import type { Vector3 } from '@jsprismarine/math';
import { LevelSoundEvent } from '@jsprismarine/minecraft';
import type { Entity } from '../Entity';
import { Projectile } from './Projectile';

/**
 * An arrow in flight.
 *
 * How hard it hits comes from how fast it is going, which is what makes drawing a bow fully worth
 * doing: the charge sets the speed at launch and the speed is the damage. A skeleton's shot and a
 * player's fully-drawn one are the same arrow with different launch speeds.
 * @see https://minecraft.wiki/w/Arrow
 */

/** Blocks per tick squared. Lighter than a thrown egg's, which is why arrows carry. */
const GRAVITY = 0.05;

/** What survives each tick. Vanilla's, and shallow enough that an arrow flies a long way. */
const DRAG = 0.99;

/** Half-hearts per block per tick of speed. A fully drawn bow launches at three. */
const DAMAGE_PER_SPEED = 2;

/** How long an arrow stays in the ground before it is tidied away, in ticks. */
const STUCK_TICKS = 1200;

export default class Arrow extends Projectile {
    public static MOB_ID = 'minecraft:arrow';

    /** Set when it strikes something solid, after which it stops being a projectile. */
    private stuck = false;
    private stuckTicks = 0;

    /**
     * Whether this was a fully-drawn shot.
     *
     * Vanilla's arrows crit on a full draw rather than on falling, unlike a melee blow - so the
     * flag is set at launch rather than worked out on impact.
     */
    private critical = false;

    protected override get gravity(): number {
        return GRAVITY;
    }

    protected override get drag(): number {
        return DRAG;
    }

    /** Marks this as a fully-drawn shot, worth half again as much. */
    public setCritical(critical = true): this {
        this.critical = critical;
        return this;
    }

    public override async update(tick: number): Promise<void> {
        // An arrow in the ground is scenery: it does not fall, does not sweep, and is only waiting
        // to be tidied away. Ticking the flight would send it through the floor it landed on.
        if (this.stuck) {
            if (++this.stuckTicks >= STUCK_TICKS) await this.getWorld().removeEntity(this);
            return;
        }

        await super.update(tick);
    }

    /** What it does to something it catches. */
    protected override async hit(target: Entity): Promise<boolean> {
        const speed = Math.hypot(this.velocity.getX(), this.velocity.getY(), this.velocity.getZ());

        // At least one, so a nearly-spent arrow still stings rather than passing through for free.
        const base = Math.max(1, Math.ceil(speed * DAMAGE_PER_SPEED));
        const damage = this.critical ? Math.ceil(base * 1.5) : base;

        const landed = await target.damage(damage, this.damageSource());

        // Through anything it could not hurt - a creative player, something still inside its grace
        // period - rather than stopping dead in mid-air against them.
        if (!landed) return false;

        await this.getWorld().sendActorSound(target, LevelSoundEvent.BOW_HIT);
        await this.getWorld().removeEntity(this);

        return true;
    }

    /** Arrows stop where they strike and stay there to be looked at. */
    protected override async land(at: Vector3): Promise<void> {
        this.stuck = true;
        this.stuckTicks = 0;

        await this.setPosition({ position: at, pitch: this.pitch, yaw: this.yaw, headYaw: this.headYaw });
    }
}
