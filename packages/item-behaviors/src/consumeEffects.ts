/**
 * The five consume effects.
 *
 * `minecraft:consumable.on_consume_effects` and
 * `minecraft:death_protection.death_effects` are the same tagged union, and
 * Java 26.3 registers exactly five members of it: apply, remove, clear,
 * teleport and play a sound. Every food effect in the game is one of these,
 * which is why the golden apple, the chorus fruit, the pufferfish, milk and
 * the honey bottle need no code of their own.
 *
 * The item package parses the discriminator and stops, by design, so this
 * module parses the payload once per item type at load and the behaviors run
 * the result.
 */
import type { HolderSet } from '@jsprismarine/items';

import { booleanField, fieldOf, listField, numberField, stringField } from './raw';
import type { EffectApplication, ItemSource, WorldActions } from './world';

/** `minecraft:apply_effects`: give the effects, with a probability. */
export interface ApplyEffectsConsumeEffect {
    readonly kind: 'apply-effects';
    readonly effects: readonly EffectApplication[];
    /** From 0 to 1; `apply_effects` defaults it to 1. */
    readonly probability: number;
}

/** `minecraft:remove_effects`: take the named effects off. */
export interface RemoveEffectsConsumeEffect {
    readonly kind: 'remove-effects';
    readonly effects: HolderSet;
}

/** `minecraft:clear_all_effects`: take every effect off, which is milk. */
export interface ClearEffectsConsumeEffect {
    readonly kind: 'clear-all-effects';
}

/** `minecraft:teleport_randomly`: the chorus fruit's hop. */
export interface TeleportConsumeEffect {
    readonly kind: 'teleport-randomly';
    /** The search box's width in blocks; Java defaults it to 16. */
    readonly diameter: number;
}

/** `minecraft:play_sound`: a sound at the consumer. */
export interface PlaySoundConsumeEffect {
    readonly kind: 'play-sound';
    readonly sound: string;
}

/** One consume effect, parsed. */
export type ConsumeEffect =
    | ApplyEffectsConsumeEffect
    | ClearEffectsConsumeEffect
    | PlaySoundConsumeEffect
    | RemoveEffectsConsumeEffect
    | TeleportConsumeEffect;

/** Java's default diameter for `minecraft:teleport_randomly`. */
export const DEFAULT_TELEPORT_DIAMETER = 16;

/**
 * Parses one `MobEffectInstance`, whose codec defaults everything but the id:
 * duration 1 tick, amplifier 0, and the icon shown.
 */
const parseEffect = (value: unknown): EffectApplication | undefined => {
    const id = stringField(value, 'id');
    if (id === undefined) return undefined;
    return {
        id,
        durationTicks: numberField(value, 'duration') ?? 1,
        amplifier: numberField(value, 'amplifier') ?? 0,
        showIcon: booleanField(value, 'show_icon') ?? true
    };
};

/** Parses a holder set in the three forms Java writes one: a tag, an id, or a list. */
const parseHolderSet = (value: unknown): HolderSet | undefined => {
    if (typeof value === 'string') {
        return value.startsWith('#') ? { kind: 'tag', tag: value.slice(1) } : { kind: 'entries', entries: [value] };
    }
    if (!Array.isArray(value)) return undefined;
    const entries = value.filter((entry): entry is string => typeof entry === 'string');
    return { kind: 'entries', entries };
};

/** Parses one entry of a consume effect list. */
export const parseConsumeEffect = (value: unknown): ConsumeEffect | undefined => {
    switch (stringField(value, 'type')) {
        case 'minecraft:apply_effects': {
            const effects = listField(value, 'effects')
                .map(parseEffect)
                .filter((effect): effect is EffectApplication => effect !== undefined);
            return effects.length === 0
                ? undefined
                : { kind: 'apply-effects', effects, probability: numberField(value, 'probability') ?? 1 };
        }
        case 'minecraft:remove_effects': {
            const effects = parseHolderSet(fieldOf(value, 'effects'));
            return effects === undefined ? undefined : { kind: 'remove-effects', effects };
        }
        case 'minecraft:clear_all_effects':
            return { kind: 'clear-all-effects' };
        case 'minecraft:teleport_randomly':
            return {
                kind: 'teleport-randomly',
                diameter: numberField(value, 'diameter') ?? DEFAULT_TELEPORT_DIAMETER
            };
        case 'minecraft:play_sound': {
            const sound = stringField(value, 'sound') ?? stringField(fieldOf(value, 'sound'), 'sound_id');
            return sound === undefined ? undefined : { kind: 'play-sound', sound };
        }
        default:
            return undefined;
    }
};

/**
 * Parses a whole consume effect list.
 *
 * An entry whose type is not one of the five is dropped rather than failing
 * the load, which is the same leniency the item package's schemas take: a
 * release that adds a sixth should not stop the server from starting.
 */
export const parseConsumeEffects = (value: unknown): readonly ConsumeEffect[] =>
    listField(value, 'on_consume_effects')
        .map(parseConsumeEffect)
        .filter((effect): effect is ConsumeEffect => effect !== undefined);

/** Parses `minecraft:death_protection`'s list, which is the same union under another key. */
export const parseDeathEffects = (value: unknown): readonly ConsumeEffect[] =>
    listField(value, 'death_effects')
        .map(parseConsumeEffect)
        .filter((effect): effect is ConsumeEffect => effect !== undefined);

/**
 * Runs the parsed effects on a target.
 *
 * A probability below 1 draws once per effect, which is what makes raw
 * chicken poison three bites in ten rather than every bite.
 */
export const runConsumeEffects = (effects: readonly ConsumeEffect[], target: ItemSource, world: WorldActions): void => {
    for (const effect of effects) {
        switch (effect.kind) {
            case 'apply-effects':
                if (effect.probability < 1 && world.random() >= effect.probability) break;
                world.perform({ kind: 'apply-effects', target, effects: effect.effects });
                break;
            case 'remove-effects':
                world.perform({ kind: 'remove-effects', target, effects: effect.effects });
                break;
            case 'clear-all-effects':
                world.perform({ kind: 'remove-effects', target });
                break;
            case 'teleport-randomly':
                world.perform({ kind: 'teleport-randomly', target, radius: effect.diameter / 2 });
                break;
            case 'play-sound':
                world.perform({ kind: 'play-sound', sound: effect.sound, position: world.stateOf(target).position });
                break;
        }
    }
};
