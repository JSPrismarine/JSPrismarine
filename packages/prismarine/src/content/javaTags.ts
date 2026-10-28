import { bedrockBlockToJava, javaItemToBedrock } from '@jsprismarine/mapping';

import type { ContentTags } from './tags';

/** Java datapack tag memberships for the Bedrock identifiers held at runtime. */
interface JavaTagIndexes {
    readonly blocks: ReadonlyMap<string, readonly string[]>;
    readonly items: ReadonlyMap<string, readonly string[]>;
}

const indexes = new WeakMap<ContentTags, JavaTagIndexes>();

/** Adds a tag to a mutable member index while one is being built. */
const addMembership = (memberships: Map<string, string[]>, identifier: string, tag: string): void => {
    const tags = memberships.get(identifier) ?? [];
    tags.push(tag);
    memberships.set(identifier, tags);
};

/** Builds one Java registry's identifier-to-tag index. */
const indexOf = (tags: ContentTags): JavaTagIndexes => {
    const cached = indexes.get(tags);
    if (cached !== undefined) return cached;

    const blocks = new Map<string, string[]>();
    for (const tag of tags.tags('block')) {
        for (const identifier of tags.members('block', tag)) addMembership(blocks, identifier, tag);
    }

    const items = new Map<string, string[]>();
    for (const tag of tags.tags('item')) {
        for (const javaIdentifier of tags.members('item', tag)) {
            const mapping = javaItemToBedrock(javaIdentifier);
            if (mapping.kind !== 'unknown') addMembership(items, mapping.bedrock.identifier, tag);
        }
    }

    const index = {
        blocks: new Map([...blocks].map(([identifier, memberships]) => [identifier, [...new Set(memberships)]])),
        items: new Map([...items].map(([identifier, memberships]) => [identifier, [...new Set(memberships)]]))
    };
    indexes.set(tags, index);
    return index;
};

/** Java block tags that apply to one or more Bedrock block identifiers. */
export const javaBlockTagsForBedrock = (tags: ContentTags, ...identifiers: readonly string[]): readonly string[] => {
    const memberships = indexOf(tags).blocks;
    const javaIdentifiers = identifiers.flatMap((identifier) =>
        identifier.startsWith('minecraft:') ? bedrockBlockToJava(identifier) : [identifier]
    );
    return [...new Set(javaIdentifiers.flatMap((identifier) => memberships.get(identifier) ?? []))];
};

/** Java item tags that apply to one Bedrock item identifier. */
export const javaItemTagsForBedrock = (tags: ContentTags, identifier: string): readonly string[] =>
    indexOf(tags).items.get(identifier) ?? [];
