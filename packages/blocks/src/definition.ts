import type { ComponentEntry, Diagnostic } from '@jsprismarine/content';
import type { FormatVersion } from '@jsprismarine/packs';
import { parseVersion, selectSchemaVersion } from '@jsprismarine/packs';

import type { BlockStateValue } from './hooks';
import type { BlockStateDefinition } from './state';
import { BlockStateModel } from './state';

/**
 * The schema versions this package knows, oldest first. `format_version`
 * dispatch picks the newest entry at or below the file's version, which is the
 * rule `selectSchemaVersion` in `@jsprismarine/packs` implements.
 */
export const BLOCK_SCHEMA_VERSIONS = ['1.16.100', '1.19.40', '1.26.20'] as const;

/** One of {@link BLOCK_SCHEMA_VERSIONS}. */
export type BlockSchemaVersion = (typeof BLOCK_SCHEMA_VERSIONS)[number];

/** What one schema version of the block grammar accepts. */
export interface BlockSchema {
    readonly version: BlockSchemaVersion;
    /** Whether `description.states` and the `permutations` array are read. */
    readonly statesAndPermutations: boolean;
    /** Whether `description.traits` is read. */
    readonly traits: boolean;
    /** Component names this version does not have, reported when a file uses one. */
    readonly withoutComponents: readonly string[];
    /** Component names this version forbids directly under `components`. */
    readonly forbiddenInDefinition: readonly string[];
    /** Component names this version forbids inside a permutation's `components`. */
    readonly forbiddenInPermutation: readonly string[];
}

/** The four property components Mojang renamed at 1.19.40. */
const LEGACY_PROPERTY_COMPONENTS = [
    'minecraft:destroy_time',
    'minecraft:explosion_resistance',
    'minecraft:block_light_emission',
    'minecraft:block_light_absorption'
] as const;

/** What replaced them. */
const RENAMED_PROPERTY_COMPONENTS = [
    'minecraft:destructible_by_mining',
    'minecraft:destructible_by_explosion',
    'minecraft:light_emission',
    'minecraft:light_dampening'
] as const;

/**
 * The event components `Blocks.json` forbids at the top level of a 1.26.20
 * file. Script custom components replaced them, so a file that still writes
 * one loads with a diagnostic rather than silently keeping a dead handler.
 */
const EVENT_COMPONENTS = [
    'minecraft:on_interact',
    'minecraft:on_fall_on',
    'minecraft:on_placed',
    'minecraft:on_player_destroyed',
    'minecraft:on_player_placing',
    'minecraft:on_step_off',
    'minecraft:on_step_on',
    'minecraft:queued_ticking',
    'minecraft:random_ticking'
] as const;

/** What `Permutation.json` forbids inside a permutation on top of the event components. */
const PERMUTATION_ONLY_FORBIDDEN = [
    'minecraft:redstone_consumer',
    'minecraft:block_entity',
    'minecraft:support',
    'minecraft:embedded_visual',
    'minecraft:flower_pottable',
    'minecraft:item_visual',
    'minecraft:breathability',
    'minecraft:unit_cube'
] as const;

/**
 * Every schema version, keyed by its `format_version`.
 *
 * The 1.26.20 entry is read from `metadata/json_schemas/server/block/1.26.20/`
 * in `Mojang/bedrock-samples` v1.26.50.4: `Blocks.json` and `Permutation.json`
 * carry the two forbidden sets as `propertyNames` patterns, and
 * `Description.json` carries `states` and `traits`. The 1.19.40 boundary is
 * the property-component rename recorded in
 * `docs/research/bedrock-blocks-items-recipes-biomes-features.md` section 1.
 */
export const BLOCK_SCHEMAS: Readonly<Record<BlockSchemaVersion, BlockSchema>> = {
    '1.16.100': {
        version: '1.16.100',
        statesAndPermutations: true,
        traits: false,
        withoutComponents: RENAMED_PROPERTY_COMPONENTS,
        forbiddenInDefinition: [],
        forbiddenInPermutation: PERMUTATION_ONLY_FORBIDDEN
    },
    '1.19.40': {
        version: '1.19.40',
        statesAndPermutations: true,
        traits: false,
        withoutComponents: LEGACY_PROPERTY_COMPONENTS,
        forbiddenInDefinition: [],
        forbiddenInPermutation: PERMUTATION_ONLY_FORBIDDEN
    },
    '1.26.20': {
        version: '1.26.20',
        statesAndPermutations: true,
        traits: true,
        withoutComponents: LEGACY_PROPERTY_COMPONENTS,
        forbiddenInDefinition: [...EVENT_COMPONENTS, 'minecraft:breathability', 'minecraft:unit_cube'],
        forbiddenInPermutation: [...EVENT_COMPONENTS, ...PERMUTATION_ONLY_FORBIDDEN]
    }
};

/** Picks the schema a file's `format_version` reads under. */
export const schemaFor = (version: FormatVersion): BlockSchema =>
    BLOCK_SCHEMAS[selectSchemaVersion(BLOCK_SCHEMA_VERSIONS, version)];

/** Where a block appears in the creative menu. */
export interface MenuCategory {
    /** `construction`, `nature`, `equipment`, `items` or `none`. */
    readonly category: string;
    /** The namespaced group key, such as `minecraft:itemGroup.name.stairs`. */
    readonly group: string | undefined;
    readonly hiddenInCommands: boolean;
}

/** One trait a block enables, with the states the trait supplies. */
export interface BlockTrait {
    /** The trait name, such as `minecraft:placement_direction`. */
    readonly name: string;
    /** The `enabled_states` the trait adds to the block. */
    readonly enabledStates: readonly string[];
    /** The trait's remaining parameters, unparsed, such as `y_rotation_offset`. */
    readonly parameters: Readonly<Record<string, unknown>>;
}

/**
 * The undocumented `internal_vanilla_data` the 98 vanilla block files carry.
 *
 * Nothing in `MicrosoftDocs/minecraft-creator` describes it. The overlay
 * generator reads `blockArchetype` to name a behavior, because the archetype
 * is the mechanism Mojang itself uses to attach engine code to a data-driven
 * block.
 */
export interface InternalVanillaData {
    /** `block_id`, equal to `raw_id` in `mojang-blocks.json`. */
    readonly blockId: number | undefined;
    /** `material`: `solid`, `plant` or `solid_plant` in the vanilla files. */
    readonly material: string | undefined;
    /** The single key of `block_archetype`, such as `slab_block`, or undefined when absent. */
    readonly blockArchetype: string | undefined;
    /** The archetype's own parameters, such as a stair's `base_block`. */
    readonly archetypeParameters: Readonly<Record<string, unknown>>;
    /** Every key as the file wrote it, for the fields this interface does not name. */
    readonly raw: Readonly<Record<string, unknown>>;
}

/** `minecraft:block.description`, parsed. */
export interface BlockDescription {
    readonly identifier: string;
    readonly menuCategory: MenuCategory | undefined;
    /** The states the file declares, in declaration order; empty for a vanilla file. */
    readonly states: readonly BlockStateDefinition[];
    readonly traits: readonly BlockTrait[];
    readonly internalVanillaData: InternalVanillaData | undefined;
}

/** One entry of the `permutations` array. */
export interface BlockPermutation {
    /** The Molang condition, limited to `query.block_state` by the docs. */
    readonly condition: string;
    /** The components it applies over the base set, in declaration order. */
    readonly components: readonly ComponentEntry[];
}

/** One block definition file, parsed and ready to resolve. */
export interface BlockDefinitionDocument {
    /** The file's own `format_version`. */
    readonly formatVersion: FormatVersion;
    /** The schema `format_version` dispatch chose for it. */
    readonly schema: BlockSchema;
    readonly description: BlockDescription;
    /** The base components, in declaration order. */
    readonly components: readonly ComponentEntry[];
    readonly permutations: readonly BlockPermutation[];
    /** The states the file declares, combined into the canonical encoding. */
    readonly stateModel: BlockStateModel;
}

/** What {@link parseBlockDefinition} returns: the document when it parsed, and the report. */
export interface BlockParseResult {
    /** The parsed document, or undefined when the file has no usable identifier. */
    readonly document: BlockDefinitionDocument | undefined;
    readonly diagnostics: readonly Diagnostic[];
}

/** Where a definition came from, so a diagnostic can name it. */
export interface BlockParseSource {
    /** The pack the file came from. */
    readonly pack: string;
    /** The pack-relative path of the file. */
    readonly path?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isStateValue = (value: unknown): value is BlockStateValue =>
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

const typeOfValues = (values: readonly BlockStateValue[]): 'bool' | 'int' | 'string' => {
    if (values.every((value) => typeof value === 'boolean')) return 'bool';
    if (values.every((value) => typeof value === 'number')) return 'int';
    return 'string';
};

/**
 * Reads one `description.states` entry: an array of values, `{"values": [...]}`
 * or `{"values": {"min": n, "max": m}}`.
 */
const readStateValues = (value: unknown): readonly BlockStateValue[] | undefined => {
    const values = Array.isArray(value) ? value : isRecord(value) ? value.values : undefined;

    if (Array.isArray(values)) {
        return values.every(isStateValue) ? values : undefined;
    }

    if (isRecord(values) && typeof values.min === 'number' && typeof values.max === 'number') {
        const { min, max } = values;
        if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) return undefined;
        return Array.from({ length: max - min + 1 }, (_unused, offset) => min + offset);
    }

    return undefined;
};

const readMenuCategory = (value: unknown): MenuCategory | undefined => {
    if (!isRecord(value)) return undefined;
    return {
        category: typeof value.category === 'string' ? value.category : 'none',
        group: typeof value.group === 'string' ? value.group : undefined,
        hiddenInCommands: value.is_hidden_in_commands === true
    };
};

const readTraits = (value: unknown): readonly BlockTrait[] => {
    if (!isRecord(value)) return [];
    return Object.entries(value).flatMap(([name, parameters]) => {
        if (!isRecord(parameters)) return [];
        const enabled = parameters.enabled_states;
        const { enabled_states: _dropped, ...rest } = parameters;
        return [
            {
                name,
                enabledStates: Array.isArray(enabled) ? enabled.filter((state) => typeof state === 'string') : [],
                parameters: rest
            }
        ];
    });
};

const readInternalVanillaData = (value: unknown): InternalVanillaData | undefined => {
    if (!isRecord(value)) return undefined;
    const archetype = isRecord(value.block_archetype) ? Object.entries(value.block_archetype)[0] : undefined;
    return {
        blockId: typeof value.block_id === 'number' ? value.block_id : undefined,
        material: typeof value.material === 'string' ? value.material : undefined,
        blockArchetype: archetype?.[0],
        archetypeParameters: isRecord(archetype?.[1]) ? archetype[1] : {},
        raw: value
    };
};

const readComponents = (value: unknown): readonly ComponentEntry[] =>
    isRecord(value) ? Object.entries(value).map(([name, componentValue]) => ({ name, value: componentValue })) : [];

/**
 * Parses one Bedrock block definition file.
 *
 * `format_version` dispatch runs first: the newest schema at or below the
 * file's version decides whether `states`, `traits` and `permutations` are
 * read and which component names belong to that version. Anything the schema
 * does not accept is dropped and reported rather than thrown, so one bad file
 * cannot stop a pack load.
 *
 * @param data - The file's parsed JSON, from the lenient parser or `JSON.parse`.
 * @returns The document, or `document: undefined` when the file carries no
 *   `minecraft:block.description.identifier` to register it under.
 */
export const parseBlockDefinition = (data: unknown, source: BlockParseSource): BlockParseResult => {
    const diagnostics: Diagnostic[] = [];
    const report = (severity: 'error' | 'warning', code: string, message: string): void => {
        diagnostics.push({ severity, code, pack: source.pack, path: source.path, message });
    };

    if (!isRecord(data) || !isRecord(data['minecraft:block'])) {
        report('error', 'block.malformed', 'the file has no minecraft:block object');
        return { document: undefined, diagnostics };
    }

    const block = data['minecraft:block'];
    const description = isRecord(block.description) ? block.description : {};
    const identifier = description.identifier;
    if (typeof identifier !== 'string') {
        report('error', 'block.malformed', 'the description has no identifier');
        return { document: undefined, diagnostics };
    }

    const formatVersion = parseVersion(data.format_version);
    if (formatVersion === undefined) {
        report('error', 'block.format-version', `${identifier} has no readable format_version`);
        return { document: undefined, diagnostics };
    }
    const schema = schemaFor(formatVersion);

    const states: BlockStateDefinition[] = [];
    if (isRecord(description.states)) {
        if (!schema.statesAndPermutations) {
            report(
                'warning',
                'block.states-unsupported',
                `${identifier} declares states, which ${schema.version} has no field for`
            );
        } else {
            for (const [name, declared] of Object.entries(description.states)) {
                const values = readStateValues(declared);
                if (values === undefined || values.length === 0) {
                    report('error', 'block.state-invalid', `${identifier} state ${name} has no readable values`);
                    continue;
                }
                states.push({ name, type: typeOfValues(values), values, defaultValue: values[0]! });
            }
        }
    }

    const traits = schema.traits ? readTraits(description.traits) : [];
    if (!schema.traits && isRecord(description.traits)) {
        report(
            'warning',
            'block.traits-unsupported',
            `${identifier} declares traits, which ${schema.version} has no field for`
        );
    }

    const keep = (entries: readonly ComponentEntry[], forbidden: readonly string[], where: string) =>
        entries.filter((entry) => {
            if (forbidden.includes(entry.name)) {
                report('error', 'block.component-forbidden', `${identifier} may not use ${entry.name} ${where}`);
                return false;
            }
            if (schema.withoutComponents.includes(entry.name)) {
                report(
                    'warning',
                    'block.component-version',
                    `${identifier} uses ${entry.name}, which format_version ${schema.version} does not have`
                );
                return false;
            }
            return true;
        });

    const components = keep(readComponents(block.components), schema.forbiddenInDefinition, 'in a definition');

    const permutations: BlockPermutation[] = [];
    if (Array.isArray(block.permutations)) {
        if (!schema.statesAndPermutations) {
            report(
                'warning',
                'block.permutations-unsupported',
                `${identifier} declares permutations, which ${schema.version} has no field for`
            );
        } else {
            for (const [index, entry] of block.permutations.entries()) {
                if (!isRecord(entry) || typeof entry.condition !== 'string') {
                    report('error', 'block.permutation-invalid', `${identifier} permutation ${index} has no condition`);
                    continue;
                }
                permutations.push({
                    condition: entry.condition,
                    components: keep(
                        readComponents(entry.components),
                        schema.forbiddenInPermutation,
                        'in a permutation'
                    )
                });
            }
        }
    }

    return {
        document: {
            formatVersion,
            schema,
            description: {
                identifier,
                menuCategory: readMenuCategory(description.menu_category),
                states,
                traits,
                internalVanillaData: readInternalVanillaData(description.internal_vanilla_data)
            },
            components,
            permutations,
            stateModel: new BlockStateModel(states)
        },
        diagnostics
    };
};
