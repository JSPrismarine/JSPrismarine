import Ajv from 'ajv';
import type { ErrorObject, ValidateFunction } from 'ajv';

import type { BedrockSchemaSet } from './bedrockSchemas';
import { selectSchema } from './bedrockSchemas';
import type { DiagnosticSeverity } from './diagnostics';
import { parseVersion } from './formatVersion';
import type { RegistryId } from './registries';
import type { DefinitionValidator, ValidationFinding } from './validation';

/**
 * Schema validation for the Bedrock half of the pack stack, against Mojang's
 * own `metadata/json_schemas` from bedrock-samples.
 *
 * Mojang publishes a root document per area and format version, and a file
 * picks one by its `format_version` under the engine's own rule: the same
 * version or the closest one that is not greater. A file older than every
 * published schema checks against none, which is why the structural
 * validator stays in the stack beside this one.
 *
 * Six of the eleven Bedrock registries have a published root document.
 * Recipes, loot tables, trade tables, features and feature rules have none,
 * and keep the structural checks alone.
 */

/** Which schema document a registry's files check against, and which part of the file it describes. */
interface SchemaRoute {
    /** The document key in {@link BedrockSchemaSet.versionsByDocument}. */
    document: string;
    /**
     * The namespaced wrapper key whose value the document describes, or
     * undefined when the document describes the whole file.
     */
    wrapperKey?: string;
}

const ROUTES: Partial<Record<RegistryId, SchemaRoute>> = {
    entities: { document: 'server/entity/ActorDocument.json', wrapperKey: 'minecraft:entity' },
    items: { document: 'server/item/ItemDocument.json', wrapperKey: 'minecraft:item' },
    blocks: { document: 'server/block/Blocks.json', wrapperKey: 'minecraft:block' },
    biomes: { document: 'server/biome/Biome Document.json' },
    spawnRules: { document: 'client_server/spawn/Spawn Rules.json', wrapperKey: 'minecraft:spawn_rules' },
    itemCatalog: {
        document: 'server/crafting_catalog/Crafting Catalog Document.json',
        wrapperKey: 'minecraft:crafting_items_catalog'
    }
};

/** The registries a published root document covers, so a caller can report the gap. */
export const SCHEMA_VALIDATED_REGISTRIES = Object.keys(ROUTES) as readonly RegistryId[];

/**
 * Rewrites every `oneOf` as `anyOf` throughout a schema.
 *
 * Mojang's generator emits a variant union as `oneOf`, which JSON Schema
 * reads as "exactly one", and their variants overlap. Two cases from the
 * 1.26.50 publication:
 *
 * - `Filter Group` is a union of Filter Test, an array, and Filter Group Map.
 *   Filter Group Map is `"type": "object"` with no required key and no
 *   `additionalProperties`, so it matches every object, and a plain test such
 *   as `{"test": "in_water", "subject": "other", "value": true}` matches two
 *   arms at once.
 * - `Block Descriptor` lists the same `$ref` to `BlockDescriptorProxy.json`
 *   as both its first and its third arm, so every descriptor object matches
 *   twice.
 *
 * Read as `oneOf`, neither can be satisfied by any value, and the vanilla
 * behavior pack reports 347 violations that are all wrong. Read as `anyOf`,
 * every arm still has to be a possible shape and the arms stay checked, which
 * is what the generator meant.
 */
const asAnyOf = (schema: Readonly<Record<string, unknown>>): Record<string, unknown> => {
    const rewritten: Record<string, unknown> = {};
    for (const [key, member] of Object.entries(schema)) {
        rewritten[key === 'oneOf' ? 'anyOf' : key] = rewriteMember(member);
    }
    return rewritten;
};

/** Applies {@link asAnyOf} through arrays and nested subschemas. */
const rewriteMember = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(rewriteMember);
    return isRecord(value) ? asAnyOf(value) : value;
};

/** Options for {@link bedrockSchemaValidator}. */
export interface BedrockSchemaValidatorOptions {
    /** The severity a schema violation reports at. Defaults to `error`. */
    severity?: DiagnosticSeverity;
    /**
     * How many violations one file reports before the rest are summarized.
     * One malformed union arm can produce hundreds of Ajv errors, and the
     * first few name the field. Defaults to 10.
     */
    limit?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Renders one Ajv error as a field and a reason. The field is the JSON
 * pointer Ajv reports, with the wrapper key prefixed back on so the message
 * names the path as the file writes it.
 */
const describe = (error: ErrorObject, wrapperKey: string | undefined): string => {
    const pointer = `${wrapperKey ? `/${wrapperKey}` : ''}${error.instancePath}`;
    const field = pointer.length > 0 ? pointer : '/';
    const detail = error.keyword === 'additionalProperties' ? ` ${error.params.additionalProperty}` : '';
    return `${field} ${error.message ?? 'is invalid'}${detail}`;
};

/**
 * Builds a validator that checks each definition against the bedrock-samples
 * schema for its registry and `format_version`. Compose it with
 * {@link structuralValidator} through {@link composeValidators}: the schemas
 * cover six registries and say nothing about the other five, and they do not
 * close their objects, so unknown keys still need the structural check that
 * reports them.
 *
 * @param schemas - The schema set from {@link readBedrockSchemas}.
 * @returns A validator reporting one finding per schema violation.
 */
export const bedrockSchemaValidator = (
    schemas: BedrockSchemaSet,
    options: BedrockSchemaValidatorOptions = {}
): DefinitionValidator => {
    const severity = options.severity ?? 'error';
    const limit = options.limit ?? 10;

    // `strict: false` because Mojang's `x-ordinal-index`, `x-format-version`
    // and `x-runtime-constraint-description` are not JSON Schema keywords.
    // `validateSchema: false` because the set is Mojang's publication, not
    // user input, and meta-validating 969 files on every load costs more than
    // it finds.
    const ajv = new Ajv({ strict: false, allErrors: true, validateSchema: false });
    for (const [id, schema] of schemas.byId) ajv.addSchema(asAnyOf(schema), id);

    /** Compiled validators by `$id`; null marks a document whose `$ref`s did not resolve. */
    const compiled = new Map<string, ValidateFunction | null>();
    const compile = (id: string): ValidateFunction | null => {
        const cached = compiled.get(id);
        if (cached !== undefined) return cached;
        let validate: ValidateFunction | null;
        try {
            validate = ajv.getSchema(id) ?? null;
        } catch {
            validate = null;
        }
        compiled.set(id, validate);
        return validate;
    };

    return ({ registry, data }): ValidationFinding[] => {
        const route = ROUTES[registry as RegistryId];
        if (!route || !isRecord(data)) return [];

        const id = selectSchema(schemas, route.document, parseVersion(data.format_version));
        if (!id) return [];

        const validate = compile(id);
        if (!validate) {
            return [
                {
                    severity: 'warning',
                    code: 'definition.schema-unavailable',
                    message: `the bedrock-samples schema ${decodeURIComponent(id)} did not compile`
                }
            ];
        }

        const subject = route.wrapperKey ? data[route.wrapperKey] : data;
        // A missing wrapper is the structural validator's finding to report.
        if (route.wrapperKey && subject === undefined) return [];

        if (validate(subject)) return [];

        const messages = [...new Set((validate.errors ?? []).map((error) => describe(error, route.wrapperKey)))];
        const findings: ValidationFinding[] = messages
            .slice(0, limit)
            .map((message) => ({ severity, code: 'definition.schema', message }));
        if (messages.length > limit) {
            findings.push({
                severity,
                code: 'definition.schema',
                message: `and ${messages.length - limit} further violations of ${decodeURIComponent(id)}`
            });
        }
        return findings;
    };
};
