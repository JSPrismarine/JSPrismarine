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
 * Whether a boolean game rule is on.
 *
 * Off only when the world says so. A world that carries no rule of that name, which is every
 * world before its rules are registered, reads as on, because that is the default of all three
 * rules named here and it is the answer the class-based paths already give.
 *
 * @param rule - One of this module's ids.
 */
export const ruleIsOn = (level: ContentLevelFacts, rule: string): boolean => level.gameRule(rule) !== false;
