/**
 * Java entity type tag membership, indexed for the identifiers used by gameplay and predicates.
 *
 * Datapacks tag Java entity types, while Bedrock definitions name the entities this server
 * constructs. This index keeps both names available so callers can use the identifier native to
 * their input without duplicating the cross-edition mapping.
 */
import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';

import type { ContentTags } from './tags';

interface EntityTypeTagIndex {
    readonly java: ReadonlyMap<string, readonly string[]>;
    readonly bedrock: ReadonlyMap<string, readonly string[]>;
}

const indexes = new WeakMap<ContentTags, EntityTypeTagIndex>();

/** Appends one tag to a mutable membership map while it is being built. */
const addMembership = (memberships: Map<string, string[]>, identifier: string, tag: string): void => {
    const tags = memberships.get(identifier) ?? [];
    tags.push(tag);
    memberships.set(identifier, tags);
};

/** Copies one mutable membership map into deduplicated readonly values. */
const freezeMemberships = (memberships: Map<string, string[]>): ReadonlyMap<string, readonly string[]> =>
    new Map([...memberships].map(([identifier, tags]) => [identifier, [...new Set(tags)]]));

/** Builds entity tag membership once for a content stack. */
const indexOf = (tags: ContentTags): EntityTypeTagIndex => {
    const cached = indexes.get(tags);
    if (cached !== undefined) return cached;

    const java = new Map<string, string[]>();
    const bedrock = new Map<string, string[]>();
    for (const tag of tags.tags('entity_type')) {
        for (const javaIdentifier of tags.members('entity_type', tag)) {
            addMembership(java, javaIdentifier, tag);

            const mapping = javaEntityTypeToBedrock(javaIdentifier);
            if (mapping.kind === 'mapped' || mapping.kind === 'passthrough')
                addMembership(bedrock, mapping.bedrock, tag);
        }
    }

    const index = { java: freezeMemberships(java), bedrock: freezeMemberships(bedrock) };
    indexes.set(tags, index);
    return index;
};

/** The Java entity type tags for a Java identifier such as `minecraft:zombified_piglin`. */
export const javaEntityTypeTagsFor = (tags: ContentTags, identifier: string): readonly string[] =>
    indexOf(tags).java.get(identifier) ?? [];

/** The Java entity type tags for a Bedrock identifier such as `minecraft:zombie_pigman`. */
export const bedrockEntityTypeTagsFor = (tags: ContentTags, identifier: string): readonly string[] =>
    indexOf(tags).bedrock.get(identifier) ?? [];
