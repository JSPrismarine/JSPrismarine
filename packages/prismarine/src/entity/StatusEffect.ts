/** The status effect state an actor holds and sends to Bedrock clients. */
export interface StatusEffect {
    /** The namespaced Bedrock effect identifier. */
    readonly id: string;
    /** One below the displayed potency. */
    readonly amplifier: number;
    /** Ticks remaining, or `-1` for an effect that never expires. */
    readonly durationTicks: number;
    /** Whether the effect came from an ambient source such as a beacon. */
    readonly ambient: boolean;
    /** Whether the effect draws particles around the actor. */
    readonly showParticles: boolean;
    /** Whether the effect has a HUD icon. */
    readonly showIcon: boolean;
}

/** Values an effect application may override. */
export type StatusEffectInput = Pick<StatusEffect, 'id' | 'amplifier' | 'durationTicks'> &
    Partial<Pick<StatusEffect, 'ambient' | 'showParticles' | 'showIcon'>>;

/** What a change packet does to one effect. */
export type StatusEffectChange = 'add' | 'update' | 'remove';

/** Bedrock's numeric effect ids, which are the ids MobEffectPacket carries. */
const BEDROCK_MOB_EFFECT_IDS: ReadonlyMap<string, number> = new Map(
    Object.entries({
        'minecraft:speed': 1,
        'minecraft:slowness': 2,
        'minecraft:haste': 3,
        'minecraft:mining_fatigue': 4,
        'minecraft:strength': 5,
        'minecraft:instant_health': 6,
        'minecraft:instant_damage': 7,
        'minecraft:jump_boost': 8,
        'minecraft:nausea': 9,
        'minecraft:regeneration': 10,
        'minecraft:resistance': 11,
        'minecraft:fire_resistance': 12,
        'minecraft:water_breathing': 13,
        'minecraft:invisibility': 14,
        'minecraft:blindness': 15,
        'minecraft:night_vision': 16,
        'minecraft:hunger': 17,
        'minecraft:weakness': 18,
        'minecraft:poison': 19,
        'minecraft:wither': 20,
        'minecraft:health_boost': 21,
        'minecraft:absorption': 22,
        'minecraft:saturation': 23,
        'minecraft:levitation': 24,
        'minecraft:fatal_poison': 25,
        'minecraft:slow_falling': 26,
        'minecraft:conduit_power': 27,
        'minecraft:bad_omen': 28,
        'minecraft:village_hero': 29,
        'minecraft:darkness': 30,
        'minecraft:trial_omen': 31,
        'minecraft:raid_omen': 32,
        'minecraft:wind_charged': 33,
        'minecraft:weaving': 34,
        'minecraft:oozing': 35,
        'minecraft:infested': 36,
        'minecraft:breath_of_the_nautilus': 37
    })
);

const BEDROCK_MOB_EFFECTS_BY_ID = new Map([...BEDROCK_MOB_EFFECT_IDS].map(([identifier, id]) => [id, identifier]));

/** Gives a status effect its namespaced identifier and Bedrock spelling. */
export const normalizeStatusEffectId = (identifier: string): string => {
    const namespaced = identifier.includes(':') ? identifier : `minecraft:${identifier}`;
    return namespaced === 'minecraft:hero_of_the_village' ? 'minecraft:village_hero' : namespaced;
};

/**
 * Adds or refreshes one effect in a status-effect map using Bedrock's precedence rules.
 * @param effects - The active effects to update.
 * @param input - The requested effect state.
 * @returns The packet change, or undefined when the effect was invalid or unchanged.
 */
export const mergeStatusEffect = (
    effects: Map<string, StatusEffect>,
    input: StatusEffectInput
): StatusEffectChange | undefined => {
    const id = normalizeStatusEffectId(input.id);
    if (bedrockMobEffectId(id) === undefined) return undefined;

    const durationTicks = Math.trunc(input.durationTicks);
    if (
        !Number.isFinite(durationTicks) ||
        durationTicks === 0 ||
        durationTicks < -1 ||
        !Number.isFinite(input.amplifier)
    )
        return undefined;

    const next: StatusEffect = {
        id,
        amplifier: Math.max(0, Math.min(255, Math.trunc(input.amplifier))),
        durationTicks,
        ambient: input.ambient ?? false,
        showParticles: input.showParticles ?? true,
        showIcon: input.showIcon ?? true
    };
    const previous = effects.get(id);
    if (previous !== undefined) {
        const previousDuration = previous.durationTicks < 0 ? Number.POSITIVE_INFINITY : previous.durationTicks;
        const nextDuration = next.durationTicks < 0 ? Number.POSITIVE_INFINITY : next.durationTicks;
        if (next.amplifier < previous.amplifier) return undefined;
        if (
            next.amplifier === previous.amplifier &&
            nextDuration <= previousDuration &&
            next.ambient === previous.ambient &&
            next.showParticles === previous.showParticles &&
            next.showIcon === previous.showIcon
        )
            return undefined;
    }

    effects.set(id, next);
    return previous === undefined ? 'add' : 'update';
};

/** Removes one effect from a status-effect map. */
export const removeStatusEffectFromMap = (
    effects: Map<string, StatusEffect>,
    identifier: string
): StatusEffect | undefined => {
    const id = normalizeStatusEffectId(identifier);
    const previous = effects.get(id);
    if (previous === undefined) return undefined;
    effects.delete(id);
    return previous;
};

/** The MobEffectPacket id for a Bedrock effect, or undefined for an unsupported effect. */
export const bedrockMobEffectId = (identifier: string): number | undefined =>
    BEDROCK_MOB_EFFECT_IDS.get(normalizeStatusEffectId(identifier));

/** The Bedrock effect name stored in actor NBT for a numeric id. */
export const bedrockMobEffectIdentifier = (id: number): string | undefined => BEDROCK_MOB_EFFECTS_BY_ID.get(id);
