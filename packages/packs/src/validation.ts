import type { DiagnosticSeverity } from './diagnostics';
import { parseFilter, FilterParseError } from './filters';
import type { JavaRegistryId } from './javaRegistries';
import type { RegistryId } from './registries';

/** One finding a validator reports about a single definition file. */
export interface ValidationFinding {
    severity: DiagnosticSeverity;
    code: string;
    message: string;
}

/** A definition file as handed to a validator, before composition. */
export interface DefinitionFile {
    registry: RegistryId | JavaRegistryId;
    /** The pack-relative path of the file. */
    path: string;
    data: unknown;
}

/**
 * Validates one definition file. The loader ships a structural validator
 * ({@link structuralValidator}) and accepts a replacement through its
 * options, so schema-based validation can take over later without changing
 * the load interface.
 */
export type DefinitionValidator = (file: DefinitionFile) => ValidationFinding[];

/**
 * Runs validators in order over one file and concatenates their findings.
 * This is how schema validation joins the structural checks rather than
 * replacing them: the schemas cover part of each half and leave unknown keys
 * open, so both layers have something to say about the same file.
 */
export const composeValidators =
    (...validators: readonly DefinitionValidator[]): DefinitionValidator =>
    (file) =>
        validators.flatMap((validate) => validate(file));

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Walks a definition for `filters` keys and parses each with the filter
 * grammar, so a malformed filter is reported where it is written rather than
 * when it first runs. Both the string form and the integer encoding parse.
 */
const validateFilters = (value: unknown, findings: ValidationFinding[]): void => {
    if (Array.isArray(value)) {
        for (const member of value) validateFilters(member, findings);
        return;
    }
    if (!isRecord(value)) return;

    for (const [key, member] of Object.entries(value)) {
        if (key === 'filters') {
            try {
                parseFilter(member);
            } catch (error) {
                if (!(error instanceof FilterParseError)) throw error;
                findings.push({ severity: 'error', code: 'definition.invalid-filter', message: error.message });
            }
            continue;
        }
        validateFilters(member, findings);
    }
};

/** The root keys any wrapped definition file may carry. */
const COMMON_ROOT_KEYS = ['format_version'];

interface Shape {
    /** Root keys beside `format_version` and the wrapper that are known. */
    rootKeys?: readonly string[];
    /** Whether the file needs a `format_version`. Loot and trade tables have none. */
    requiresFormatVersion: boolean;
    /** The wrapper prefix a file must have exactly one of, such as `minecraft:`. */
    requiresWrapper: boolean;
    /** Required keys of the wrapper's `description` object. */
    descriptionKeys?: readonly string[];
    /**
     * Wrapper keys whose value must be an object when present. A key written
     * as `null` counts as absent: 23 vanilla entity files, `area_effect_cloud`
     * among them, write `"events": null` for a definition with no events.
     */
    objectKeys?: readonly string[];
    /** Required root keys with their expected container type. */
    requiredRootArrays?: readonly string[];
}

const SHAPES: Record<RegistryId, Shape> = {
    blocks: {
        requiresFormatVersion: true,
        requiresWrapper: true,
        descriptionKeys: ['identifier'],
        objectKeys: ['components']
    },
    items: {
        requiresFormatVersion: true,
        requiresWrapper: true,
        descriptionKeys: ['identifier'],
        objectKeys: ['components']
    },
    entities: {
        requiresFormatVersion: true,
        requiresWrapper: true,
        descriptionKeys: ['identifier'],
        objectKeys: ['components', 'component_groups', 'events']
    },
    lootTables: { requiresFormatVersion: false, requiresWrapper: false },
    tradeTables: { requiresFormatVersion: false, requiresWrapper: false, requiredRootArrays: ['tiers'] },
    spawnRules: { requiresFormatVersion: true, requiresWrapper: true, descriptionKeys: ['identifier'] },
    recipes: { requiresFormatVersion: true, requiresWrapper: true, descriptionKeys: ['identifier'] },
    biomes: { requiresFormatVersion: true, requiresWrapper: true, descriptionKeys: ['identifier'] },
    features: { requiresFormatVersion: true, requiresWrapper: true, descriptionKeys: ['identifier'] },
    featureRules: { requiresFormatVersion: true, requiresWrapper: true, descriptionKeys: ['identifier'] },
    itemCatalog: { requiresFormatVersion: true, requiresWrapper: true }
};

interface JavaShape {
    /** Root keys that must be present with the given container or primitive type. */
    required?: Readonly<Record<string, 'object' | 'array' | 'string' | 'number'>>;
    /** Root keys that must have the given type when present. */
    optional?: Readonly<Record<string, 'object' | 'array' | 'string' | 'number'>>;
    /** Whether a root array is also a valid file, as it is for predicates and item modifiers. */
    allowsArrayRoot?: boolean;
}

const JAVA_SHAPES: Record<JavaRegistryId, JavaShape> = {
    lootTablesJava: { optional: { pools: 'array', type: 'string' } },
    recipesJava: { required: { type: 'string' } },
    advancements: { required: { criteria: 'object' } },
    tags: { required: { values: 'array' } },
    enchantments: {
        optional: { effects: 'object', weight: 'number', max_level: 'number', slots: 'array' }
    },
    damageTypes: { required: { message_id: 'string', scaling: 'string', exhaustion: 'number' } },
    predicates: { allowsArrayRoot: true, optional: { condition: 'string' } },
    itemModifiers: { allowsArrayRoot: true, optional: { type: 'string' } }
};

const matchesType = (value: unknown, type: 'object' | 'array' | 'string' | 'number'): boolean => {
    if (type === 'object') return isRecord(value);
    if (type === 'array') return Array.isArray(value);
    return typeof value === type;
};

const isJavaRegistry = (registry: RegistryId | JavaRegistryId): registry is JavaRegistryId => registry in JAVA_SHAPES;

/** Structural checks for one Java datapack definition: required keys and container types. */
const validateJavaDefinition = (registry: JavaRegistryId, data: unknown): ValidationFinding[] => {
    const shape = JAVA_SHAPES[registry];
    const findings: ValidationFinding[] = [];

    if (shape.allowsArrayRoot && Array.isArray(data)) return findings;
    if (!isRecord(data)) {
        return [
            {
                severity: 'error',
                code: 'definition.not-an-object',
                message: shape.allowsArrayRoot
                    ? 'the file is not a JSON object or array'
                    : 'the file is not a JSON object'
            }
        ];
    }

    for (const [key, type] of Object.entries(shape.required ?? {})) {
        if (!matchesType(data[key], type))
            findings.push({
                severity: 'error',
                code: 'definition.missing-key',
                message: `${key} must be ${aType(type)}`
            });
    }
    for (const [key, type] of Object.entries(shape.optional ?? {})) {
        if (data[key] !== undefined && !matchesType(data[key], type))
            findings.push({
                severity: 'error',
                code: 'definition.missing-key',
                message: `${key} must be ${aType(type)}`
            });
    }

    return findings;
};

const aType = (type: 'object' | 'array' | 'string' | 'number'): string =>
    type === 'object' ? 'an object' : type === 'array' ? 'an array' : `a ${type}`;

/**
 * The structural validator this slice ships: required keys and container
 * types per registry, for Bedrock and Java registries alike. Unknown root
 * keys are warnings, so unrecognized content loads anyway; missing required
 * structure is an error.
 */
export const structuralValidator: DefinitionValidator = ({ registry, data }) => {
    if (isJavaRegistry(registry)) return validateJavaDefinition(registry, data);

    const findings: ValidationFinding[] = [];
    const shape = SHAPES[registry];

    if (!isRecord(data)) {
        return [{ severity: 'error', code: 'definition.not-an-object', message: 'the file is not a JSON object' }];
    }

    validateFilters(data, findings);

    if (shape.requiresFormatVersion && data.format_version === undefined) {
        findings.push({
            severity: 'error',
            code: 'definition.missing-format-version',
            message: 'format_version is required'
        });
    }

    for (const key of shape.requiredRootArrays ?? []) {
        if (!Array.isArray(data[key]))
            findings.push({ severity: 'error', code: 'definition.missing-key', message: `${key} must be an array` });
    }

    if (!shape.requiresWrapper) return findings;

    const wrapperKeys = Object.keys(data).filter((key) => key.includes(':'));
    if (wrapperKeys.length !== 1) {
        findings.push({
            severity: 'error',
            code: 'definition.missing-wrapper',
            message: `expected exactly one namespaced wrapper key, got ${wrapperKeys.length === 0 ? 'none' : wrapperKeys.join(', ')}`
        });
        return findings;
    }

    for (const key of Object.keys(data)) {
        if (key === wrapperKeys[0] || COMMON_ROOT_KEYS.includes(key)) continue;
        findings.push({ severity: 'warning', code: 'definition.unknown-key', message: `unknown root key ${key}` });
    }

    const wrapper = data[wrapperKeys[0]!];
    if (!isRecord(wrapper)) {
        findings.push({
            severity: 'error',
            code: 'definition.missing-wrapper',
            message: `${wrapperKeys[0]} must be an object`
        });
        return findings;
    }

    if (shape.descriptionKeys) {
        const description = wrapper.description;
        if (!isRecord(description)) {
            findings.push({
                severity: 'error',
                code: 'definition.missing-key',
                message: 'description must be an object'
            });
        } else {
            for (const key of shape.descriptionKeys) {
                if (typeof description[key] !== 'string')
                    findings.push({
                        severity: 'error',
                        code: 'definition.missing-key',
                        message: `description.${key} must be a string`
                    });
            }
        }
    }

    for (const key of shape.objectKeys ?? []) {
        if (wrapper[key] !== undefined && wrapper[key] !== null && !isRecord(wrapper[key]))
            findings.push({ severity: 'error', code: 'definition.missing-key', message: `${key} must be an object` });
    }

    return findings;
};
