import type { Vector3 } from '@jsprismarine/math';
import { bypassesArmor, bypassesEnchantments } from './Damage';
import { DamageCause } from './DamageCause';
import type { Entity } from './Entity';

/**
 * Who did the damage, and not only what kind it was.
 *
 * `DamageCause` alone answers "how did this happen"; almost everything interesting about a hit
 * needs "and who did it" as well. A death message names the killer, a hurt mob fights back at
 * whoever hurt it, and knockback needs a point in the world to push away from - none of which a
 * bare enum can carry.
 *
 * Immutable, and passed by value: the same source travels from the swing that caused it all the
 * way to the death message, so anything that could mutate it in between would rewrite history.
 */

/**
 * Causes that get through invulnerability frames.
 *
 * The void only: everything else respects the half-second of grace after a hit, and a player
 * standing under the world would otherwise be able to sit there indefinitely.
 */
const BYPASSES_INVULNERABILITY: ReadonlySet<DamageCause> = new Set([DamageCause.Void]);

/** Burning, in either of its two forms; what Fire Protection is measured against. */
const FIRE_CAUSES: ReadonlySet<DamageCause> = new Set([DamageCause.Fire, DamageCause.Lava]);

/**
 * The plain, attacker-less sources, built once.
 *
 * Drowning damage is raised every twentieth tick for every submerged entity in the world, and
 * an allocation per entity per second for something with no fields worth distinguishing is
 * waste. Anything carrying an attacker is built fresh, because it is genuinely different.
 */
const PLAIN_SOURCES = new Map<DamageCause, DamageSource>();

export class DamageSource {
    public readonly cause: DamageCause;

    /**
     * Whoever is answerable for the hit.
     *
     * For a fired arrow this is the archer, not the arrow - which is what makes a death message
     * say who shot you, and what makes a skeleton's stray shot start a fight with the skeleton
     * rather than with the projectile that has already gone.
     */
    public readonly attacker: Entity | null;

    /** The thing that actually made contact, when that is not the attacker. */
    public readonly projectile: Entity | null;

    /**
     * Extra knockback beyond the base, in vanilla's "levels".
     *
     * Sprinting counts as one, and so does each level of the Knockback enchantment.
     */
    public readonly knockbackLevels: number;

    public constructor({
        cause,
        attacker = null,
        projectile = null,
        knockbackLevels = 0
    }: {
        cause: DamageCause;
        attacker?: Entity | null;
        projectile?: Entity | null;
        knockbackLevels?: number;
    }) {
        this.cause = cause;
        this.attacker = attacker;
        this.projectile = projectile;
        this.knockbackLevels = knockbackLevels;
    }

    /**
     * Accepts either form, so every existing `damage(n, DamageCause.Fall)` call still works.
     *
     * This is what let the whole pipeline gain an attacker without touching a single one of the
     * call sites that never had one.
     * @param {DamageCause | DamageSource} source - A bare cause, or a full source.
     * @returns {DamageSource} The source, built if it was only a cause.
     */
    public static of(source: DamageCause | DamageSource): DamageSource {
        if (source instanceof DamageSource) return source;

        const cached = PLAIN_SOURCES.get(source);
        if (cached) return cached;

        const built = new DamageSource({ cause: source });
        PLAIN_SOURCES.set(source, built);

        return built;
    }

    /**
     * One entity hitting another with what it is holding.
     * @param {Entity} attacker - Who swung.
     * @param {number} [knockbackLevels=0] - Sprint and Knockback levels, summed.
     * @returns {DamageSource} The source.
     */
    public static entity(attacker: Entity, knockbackLevels = 0): DamageSource {
        return new DamageSource({ cause: DamageCause.Attack, attacker, knockbackLevels });
    }

    /**
     * Something thrown or fired arriving.
     * @param {Entity} projectile - What hit.
     * @param {Entity | null} [shooter=null] - Who sent it, if anyone is still around to blame.
     * @param {number} [knockbackLevels=0] - Punch levels, and the like.
     * @returns {DamageSource} The source.
     */
    public static projectileFrom(projectile: Entity, shooter: Entity | null = null, knockbackLevels = 0): DamageSource {
        return new DamageSource({
            cause: DamageCause.Projectile,
            attacker: shooter,
            projectile,
            knockbackLevels
        });
    }

    /** Whether armour points do anything about this. */
    public bypassesArmor(): boolean {
        return bypassesArmor(this.cause);
    }

    /** Whether the enchantments on that armour do either. */
    public bypassesEnchantments(): boolean {
        return bypassesEnchantments(this.cause);
    }

    /** Whether this ignores the grace period after a hit. */
    public bypassesInvulnerability(): boolean {
        return BYPASSES_INVULNERABILITY.has(this.cause);
    }

    /** Whether Fire Protection is the enchantment that applies. */
    public isFire(): boolean {
        return FIRE_CAUSES.has(this.cause);
    }

    /**
     * The point to be knocked away from, if this is the kind of damage that shoves.
     *
     * The projectile before the shooter, because an arrow fired across a valley should push you
     * away from where it came *from you*, not away from an archer a hundred blocks off. Null for
     * everything environmental: falling and drowning do not move anybody.
     * @returns {Vector3 | null} Where the blow came from, or null for no knockback.
     */
    public getKnockbackOrigin(): Vector3 | null {
        return this.projectile?.getPosition() ?? this.attacker?.getPosition() ?? null;
    }
}

export default DamageSource;
