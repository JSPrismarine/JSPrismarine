import type { Diagnostic } from '@jsprismarine/entities';
import type { Filter } from '@jsprismarine/packs';
import { FilterParseError, parseFilter } from '@jsprismarine/packs';

/**
 * The spawn rule grammar.
 *
 * A file is `{"format_version": "<semver>", "minecraft:spawn_rules": {...}}`,
 * and the body has `description` and `conditions`. Mojang's
 * `Spawn Rules.json` declares 24 condition components; vanilla writes 21 of
 * them. Parsing reports an unknown component rather than refusing the file, so
 * a pack written against a newer game still loads and the report names what
 * the runtime did not read.
 */

/** The pools `description.population_control` names, each with its own cap. */
export const POPULATION_POOLS = [
    'animal',
    'water_animal',
    'water_ambient',
    'ambient',
    'monster',
    'cat',
    'pillager',
    'villager'
] as const;

/** One of {@link POPULATION_POOLS}. */
export type PopulationPool = (typeof POPULATION_POOLS)[number];

/** The difficulty names `minecraft:difficulty_filter` compares, in ascending order. */
export const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard'] as const;

/** One of {@link DIFFICULTIES}. */
export type Difficulty = (typeof DIFFICULTIES)[number];

/**
 * Every condition component `Spawn Rules.json` declares, in the schema's
 * order. Vanilla writes 21 of the 24; `minecraft:spawns_above_block_filter`,
 * `minecraft:is_persistent` and `minecraft:is_experimental` appear in the
 * schema alone, so this package parses them and leaves their meaning to the
 * caller.
 */
export const SPAWN_RULE_COMPONENTS = [
    'minecraft:biome_filter',
    'minecraft:brightness_filter',
    'minecraft:delay_filter',
    'minecraft:density_limit',
    'minecraft:difficulty_filter',
    'minecraft:disallow_spawns_in_bubble',
    'minecraft:distance_filter',
    'minecraft:height_filter',
    'minecraft:herd',
    'minecraft:is_experimental',
    'minecraft:is_persistent',
    'minecraft:mob_event_filter',
    'minecraft:permute_type',
    'minecraft:player_in_village_filter',
    'minecraft:spawn_event',
    'minecraft:spawns_above_block_filter',
    'minecraft:spawns_lava',
    'minecraft:spawns_on_block_filter',
    'minecraft:spawns_on_block_prevented_filter',
    'minecraft:spawns_on_surface',
    'minecraft:spawns_underground',
    'minecraft:spawns_underwater',
    'minecraft:weight',
    'minecraft:world_age_filter'
] as const;

/** One of {@link SPAWN_RULE_COMPONENTS}. */
export type SpawnRuleComponent = (typeof SPAWN_RULE_COMPONENTS)[number];

/** An inclusive numeric range, as every `{min, max}` component writes one. */
export interface SpawnRange {
    readonly min: number;
    readonly max: number;
}

/** How often one condition is drawn against the others that pass at the same position. */
export interface SpawnWeight {
    /** The relative weight; a weight of 100 among a total of 1000 is drawn a tenth of the time. */
    readonly default: number;
    /** An extra rarity roll Mojang documents by name only. Zero means no roll. */
    readonly rarity: number;
}

/** One `minecraft:herd` alternative: how many spawn together and which events they run. */
export interface HerdRule {
    readonly minSize: number;
    readonly maxSize: number;
    /** The event the first {@link initialEventCount} members run instead of their spawn event. */
    readonly initialEvent?: string;
    readonly initialEventCount: number;
    /** The event every member past {@link eventSkipCount} runs. */
    readonly event?: string;
    readonly eventSkipCount: number;
}

/** One `minecraft:permute_type` entry: a weighted swap of the entity a herd member spawns as. */
export interface SpawnPermutation {
    readonly weight: number;
    /**
     * The entity to spawn instead, optionally in the `type<event>` form. Absent
     * means the rule's own entity, which is how vanilla writes the common branch.
     */
    readonly entityType?: string;
    /** How many herd members this permutation takes before the weighted draw runs. */
    readonly minGuaranteed: number;
}

/** The `minecraft:delay_filter` body: a cooldown shared by every rule naming the same identifier. */
export interface SpawnDelay {
    readonly min: number;
    readonly max: number;
    /** The cooldown's name, which is how the three pillager patrol conditions keep separate timers. */
    readonly identifier?: string;
    /** The percent chance the attempt takes once the cooldown has elapsed. */
    readonly spawnChance: number;
}

/** The `minecraft:player_in_village_filter` body. */
export interface PlayerInVillageFilter {
    readonly distance: number;
    readonly villageBorderTolerance: number;
}

/** The `minecraft:spawns_above_block_filter` body, which no vanilla rule writes. */
export interface AboveBlockFilter {
    readonly blocks: readonly string[];
    readonly distance: number;
}

/**
 * One member of `conditions`: a complete alternative set of requirements with
 * its own weight, herd and permutations. A rule passes at a position when any
 * one of its conditions does.
 */
export interface SpawnCondition {
    readonly weight: SpawnWeight;
    readonly biomeFilter?: Filter;
    readonly brightness?: { readonly min: number; readonly max: number; readonly adjustForWeather: boolean };
    readonly difficulty?: { readonly min: Difficulty; readonly max: Difficulty };
    readonly height?: SpawnRange;
    /** How far from the nearest player the position must be. */
    readonly distance?: SpawnRange;
    /** How many of this entity may already stand nearby, per pass; -1 is no limit. */
    readonly density?: { readonly surface: number; readonly underground: number };
    readonly worldAge?: SpawnRange;
    readonly spawnsOnSurface: boolean;
    readonly spawnsUnderground: boolean;
    readonly spawnsUnderwater: boolean;
    readonly spawnsLava: boolean;
    readonly disallowSpawnsInBubble: boolean;
    readonly isPersistent: boolean;
    readonly isExperimental: boolean;
    /** The blocks the position may stand on; an empty list means the component is absent. */
    readonly blocks?: readonly string[];
    /** The blocks the position may not stand on. */
    readonly preventedBlocks?: readonly string[];
    readonly aboveBlocks?: AboveBlockFilter;
    readonly herd: readonly HerdRule[];
    readonly permutations?: readonly SpawnPermutation[];
    readonly delay?: SpawnDelay;
    readonly mobEvent?: string;
    /** The event a spawned entity runs instead of `minecraft:entity_spawned`. */
    readonly spawnEvent?: string;
    readonly playerInVillage?: PlayerInVillageFilter;
}

/** One parsed `spawn_rules/*.json`. */
export interface SpawnRule {
    readonly identifier: string;
    /** The pool whose cap gates this entity, absent when the file names none. */
    readonly populationControl?: string;
    readonly formatVersion?: string;
    readonly conditions: readonly SpawnCondition[];
}

/** Where a parse reports its findings. */
export interface SpawnRuleParseOptions {
    /** The pack the file came from, used in the diagnostics. */
    readonly pack: string;
    readonly path?: string;
    readonly report?: (diagnostic: Diagnostic) => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const KNOWN_COMPONENTS: ReadonlySet<string> = new Set(SPAWN_RULE_COMPONENTS);

const KNOWN_POOLS: ReadonlySet<string> = new Set(POPULATION_POOLS);

/** Reads a number, falling back when the key is absent or not a number. */
const numberAt = (source: Record<string, unknown>, key: string, fallback: number): number => {
    const value = source[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const stringAt = (source: Record<string, unknown>, key: string): string | undefined => {
    const value = source[key];
    return typeof value === 'string' ? value : undefined;
};

const bodyOf = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

/**
 * Reads a block list written as one name, as a list of names, or as a list of
 * `{name}` objects. All three appear in vanilla.
 */
const blockList = (value: unknown): readonly string[] => {
    const members = Array.isArray(value) ? value : [value];
    const names: string[] = [];
    for (const member of members) {
        if (typeof member === 'string') names.push(member);
        else if (isRecord(member) && typeof member.name === 'string') names.push(member.name);
    }
    return names;
};

const difficultyAt = (
    source: Record<string, unknown>,
    key: string,
    fallback: Difficulty,
    fail: (message: string) => void
): Difficulty => {
    const value = source[key];
    if (value === undefined) return fallback;
    const name = DIFFICULTIES.find((difficulty) => difficulty === value);
    if (name !== undefined) return name;
    fail(`minecraft:difficulty_filter ${key} is not a difficulty: ${JSON.stringify(value)}`);
    return fallback;
};

const parseHerd = (value: unknown): readonly HerdRule[] =>
    (Array.isArray(value) ? value : [value]).filter(isRecord).map((body) => {
        const rule: {
            minSize: number;
            maxSize: number;
            initialEvent?: string;
            initialEventCount: number;
            event?: string;
            eventSkipCount: number;
        } = {
            minSize: numberAt(body, 'min_size', 1),
            maxSize: numberAt(body, 'max_size', 1),
            initialEventCount: numberAt(body, 'initial_event_count', 0),
            eventSkipCount: numberAt(body, 'event_skip_count', 0)
        };
        const initialEvent = stringAt(body, 'initial_event');
        if (initialEvent !== undefined) rule.initialEvent = initialEvent;
        const event = stringAt(body, 'event');
        if (event !== undefined) rule.event = event;
        return rule;
    });

const parsePermutations = (value: unknown): readonly SpawnPermutation[] =>
    (Array.isArray(value) ? value : []).filter(isRecord).map((body) => {
        const permutation: { weight: number; entityType?: string; minGuaranteed: number } = {
            weight: numberAt(body, 'weight', 1),
            // The schema calls it `min_guaranteed`; the docs page calls the same
            // field `guaranteed_count`, so both spellings read.
            minGuaranteed: numberAt(body, 'min_guaranteed', numberAt(body, 'guaranteed_count', 0))
        };
        const entityType = stringAt(body, 'entity_type');
        if (entityType !== undefined) permutation.entityType = entityType;
        return permutation;
    });

const parseCondition = (
    value: Record<string, unknown>,
    fail: (code: string, message: string) => void
): SpawnCondition => {
    for (const key of Object.keys(value)) {
        if (!KNOWN_COMPONENTS.has(key)) fail('spawnRule.unknownComponent', `unknown spawn rule component ${key}`);
    }

    const weightBody = bodyOf(value['minecraft:weight']);
    const condition: {
        -readonly [Key in keyof SpawnCondition]: SpawnCondition[Key];
    } = {
        // The schema marks `default` required and says nothing about a condition
        // that writes no weight at all, so an absent weight counts once.
        weight: { default: numberAt(weightBody, 'default', 1), rarity: numberAt(weightBody, 'rarity', 0) },
        herd: 'minecraft:herd' in value ? parseHerd(value['minecraft:herd']) : [],
        spawnsOnSurface: 'minecraft:spawns_on_surface' in value,
        spawnsUnderground: 'minecraft:spawns_underground' in value,
        spawnsUnderwater: 'minecraft:spawns_underwater' in value,
        spawnsLava: 'minecraft:spawns_lava' in value,
        disallowSpawnsInBubble: 'minecraft:disallow_spawns_in_bubble' in value,
        isPersistent: 'minecraft:is_persistent' in value,
        isExperimental: 'minecraft:is_experimental' in value
    };

    if ('minecraft:biome_filter' in value) {
        try {
            condition.biomeFilter = parseFilter(value['minecraft:biome_filter']);
        } catch (error) {
            if (!(error instanceof FilterParseError)) throw error;
            fail('spawnRule.badValue', `minecraft:biome_filter does not parse: ${error.message}`);
        }
    }

    if ('minecraft:brightness_filter' in value) {
        const body = bodyOf(value['minecraft:brightness_filter']);
        condition.brightness = {
            min: numberAt(body, 'min', 0),
            max: numberAt(body, 'max', 15),
            adjustForWeather: body.adjust_for_weather === true
        };
    }

    if ('minecraft:difficulty_filter' in value) {
        const body = bodyOf(value['minecraft:difficulty_filter']);
        const report = (message: string): void => fail('spawnRule.badValue', message);
        condition.difficulty = {
            min: difficultyAt(body, 'min', 'peaceful', report),
            max: difficultyAt(body, 'max', 'hard', report)
        };
    }

    if ('minecraft:height_filter' in value) {
        const body = bodyOf(value['minecraft:height_filter']);
        condition.height = { min: numberAt(body, 'min', 24), max: numberAt(body, 'max', 128) };
    }

    if ('minecraft:distance_filter' in value) {
        const body = bodyOf(value['minecraft:distance_filter']);
        condition.distance = { min: numberAt(body, 'min', 24), max: numberAt(body, 'max', 128) };
    }

    if ('minecraft:world_age_filter' in value) {
        const body = bodyOf(value['minecraft:world_age_filter']);
        condition.worldAge = { min: numberAt(body, 'min', 0), max: numberAt(body, 'max', -1) };
    }

    if ('minecraft:density_limit' in value) {
        const body = bodyOf(value['minecraft:density_limit']);
        condition.density = { surface: numberAt(body, 'surface', -1), underground: numberAt(body, 'underground', -1) };
    }

    if ('minecraft:spawns_on_block_filter' in value)
        condition.blocks = blockList(value['minecraft:spawns_on_block_filter']);

    if ('minecraft:spawns_on_block_prevented_filter' in value)
        condition.preventedBlocks = blockList(value['minecraft:spawns_on_block_prevented_filter']);

    if ('minecraft:spawns_above_block_filter' in value) {
        const body = bodyOf(value['minecraft:spawns_above_block_filter']);
        condition.aboveBlocks = { blocks: blockList(body.blocks), distance: numberAt(body, 'distance', 1) };
    }

    if ('minecraft:permute_type' in value) condition.permutations = parsePermutations(value['minecraft:permute_type']);

    if ('minecraft:delay_filter' in value) {
        const body = bodyOf(value['minecraft:delay_filter']);
        const delay: { min: number; max: number; identifier?: string; spawnChance: number } = {
            min: numberAt(body, 'min', 0),
            max: numberAt(body, 'max', 0),
            spawnChance: numberAt(body, 'spawn_chance', 100)
        };
        const identifier = stringAt(body, 'identifier');
        if (identifier !== undefined) delay.identifier = identifier;
        condition.delay = delay;
    }

    const mobEvent = stringAt(bodyOf(value['minecraft:mob_event_filter']), 'event');
    if ('minecraft:mob_event_filter' in value && mobEvent !== undefined) condition.mobEvent = mobEvent;

    const spawnEvent = stringAt(bodyOf(value['minecraft:spawn_event']), 'event');
    if ('minecraft:spawn_event' in value && spawnEvent !== undefined) condition.spawnEvent = spawnEvent;

    if ('minecraft:player_in_village_filter' in value) {
        const body = bodyOf(value['minecraft:player_in_village_filter']);
        condition.playerInVillage = {
            distance: numberAt(body, 'distance', 0),
            villageBorderTolerance: numberAt(body, 'village_border_tolerance', 10)
        };
    }

    return condition;
};

/**
 * Parses one `spawn_rules/*.json` file.
 *
 * @returns The rule, or undefined when the file is not a spawn rule or names
 * no identifier. Everything else loads and reports.
 */
export const parseSpawnRule = (file: unknown, options: SpawnRuleParseOptions): SpawnRule | undefined => {
    const fail = (code: string, message: string): void => {
        const diagnostic: Diagnostic = { severity: 'error', code, pack: options.pack, message };
        if (options.path !== undefined) diagnostic.path = options.path;
        options.report?.(diagnostic);
    };
    const warn = (code: string, message: string): void => {
        const diagnostic: Diagnostic = { severity: 'warning', code, pack: options.pack, message };
        if (options.path !== undefined) diagnostic.path = options.path;
        options.report?.(diagnostic);
    };

    if (!isRecord(file) || !isRecord(file['minecraft:spawn_rules'])) {
        fail('spawnRule.notASpawnRule', 'the file has no `minecraft:spawn_rules` body');
        return undefined;
    }

    const body = file['minecraft:spawn_rules'];
    const description = bodyOf(body.description);
    const identifier = stringAt(description, 'identifier');
    if (identifier === undefined) {
        fail('spawnRule.missingIdentifier', '`description.identifier` is missing');
        return undefined;
    }

    const rule: { -readonly [Key in keyof SpawnRule]: SpawnRule[Key] } = { identifier, conditions: [] };

    const formatVersion = stringAt(file, 'format_version');
    if (formatVersion !== undefined) rule.formatVersion = formatVersion;

    const pool = stringAt(description, 'population_control');
    if (pool !== undefined) {
        rule.populationControl = pool;
        if (!KNOWN_POOLS.has(pool)) warn('spawnRule.unknownPool', `unknown population_control ${pool}`);
    }

    const conditions = body.conditions;
    if (conditions !== undefined) {
        if (!Array.isArray(conditions)) {
            fail('spawnRule.badValue', '`conditions` must be an array');
        } else {
            rule.conditions = conditions.filter(isRecord).map((condition) => parseCondition(condition, fail));
        }
    }

    return rule;
};
