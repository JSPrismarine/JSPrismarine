/**
 * Which way a blow shoves its target, and how hard: Java's `LivingEntity.knockback`.
 *
 * One home for vanilla's knockback rule, which the entity store's damage pipeline and the
 * projectile hits shove with.
 *
 * @javaSee LivingEntity.knockback(DDDLnet/minecraft/world/damagesource/DamageSource;FZ)V
 */
import type { EntityPosition } from '@jsprismarine/entities';

/**
 * The shove a blow with an attacker gives, Java's `LivingEntity.dealDefaultKnockback` `knockback(0.4F, ...)`.
 *
 * @javaSource LivingEntity.dealDefaultKnockback
 */
export const BASE_KNOCKBACK = 0.4;

/** What each level of sprint-or-Knockback adds, as a second shove after the blow's own. */
export const KNOCKBACK_PER_LEVEL = 0.5;

/**
 * How far up a shove lifts a body on the ground, at most, in blocks per tick.
 *
 * Vanilla's cap, which is what a hit from a standing start produces. Gravity brings the entity
 * back down, so this is only the first tick of the arc.
 */
export const KNOCKBACK_LIFT = 0.4;

/**
 * The range of Java's `minecraft:knockback_resistance` attribute. A resistance below 0, which a
 * sulfur cube's archetype gives it, makes a shove stronger.
 */
const MIN_RESISTANCE = -2;
const MAX_RESISTANCE = 1;

/** The shortest direction Java's `knockback` pushes along, `1.0E-5F` squared; a shorter one is replaced. */
const SHORTEST_DIRECTION = Math.sqrt(1e-5);

/** What {@link livingKnockback} works a shove out from. */
export interface LivingKnockbackInput {
    /** The body's velocity before the shove. */
    readonly velocity: EntityPosition;
    /** Whether the body stands on the ground, which is the only time a shove lifts it. */
    readonly onGround: boolean;
    /** The body's knockback resistance. */
    readonly resistance: number;
    /** How hard the shove is before resistance, such as {@link BASE_KNOCKBACK}. */
    readonly power: number;
    /**
     * The way toward what shoves, horizontally, Java's `xd` and `zd`: the body goes the other way.
     * Only its direction counts.
     */
    readonly toward: { readonly x: number; readonly z: number };
    /**
     * Picks a direction when `toward` is too short to have one, so the same entity is always
     * shoved the same way and does not jitter, where Java draws a random one. An integer, such as
     * the runtime id.
     */
    readonly tieBreak: number;
}

/**
 * The velocity one shove leaves a body with, Java's `LivingEntity.knockback(power, xd, zd)`.
 *
 * The power is scaled by `1 - resistance`, and nothing happens when that leaves none. The
 * horizontal motion is halved and the shove taken off it along `toward`. A body on the ground is
 * lifted to half its vertical motion plus the power, at most {@link KNOCKBACK_LIFT}; one in the
 * air or in water keeps its vertical motion.
 *
 * @returns The new velocity, or the old one when the body resists the shove.
 * @javaSource LivingEntity.knockback(DDDLnet/minecraft/world/damagesource/DamageSource;FZ)V
 */
export const livingKnockback = (input: LivingKnockbackInput): EntityPosition => {
    const resistance = Math.min(MAX_RESISTANCE, Math.max(MIN_RESISTANCE, input.resistance));
    const power = input.power * (1 - resistance);
    if (power <= 0) return input.velocity;

    let { x, z } = input.toward;
    let length = Math.hypot(x, z);
    if (length < SHORTEST_DIRECTION) {
        const angle = ((((input.tieBreak % 8) + 8) % 8) / 8) * Math.PI * 2;
        x = Math.cos(angle);
        z = Math.sin(angle);
        length = 1;
    }

    const { velocity } = input;
    return {
        x: velocity.x / 2 - (x / length) * power,
        y: input.onGround ? Math.min(KNOCKBACK_LIFT, velocity.y / 2 + power) : velocity.y,
        z: velocity.z / 2 - (z / length) * power
    };
};

/**
 * The way an entity faces, horizontally, as Java's `causeExtraKnockback` passes it to
 * `knockback`: `(sin(yaw), -cos(yaw))`, which points behind the entity, so the shove goes the way
 * it faces.
 *
 * @param yaw - The entity's yaw, in degrees.
 */
export const behind = (yaw: number): { readonly x: number; readonly z: number } => {
    const radians = (yaw * Math.PI) / 180;
    return { x: Math.sin(radians), z: -Math.cos(radians) };
};
