import { WorldgenErrors } from '@jsprismarine/errors/worldgen';

const VALID = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

/**
 * Expands a registry reference to its `namespace:path` form.
 *
 * Java's data files leave the namespace off `minecraft` entries in some places and spell it out
 * in others, so every lookup in this package goes through here first.
 *
 * @throws When the reference is not a string, or contains characters an identifier cannot hold.
 */
export const normalizeIdentifier = (value: unknown): string => {
    if (typeof value !== 'string') {
        throw new WorldgenErrors.ExpectedRegistryIdentifier({ value: JSON.stringify(value) });
    }
    const full = value.includes(':') ? value : `minecraft:${value}`;
    if (!VALID.test(full)) throw new WorldgenErrors.InvalidRegistryIdentifier({ value: JSON.stringify(value) });
    return full;
};

/** Strips the `minecraft:` prefix from a type name so a switch can match the short form. */
export const typeName = (value: unknown): string => {
    const full = normalizeIdentifier(value);
    return full.startsWith('minecraft:') ? full.slice('minecraft:'.length) : full;
};
