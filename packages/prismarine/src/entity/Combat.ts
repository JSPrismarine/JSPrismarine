import type { Vector3 } from '@jsprismarine/math';
import { LevelEvent, LevelSoundEvent } from '@jsprismarine/minecraft';
import { GameRules } from '../world/GameRuleManager';
import { AttributeIds } from './Attribute';
import { DamageSource } from './DamageSource';
import type { Entity } from './Entity';
import { sizeOf } from './EntitySize';
import Human from './Human';

/**
 * One entity hitting another.
 *
 * Free functions rather than a method, because both sides of a fight need the same code and they
 * live in different class hierarchies: a `Player` is a `Human` and a zombie is a `Mob`, and their
 * only common ancestor is `Entity`, which has no business knowing what a weapon is. Putting it
 * here also keeps it out of the packet handler, where it would only ever have served players.
 *
 * Deliberately imports neither `Player` nor `Mob`. A goal will call this, goals are reached from
 * `Mob`, and `Mob` would then import this back - so anything species-specific is passed in by
 * whoever knows it. That is why the reach and the critical are options and not worked out here.
 */

/** How far a player may reach in survival, measured to the target's body rather than its centre. */
export const SURVIVAL_REACH = 3;

/** The same in creative, where vanilla is more generous. */
export const CREATIVE_REACH = 6;

/**
 * What a mob may reach, and what anything is allowed that does not say.
 *
 * Generous next to a player's, because a mob's own body is part of the distance: an enderman is
 * nearly three blocks tall and its position is its feet, so a strict three would have tall mobs
 * unable to reach what they were standing next to.
 */
export const DEFAULT_REACH = 4;

/** A critical is half again as much, and vanilla's multiplier. */
const CRITICAL_MULTIPLIER = 1.5;

/** How much of a swing survives being blocked by nothing at all - see {@link meleeAttack}. */
const NO_DAMAGE = 0;

/** What to vary about one blow. Everything the caller knows and this module deliberately does not. */
export interface MeleeOptions {
    /** How far the attacker may reach, to the target's body. */
    reach?: number;

    /**
     * Half-hearts the blow is worth, before the critical.
     *
     * A player's comes from what they are holding; a mob's from its attack attribute, which is
     * what this falls back to.
     */
    damage?: number;

    /** Whether this is a critical: half again as much, and a burst of particles. */
    critical?: boolean;

    /** Sprint and Knockback levels, summed - see `DamageSource.knockbackLevels`. */
    knockbackLevels?: number;
}

/**
 * The distance from a point to the nearest part of an entity's body.
 *
 * To the *box*, not to the position, and that is the whole difficulty: a player's position is
 * their eyes and every other entity's is its feet, so a straight point-to-point distance is
 * measuring between two things that are not the same kind of thing. Measured to the body, a
 * player standing on a cow and a player standing beside one are both within reach of it, which is
 * what a player would expect and what a centre-to-centre check gets wrong for anything tall.
 * @param {Vector3} from - Where the blow comes from; for a player, their eyes.
 * @param {Entity} target - Who is being reached for.
 * @returns {number} Blocks to the nearest point of the target's body; zero if inside it.
 */
export const distanceToBody = (from: Vector3, target: Entity): number => {
    const at = target.getPosition();
    const { width, height } = sizeOf(target.getType());
    const half = width / 2;
    const feet = target.getFeetY();

    const dx = Math.max(0, Math.abs(from.getX() - at.getX()) - half);
    const dz = Math.max(0, Math.abs(from.getZ() - at.getZ()) - half);
    const dy = Math.max(0, feet - from.getY(), from.getY() - (feet + height));

    return Math.hypot(dx, dy, dz);
};

/**
 * Whether one entity is allowed to hurt another at all.
 *
 * The gate every fight goes through, so the rules are stated once rather than in each of the
 * handler, the goals and whatever comes next.
 *
 * A dead target is refused here rather than left to `Entity.damage`, because a mob keeps its
 * place in the world for a second while its death animation plays and would otherwise be a
 * punchbag for that second.
 * @param {Entity} attacker - Who is swinging.
 * @param {Entity} target - Who at.
 * @returns {boolean} `true` if the blow is permitted.
 */
export const canHarm = (attacker: Entity, target: Entity): boolean => {
    if (attacker === target || !target.isAlive()) return false;

    // A fight cannot cross worlds, and the runtime id a client names is only unique within one.
    if (attacker.getWorld() !== target.getWorld()) return false;

    if (attacker instanceof Human && target instanceof Human) {
        const [pvp] = target.getWorld().getGameRuleManager().getGameRule(GameRules.PVP) ?? [true];
        if (!pvp) return false;
    }

    return true;
};

/**
 * Swings at something, and hurts it if the swing connects.
 *
 * Returns `false` for every way a swing can fail to land - out of reach, refused by the rules,
 * absorbed by the target's grace period, cancelled by a listener - and the caller wants that,
 * because a swing that did not land costs no hunger and wears out no weapon.
 * @param {Entity} attacker - Who is swinging.
 * @param {Entity} target - Who at.
 * @param {MeleeOptions} [options] - What the caller knows about this particular blow.
 * @returns {Promise<boolean>} `true` if the target actually took damage.
 * @example
 * ```typescript
 * await meleeAttack(player, zombie, { reach: SURVIVAL_REACH, damage: sword.getAttackDamage() });
 * ```
 */
export const meleeAttack = async (attacker: Entity, target: Entity, options: MeleeOptions = {}): Promise<boolean> => {
    const { reach = DEFAULT_REACH, critical = false, knockbackLevels = 0 } = options;

    if (!canHarm(attacker, target)) return false;
    if (distanceToBody(attacker.getPosition(), target) > reach) return false;

    const world = attacker.getWorld();
    const base = options.damage ?? attacker.attributes.getValue(AttributeIds.AttackDamage);
    const damage = critical ? base * CRITICAL_MULTIPLIER : base;

    // Something that does no damage still makes a noise, because the alternative is a swing that
    // produces nothing at all and reads as the server having missed the packet.
    const landed = damage > NO_DAMAGE && (await target.damage(damage, DamageSource.entity(attacker, knockbackLevels)));

    if (!landed) {
        await world.sendActorSound(attacker, LevelSoundEvent.ATTACK_NODAMAGE);
        return false;
    }

    await world.sendActorSound(attacker, critical ? LevelSoundEvent.ATTACK_STRONG : LevelSoundEvent.ATTACK);

    // On the target rather than on the attacker: the stars burst around what was hit.
    if (critical) await world.sendWorldEvent(target.getPosition(), LevelEvent.PARTICLES_CRIT, 0);

    return true;
};
