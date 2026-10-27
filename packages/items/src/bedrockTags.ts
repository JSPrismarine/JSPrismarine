/**
 * Bedrock's item tags, kept apart from the Java datapack tags that name item
 * sets for recipes, loot and predicates.
 */

/** Tag name to the Bedrock item identifiers carrying it. */
export type BedrockItemTagSource = Readonly<Record<string, readonly string[]>>;

/** Item identifier to a replacement list of Bedrock tags. */
export type BedrockItemTagOverrides = ReadonlyMap<string, readonly string[]>;

/** The merged Bedrock item tags for one loaded item catalog. */
export interface BedrockItemTags {
    /** Every tag name, including tags whose current member list is empty. */
    names(): readonly string[];
    /** Whether the source defines a tag. */
    has(tag: string): boolean;
    /** The item identifiers in a tag, in source order. */
    members(tag: string): readonly string[];
    /** Whether an item carries a tag. */
    includes(tag: string, identifier: string): boolean;
    /** The tags carried by an item, in source order. */
    tagsOf(identifier: string): readonly string[];
}

/**
 * Builds a Bedrock item tag index and applies tags declared by loaded item
 * definitions over the captured vanilla membership.
 *
 * @param source - Tag name to vanilla item identifiers.
 * @param overrides - Item identifier to its explicit `minecraft:tags` list.
 */
export const buildBedrockItemTags = (
    source: BedrockItemTagSource = {},
    overrides: BedrockItemTagOverrides = new Map()
): BedrockItemTags => {
    const members = new Map<string, Set<string>>();
    const byItem = new Map<string, string[]>();

    for (const [tag, identifiers] of Object.entries(source)) {
        const tagged = new Set(identifiers);
        members.set(tag, tagged);
        for (const identifier of tagged) {
            const tags = byItem.get(identifier) ?? [];
            tags.push(tag);
            byItem.set(identifier, tags);
        }
    }

    for (const [identifier, tags] of overrides) {
        for (const previous of byItem.get(identifier) ?? []) members.get(previous)?.delete(identifier);

        const uniqueTags = [...new Set(tags)];
        byItem.set(identifier, uniqueTags);
        for (const tag of uniqueTags) {
            const tagged = members.get(tag) ?? new Set<string>();
            tagged.add(identifier);
            members.set(tag, tagged);
        }
    }

    return {
        names: () => [...members.keys()],
        has: (tag) => members.has(tag),
        members: (tag) => [...(members.get(tag) ?? [])],
        includes: (tag, identifier) => members.get(tag)?.has(identifier) ?? false,
        tagsOf: (identifier) => byItem.get(identifier) ?? []
    };
};
