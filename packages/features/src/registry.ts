import { fail } from './json';
import { FeaturesErrors } from '@jsprismarine/errors/features';

const VALID = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

/**
 * Expands a registry reference to its `namespace:path` form.
 *
 * Mojang's data leaves `minecraft` off in some places and spells it out in others, so every
 * lookup goes through here first.
 */
export const normalizeIdentifier = (value: unknown, path: string): string => {
    if (typeof value !== 'string')
        return fail(new FeaturesErrors.ExpectedRegistryIdentifier({ path, value: JSON.stringify(value) }));
    const full = value.includes(':') ? value : `minecraft:${value}`;
    if (!VALID.test(full))
        return fail(new FeaturesErrors.InvalidRegistryIdentifier({ path, value: JSON.stringify(value) }));
    return full;
};

/** Strips the `minecraft:` prefix from a dispatch key so a switch can match the short form. */
export const typeNameOf = (value: unknown, path: string): string => {
    const full = normalizeIdentifier(value, `${path}.type`);
    return full.startsWith('minecraft:') ? full.slice('minecraft:'.length) : full;
};

/** Strips the `minecraft:` prefix, reading the key the predicate registries dispatch on. */
export const predicateTypeNameOf = (value: unknown, path: string): string => {
    const full = normalizeIdentifier(value, `${path}.predicate_type`);
    return full.startsWith('minecraft:') ? full.slice('minecraft:'.length) : full;
};

/**
 * A reference to a set of blocks: either one identifier or a `#`-prefixed tag.
 *
 * Java's `HolderSet` also accepts an inline list; `features_cannot_replace` and the geode's
 * invalid-block set are the two shapes the vanilla feature data actually uses.
 */
export type BlockSet =
    { readonly kind: 'tag'; readonly tag: string } | { readonly kind: 'blocks'; readonly names: readonly string[] };

/** Reads a `HolderSet<Block>`: a tag reference, one identifier, or an inline list of them. */
export const parseBlockSet = (source: unknown, path: string): BlockSet => {
    if (typeof source === 'string') {
        return source.startsWith('#')
            ? { kind: 'tag', tag: normalizeIdentifier(source.slice(1), path) }
            : { kind: 'blocks', names: [normalizeIdentifier(source, path)] };
    }
    if (Array.isArray(source)) {
        return { kind: 'blocks', names: source.map((entry, index) => normalizeIdentifier(entry, `${path}[${index}]`)) };
    }
    return fail(new FeaturesErrors.ExpectedBlockSet({ path, source: JSON.stringify(source) }));
};
