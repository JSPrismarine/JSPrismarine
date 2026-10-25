/**
 * The block facts `@jsprismarine/features` asks about a Java state.
 *
 * Seven questions, answered from two sources. Java's own block tags, read out of the datapack,
 * settle membership and replaceability; the rest come from the Bedrock state the Java one maps
 * to, because `@jsprismarine/mapping` carries the Java-sourced property table keyed that way.
 */
import type { BlockOracle, BlockState, Direction, FluidKind } from '@jsprismarine/features';
import { hasSturdyTopFace, isFullCube } from '@jsprismarine/engine-systems';
import { javaBlockStateToBedrock } from '@jsprismarine/mapping';

import type { JavaRegistry } from './javaWorldgenData';

/** The three identifiers Java treats as air. */
const AIR_BLOCKS = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air']);

/** The blocks that are water without being `minecraft:water`. */
const WATER_BLOCKS = new Set(['minecraft:water', 'minecraft:bubble_column', 'minecraft:seagrass']);

/** Java's `#minecraft:replaceable`, which is what `canBeReplaced` resolves to for most blocks. */
const REPLACEABLE_TAG = 'minecraft:replaceable';

/**
 * Expands a Java block tag registry into flat identifier sets.
 *
 * A tag document's `values` entry may be another tag, prefixed with `#`, and may be an object
 * carrying `required: false`. Both forms are resolved here so a lookup is one set membership
 * test rather than a graph walk per block.
 */
const expandTags = (documents: JavaRegistry): Map<string, Set<string>> => {
    const expanded = new Map<string, Set<string>>();
    const resolving = new Set<string>();

    const resolve = (id: string): Set<string> => {
        const cached = expanded.get(id);
        if (cached) return cached;
        if (resolving.has(id)) return new Set();

        const members = new Set<string>();
        expanded.set(id, members);
        resolving.add(id);

        // Extracted game data: every field is checked rather than trusted.
        const document = documents.get(id);
        const values =
            typeof document === 'object' &&
            document !== null &&
            Array.isArray((document as { values?: unknown }).values)
                ? ((document as { values: unknown[] }).values as unknown[])
                : [];

        for (const entry of values) {
            const value =
                typeof entry === 'string'
                    ? entry
                    : typeof entry === 'object' && entry !== null && typeof (entry as { id?: unknown }).id === 'string'
                      ? (entry as { id: string }).id
                      : undefined;
            if (value === undefined) continue;

            if (value.startsWith('#')) {
                for (const member of resolve(normalize(value.slice(1)))) members.add(member);
            } else {
                members.add(normalize(value));
            }
        }

        resolving.delete(id);
        return members;
    };

    for (const id of documents.keys()) resolve(id);
    return expanded;
};

const normalize = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

/**
 * Builds the oracle the decoration pass reads.
 *
 * @param blockTags - The `tags/block` registry, as the datapack loader read it.
 */
export const createJavaBlockOracle = (blockTags: JavaRegistry): BlockOracle => {
    const tags = expandTags(blockTags);
    const replaceable = tags.get(REPLACEABLE_TAG) ?? new Set<string>();
    const fullCubes = new Map<string, boolean>();
    const sturdyTops = new Map<string, boolean>();

    /**
     * The Bedrock facts for a Java state.
     *
     * An unmapped Java block answers "not a full cube", which makes a feature treat it as
     * something it may not build on, rather than quietly building on a block this server
     * cannot place anyway.
     */
    const bedrockFacts = (state: BlockState): { fullCube: boolean; sturdyTop: boolean } => {
        const key = state.name;
        const cachedCube = fullCubes.get(key);
        if (cachedCube !== undefined) return { fullCube: cachedCube, sturdyTop: sturdyTops.get(key) ?? false };

        const mapped = javaBlockStateToBedrock(state.name, state.properties);
        const block = mapped.kind === 'unknown' ? undefined : mapped.bedrock;
        const fullCube = block === undefined ? false : isFullCube(block);
        const sturdyTop = block === undefined ? false : hasSturdyTopFace(block);

        fullCubes.set(key, fullCube);
        sturdyTops.set(key, sturdyTop);
        return { fullCube, sturdyTop };
    };

    const isAir = (state: BlockState): boolean => AIR_BLOCKS.has(state.name);

    const fluid = (state: BlockState): FluidKind => {
        if (state.name === 'minecraft:lava') return 'lava';
        if (WATER_BLOCKS.has(state.name)) return 'water';
        return state.properties['waterlogged'] === 'true' ? 'water' : 'empty';
    };

    /**
     * Java's `isSolid` is `blocksMotion`, which the Bedrock property table does not carry.
     * A full cube is the closest fact it does carry: it agrees for every block the vanilla
     * features build on or test against, and disagrees for the slabs and stairs features do
     * not read.
     */
    const isSolid = (state: BlockState): boolean => !isAir(state) && bedrockFacts(state).fullCube;

    return {
        isAir,
        isSolid,
        isSturdy: (state: BlockState, direction: Direction) =>
            direction === 'up' ? bedrockFacts(state).sturdyTop : bedrockFacts(state).fullCube,
        isReplaceable: (state: BlockState) => isAir(state) || replaceable.has(state.name),
        fluid,
        hasTag: (state: BlockState, tag: string) => tags.get(normalize(tag))?.has(state.name) ?? false,
        /**
         * Java asks each block class whether it can stand where it is being placed, which is
         * code rather than data. The shared half of those rules is that a block which is not a
         * full cube needs something with a sturdy top under it, and that is what this answers.
         */
        canSurvive: (world, position, state) => {
            if (bedrockFacts(state).fullCube) return true;

            const below = world.getBlock({ x: position.x, y: position.y - 1, z: position.z });
            return bedrockFacts(below).sturdyTop;
        },
        tagMembers: (tag: string) => [...(tags.get(normalize(tag)) ?? [])]
    };
};
