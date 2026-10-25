/**
 * Resolving a `HolderSet`, which is how every Java data component names a
 * group of blocks, items or entities.
 *
 * Three written forms - `"minecraft:stone"`, `["a", "b"]` and
 * `"#minecraft:logs"` - parse into two cases, and the tag case is the only
 * one that needs anything outside the set itself.
 */
import type { HolderSet } from '@jsprismarine/items';

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

/**
 * Whether an identifier is in a holder set.
 *
 * @param tags - The merged tags, or undefined on a server with no content
 *   build. Without them a `#tag` matches nothing, which is the honest answer:
 *   the set names a group the server has no membership list for.
 */
export const holderSetIncludes = (tags: TagLookup | undefined, set: HolderSet, member: string): boolean => {
    if (set.kind === 'entries') return set.entries.includes(member);
    if (!tags) return false;
    return HOLDER_SET_REGISTRIES.some((registry) => tags.includes(registry, set.tag, member));
};
