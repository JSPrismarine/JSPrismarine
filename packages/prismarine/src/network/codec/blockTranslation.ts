/**
 * The block runtime ids an older release's session is sent in place of the world's
 * ([ADR 0025](../../../../../docs/adr/0025-older-protocols-are-a-window-relative-to-the-newest-release.md)).
 *
 * The world holds the newest release's block states, and a runtime id is the FNV-1a hash of a
 * state's `{name, states}` compound, so a block the newer release gave another state hashes to
 * an id the older client does not know. 1.26.60 gave fire, redstone wire and chorus plants their
 * connection states, and every one of their 1872 states is such an id at 1.26.51. Each is
 * projected onto the older release's catalog instead: a state the older block lacks is dropped,
 * a value outside the older domain takes the older default, and the result is hashed again.
 * Geyser's `ICanHasMoreStates` drops the same states for the same three blocks.
 *
 * A block the older release does not have at all becomes `minecraft:info_update`, which every
 * release has. `protocol-content: oldest` keeps such blocks out of the world, so this is what a
 * server that accepts older clients with the newest content shows them.
 *
 * The translation is derived from the two captured catalogs and touches only the blocks whose
 * properties differ, so every other id, a pack's custom blocks included, passes through. It runs
 * one way: nothing the server reads takes a block id from the client, since an item stack's
 * block comes from its name.
 */
import { blockSchemas } from '@jsprismarine/minecraft/generated/block-schemas';
import { blockSchemas as blockSchemas2193 } from '@jsprismarine/minecraft/generated/v2193/block-schemas';
import { blockSchemas as blockSchemas2225 } from '@jsprismarine/minecraft/generated/v2225/block-schemas';
import { blockRuntimeId } from '@jsprismarine/protocol';
import type { BlockStateValue } from '@jsprismarine/protocol';
import { protocolVersion as protocol2193 } from '@jsprismarine/protocol/bedrock/wire/versions/v2193';
import { protocolVersion as protocol2225 } from '@jsprismarine/protocol/bedrock/wire/versions/v2225';
import type { BlockSchema, BlockSchemaCatalog } from '@jsprismarine/minecraft/BlockSchemaCatalog';

/** What an older session is sent for a block its release does not have. */
export const MISSING_BLOCK_SUBSTITUTE = 'minecraft:info_update';

/** How one session's block runtime ids differ from the world's. */
export interface BlockTranslation {
    /**
     * The id a session is sent for a world id.
     * @param runtimeId - A runtime id as the world holds it.
     */
    toClient(runtimeId: number): number;
    /** Whether any id changes, which is false for a session on the world's own release. */
    readonly changes: boolean;
}

/** The translation of a session on the world's release, or a newer one: nothing changes. */
export const IDENTITY_BLOCK_TRANSLATION: BlockTranslation = {
    toClient: (runtimeId) => runtimeId,
    changes: false
};

type Values = Record<string, BlockStateValue>;

/** A catalog value as the hash wants it: a `byte` property is a flag, which hashes as a byte. */
const hashable = (schema: BlockSchema, values: Readonly<Record<string, string | number | boolean>>): Values =>
    Object.fromEntries(
        Object.entries(values).map(([name, value]) => [
            name,
            schema.properties[name]?.type === 'byte' ? value === true || value === 1 : value
        ])
    );

/** The runtime id of one state of a catalog block. */
const idOf = (name: string, schema: BlockSchema, values: Readonly<Record<string, string | number | boolean>>) =>
    blockRuntimeId(name, hashable(schema, values));

/** A block's default state. */
const defaultsOf = (schema: BlockSchema): Record<string, string | number | boolean> =>
    Object.fromEntries(Object.entries(schema.properties).map(([name, property]) => [name, property.default]));

/** Every state of a catalog block, as property values. */
const statesOf = (schema: BlockSchema): Record<string, string | number | boolean>[] =>
    Object.entries(schema.properties).reduce<Record<string, string | number | boolean>[]>(
        (states, [name, property]) =>
            states.flatMap((state) => property.values.map((value) => ({ ...state, [name]: value }))),
        [{}]
    );

/**
 * A world state laid over an older block's schema: what both have keeps its value when the
 * older block accepts it, and everything else takes the older default.
 */
const project = (
    values: Readonly<Record<string, string | number | boolean>>,
    onto: BlockSchema
): Record<string, string | number | boolean> =>
    Object.fromEntries(
        Object.entries(onto.properties).map(([name, property]) => {
            const value = values[name];
            return [name, value !== undefined && property.values.includes(value) ? value : property.default];
        })
    );

/** Whether two schemas describe the same states, which hash the same. */
const sameStates = (a: BlockSchema, b: BlockSchema): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * The translation between the world's catalog and an older release's.
 * @param world - The catalog the world's states come from.
 * @param older - The older release's catalog.
 * @returns The ids an older session is sent, over the blocks whose states differ.
 */
export const blockTranslationBetween = (world: BlockSchemaCatalog, older: BlockSchemaCatalog): BlockTranslation => {
    const down = new Map<number, number>();
    const substitute = older.blocks[MISSING_BLOCK_SUBSTITUTE];
    const substituteId =
        substitute === undefined ? undefined : idOf(MISSING_BLOCK_SUBSTITUTE, substitute, defaultsOf(substitute));

    for (const [name, schema] of Object.entries(world.blocks)) {
        const olderSchema = older.blocks[name];
        if (olderSchema !== undefined && sameStates(schema, olderSchema)) continue;

        for (const state of statesOf(schema)) {
            const id = idOf(name, schema, state);
            const sent =
                olderSchema === undefined ? substituteId : idOf(name, olderSchema, project(state, olderSchema));
            if (sent !== undefined && sent !== id) down.set(id, sent);
        }
    }

    return {
        toClient: (runtimeId) => down.get(runtimeId) ?? runtimeId,
        changes: down.size > 0
    };
};

/** Each release's captured catalog. A preview has none and is sent the world's ids. */
const catalogs = new Map<number, BlockSchemaCatalog>([
    [protocol2193, blockSchemas2193],
    [protocol2225, blockSchemas2225]
]);

/** The release the world's catalog is, the default Bedrock Dedicated Server's. */
const worldProtocol = [...catalogs].find(([, catalog]) => catalog === blockSchemas)?.[0];

const translations = new Map<number, BlockTranslation>();

/**
 * The translation a session speaking `protocolVersion` needs, built the first time it is asked
 * for. Identity for the world's own release, a newer one, and a version with no catalog.
 * @param protocolVersion - The version the session negotiated.
 * @returns How that session's block runtime ids differ from the world's.
 */
export const blockTranslationFor = (protocolVersion: number): BlockTranslation => {
    const older = catalogs.get(protocolVersion);
    if (older === undefined || worldProtocol === undefined || protocolVersion >= worldProtocol) {
        return IDENTITY_BLOCK_TRANSLATION;
    }
    let translation = translations.get(protocolVersion);
    if (translation === undefined) {
        translation = blockTranslationBetween(blockSchemas, older);
        translations.set(protocolVersion, translation);
    }
    return translation;
};

/**
 * The vanilla blocks the world's catalog has and a release's does not. Empty for a release
 * with no captured catalog, which is sent the world's blocks as they are.
 * @param protocolVersion - The release.
 * @returns The block names, sorted.
 */
export const missingVanillaBlocks = (protocolVersion: number): string[] => {
    const older = catalogs.get(protocolVersion);
    if (older === undefined) return [];
    return Object.keys(blockSchemas.blocks)
        .filter((name) => older.blocks[name] === undefined)
        .sort();
};
