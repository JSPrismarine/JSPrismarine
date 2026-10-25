/**
 * The Java gamerule registry at 26.3, the 1.21.11 renames, and the Bedrock
 * names that line up with it.
 *
 * 1.21.11 moved gamerules into a registry and renamed every one of them from
 * camelCase to a namespaced snake_case id. The mcfunction runtime reads two of
 * them, `minecraft:max_command_sequence_length` and `minecraft:max_command_forks`,
 * and anything written against `maxCommandChainLength` or `maxCommandForkCount`
 * is stale.
 *
 * The current names are Mojang's own `minecraft:game_rule` registry report
 * from the 26.3 data generator, which lists 59 rules. The legacy names are the
 * old-to-new map inside `GameRuleRegistryFix.class` in the same jar, read from
 * its constant pool:
 *
 *     python3 -I cpstrings.py net/minecraft/util/datafix/fixes/GameRuleRegistryFix.class
 *
 * That map carries 59 legacy names over 58 current ones (`enableCommandBlocks`
 * and `commandBlocksEnabled` both become `minecraft:command_blocks_work`), of
 * which 27 change more than case. The 59th current rule,
 * `minecraft:fire_spread_radius_around_player`, is not a rename: the fix folds
 * the old booleans `doFireTick` and `allowFireTicksAwayFromPlayer` into one
 * integer radius. Three rules were removed outright.
 *
 * The Bedrock side is read from the generated command table rather than
 * repeated here, because Mojang ships it as the `BoolGameRule` and
 * `IntGameRule` enums of `/gamerule`.
 */
import { bedrockCommandEnum } from './bedrockTable';

/** What a gamerule's value is. */
export type GameRuleType = 'boolean' | 'integer';

/** One gamerule of the 26.3 `minecraft:game_rule` registry. */
export interface GameRule {
    /** The namespaced id 1.21.11 gave it. */
    readonly name: string;
    readonly type: GameRuleType;
    /** The camelCase names a pre-1.21.11 world or command used. */
    readonly legacyNames: readonly string[];
    /** Bedrock's lowercase unnamespaced name, when Bedrock has this rule. */
    readonly bedrockName?: string;
    /** The smallest value 1.21.11 accepts, where it states one. */
    readonly min?: number;
    /** The default, where this repository has a source for it. */
    readonly default?: number;
}

/**
 * The three rules this package states a default for.
 *
 * Mojang has never published the numbers. `GameRules.class` in the 26.3 jar
 * has exactly three integer constants in its pool, `[32768, 65536, 2147483647]`,
 * and two independent secondary sources give the same figures: minecraft.wiki's
 * gamerule page, and the `assets/game_rules.json` that `Pumpkin-MC/Extractor`
 * extracted from the real 26.3 jar. Treat them as well corroborated rather
 * than primary. The minimums are from the 1.21.11 changelog, which does state
 * them; the same extraction reports 0 rather than 1 for
 * `minecraft:max_command_forks`, and the changelog is preferred here.
 */
const LIMITS: Readonly<Record<string, { min: number; default: number }>> = {
    'minecraft:max_block_modifications': { min: 1, default: 32_768 },
    'minecraft:max_command_forks': { min: 1, default: 65_536 },
    'minecraft:max_command_sequence_length': { min: 0, default: 65_536 }
};

/** `name, type, legacy names, Bedrock name`, in registry order. */
const ROWS: readonly [string, GameRuleType, string, string?][] = [
    ['advance_time', 'boolean', 'doDaylightCycle', 'dodaylightcycle'],
    ['advance_weather', 'boolean', 'doWeatherCycle', 'doweathercycle'],
    ['allow_entering_nether_using_portals', 'boolean', 'allowEnteringNetherUsingPortals'],
    ['block_drops', 'boolean', 'doTileDrops', 'dotiledrops'],
    ['block_explosion_drop_decay', 'boolean', 'blockExplosionDropDecay'],
    ['command_blocks_work', 'boolean', 'enableCommandBlocks commandBlocksEnabled', 'commandblocksenabled'],
    ['command_block_output', 'boolean', 'commandBlockOutput', 'commandblockoutput'],
    ['drowning_damage', 'boolean', 'drowningDamage', 'drowningdamage'],
    ['elytra_movement_check', 'boolean', 'disableElytraMovementCheck'],
    ['ender_pearls_vanish_on_death', 'boolean', 'enderPearlsVanishOnDeath'],
    ['entity_drops', 'boolean', 'doEntityDrops', 'doentitydrops'],
    ['fall_damage', 'boolean', 'fallDamage', 'falldamage'],
    ['fire_damage', 'boolean', 'fireDamage', 'firedamage'],
    ['fire_spread_radius_around_player', 'integer', 'doFireTick allowFireTicksAwayFromPlayer', 'dofiretick'],
    ['forgive_dead_players', 'boolean', 'forgiveDeadPlayers'],
    ['freeze_damage', 'boolean', 'freezeDamage', 'freezedamage'],
    ['global_sound_events', 'boolean', 'globalSoundEvents'],
    ['immediate_respawn', 'boolean', 'doImmediateRespawn', 'doimmediaterespawn'],
    ['keep_inventory', 'boolean', 'keepInventory', 'keepinventory'],
    ['lava_source_conversion', 'boolean', 'lavaSourceConversion'],
    ['limited_crafting', 'boolean', 'doLimitedCrafting', 'dolimitedcrafting'],
    ['locator_bar', 'boolean', 'locatorBar'],
    ['log_admin_commands', 'boolean', 'logAdminCommands'],
    ['max_block_modifications', 'integer', 'commandModificationBlockLimit'],
    ['max_command_forks', 'integer', 'maxCommandForkCount'],
    ['max_command_sequence_length', 'integer', 'maxCommandChainLength', 'maxcommandchainlength'],
    ['max_entity_cramming', 'integer', 'maxEntityCramming'],
    ['max_minecart_speed', 'integer', 'minecartMaxSpeed'],
    ['max_snow_accumulation_height', 'integer', 'snowAccumulationHeight'],
    ['mob_drops', 'boolean', 'doMobLoot', 'domobloot'],
    ['mob_explosion_drop_decay', 'boolean', 'mobExplosionDropDecay'],
    ['mob_griefing', 'boolean', 'mobGriefing', 'mobgriefing'],
    ['natural_health_regeneration', 'boolean', 'naturalRegeneration', 'naturalregeneration'],
    ['player_movement_check', 'boolean', 'disablePlayerMovementCheck'],
    ['players_nether_portal_creative_delay', 'integer', 'playersNetherPortalCreativeDelay'],
    ['players_nether_portal_default_delay', 'integer', 'playersNetherPortalDefaultDelay'],
    ['players_sleeping_percentage', 'integer', 'playersSleepingPercentage', 'playerssleepingpercentage'],
    ['projectiles_can_break_blocks', 'boolean', 'projectilesCanBreakBlocks', 'projectilescanbreakblocks'],
    ['pvp', 'boolean', 'pvp', 'pvp'],
    ['raids', 'boolean', 'disableRaids'],
    ['random_tick_speed', 'integer', 'randomTickSpeed', 'randomtickspeed'],
    ['reduced_debug_info', 'boolean', 'reducedDebugInfo'],
    ['respawn_radius', 'integer', 'spawnRadius', 'spawnradius'],
    ['send_command_feedback', 'boolean', 'sendCommandFeedback', 'sendcommandfeedback'],
    ['show_advancement_messages', 'boolean', 'announceAdvancements'],
    ['show_death_messages', 'boolean', 'showDeathMessages', 'showdeathmessages'],
    ['spawner_blocks_work', 'boolean', 'spawnerBlocksEnabled'],
    ['spawn_mobs', 'boolean', 'doMobSpawning', 'domobspawning'],
    ['spawn_monsters', 'boolean', 'spawnMonsters'],
    ['spawn_patrols', 'boolean', 'doPatrolSpawning'],
    ['spawn_phantoms', 'boolean', 'doInsomnia', 'doinsomnia'],
    ['spawn_wandering_traders', 'boolean', 'doTraderSpawning'],
    ['spawn_wardens', 'boolean', 'doWardenSpawning'],
    ['spectators_generate_chunks', 'boolean', 'spectatorsGenerateChunks'],
    ['spread_vines', 'boolean', 'doVinesSpread'],
    ['tnt_explodes', 'boolean', 'tntExplodes', 'tntexplodes'],
    ['tnt_explosion_drop_decay', 'boolean', 'tntExplosionDropDecay', 'tntexplosiondropdecay'],
    ['universal_anger', 'boolean', 'universalAnger'],
    ['water_source_conversion', 'boolean', 'waterSourceConversion']
];

/** The 59 gamerules of the 26.3 `minecraft:game_rule` registry, sorted by id. */
export const JAVA_GAME_RULES: readonly GameRule[] = ROWS.map(([id, type, legacy, bedrockName]) => {
    const name = `minecraft:${id}`;
    const limits = LIMITS[name];
    return {
        name,
        type,
        legacyNames: legacy.split(' '),
        ...(bedrockName === undefined ? {} : { bedrockName }),
        ...(limits === undefined ? {} : limits)
    };
});

/**
 * The three rules 1.21.11 removed rather than renamed, from the removal branch
 * of `GameRuleRegistryFix`.
 */
export const REMOVED_GAME_RULES: readonly string[] = [
    'entitiesWithPassengersCanUsePortals',
    'gameLoopFunction',
    'spawnChunkRadius'
];

const byName = new Map(JAVA_GAME_RULES.map((rule) => [rule.name, rule]));
const byLegacyName = new Map(JAVA_GAME_RULES.flatMap((rule) => rule.legacyNames.map((legacy) => [legacy, rule])));
const byBedrockName = new Map(
    JAVA_GAME_RULES.flatMap((rule) => (rule.bedrockName === undefined ? [] : [[rule.bedrockName, rule] as const]))
);

/**
 * Looks a gamerule up by its 1.21.11 id, its pre-1.21.11 camelCase name, or
 * Bedrock's lowercase name.
 *
 * A bare id without the namespace resolves too, because that is how a
 * `/gamerule` line usually spells it.
 *
 * @returns The rule, or undefined when the name belongs to no edition.
 */
export const gameRule = (name: string): GameRule | undefined =>
    byName.get(name) ??
    byName.get(`minecraft:${name}`) ??
    byLegacyName.get(name) ??
    byBedrockName.get(name.toLowerCase());

/**
 * The 1.21.11 id of a pre-1.21.11 gamerule name.
 *
 * @returns The current id, or undefined when the rule was removed or never
 *   existed. {@link REMOVED_GAME_RULES} names the three removals.
 */
export const renamedGameRule = (legacyName: string): string | undefined => byLegacyName.get(legacyName)?.name;

/** Whether 1.21.11 removed the named gamerule outright. */
export const isRemovedGameRule = (legacyName: string): boolean => REMOVED_GAME_RULES.includes(legacyName);

/**
 * Bedrock's own gamerule names, read from the `/gamerule` enums of Mojang's
 * command metadata rather than repeated here.
 *
 * @returns The boolean names and the integer names, in Mojang's order.
 */
export const bedrockGameRuleNames = (): { boolean: readonly string[]; integer: readonly string[] } => ({
    boolean: bedrockCommandEnum('BoolGameRule')?.values ?? [],
    integer: bedrockCommandEnum('IntGameRule')?.values ?? []
});

/** The Bedrock gamerules with no rule of the same meaning in Java's registry. */
export const bedrockOnlyGameRuleNames = (): readonly string[] => {
    const { boolean, integer } = bedrockGameRuleNames();
    return [...boolean, ...integer].filter((name) => !byBedrockName.has(name));
};
