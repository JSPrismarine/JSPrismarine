/**
 * Resolving a `HolderSet`, which is how every Java data component names a
 * group of blocks, items or entities.
 *
 * Three written forms - `"minecraft:stone"`, `["a", "b"]` and
 * `"#minecraft:logs"` - parse into two cases, and the tag case is the only
 * one that needs anything outside the set itself.
 */
import type { HolderSet } from '@jsprismarine/items';
import {
    bedrockBlockToJava,
    javaBlockStateToBedrock,
    javaEntityTypeToBedrock,
    javaItemToBedrock
} from '@jsprismarine/mapping';

/** What a tag lookup has to answer; `ContentTags` satisfies it. */
export interface TagLookup {
    /** Whether an identifier is in a tag of one registry. */
    includes(registry: string, tag: string, identifier: string): boolean;
}

/**
 * The registries a holder set's tag may name, in the order they are tried.
 *
 * A `HolderSet` carries a tag id and nothing that says which registry it
 * tags, because in Java the registry is implied by the component the set sits
 * in. These are the three a block or item rule compares against.
 */
export const HOLDER_SET_REGISTRIES = ['item', 'block', 'entity_type'] as const;

const bedrockNames = new Map<string, readonly string[]>();

/**
 * The Bedrock identities a Java identifier named in an `entries` set takes on this server.
 *
 * A holder set's entries are Java ids, while the runtime registries are keyed by Bedrock
 * identity, so a literal such as `minecraft:cobweb` has to be mapped before it can match the
 * `minecraft:web` block a mining rule is asked about. A Java id can be a block, an item or an
 * entity type, and the set does not say which, so every registry that knows it contributes.
 */
const bedrockNamesOf = (javaId: string): readonly string[] => {
    const cached = bedrockNames.get(javaId);
    if (cached !== undefined) return cached;

    const names: string[] = [];
    const block = javaBlockStateToBedrock(javaId);
    if (block.kind === 'mapped') names.push(block.bedrock.name);
    const item = javaItemToBedrock(javaId);
    if (item.kind !== 'unknown') names.push(item.bedrock.identifier);
    const entity = javaEntityTypeToBedrock(javaId);
    if (entity.kind === 'mapped') names.push(entity.bedrock);

    bedrockNames.set(javaId, names);
    return names;
};

/**
 * Whether an identifier is in a holder set.
 *
 * @param tags - The merged tags, or undefined on a server with no content
 *   build. Without them a `#tag` matches nothing, which is the honest answer:
 *   the set names a group the server has no membership list for.
 */
export const holderSetIncludes = (tags: TagLookup | undefined, set: HolderSet, member: string): boolean => {
    if (set.kind === 'entries') {
        return set.entries.includes(member) || set.entries.some((entry) => bedrockNamesOf(entry).includes(member));
    }
    if (!tags) return false;
    if (HOLDER_SET_REGISTRIES.some((registry) => tags.includes(registry, set.tag, member))) return true;

    // Java's tags list Java ids, while the member is the Bedrock identity of a block, which
    // differs for `note_block`/`noteblock` and `cobweb`/`web`, so the Java ids it came from are tried too.
    return bedrockBlockToJava(member).some((javaId) => tags.includes('block', set.tag, javaId));
};
