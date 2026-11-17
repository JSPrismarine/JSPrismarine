/**
 * What a projectile does to what it hits, by Java 26.3's rules.
 *
 * A projectile's `on_hit` in its `minecraft:projectile` component names most of it, and the
 * runtime reads that. Where a vanilla projectile's Java class does something its Bedrock file
 * leaves out or words differently, {@link JAVA_PROJECTILE_HITS} says what Java does: a wither
 * skull's own blow, the push every Java projectile gives when it hurts, the area effect cloud a
 * dragon's fireball leaves, and the experience a thrown bottle o' enchanting drops.
 */
import type { EntityPosition, EntityStatusEffect } from '@jsprismarine/entities';
import { isRecord } from '@jsprismarine/entities';

import type { RandomSource } from '../../content/world/adapter';
import { BASE_KNOCKBACK, livingKnockback } from '../knockback';

/** What one level of Punch adds to an arrow's push, Java's `AbstractArrow.doKnockback` scale. */
const PUNCH_PER_LEVEL = 0.6;

/** The lift Punch adds, Java's `AbstractArrow.doKnockback` `push(x, 0.1, z)`. */
const PUNCH_LIFT = 0.1;

/** How long a small fireball sets what it hits alight, Java's `SmallFireball.onHitEntity` `igniteForSeconds(5.0F)`. */
export const PROJECTILE_IGNITE_TICKS = 100;

/** A vanilla projectile's hit where Java's class differs from its Bedrock file. */
export interface JavaProjectileHit {
    /**
     * The health its blow takes off an entity, from an owner and from none, where the file names
     * no blow or another amount; `unowned` is undefined when Java lands no blow without an owner.
     */
    readonly damage?: { readonly owned: number; readonly unowned: number | undefined };
    /** Whether its blow pushes the entity back, where the file's `knockback` flag says otherwise. */
    readonly knockback?: boolean;
    /** The area effect cloud it leaves where it lands, as spawn data for the cloud. */
    readonly cloud?: Readonly<Record<string, unknown>>;
    /** The experience it drops where it lands. */
    readonly experience?: (random: RandomSource) => number;
}

/** The vanilla projectiles whose Java hit differs from their Bedrock file, by Bedrock identifier. */
export const JAVA_PROJECTILE_HITS: ReadonlyMap<string, JavaProjectileHit> = new Map<string, JavaProjectileHit>([
    // WitherSkull.onHitEntity: witherSkull 8 from a living owner, magic 5 from none.
    ['minecraft:wither_skull', { damage: { owned: 8, unowned: 5 }, knockback: true }],
    // ThrownEnderpearl.onHitEntity hurts what it hits for 0, which still pushes it back.
    ['minecraft:ender_pearl', { damage: { owned: 0, unowned: 0 }, knockback: true }],
    // LargeFireball.onHitEntity hurts for 6 through hurtServer, which pushes.
    ['minecraft:fireball', { knockback: true }],
    // LlamaSpit.onHitEntity hurts for 1 only when a living llama spat it, and pushes.
    ['minecraft:llama_spit', { damage: { owned: 1, unowned: undefined }, knockback: true }],
    // DragonFireball.onHit's breath cloud is `dragonFireball.ts`, which places it by the living bodies it meets.
    // ThrownExperienceBottle.onHit: 3 + nextInt(5) + nextInt(5) experience.
    ['minecraft:xp_bottle', { experience: (random) => 3 + random.nextInt(5) + random.nextInt(5) }]
]);

/** What a pushed body is doing, and how the push meets it. */
export interface KnockbackInput {
    /** The body's velocity before the push. */
    readonly velocity: EntityPosition;
    /** The way the projectile was flying, which is the way the body is pushed. */
    readonly direction: { readonly x: number; readonly z: number };
    /** The body's knockback resistance. */
    readonly resistance: number;
    /** Whether the body stands on the ground, which is the only time a push lifts it. */
    readonly onGround: boolean;
    /** The arrow's Punch level, 0 for anything else. */
    readonly punch: number;
}

/**
 * The velocity a projectile's blow leaves a body with: Java's `LivingEntity.knockback(0.4, ...)`
 * along the projectile's flight, which halves the body's horizontal motion, pushes it 0.4 less
 * its resistance and lifts a grounded body to at most 0.4, then Punch's extra push from
 * `AbstractArrow.doKnockback`.
 * @returns The new velocity, or the old one when the body resists every push.
 */
export const projectileKnockback = (input: KnockbackInput): EntityPosition => {
    const resistance = Math.min(1, Math.max(0, input.resistance));
    const length = Math.hypot(input.direction.x, input.direction.z);
    if (resistance >= 1 || length < 1e-5) return input.velocity;
    const unitX = input.direction.x / length;
    const unitZ = input.direction.z / length;
    let next = livingKnockback({
        velocity: input.velocity,
        onGround: input.onGround,
        resistance,
        power: BASE_KNOCKBACK,
        toward: { x: -unitX, z: -unitZ },
        tieBreak: 0
    });
    const punch = input.punch * PUNCH_PER_LEVEL * (1 - resistance);
    if (punch > 0) next = { x: next.x + unitX * punch, y: next.y + PUNCH_LIFT, z: next.z + unitZ * punch };
    return next;
};

const DIFFICULTY_KEYS: Readonly<Record<string, string>> = {
    peaceful: 'durationeasy',
    easy: 'durationeasy',
    normal: 'durationnormal',
    hard: 'durationhard'
};

/**
 * The status effects an `on_hit.mob_effect` gives what a projectile hits, at the world's
 * difficulty: Java's shulker bullet's ten seconds of Levitation, and a wither skull's Wither II
 * for ten seconds on normal, forty on hard and none on easy.
 */
export const projectileHitEffects = (onHit: Record<string, unknown>, difficulty: string): EntityStatusEffect[] => {
    const mobEffect = isRecord(onHit.mob_effect) ? onHit.mob_effect : undefined;
    const effects = Array.isArray(mobEffect?.effects) ? mobEffect.effects : [];
    return effects.flatMap((effect): EntityStatusEffect[] => {
        if (!isRecord(effect) || typeof effect.effect !== 'string') return [];
        const byDifficulty = effect[DIFFICULTY_KEYS[difficulty] ?? 'durationnormal'];
        const duration = typeof byDifficulty === 'number' ? byDifficulty : effect.duration;
        if (typeof duration !== 'number' || duration <= 0) return [];
        return [
            {
                id: effect.effect.includes(':') ? effect.effect : `minecraft:${effect.effect}`,
                durationTicks: Math.floor(duration),
                amplifier: typeof effect.amplifier === 'number' ? Math.max(0, Math.floor(effect.amplifier)) : 0
            }
        ];
    });
};

/** The experience an `on_hit.grant_xp` drops: between its `minXP` and `maxXP`, inclusive. */
export const grantedExperience = (onHit: Record<string, unknown>, random: RandomSource): number => {
    const grant = isRecord(onHit.grant_xp) ? onHit.grant_xp : undefined;
    if (grant === undefined) return 0;
    const min = typeof grant.minXP === 'number' ? Math.max(0, Math.floor(grant.minXP)) : 0;
    const max = typeof grant.maxXP === 'number' ? Math.max(min, Math.floor(grant.maxXP)) : min;
    return min + random.nextInt(max - min + 1);
};

/** One `on_hit.definition_event`: the event and who it is fired on. */
export interface ProjectileHitEvent {
    readonly event: string;
    readonly projectile: boolean;
    readonly target: boolean;
    readonly shooter: boolean;
}

/** The event an `on_hit.definition_event` fires, such as the fireball's and the wither skull's `minecraft:explode`. */
export const projectileHitEvent = (onHit: Record<string, unknown>): ProjectileHitEvent | undefined => {
    const definition = isRecord(onHit.definition_event) ? onHit.definition_event : undefined;
    const trigger = isRecord(definition?.event_trigger) ? definition.event_trigger : undefined;
    if (definition === undefined || typeof trigger?.event !== 'string') return undefined;
    return {
        event: trigger.event,
        projectile: definition.affect_projectile === true,
        target: definition.affect_target === true,
        shooter: definition.affect_shooter === true
    };
};
