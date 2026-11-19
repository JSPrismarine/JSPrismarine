/**
 * The game rules `world.gameRules` reads and writes, under the names the Script API gives them,
 * with the value a new Bedrock world starts each at and the bounds BDS keeps a script's write
 * within. The `world-settings` scenario of the parity suite's `scripting.world` family recorded
 * the defaults and the bounds on the pinned Bedrock Dedicated Server.
 */

/** Whether a script's `playerWaypoints` shows every player on the locator bar. */
export type ScriptPlayerWaypointsMode = 'Everyone' | 'Off';

/** A game rule's value as a script reads it. */
export type ScriptGameRuleValue = boolean | number | ScriptPlayerWaypointsMode;

/** One rule: its default, and for a number, the bounds a write is kept within. */
export type ScriptGameRule =
    | { readonly type: 'boolean'; readonly default: boolean }
    | { readonly type: 'integer'; readonly default: number; readonly max?: number }
    | { readonly type: 'mode'; readonly default: ScriptPlayerWaypointsMode };

const on = { type: 'boolean', default: true } as const;
const off = { type: 'boolean', default: false } as const;

/** Every rule `GameRules` has, by its Script API name. */
export const SCRIPT_GAME_RULES = {
    commandBlockOutput: on,
    commandBlocksEnabled: on,
    doDayLightCycle: on,
    doEntityDrops: on,
    doFireTick: on,
    doImmediateRespawn: off,
    doInsomnia: on,
    doLimitedCrafting: off,
    doMobLoot: on,
    doMobSpawning: on,
    doTileDrops: on,
    doWeatherCycle: on,
    drowningDamage: on,
    fallDamage: on,
    fireDamage: on,
    freezeDamage: on,
    // BDS keeps a write of 10,003 at 10,000.
    functionCommandLimit: { type: 'integer', default: 10_000, max: 10_000 },
    keepInventory: off,
    maxCommandChainLength: { type: 'integer', default: 65_535 },
    mobGriefing: on,
    naturalRegeneration: on,
    playerWaypoints: { type: 'mode', default: 'Everyone' },
    // BDS takes 200 here, past the 100 percent the rule describes.
    playersSleepingPercentage: { type: 'integer', default: 100 },
    projectilesCanBreakBlocks: on,
    pvp: on,
    randomTickSpeed: { type: 'integer', default: 1 },
    recipesUnlock: on,
    respawnBlocksExplode: on,
    sendCommandFeedback: on,
    showBorderEffect: on,
    showCoordinates: off,
    showDaysPlayed: off,
    showDeathMessages: on,
    showRecipeMessages: on,
    showTags: on,
    spawnRadius: { type: 'integer', default: 0 },
    tntExplodes: on,
    tntExplosionDropDecay: on
} as const satisfies Readonly<Record<string, ScriptGameRule>>;

/** A rule's Script API name. */
export type ScriptGameRuleName = keyof typeof SCRIPT_GAME_RULES;

/** Whether a name is one of {@link SCRIPT_GAME_RULES}. */
export const isScriptGameRule = (name: string): name is ScriptGameRuleName => Object.hasOwn(SCRIPT_GAME_RULES, name);

/**
 * The value a write leaves a rule at, or undefined for one BDS ignores: a negative number, as
 * `randomTickSpeed = -1` was, keeps the value the rule had. A number drops its fraction and is
 * kept within the rule's maximum.
 */
export const gameRuleWrite = (
    name: ScriptGameRuleName,
    value: ScriptGameRuleValue
): ScriptGameRuleValue | undefined => {
    const rule: ScriptGameRule = SCRIPT_GAME_RULES[name];
    if (rule.type !== 'integer' || typeof value !== 'number') return value;
    const whole = Math.trunc(value);
    if (whole < 0) return undefined;
    return rule.max === undefined ? whole : Math.min(whole, rule.max);
};
