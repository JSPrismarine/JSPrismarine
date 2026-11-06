import { DamageCause } from './DamageCause';

/** What one effect does to its holder's health on a tick it applies. */
export type EffectHealthChange =
    | { readonly kind: 'heal'; readonly amount: number }
    | { readonly kind: 'damage'; readonly amount: number; readonly cause: DamageCause };

/** The effects that act once, the tick after they are given, whatever duration they were given. */
const INSTANT_EFFECTS: ReadonlySet<string> = new Set([
    'minecraft:instant_health',
    'minecraft:instant_damage',
    'minecraft:saturation'
]);

/** Whether an effect applies once and is then spent, Java's `InstantenousMobEffect`. */
export const isInstantEffect = (id: string): boolean => INSTANT_EFFECTS.has(id);

/**
 * Java's `shouldApplyEffectTickThisTick` for the effects that repeat: every `base >> amplifier`
 * ticks, and on every tick once the shifted interval reaches zero.
 */
const repeatsThisTick = (base: number, amplifier: number, clock: number): boolean => {
    const interval = base >> amplifier;
    return interval > 0 ? clock % interval === 0 : true;
};

/**
 * What an effect does to health on one tick, from the 26.3 server's `MobEffect.applyEffectTick`.
 *
 * Healing and harm are in half-hearts. Poison stops at one half-heart and wither does not, and
 * Bedrock's fatal poison is poison without the stop. Potency scales the instant effects by a
 * left shift, so level two heals eight and level six heals 128.
 * @param id - The namespaced effect id.
 * @param amplifier - One below the displayed level.
 * @param clock - What the repeat interval counts: the ticks the effect has left, or the holder's
 * age for one that never expires.
 * @param health - The holder's health now.
 * @param maxHealth - The holder's maximum health.
 * @returns The change to apply this tick, or undefined when the effect does nothing to health now.
 */
export const effectHealthChange = (
    id: string,
    amplifier: number,
    clock: number,
    health: number,
    maxHealth: number
): EffectHealthChange | undefined => {
    switch (id) {
        case 'minecraft:instant_health':
            return { kind: 'heal', amount: Math.max(4 * 2 ** amplifier, 0) };
        case 'minecraft:instant_damage':
            return { kind: 'damage', amount: 6 * 2 ** amplifier, cause: DamageCause.Magic };
        case 'minecraft:regeneration':
            if (!repeatsThisTick(50, amplifier, clock) || health >= maxHealth) return undefined;
            return { kind: 'heal', amount: 1 };
        case 'minecraft:poison':
            if (!repeatsThisTick(25, amplifier, clock) || health <= 1) return undefined;
            return { kind: 'damage', amount: 1, cause: DamageCause.Magic };
        case 'minecraft:fatal_poison':
            if (!repeatsThisTick(25, amplifier, clock)) return undefined;
            return { kind: 'damage', amount: 1, cause: DamageCause.Magic };
        case 'minecraft:wither':
            if (!repeatsThisTick(40, amplifier, clock)) return undefined;
            return { kind: 'damage', amount: 1, cause: DamageCause.Wither };
        default:
            return undefined;
    }
};
