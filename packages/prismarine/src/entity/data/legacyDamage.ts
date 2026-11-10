/**
 * The seam between the legacy {@link DamageSource} and the store's {@link DamageIntent}.
 *
 * A player's sword, a legacy blast, a command and a status effect still describe a blow with a
 * `DamageSource`, which names entity objects. The store's pipeline takes plain data addressed by
 * runtime id. This turns one into the other in both directions: a legacy blow on a data-driven
 * entity becomes an intent, and a committed intent becomes the `DamageSource` the plugin events
 * and the advancement triggers still take. Players move into the store in slice 5, and this goes
 * with the legacy classes.
 */
import type { World } from '../../world/World';
import type { ViewableEntity } from '../predicateView';
import { damageCauseOf } from '../DamageCause';
import { DamageSource } from '../DamageSource';
import type { DataEntity } from './DataEntity';
import type { DamageIntent, DamageRoute } from './damagePipeline';

/**
 * The intent a legacy blow on a data-driven entity becomes.
 *
 * A mob keeps the rules the legacy pipeline gave it, which are the grace period, armor and its
 * enchantments, resistance, absorption, the hurt feedback and the shove. Anything else, such as
 * a boat or an end crystal, took a legacy blow as a plain runtime hit, and still does.
 */
export const intentOfLegacyBlow = (
    entity: DataEntity,
    amount: number,
    source: DamageSource,
    route: DamageRoute
): DamageIntent => {
    const attacker = source.attacker === null ? undefined : Number(source.attacker.getRuntimeId());
    const projectile = source.projectile === null ? undefined : Number(source.projectile.getRuntimeId());
    const ids = {
        ...(attacker === undefined ? {} : { attacker }),
        ...(projectile === undefined ? {} : { projectile })
    };
    const described = {
        ...(source.deathMessageOverride === undefined ? {} : { deathMessageOverride: source.deathMessageOverride }),
        ...(source.damageType === undefined ? {} : { damageType: source.damageType }),
        ...(source.tags === undefined ? {} : { tags: [...source.tags] })
    };

    if (!entity.instance.families().includes('mob'))
        return { target: entity.id, ...ids, cause: source.cause, amount, source: { route, feedback: false, ...described } };

    const origin = source.getKnockbackOrigin();
    return {
        target: entity.id,
        ...ids,
        cause: source.cause,
        amount,
        source: {
            route,
            graced: true,
            mitigated: true,
            bypassesArmor: source.bypassesArmor(),
            bypassesEnchantments: source.bypassesEnchantments(),
            bypassesGrace: source.bypassesInvulnerability(),
            ...(origin === null
                ? {}
                : {
                      knockback: {
                          origin: { x: origin.getX(), y: origin.getY(), z: origin.getZ() },
                          levels: source.knockbackLevels
                      }
                  }),
            ...described
        }
    };
};

/**
 * The intent a health written straight onto a data-driven entity becomes, which is what `/kill`
 * does. It ignores the grace period, armor and the rest, as a written health did, and shows no
 * hurt feedback.
 */
export const intentOfHealthWrite = (
    entity: DataEntity,
    taken: number,
    source: DamageSource,
    route: DamageRoute
): DamageIntent => {
    const attacker = source.attacker === null ? undefined : Number(source.attacker.getRuntimeId());
    return {
        target: entity.id,
        ...(attacker === undefined ? {} : { attacker }),
        cause: source.cause,
        amount: taken,
        source: { route, feedback: false }
    };
};

/** The legacy `DamageSource` a committed intent is reported to plugins and advancements as. */
export const legacySourceOfIntent = (world: World, intent: DamageIntent): DamageSource => {
    const attacker = intent.attacker === undefined ? null : world.getEntity(BigInt(intent.attacker));
    const projectile = intent.projectile === undefined ? null : world.getEntity(BigInt(intent.projectile));
    const cause = damageCauseOf(intent.cause);
    const facts = intent.source;
    if (
        attacker === null &&
        projectile === null &&
        facts.deathMessageOverride === undefined &&
        facts.damageType === undefined &&
        facts.tags === undefined
    )
        return DamageSource.of(cause);
    return new DamageSource({
        cause,
        attacker,
        projectile,
        knockbackLevels: facts.knockback?.levels ?? 0,
        deathMessageOverride: facts.deathMessageOverride,
        damageType: facts.damageType,
        ...(facts.tags === undefined ? {} : { tags: new Set(facts.tags) })
    });
};

/** A data-driven entity as the enchantment and predicate rules read a victim. */
export const viewableDataEntity = (entity: DataEntity): ViewableEntity => ({
    getType: () => entity.identifier,
    getPosition: () => ({ getX: () => entity.position.x, getY: () => entity.position.y, getZ: () => entity.position.z }),
    isOnFire: () => entity.body.conditions.has('on_fire'),
    isOnGround: () => entity.body.conditions.has('on_ground'),
    getStatusEffects: () => [...entity.body.statusEffects.values()]
});
