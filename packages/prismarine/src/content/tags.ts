/**
 * The tag half of the content build.
 *
 * `@jsprismarine/packs` routes every `data/<namespace>/tags/<registry>/...`
 * file into one `tags` map and prefixes each identifier with the registry it
 * tags, because one datapack tags many registries and the paths repeat
 * across them. It has already applied Java Edition's cross-pack rule there:
 * a later pack's values concatenate unless it sets `replace`.
 *
 * What is left, and what this module does, is split that map back apart by
 * tagged registry and run each half through `@jsprismarine/content`'s
 * `Tags`, which expands a `#namespace:tag` member into that tag's own
 * members, transitively, and drops a reference that closes a cycle with a
 * report rather than a throw.
 */
import type { Diagnostic } from '@jsprismarine/content';
import { Registry, Tags } from '@jsprismarine/content';
import type { TagMember, TagSource } from '@jsprismarine/content';
import type { Definition } from '@jsprismarine/packs';

/**
 * The merged tags of a pack stack, read by the registry they tag.
 *
 * Members are identifiers rather than registry entries, because a Java tag
 * names Java identifiers and the registries this server builds are keyed by
 * Bedrock ones. Translating is `@jsprismarine/mapping`'s job, and a caller
 * that needs it does the lookup itself rather than having this table guess.
 */
export interface ContentTags {
    /** The registries the stack tags, such as `block`, `item` and `worldgen/biome`. */
    readonly registries: readonly string[];
    /** Everything the merge reported, such as a tag reference that closes a cycle. */
    readonly diagnostics: readonly Diagnostic[];
    /** How many tags the stack holds across every registry. */
    readonly size: number;
    /** Every tag id of one registry, without a leading `#`. */
    tags(registry: string): readonly string[];
    /** Whether the stack defines a tag at all, which is different from its being empty. */
    has(registry: string, tag: string): boolean;
    /** The members of one tag, in merge order, with `#` references expanded. */
    members(registry: string, tag: string): readonly string[];
    /** Whether an identifier is in a tag. */
    includes(registry: string, tag: string, identifier: string): boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads one tag file's `replace` flag and member list, ignoring anything else it carries. */
const parseTagFile = (data: unknown): { replace: boolean; values: readonly TagMember[] } => {
    if (!isRecord(data) || !Array.isArray(data.values)) return { replace: false, values: [] };

    const values: TagMember[] = [];
    for (const entry of data.values) {
        if (typeof entry === 'string') values.push(entry);
        else if (isRecord(entry) && typeof entry.id === 'string') {
            values.push({ id: entry.id, required: entry.required !== false });
        }
    }
    return { replace: data.replace === true, values };
};

/** Splits `block/minecraft:mineable/axe` into its registry and its tag id. */
const splitTagIdentifier = (identifier: string): { registry: string; tag: string } | undefined => {
    const colon = identifier.indexOf(':');
    if (colon < 0) return undefined;

    const slash = identifier.lastIndexOf('/', colon);
    if (slash <= 0) return undefined;

    return { registry: identifier.slice(0, slash), tag: identifier.slice(slash + 1) };
};

/** One registry's merged tags. */
interface RegistryTags {
    readonly ids: Registry<string>;
    readonly tags: Tags<string>;
    readonly names: readonly string[];
}

/**
 * Merges the stack's tag files, one `Tags` per tagged registry.
 *
 * The identifier registry each `Tags` resolves against is built from the
 * identifiers the files themselves name, so a member is never reported
 * missing just because this server has no entry for it yet. A member that
 * really is absent from a later content build shows up through its holder
 * instead.
 *
 * @param definitions - The `tags` map `@jsprismarine/packs` produced.
 */
export const buildContentTags = (definitions: ReadonlyMap<string, Definition>): ContentTags => {
    const sources = new Map<string, TagSource[]>();
    const identifiers = new Map<string, Set<string>>();

    for (const definition of definitions.values()) {
        const split = splitTagIdentifier(definition.identifier);
        if (!split) continue;

        const { replace, values } = parseTagFile(definition.data);
        const source: TagSource = {
            tag: split.tag,
            pack: definition.pack,
            path: definition.path,
            replace,
            values
        };

        const forRegistry = sources.get(split.registry) ?? [];
        forRegistry.push(source);
        sources.set(split.registry, forRegistry);

        const known = identifiers.get(split.registry) ?? new Set<string>();
        for (const member of values) {
            const id = typeof member === 'string' ? member : member.id;
            if (!id.startsWith('#')) known.add(id);
        }
        identifiers.set(split.registry, known);
    }

    const built = new Map<string, RegistryTags>();
    const diagnostics: Diagnostic[] = [];
    let size = 0;

    for (const [registry, files] of sources) {
        const ids = new Registry<string>(`tags/${registry}`);
        ids.rebuild([...(identifiers.get(registry) ?? [])].map((id) => [id, id] as const));

        const tags = new Tags<string>(ids);
        tags.rebuild(files);
        diagnostics.push(...tags.diagnostics);

        const names = [...new Set(files.map((file) => file.tag))].sort();
        size += names.length;
        built.set(registry, { ids, tags, names });
    }

    return {
        registries: [...built.keys()].sort(),
        diagnostics,
        size,
        tags: (registry) => built.get(registry)?.names ?? [],
        has: (registry, tag) => built.get(registry)?.tags.has(tag) ?? false,
        members: (registry, tag) => built.get(registry)?.tags.get(tag)?.values() ?? [],
        includes: (registry, tag, identifier) => built.get(registry)?.tags.get(tag)?.has(identifier) ?? false
    };
};
