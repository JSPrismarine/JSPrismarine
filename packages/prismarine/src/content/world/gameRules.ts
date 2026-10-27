/**
 * The game rules the content path reads, and how it reads them.
 *
 * `@jsprismarine/commands` holds the whole 26.3 registry: the 1.21.11 id of every rule, the
 * pre-1.21.11 camelCase names it was renamed from, and Bedrock's own lowercase spelling. This
 * module names the handful of rules the content packages gate on and resolves each one through
 * that registry, so the spellings live in one place and a rule renamed again breaks the build
 * here instead of quietly reading nothing.
 */
import { gameRule } from '@jsprismarine/commands';

import type { ContentLevelFacts } from './adapter';

/**
 * The 1.21.11 id of one game rule.
 *
 * @param name - Any spelling the registry knows.
 * @throws {Error} When the registry has no rule of that name, which means this module names a
 *   rule that no longer exists.
 */
const idOf = (name: string): string => {
    const rule = gameRule(name);
    if (rule === undefined) throw new Error(`${name} is not a game rule of the 26.3 registry`);
    return rule.name;
};

/** `minecraft:mob_griefing`: whether a mob may change the world around it. */
export const MOB_GRIEFING = idOf('mobGriefing');

/** `minecraft:block_drops`: whether a broken block leaves its items behind. */
export const BLOCK_DROPS = idOf('doTileDrops');

/** `minecraft:mob_drops`: whether a dead mob leaves its loot behind. */
export const MOB_DROPS = idOf('doMobLoot');

/** `minecraft:tnt_explodes`: whether primed TNT detonates and chains. */
export const TNT_EXPLODES = idOf('tntExplodes');

/** `minecraft:spawn_mobs`: whether the natural spawn cycle runs. */
export const SPAWN_MOBS = idOf('doMobSpawning');

/** `minecraft:fire_spread_radius_around_player`: how far from a player fire ticks. */
export const FIRE_SPREAD_RADIUS = idOf('doFireTick');

/** `minecraft:fire_damage`: whether fire hurts entities. */
export const FIRE_DAMAGE = idOf('fireDamage');

/**
 * The default of {@link FIRE_SPREAD_RADIUS}, in blocks.
 *
 * `GameRules.registerInteger("fire_spread_radius_around_player", UPDATES, 128, -1)` in the 26.3
 * jar: a default of 128 and a minimum of -1.
 */
export const DEFAULT_FIRE_SPREAD_RADIUS = 128;

/** The one value of {@link FIRE_SPREAD_RADIUS} that lifts the limit, which is its minimum. */
export const UNLIMITED_FIRE_SPREAD_RADIUS = -1;

/**
 * The fire spread radius a stored rule value means.
 *
 * 1.21.11 folded the booleans `doFireTick` and `allowFireTicksAwayFromPlayer` into this one
 * integer, and a Bedrock world registers only the first of the two, so a boolean still arrives
 * here. Mojang's own `GameRuleRegistryFix` converts it: off is 0, which no player is ever close
 * enough to, and on is the default 128. The third value the fix produces, -1 for a world that
 * also had `allowFireTicksAwayFromPlayer` on, has no Bedrock spelling to arrive under.
 *
 * @param value - What the world stored, or undefined when it registered no such rule.
 */
export const fireSpreadRadius = (value: boolean | number | undefined): number => {
    if (typeof value === 'number') return value;
    return value === false ? 0 : DEFAULT_FIRE_SPREAD_RADIUS;
};

/**
 * Every spelling one game rule might be stored under, the 1.21.11 id first.
 *
 * A Bedrock world registers its rules under the camelCase names the client matches on, and the
 * content path asks by the id. This is the map between them, so neither end has to know the
 * other's spelling.
 *
 * @param name - Any spelling of a rule.
 * @returns The id, the pre-1.21.11 names and Bedrock's name. A name the registry does not know
 *   comes back on its own, which is how a Bedrock-only rule such as `showCoordinates` resolves.
 */
export const gameRuleSpellings = (name: string): readonly string[] => {
    const rule = gameRule(name);
    if (rule === undefined) return [name];
    return [rule.name, ...rule.legacyNames, ...(rule.bedrockName === undefined ? [] : [rule.bedrockName])];
};

/**
 * Where a world keeps its game rules, which is {@link import('../../world/GameRuleManager')}.
 *
 * Named structurally so that this module, and the world code that reads a rule outside the
 * content adapter, depend on the one lookup rather than on the class.
 */
export interface GameRuleStore {
    /** One rule's value and editability, or undefined when the world registered no such rule. */
    findGameRule(name: string): readonly [value: boolean | number, editable: boolean] | undefined;
}

/**
 * One game rule's value, under whichever spelling the world stored it.
 *
 * @param rules - The world's rules, or null for a world that has none yet, which answers
 *   undefined for every rule and so reads as every default.
 * @param name - Any spelling the registry knows; see {@link gameRuleSpellings}.
 * @returns The value, or undefined when the world carries no rule of that name.
 */
export const gameRuleValue = (rules: GameRuleStore | null, name: string): boolean | number | undefined => {
    if (rules === null) return undefined;

    for (const spelling of gameRuleSpellings(name)) {
        const found = rules.findGameRule(spelling);
        if (found !== undefined) return found[0];
    }
    return undefined;
};

/**
 * Whether a boolean game rule is on.
 *
 * Off only when the world says so. A world that carries no rule of that name, which is every
 * world before its rules are registered, reads as on, because that is the default of all three
 * rules named here and it is the answer the class-based paths already give.
 *
 * @param rule - One of this module's ids.
 */
export const ruleIsOn = (level: ContentLevelFacts, rule: string): boolean => level.gameRule(rule) !== false;
