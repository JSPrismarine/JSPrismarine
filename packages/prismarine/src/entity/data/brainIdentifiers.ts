/**
 * Finding a brain mob by the identifier it spawns under.
 *
 * `@jsprismarine/entity-brains` is written against Java Edition, so every one
 * of its twenty definitions is registered under Java's name for the mob. Five
 * Bedrock entities kept a legacy identifier when Mojang rewrote their file, and
 * one of the five is a brain mob: Java's `minecraft:villager` spawns here as
 * `minecraft:villager_v2`. A registry read by the spawned identifier misses it,
 * so a villager ran its 27 Bedrock goals and left its schedule, its professions,
 * its memories and its sensors unused.
 *
 * The rename comes from `@jsprismarine/mapping`, which owns the Java to Bedrock
 * identifier seam, rather than from an alias table written here. That is the
 * same source `javaEntityStats` reads for the same five renames.
 */
import type { BrainMobDefinition, BrainMobRegistry } from '@jsprismarine/entity-brains';
import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';

/** One registry's alias index, with the registry size it was built at. */
interface AliasIndex {
    /** How many definitions the registry held when the index was built. */
    readonly size: number;
    readonly byBedrock: ReadonlyMap<string, BrainMobDefinition>;
}

const indexes = new WeakMap<BrainMobRegistry, AliasIndex>();

/**
 * The definitions whose Bedrock identifier differs from the Java one they are
 * registered under.
 *
 * A Bedrock identifier that two Java types map onto is left out: there is no
 * one brain to pick, and guessing would attach the wrong one. Rebuilt when the
 * registry has grown, so a plugin that registers a brain after the first lookup
 * is still found.
 */
const aliasesOf = (registry: BrainMobRegistry): ReadonlyMap<string, BrainMobDefinition> => {
    const cached = indexes.get(registry);
    if (cached !== undefined && cached.size === registry.size) return cached.byBedrock;

    const byBedrock = new Map<string, BrainMobDefinition>();
    const ambiguous = new Set<string>();
    for (const definition of registry.all) {
        const mapped = javaEntityTypeToBedrock(definition.id);
        if (mapped.kind !== 'mapped' || mapped.bedrock === definition.id) continue;
        if (ambiguous.has(mapped.bedrock)) continue;
        if (byBedrock.has(mapped.bedrock)) {
            byBedrock.delete(mapped.bedrock);
            ambiguous.add(mapped.bedrock);
            continue;
        }
        byBedrock.set(mapped.bedrock, definition);
    }

    indexes.set(registry, { size: registry.size, byBedrock });
    return byBedrock;
};

/**
 * The brain mob an entity identifier runs, or undefined when it runs goals.
 *
 * Nineteen of the twenty are spelled the same way in both editions, so the
 * direct read answers first and the rename index is only consulted for the rest.
 *
 * @param identifier - The identifier the entity spawns under, such as
 *   `minecraft:villager_v2`.
 */
export const brainMobFor = (registry: BrainMobRegistry, identifier: string): BrainMobDefinition | undefined =>
    registry.get(identifier) ?? aliasesOf(registry).get(identifier);
