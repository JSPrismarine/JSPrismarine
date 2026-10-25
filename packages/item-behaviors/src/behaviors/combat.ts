/**
 * Melee: what a weapon does when a hit lands, and what the three weapons with
 * their own rules add on top.
 *
 * The damage number is not here. `attackDamage` in `formulas.ts` is a pure
 * function the server calls while resolving the hit, because the hook table
 * reports that a hit landed rather than asking how hard.
 *
 * What is here is `minecraft:weapon`'s durability and shield-disabling rules,
 * the mace's fall-based smash, the trident's throw and the spear's charge.
 */
import type { ItemHooks, ItemStack } from '@jsprismarine/items';
import { blocksAttacks, kineticWeapon, weapon } from '@jsprismarine/items';

import type { BehaviorContext, ItemBehaviorSpec } from '../behavior';
import { spendItemDurability } from '../behavior';
import { enchantmentLevel } from '../formulas';
import type { ItemSource } from '../world';

/** `MaceItem.SMASH_ATTACK_FALL_THRESHOLD`: the fall a smash needs. */
export const SMASH_ATTACK_FALL_THRESHOLD = 1.5;
/** `MaceItem.SMASH_ATTACK_KNOCKBACK_RADIUS`. */
export const SMASH_ATTACK_KNOCKBACK_RADIUS = 3.5;
/** How long an axe hit disables a shield for, when `minecraft:weapon` does not say. */
const DEFAULT_DISABLE_SECONDS = 0;

/**
 * The mace's damage bonus, which is `MaceItem.getAttackDamageBonus`:
 *
 * ```java
 * if (fallDistance <= 3.0) damage = 4.0 * fallDistance;
 * else if (fallDistance <= 8.0) damage = 12.0 + 2.0 * (fallDistance - 3.0);
 * else damage = 22.0 + fallDistance - 8.0;
 * ```
 *
 * Below the 1.5 block threshold there is no smash and no bonus. The Density
 * and Breach enchantments add to this through `modifyFallBasedDamage`, which
 * the enchantment package owns.
 *
 * @param fallDistance - How far the attacker has fallen, in blocks.
 */
export const maceDamageBonus = (fallDistance: number): number => {
    if (fallDistance <= SMASH_ATTACK_FALL_THRESHOLD) return 0;
    if (fallDistance <= 3) return 4 * fallDistance;
    if (fallDistance <= 8) return 12 + 2 * (fallDistance - 3);
    return 22 + fallDistance - 8;
};

/** Spends the attack's durability and disables the target's shield, if the weapon does that. */
const resolveWeaponHit = (
    context: BehaviorContext,
    stack: ItemStack,
    source: ItemSource,
    hitEntity: ItemSource
): void => {
    const rules = stack.params(weapon);
    if (rules === undefined) return;

    const disableSeconds = rules.disable_blocking_for_seconds ?? DEFAULT_DISABLE_SECONDS;
    if (disableSeconds > 0) {
        context.world.perform({ kind: 'disable-shield', target: hitEntity, ticks: Math.round(disableSeconds * 20) });
    }

    const perAttack = rules.item_damage_per_attack ?? 1;
    if (perAttack > 0) spendItemDurability(context.world, stack, source, perAttack);
};

/**
 * Every item carrying `minecraft:weapon`: swords, axes, the mace, the trident
 * and the seven spears.
 */
export const meleeWeaponBehavior: ItemBehaviorSpec = {
    name: 'vanilla:melee_weapon',
    hooks: ['onHitEntity'],
    create: (context) => {
        if (!('minecraft:weapon' in context.components)) return {};

        const onHitEntity: ItemHooks['onHitEntity'] = ({ itemStack, source, hitEntity, hadEffect }) => {
            if (!hadEffect) return;
            resolveWeaponHit(context, itemStack, source, hitEntity);
        };

        return { onHitEntity };
    }
};

/**
 * The mace's smash: extra damage from the fall, a ring of knockback, and the
 * fall itself cancelled, which is `MaceItem.hurtEnemy` and `postHurtEnemy`.
 *
 * The damage the smash adds reaches the hit through `attackDamage`'s
 * `itemBonus`; this behavior is the part that happens afterwards.
 */
export const maceBehavior: ItemBehaviorSpec = {
    name: 'vanilla:mace',
    hooks: ['onHitEntity'],
    create: (context) => {
        const onHitEntity: ItemHooks['onHitEntity'] = ({ source, hadEffect }) => {
            const state = context.world.stateOf(source);
            if (!hadEffect || state.fallDistance <= SMASH_ATTACK_FALL_THRESHOLD) return;

            context.world.perform({
                kind: 'play-sound',
                sound: state.fallDistance > 5 ? 'minecraft:mace.smash_ground_heavy' : 'minecraft:mace.smash_ground',
                position: state.position
            });
        };

        return { onHitEntity };
    }
};

/**
 * The trident: held to charge, released to throw, unless Riptide launches the
 * holder instead.
 *
 * Release maps onto `onCompleteUse`, because the hook table has no release
 * hook and neither does Mojang's `ItemCustomComponent`. The engine calls it
 * when a held use ends and `useDuration` says how long it was held, which is
 * what the ten-tick minimum is measured against.
 */
export const tridentBehavior: ItemBehaviorSpec = {
    name: 'vanilla:trident',
    hooks: ['onUse', 'onCompleteUse'],
    create: (context) => {
        const onUse: ItemHooks['onUse'] = () => ({});

        const onCompleteUse: ItemHooks['onCompleteUse'] = ({ itemStack, source, useDuration }) => {
            // `TridentItem.releaseUsing` wants ten ticks of draw.
            if (useDuration < 10) return undefined;

            const riptide = enchantmentLevel(itemStack, 'minecraft:riptide');
            const state = context.world.stateOf(source);
            if (riptide > 0) {
                if (!state.inWaterOrRain) return undefined;
                context.world.perform({
                    kind: 'play-sound',
                    sound: `minecraft:item.trident.riptide_${Math.min(riptide, 3)}`,
                    position: state.position
                });
                return { stack: spendItemDurability(context.world, itemStack, source, 1) };
            }

            context.world.perform({
                kind: 'launch-projectile',
                identifier: 'minecraft:thrown_trident',
                source,
                power: 2.5,
                inaccuracy: 1,
                data: { loyalty: enchantmentLevel(itemStack, 'minecraft:loyalty') }
            });
            context.world.perform({
                kind: 'play-sound',
                sound: 'minecraft:item.trident.throw',
                position: state.position
            });

            const spent = spendItemDurability(context.world, itemStack, source, 1);
            return { stack: spent.copy(Math.max(0, spent.count - 1)) };
        };

        return { onUse, onCompleteUse };
    }
};

/**
 * The spear's charge, from `minecraft:kinetic_weapon`.
 *
 * 1.26's spears are the only vanilla weapon whose rules are entirely data:
 * the damage multiplier, the delay, the forward movement and the sound all
 * come off the component. Holding the use charges; the stab itself is the
 * server's, which calls {@link kineticDamageOf} for the number.
 */
export const spearBehavior: ItemBehaviorSpec = {
    name: 'vanilla:spear',
    hooks: ['onUse'],
    create: (context) => {
        if (!('minecraft:kinetic_weapon' in context.components)) return {};

        const onUse: ItemHooks['onUse'] = ({ itemStack, source, useDuration }) => {
            if (useDuration > 0) return {};
            const rules = itemStack.params(kineticWeapon);
            const sound = rules?.hit_sound;
            if (typeof sound === 'string') {
                context.world.perform({
                    kind: 'play-sound',
                    sound,
                    position: context.world.stateOf(source).position
                });
            }
            return {};
        };

        return { onUse };
    }
};

/**
 * A spear's kinetic damage: the base attack damage scaled by the component's
 * multiplier against the charge, plus its flat modifier.
 *
 * @param charge - How much of the charge is built, 0 to 1.
 */
export const kineticDamageOf = (stack: ItemStack, baseDamage: number, charge: number): number => {
    const rules = stack.params(kineticWeapon);
    if (rules === undefined) return baseDamage;
    const multiplier = rules.damage_multiplier ?? 1;
    const modifier = rules.damage_modifier ?? 0;
    return baseDamage * (1 + (multiplier - 1) * Math.min(1, Math.max(0, charge))) + modifier;
};

/**
 * The shield: raising it, and the damage it takes for blocking.
 *
 * `minecraft:blocks_attacks` carries the whole rule set, including the quarter
 * second of delay before a raised shield counts and the `item_damage`
 * function that turns blocked damage into durability.
 */
export const shieldBehavior: ItemBehaviorSpec = {
    name: 'vanilla:shield',
    hooks: ['onUse'],
    create: (context) => {
        if (!('minecraft:blocks_attacks' in context.components)) return {};

        const onUse: ItemHooks['onUse'] = ({ itemStack, source, useDuration }) => {
            if (useDuration > 0) return {};
            const rules = itemStack.params(blocksAttacks);
            context.world.perform({
                kind: 'blocking',
                source,
                active: true,
                delayTicks: Math.round((rules?.block_delay_seconds ?? 0) * 20)
            });
            return {};
        };

        return { onUse };
    }
};

/**
 * The durability a blocked hit costs, which is
 * `minecraft:blocks_attacks.item_damage`: nothing below the threshold, and
 * `base + factor * damage` above it, floored.
 *
 * This is a server entry point rather than a hook, because blocking happens
 * on the damage path and the hook table has no hook for it.
 */
export const shieldDurabilityCost = (stack: ItemStack, blockedDamage: number): number => {
    const rules = stack.params(blocksAttacks);
    const itemDamage = rules?.item_damage;
    if (itemDamage === undefined) return 0;

    if (blockedDamage < (itemDamage.threshold ?? 0)) return 0;
    return Math.max(0, Math.floor((itemDamage.base ?? 0) + (itemDamage.factor ?? 0) * blockedDamage));
};

/** Every behavior this file declares. */
export const COMBAT_BEHAVIORS: readonly ItemBehaviorSpec[] = [
    maceBehavior,
    tridentBehavior,
    spearBehavior,
    shieldBehavior,
    meleeWeaponBehavior
];
