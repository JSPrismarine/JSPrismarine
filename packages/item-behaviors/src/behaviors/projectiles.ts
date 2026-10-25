/**
 * Launchers and throwables.
 *
 * The bow and the crossbow charge; the nine throwables go straight out. The
 * fishing rod is here too, because a cast hook is a projectile with a line on
 * it.
 *
 * A release is reported through `onCompleteUse`. The hook table has no
 * release hook and neither does Mojang's `ItemCustomComponent`, so the engine
 * calls `onCompleteUse` when a held use ends for any reason and
 * `useDuration` carries how long it was held. That number is the bow's whole
 * power curve.
 */
import type { ItemHooks, ItemStack } from '@jsprismarine/items';
import { chargedProjectiles, fireworks } from '@jsprismarine/items';

import type { ItemBehaviorSpec } from '../behavior';
import { consumeOne, onCooldown, spendItemDurability, withCooldown } from '../behavior';
import { enchantmentLevel, float } from '../formulas';
import type { ItemSource } from '../world';

/**
 * What each throwable launches and how hard, from Java's own item classes.
 *
 * The keys are Bedrock identifiers, because that is what an item type is
 * registered under; `registry.test.ts` checks every one of them against the
 * table, since a Java rename such as `map` to `empty_map` would otherwise go
 * unnoticed.
 */
export const THROWN_PROJECTILES: Readonly<Record<string, { readonly entity: string; readonly power: number }>> = {
    'minecraft:snowball': { entity: 'minecraft:snowball', power: 1.5 },
    'minecraft:egg': { entity: 'minecraft:egg', power: 1.5 },
    'minecraft:blue_egg': { entity: 'minecraft:egg', power: 1.5 },
    'minecraft:brown_egg': { entity: 'minecraft:egg', power: 1.5 },
    'minecraft:ender_pearl': { entity: 'minecraft:ender_pearl', power: 1.5 },
    'minecraft:experience_bottle': { entity: 'minecraft:experience_bottle', power: 0.7 },
    'minecraft:splash_potion': { entity: 'minecraft:splash_potion', power: 0.5 },
    'minecraft:lingering_potion': { entity: 'minecraft:lingering_potion', power: 0.5 },
    'minecraft:wind_charge': { entity: 'minecraft:wind_charge', power: 1.5 }
};

/** The inaccuracy Java gives a hand-thrown projectile. */
const THROW_INACCURACY = 1;

/**
 * The bow's power curve, which is `BowItem.getPowerForTime`:
 *
 * ```java
 * float pow = timeHeld / 20.0F;
 * pow = (pow * pow + pow * 2.0F) / 3.0F;
 * if (pow > 1.0F) pow = 1.0F;
 * ```
 *
 * A full draw is 20 ticks and gives 1; below 0.1 the shot does not happen at
 * all, and exactly 1 is what makes an arrow critical.
 */
export const bowPowerForTime = (ticksHeld: number): number => {
    const seconds = float(ticksHeld / 20);
    const power = float(float(float(seconds * seconds) + float(seconds * 2)) / 3);
    return power > 1 ? 1 : power;
};

/** The smallest draw that shoots anything, from `BowItem.releaseUsing`. */
export const BOW_MINIMUM_POWER = 0.1;

/** `BowItem.releaseUsing` multiplies the power by three to get the launch speed. */
export const BOW_LAUNCH_SCALE = 3;

/** Throwing: nine items, each a launch and one off the stack. */
export const throwableBehavior: ItemBehaviorSpec = {
    name: 'vanilla:throwable',
    hooks: ['onUse'],
    create: (context) => {
        const thrown = THROWN_PROJECTILES[context.identifier];
        if (thrown === undefined) return {};

        const onUse: ItemHooks['onUse'] = ({ itemStack, source }) => {
            if (onCooldown(context.world, itemStack, source)) return undefined;

            const state = context.world.stateOf(source);
            context.world.perform({
                kind: 'launch-projectile',
                identifier: thrown.entity,
                source,
                power: thrown.power,
                inaccuracy: THROW_INACCURACY,
                ...(itemStack.has('minecraft:potion_contents')
                    ? { data: { 'minecraft:potion_contents': itemStack.get('minecraft:potion_contents') } }
                    : {})
            });
            context.world.perform({
                kind: 'play-sound',
                sound: 'minecraft:entity.snowball.throw',
                position: state.position
            });

            return withCooldown(context.world, itemStack, source, {
                stack: consumeOne(itemStack, state.creative)
            });
        };

        return { onUse };
    }
};

/** The bow: hold to draw, release to shoot, Infinity keeps the arrow. */
export const bowBehavior: ItemBehaviorSpec = {
    name: 'vanilla:bow',
    hooks: ['onUse', 'onCompleteUse'],
    create: (context) => {
        const onUse: ItemHooks['onUse'] = () => ({});

        const onCompleteUse: ItemHooks['onCompleteUse'] = ({ itemStack, source, useDuration }) => {
            const power = bowPowerForTime(useDuration);
            if (power < BOW_MINIMUM_POWER) return undefined;

            const state = context.world.stateOf(source);
            context.world.perform({
                kind: 'launch-projectile',
                identifier: 'minecraft:arrow',
                source,
                power: power * BOW_LAUNCH_SCALE,
                inaccuracy: 1,
                data: {
                    critical: power === 1,
                    power: enchantmentLevel(itemStack, 'minecraft:power'),
                    punch: enchantmentLevel(itemStack, 'minecraft:punch'),
                    flame: enchantmentLevel(itemStack, 'minecraft:flame') > 0
                }
            });
            context.world.perform({
                kind: 'play-sound',
                sound: 'minecraft:entity.arrow.shoot',
                position: state.position
            });

            return { stack: spendItemDurability(context.world, itemStack, source, 1) };
        };

        return { onUse, onCompleteUse };
    }
};

/** How long a crossbow takes to charge, before Quick Charge, in ticks. */
export const CROSSBOW_CHARGE_TICKS = 25;

/** How much each Quick Charge level takes off the charge, in ticks. */
export const QUICK_CHARGE_TICKS_PER_LEVEL = 5;

/** The charge a crossbow needs with its enchantments applied, floored at zero. */
export const crossbowChargeTicks = (stack: ItemStack): number =>
    Math.max(
        0,
        CROSSBOW_CHARGE_TICKS - QUICK_CHARGE_TICKS_PER_LEVEL * enchantmentLevel(stack, 'minecraft:quick_charge')
    );

/** Whether the crossbow is holding something, which decides what a use does. */
const chargedWith = (stack: ItemStack): readonly { readonly id: string }[] => stack.params(chargedProjectiles) ?? [];

/**
 * The crossbow: a use charges it, and a use while charged fires it.
 *
 * The loaded projectile lives in `minecraft:charged_projectiles`, which is
 * the one component that makes the crossbow's two-step use expressible as
 * data rather than as a second item.
 */
export const crossbowBehavior: ItemBehaviorSpec = {
    name: 'vanilla:crossbow',
    hooks: ['onUse', 'onCompleteUse'],
    create: (context) => {
        const onUse: ItemHooks['onUse'] = ({ itemStack, source }) => {
            const loaded = chargedWith(itemStack);
            if (loaded.length === 0) return {};

            const state = context.world.stateOf(source);
            const multishot = enchantmentLevel(itemStack, 'minecraft:multishot') > 0;
            for (const [index, projectile] of loaded.entries()) {
                const shots = multishot ? [-10, 0, 10] : [0];
                for (const spread of shots) {
                    context.world.perform({
                        kind: 'launch-projectile',
                        identifier:
                            projectile.id === 'minecraft:firework_rocket'
                                ? 'minecraft:firework_rocket'
                                : 'minecraft:arrow',
                        source,
                        power: projectile.id === 'minecraft:firework_rocket' ? 1.6 : 3.15,
                        inaccuracy: Math.abs(spread),
                        data: {
                            piercing: enchantmentLevel(itemStack, 'minecraft:piercing'),
                            slot: index
                        }
                    });
                }
            }
            context.world.perform({
                kind: 'play-sound',
                sound: 'minecraft:item.crossbow.shoot',
                position: state.position
            });

            const fired = spendItemDurability(context.world, itemStack, source, 1);
            fired.set('minecraft:charged_projectiles', []);
            return { stack: fired };
        };

        const onCompleteUse: ItemHooks['onCompleteUse'] = ({ itemStack, source, useDuration }) => {
            if (chargedWith(itemStack).length > 0) return undefined;
            if (useDuration < crossbowChargeTicks(itemStack)) return undefined;

            const loaded = itemStack.copy();
            loaded.set('minecraft:charged_projectiles', [{ id: 'minecraft:arrow', count: 1 }]);
            context.world.perform({
                kind: 'play-sound',
                sound: 'minecraft:item.crossbow.loading_end',
                position: context.world.stateOf(source).position
            });
            return { stack: loaded };
        };

        return { onUse, onCompleteUse };
    }
};

/**
 * A firework rocket: launched from the hand, or used to boost a glide.
 *
 * Java's `FireworkRocketItem.use` spawns the entity either way; the boost is
 * the entity attaching itself to a gliding player rather than a second rule.
 */
export const fireworkRocketBehavior: ItemBehaviorSpec = {
    name: 'vanilla:firework_rocket',
    hooks: ['onUse', 'onUseOn'],
    create: (context) => {
        if (!('minecraft:fireworks' in context.components)) return {};

        const launch = (itemStack: ItemStack, source: ItemSource, at: { x: number; y: number; z: number }) => {
            const state = context.world.stateOf(source);
            const flight = itemStack.params(fireworks)?.flight_duration ?? 1;
            context.world.perform({
                kind: 'spawn-entity',
                identifier: 'minecraft:firework_rocket',
                position: at,
                data: { 'minecraft:fireworks': itemStack.get('minecraft:fireworks'), flight_duration: flight },
                ...(state.gliding ? { attachedTo: source } : {})
            });
            return { stack: consumeOne(itemStack, state.creative) };
        };

        const onUse: ItemHooks['onUse'] = ({ itemStack, source }) =>
            launch(itemStack, source, context.world.stateOf(source).position);

        const onUseOn: ItemHooks['onUseOn'] = ({ itemStack, source, faceLocation, block }) =>
            launch(itemStack, source, {
                x: block.position.x + faceLocation.x,
                y: block.position.y + faceLocation.y,
                z: block.position.z + faceLocation.z
            });

        return { onUse, onUseOn };
    }
};

/** The fishing rod: a use casts the hook, and a use while cast reels it in. */
export const fishingRodBehavior: ItemBehaviorSpec = {
    name: 'vanilla:fishing_rod',
    hooks: ['onUse'],
    create: (context) => {
        const onUse: ItemHooks['onUse'] = ({ itemStack, source }) => {
            // A cast rod is one the engine tracks; the behavior reads the
            // state back as a cooldown group so it needs no second component.
            const cast = !onCooldown(context.world, itemStack, source);
            context.world.perform({ kind: 'fishing', source, cast });
            context.world.perform({
                kind: 'play-sound',
                sound: cast ? 'minecraft:entity.fishing_bobber.throw' : 'minecraft:entity.fishing_bobber.retrieve',
                position: context.world.stateOf(source).position
            });
            return { stack: cast ? itemStack.copy() : spendItemDurability(context.world, itemStack, source, 1) };
        };

        return { onUse };
    }
};

/** The carrot on a stick and the warped fungus on a stick, which steer a mount. */
export const steeringRodBehavior: ItemBehaviorSpec = {
    name: 'vanilla:steering_rod',
    hooks: ['onUse'],
    create: (context) => {
        const onUse: ItemHooks['onUse'] = ({ itemStack, source }) => {
            const target = context.world.targetOf(source);
            if (target === undefined) return undefined;
            context.world.perform({
                kind: 'play-sound',
                sound: 'minecraft:entity.pig.step',
                position: context.world.stateOf(target).position
            });
            return { stack: spendItemDurability(context.world, itemStack, source, 7) };
        };

        return { onUse };
    }
};

/** Every behavior this file declares. */
export const PROJECTILE_BEHAVIORS: readonly ItemBehaviorSpec[] = [
    bowBehavior,
    crossbowBehavior,
    throwableBehavior,
    fireworkRocketBehavior,
    fishingRodBehavior,
    steeringRodBehavior
];
