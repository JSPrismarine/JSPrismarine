/**
 * Which way a blow shoves its target, and how hard.
 *
 * One home for vanilla's knockback rule, because a legacy entity's {@link Entity.damage} and the
 * entity store's damage pipeline both shove, and two copies of the numbers would drift.
 */

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
export const SINGLE_DAMPING = 0.5;
const COMPOUND_DAMPING = 0.25;

/**
 * How far up a shove lifts, in blocks per tick.
 *
 * Vanilla's cap, which is what a hit from a standing start produces. Gravity brings the entity
 * back down, so this is only the first tick of the arc.
 */
export const KNOCKBACK_LIFT = 0.4;

/** One shove: a unit direction away from the blow, its strength and what it leaves of the old motion. */
export interface Knockback {
    readonly directionX: number;
    readonly directionZ: number;
    readonly strength: number;
    readonly damping: number;
}

/** What {@link knockbackOf} works a shove out from. */
export interface KnockbackInput {
    /** Where the target stands, horizontally. */
    readonly target: { readonly x: number; readonly z: number };
    /** Where the blow came from, horizontally. */
    readonly origin: { readonly x: number; readonly z: number };
    /** The target's knockback resistance, clamped to 0 to 1 here. */
    readonly resistance: number;
    /** Sprint and Knockback levels behind the blow. */
    readonly levels: number;
    /**
     * Picks a direction when the target stands exactly inside the origin, so the same entity is
     * always shoved the same way and does not jitter. An integer, such as the runtime id.
     */
    readonly tieBreak: number;
}

/**
 * The shove one blow gives, or undefined when it gives none.
 *
 * Vanilla shoves *twice* for a sprint hit and once for a plain one, and each shove halves
 * whatever the last one left before adding its own. One combined impulse of `0.4 + 0.5` is not
 * the same thing and is noticeably stronger, so the two are composed here into one strength and
 * one damping. A player is *sent* their knockback, and two packets in one tick would only
 * overwrite each other.
 */
export const knockbackOf = (input: KnockbackInput): Knockback | undefined => {
    const resistance = Math.min(1, Math.max(0, input.resistance));
    const base = BASE_KNOCKBACK * (1 - resistance);
    const bonus = input.levels * KNOCKBACK_PER_LEVEL * (1 - resistance);

    const strength = bonus > 0 ? base / 2 + bonus : base;
    const damping = bonus > 0 ? COMPOUND_DAMPING : SINGLE_DAMPING;
    if (strength <= 0) return undefined;

    let dx = input.target.x - input.origin.x;
    let dz = input.target.z - input.origin.z;
    let distance = Math.hypot(dx, dz);

    if (distance < Number.EPSILON) {
        const angle = ((((input.tieBreak % 8) + 8) % 8) / 8) * Math.PI * 2;
        dx = Math.cos(angle);
        dz = Math.sin(angle);
        distance = 1;
    }

    return { directionX: dx / distance, directionZ: dz / distance, strength, damping };
};
