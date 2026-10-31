import { Vector3 } from '@jsprismarine/math';
import { LevelEvent, LevelSoundEvent } from '@jsprismarine/minecraft';

import type { Item } from '../../item/Item';
import { Entity } from '../Entity';

/**
 * Past this many horizontal blocks the eye flies toward a point this far along the way and
 * {@link TOO_FAR_SIGNAL_HEIGHT} up, rather than toward the stronghold itself. The eye points
 * the way, it does not travel it.
 */
const TOO_FAR_DISTANCE = 12;

/** How far above its throw point a far-flying eye settles. */
const TOO_FAR_SIGNAL_HEIGHT = 8;

/** Ticks of flight before the eye drops or shatters; Java discards it once `life` passes 80. */
const LIFETIME_TICKS = 80;

/** How much of the way from the current speed to the remaining distance one tick closes. */
const SPEED_LERP = 0.0025;

/** Within a block of the target, the speed and the climb are both scaled by this each tick. */
const NEAR_TARGET_DAMPING = 0.8;

/** How much of the way from the current climb to a block a tick one tick closes. */
const VERTICAL_LERP = 0.015;

/** Java rolls `random.nextInt(5) > 0` to survive, so one throw in five shatters. */
const SHATTER_ROLLS = 5;

/**
 * Java's `EyeOfEnder.updateDeltaMovement`: the next velocity, from the one the eye has, where
 * the tick is carrying it, and where it is going.
 *
 * Horizontally the speed eases toward the distance left, so the eye starts slowly, covers the
 * ground, and brakes at the point. Vertically the climb eases toward one block a tick upward
 * while the eye is below the point and downward once it is above, which is what makes it hover
 * there rather than sail past.
 */
const nextMotion = (motion: Vector3, next: Vector3, target: Vector3): Vector3 => {
    const toTarget = new Vector3(target.getX() - next.getX(), 0, target.getZ() - next.getZ());
    const distance = Math.hypot(toTarget.getX(), toTarget.getZ());
    const horizontal = Math.hypot(motion.getX(), motion.getZ());

    let speed = horizontal + SPEED_LERP * (distance - horizontal);
    let climb = motion.getY();
    if (distance < 1) {
        speed *= NEAR_TARGET_DAMPING;
        climb *= NEAR_TARGET_DAMPING;
    }

    const wasBelow = next.getY() - motion.getY() < target.getY();
    const up = wasBelow ? 1 : -1;
    const scale = distance === 0 ? 0 : speed / distance;

    return new Vector3(toTarget.getX() * scale, climb + (up - climb) * VERTICAL_LERP, toTarget.getZ() * scale);
};

/**
 * The eye of ender in flight, transcribed from Java 26.3's `EyeOfEnder`.
 *
 * Bedrock has no entity file for `minecraft:eye_of_ender_signal`, so unlike every mob it is
 * written here rather than read from the pack. There is little to write: the eye carries no
 * health and hits nothing. It flies toward a point for eighty ticks and then either drops as
 * the item it was or shatters, and the only random in it is which of the two.
 */
export class EyeOfEnderSignal extends Entity {
    public static override MOB_ID = 'minecraft:eye_of_ender_signal';

    /** Where the eye flies to, or undefined before {@link EyeOfEnderSignal.signalTo}. */
    private target: Vector3 | undefined;

    /** Ticks flown since the last `signalTo`. */
    private life = 0;

    /** Whether the eye drops as an item at the end, decided when it is signaled. */
    private surviveAfterDeath = false;

    /** Speed in blocks per tick. Zero until the first tick after a signal. */
    private motion: Vector3 = Vector3.ZERO;

    private readonly item: Item;
    private readonly random: () => number;

    /**
     * @param options - The entity's options, and the eye's own.
     * @param options.item - The stack that drops when the eye survives, which is the eye thrown.
     * @param options.random - A number in [0, 1), rolled once per signal for the shatter.
     */
    public constructor({
        item,
        random,
        ...options
    }: ConstructorParameters<typeof Entity>[0] & { item: Item; random: () => number }) {
        super(options);
        this.item = item;
        this.random = random;
    }

    /** The stack this eye was thrown as, and drops as. */
    public getItem(): Item {
        return this.item;
    }

    /** The speed it is flying at, which the spawn packet carries so the client draws it moving. */
    public override getVelocity(): Vector3 {
        return this.motion;
    }

    /**
     * Never saved. Java writes the eye to disk, but a restored one would have no target and
     * hang in the air; four seconds of flight are not worth a record.
     */
    public override shouldPersist(): boolean {
        return false;
    }

    /**
     * Points the eye at a position, which is the stronghold's generation point.
     *
     * Java's `signalTo`: beyond {@link TOO_FAR_DISTANCE} horizontal blocks the eye aims at a
     * point that far along the way and {@link TOO_FAR_SIGNAL_HEIGHT} up, so a player sees a
     * direction. Within it the eye aims at the point itself, whose y is the stronghold's,
     * and sinks toward it. The shatter is rolled here, once, as Java rolls it.
     * @param target - Where the stronghold starts, in blocks.
     */
    public signalTo(target: Vector3): void {
        const here = this.getPosition();
        const dx = target.getX() - here.getX();
        const dz = target.getZ() - here.getZ();
        const distance = Math.hypot(dx, dz);

        this.target =
            distance > TOO_FAR_DISTANCE
                ? new Vector3(
                      here.getX() + (dx / distance) * TOO_FAR_DISTANCE,
                      here.getY() + TOO_FAR_SIGNAL_HEIGHT,
                      here.getZ() + (dz / distance) * TOO_FAR_DISTANCE
                  )
                : target;
        this.life = 0;
        this.surviveAfterDeath = Math.floor(this.random() * SHATTER_ROLLS) > 0;
    }

    /**
     * One tick of flight: the move, the next velocity, and at the end the drop or the shatter.
     *
     * Java's `EyeOfEnder.tick`, in its order. The eye moves by the velocity it had, works out
     * the next one from where it now is, and once `life` passes {@link LIFETIME_TICKS} it plays
     * its death sound, leaves the world, and either drops its item or bursts into particles.
     */
    public override async update(tick: number): Promise<void> {
        await super.update(tick);
        if (this.target === undefined) return;

        const here = this.getPosition();
        const next = new Vector3(
            here.getX() + this.motion.getX(),
            here.getY() + this.motion.getY(),
            here.getZ() + this.motion.getZ()
        );
        this.motion = nextMotion(this.motion, next, this.target);
        await this.setPosition({ position: next });

        this.life += 1;
        if (this.life <= LIFETIME_TICKS) return;

        // Java's order: the sound, the discard, then what is left behind.
        const world = this.getWorld();
        await world.sendActorSound(this, LevelSoundEvent.DEATH);
        await world.removeEntity(this);
        if (this.surviveAfterDeath) {
            await world.dropContents(this.getPosition(), [this.item]);
        } else {
            await world.sendWorldEvent(this.getPosition(), LevelEvent.PARTICLES_EYE_OF_ENDER_DEATH, 0);
        }
    }
}
