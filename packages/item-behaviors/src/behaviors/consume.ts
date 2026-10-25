/**
 * Eating and drinking.
 *
 * One behavior covers all 86 consumables, because Java 26.3 already says what
 * each one does: `minecraft:food` gives the nutrition,
 * `minecraft:consumable.on_consume_effects` gives the effects, and
 * `minecraft:use_remainder` gives the bowl or the bottle left behind. The
 * golden apple, the chorus fruit, the pufferfish and milk need no code of
 * their own.
 *
 * Three families do need code, because their effects are not in the component
 * that names them: a potion's are in a registry Java keeps in code, a
 * suspicious stew's were decided by the flower it was crafted with, and an
 * ominous bottle's amplifier is a number that has to become a Bad Omen.
 *
 * Those three run before the general behavior and return undefined, so the
 * dispatch reaches the general one, which produces the result. `registry.ts`
 * fixes that order and `registry.test.ts` asserts it.
 */
import type { ItemHooks, ItemStack } from '@jsprismarine/items';
import {
    food,
    ominousBottleAmplifier,
    potionContents,
    potionDurationScale,
    suspiciousStewEffects,
    useRemainder
} from '@jsprismarine/items';

import type { BehaviorContext, ItemBehaviorSpec } from '../behavior';
import { consumeOne, rawComponent, withCooldown } from '../behavior';
import { parseConsumeEffects, runConsumeEffects } from '../consumeEffects';
import type { EffectApplication, ItemSource } from '../world';

/** How long Bad Omen lasts, which is `OminousBottleItem`'s 100 minutes. */
export const BAD_OMEN_TICKS = 120_000;

/** The effect an ominous bottle applies. */
export const BAD_OMEN_EFFECT = 'minecraft:bad_omen';

/** A suspicious stew entry's duration when the component leaves it out. */
const DEFAULT_STEW_DURATION = 160;

/**
 * Whether the user can start eating this.
 *
 * Java's `Consumable.canConsume` lets a drink through always and a food only
 * when the hunger bar has room or the food is marked `can_always_eat`.
 */
const canConsume = (context: BehaviorContext, stack: ItemStack, source: ItemSource): boolean => {
    const nutrition = stack.params(food);
    if (nutrition === undefined) return true;
    if (nutrition.can_always_eat === true) return true;
    return context.world.stateOf(source).foodLevel < 20;
};

/**
 * What goes back in the slot after one is eaten, which is
 * `UseRemainder.convertIntoRemainder`: the remainder replaces the stack when
 * it was the last one, and is handed to the user otherwise.
 */
const remainderOf = (context: BehaviorContext, stack: ItemStack, source: ItemSource, creative: boolean): ItemStack => {
    const shrunk = consumeOne(stack, creative);
    const remainder = stack.params(useRemainder);
    if (remainder === undefined || creative) return shrunk;

    const produced = context.items.create(remainder.id, remainder.count ?? 1);
    if (produced === undefined) return shrunk;
    if (shrunk.empty) return produced;

    context.world.perform({ kind: 'give-item', source, item: produced });
    return shrunk;
};

/** Eating and drinking, for every item carrying `minecraft:food` or `minecraft:consumable`. */
export const consumableBehavior: ItemBehaviorSpec = {
    name: 'vanilla:consumable',
    hooks: ['onUse', 'onConsume'],
    create: (context) => {
        const hasConsumable = 'minecraft:consumable' in context.components;
        const hasFood = 'minecraft:food' in context.components;
        if (!hasConsumable && !hasFood) return {};

        const typeEffects = parseConsumeEffects(context.components['minecraft:consumable']);

        const onUse: ItemHooks['onUse'] = ({ itemStack, source }) =>
            canConsume(context, itemStack, source) ? {} : undefined;

        const onConsume: ItemHooks['onConsume'] = ({ itemStack, source }) => {
            const nutrition = itemStack.params(food);
            if (nutrition !== undefined) {
                context.world.perform({
                    kind: 'feed',
                    target: source,
                    nutrition: nutrition.nutrition,
                    saturation: nutrition.saturation
                });
            }

            const patched = itemStack.patch.get('minecraft:consumable');
            const effects =
                patched === undefined
                    ? typeEffects
                    : parseConsumeEffects(rawComponent(itemStack, 'minecraft:consumable'));
            runConsumeEffects(effects, source, context.world);

            const creative = context.world.stateOf(source).creative;
            return withCooldown(context.world, itemStack, source, {
                stack: remainderOf(context, itemStack, source, creative)
            });
        };

        return { onUse, onConsume };
    }
};

/** Scales a duration by `minecraft:potion_duration_scale`, which is how a lingering cloud weakens. */
const scaled = (duration: number, scale: number | undefined): number =>
    scale === undefined ? duration : Math.max(1, Math.round(duration * scale));

/**
 * The effects one potion stack applies: the registry's own list for the named
 * potion, plus whatever `custom_effects` adds, both scaled.
 */
export const potionEffectsOf = (context: BehaviorContext, stack: ItemStack): readonly EffectApplication[] => {
    const contents = stack.params(potionContents);
    if (contents === undefined) return [];
    const scale = stack.params(potionDurationScale);

    const named = contents.potion === undefined ? [] : context.world.effectsOf(contents.potion);
    const custom = (contents.custom_effects ?? []).map((effect) => ({
        id: effect.id,
        durationTicks: effect.duration ?? 1,
        amplifier: effect.amplifier ?? 0,
        showIcon: effect.show_icon ?? true
    }));

    return [...named, ...custom].map((effect) => ({
        ...effect,
        durationTicks: scaled(effect.durationTicks, scale)
    }));
};

/** Drinking a potion, which is the one consumable whose effects live in a registry. */
export const potionBehavior: ItemBehaviorSpec = {
    name: 'vanilla:potion',
    hooks: ['onConsume'],
    create: (context) => {
        if (!('minecraft:potion_contents' in context.components)) return {};

        const onConsume: ItemHooks['onConsume'] = ({ itemStack, source }) => {
            const effects = potionEffectsOf(context, itemStack);
            if (effects.length > 0) context.world.perform({ kind: 'apply-effects', target: source, effects });
            // The general consumable behavior produces the bottle and the result.
            return undefined;
        };

        return { onConsume };
    }
};

/** Eating a suspicious stew, whose effects the crafting flower wrote onto the stack. */
export const suspiciousStewBehavior: ItemBehaviorSpec = {
    name: 'vanilla:suspicious_stew',
    hooks: ['onConsume'],
    create: (context) => {
        if (!('minecraft:suspicious_stew_effects' in context.components)) return {};

        const onConsume: ItemHooks['onConsume'] = ({ itemStack, source }) => {
            const stored = itemStack.params(suspiciousStewEffects) ?? [];
            const effects = stored.map((entry) => ({
                id: entry.id,
                durationTicks: entry.duration ?? DEFAULT_STEW_DURATION,
                amplifier: 0,
                showIcon: true
            }));
            if (effects.length > 0) context.world.perform({ kind: 'apply-effects', target: source, effects });
            return undefined;
        };

        return { onConsume };
    }
};

/** Drinking an ominous bottle, which is Bad Omen at the amplifier the bottle carries. */
export const ominousBottleBehavior: ItemBehaviorSpec = {
    name: 'vanilla:ominous_bottle',
    hooks: ['onConsume'],
    create: (context) => {
        if (!('minecraft:ominous_bottle_amplifier' in context.components)) return {};

        const onConsume: ItemHooks['onConsume'] = ({ itemStack, source }) => {
            context.world.perform({
                kind: 'apply-effects',
                target: source,
                effects: [
                    {
                        id: BAD_OMEN_EFFECT,
                        durationTicks: BAD_OMEN_TICKS,
                        amplifier: itemStack.params(ominousBottleAmplifier) ?? 0,
                        showIcon: true
                    }
                ]
            });
            return undefined;
        };

        return { onConsume };
    }
};

/** Every behavior this file declares, in the order they have to be attached in. */
export const CONSUME_BEHAVIORS: readonly ItemBehaviorSpec[] = [
    potionBehavior,
    suspiciousStewBehavior,
    ominousBottleBehavior,
    consumableBehavior
];
