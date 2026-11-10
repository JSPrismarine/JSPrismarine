import type { StatusEffect } from './StatusEffect';
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

/** What {@link tickStatusEffects} reads and writes of the holder of a set of effects. */
export interface StatusEffectHolder {
    /** The holder's active effects by id, which the tick counts down in place. */
    readonly effects: Map<string, StatusEffect>;
    /** How many ticks the holder's effects have been ticked, the clock of an endless effect. */
    readonly age: number;
    /** What one effect does on the holder this tick, such as Poison's damage. */
    apply(effect: StatusEffect, clock: number): Promise<void> | void;
    /** Takes one spent effect off the holder and tells clients. */
    remove(id: string): void;
}

/**
 * Applies the effects that act on the server, then counts finite ones down and takes off the
 * ones that ran out.
 *
 * Speed, jump boost, night vision and the like are the client's to apply once it has been told
 * of the effect; what lands here is what changes health, food and the damage taken. An instant
 * effect acts on the first tick and is spent, and an effect with a duration of one tick still
 * acts before it expires.
 */
export const tickStatusEffects = async (holder: StatusEffectHolder): Promise<void> => {
    const { effects } = holder;
    // Most entities carry no effects, and copying an empty map into an array every tick adds up.
    if (effects.size === 0) return;

    for (const effect of [...effects.values()]) {
        const clock = effect.durationTicks < 0 ? holder.age : effect.durationTicks;
        await holder.apply(effect, clock);

        // Applying an effect can kill the holder, clear its effects or replace this one.
        if (effects.get(effect.id) !== effect) continue;
        if (isInstantEffect(effect.id) || (effect.durationTicks >= 0 && effect.durationTicks <= 1)) {
            holder.remove(effect.id);
            continue;
        }
        if (effect.durationTicks < 0) continue;
        effects.set(effect.id, { ...effect, durationTicks: effect.durationTicks - 1 });
    }
};
