/**
 * The cloud of dragon's breath a dragon fireball leaves where it lands, transcribed from Java
 * 26.3's `DragonFireball.onHit`.
 *
 * Bedrock's `dragon_fireball` file writes the cloud as `on_hit.spawn_aoe_cloud`, a component the
 * server had no handler for, so the fireball burst into nothing. Java's cloud starts at a radius
 * of 3 and grows to 7 over its 600 ticks, carries instant damage II at a quarter of its duration,
 * and belongs to the dragon. It forms on the first living thing within 4 blocks of where the
 * fireball landed, inside a box 4 blocks out and 2 up and down, and where the fireball is when
 * nothing is.
 */
import type { EntityPosition } from '@jsprismarine/entities';

/** The projectile this cloud comes from. */
export const DRAGON_FIREBALL = 'minecraft:dragon_fireball';

/** The cloud's numbers, as `AreaEffectCloud`'s spawn data names them. */
const BREATH = {
    radius: 3,
    duration: 600,
    radius_per_tick: (7 - 3) / 600,
    potion_duration_scale: 0.25,
    particle: 'dragon_breath',
    effects: [{ id: 'minecraft:instant_damage', amplifier: 1, duration: 1 }]
} as const;

/** How far out the fireball looks for something living to center the cloud on, Java's `inflate(4, 2, 4)`. */
const REACH = { across: 4, up: 2 } as const;

/** How close that living thing has to be, Java's `distanceToSqr < 16`. */
const CENTER_DISTANCE_SQUARED = 16;

/** One living thing near where the fireball landed. */
export interface BreathCandidate {
    readonly position: EntityPosition;
}

/** Where a dragon fireball's cloud forms and what it carries. */
export interface DragonBreath {
    readonly at: EntityPosition;
    readonly data: Readonly<Record<string, unknown>>;
}

/** The box Java searches for living things around a landed fireball. */
export const breathSearchBox = (
    at: EntityPosition,
    half: number
): { readonly min: EntityPosition; readonly max: EntityPosition } => ({
    min: { x: at.x - half - REACH.across, y: at.y - half - REACH.up, z: at.z - half - REACH.across },
    max: { x: at.x + half + REACH.across, y: at.y + half + REACH.up, z: at.z + half + REACH.across }
});

/**
 * The cloud a dragon fireball leaves.
 * @param at - Where the fireball landed.
 * @param living - The living things inside {@link breathSearchBox}, in the order the world found them.
 */
export const dragonBreathOf = (at: EntityPosition, living: readonly BreathCandidate[]): DragonBreath => {
    const near = living.find(
        ({ position }) =>
            (position.x - at.x) ** 2 + (position.y - at.y) ** 2 + (position.z - at.z) ** 2 < CENTER_DISTANCE_SQUARED
    );
    return { at: near === undefined ? at : { ...near.position }, data: BREATH };
};
