/**
 * The block facts `@jsprismarine/features` asks about a Java state.
 *
 * Seven questions, answered from two sources. Java's own block tags, read out of the datapack,
 * settle membership and replaceability; the rest come from the Bedrock state the Java one maps
 * to, because `@jsprismarine/mapping` carries the Java-sourced property table keyed that way.
 */
import type { BlockOracle, BlockState, Direction, FluidKind } from '@jsprismarine/features';
import { hasSturdyTopFace, isFullCube } from '@jsprismarine/engine-systems';
import { javaBlockFluidKindOf, javaBlockStateToBedrock } from '@jsprismarine/mapping';

import type { JavaRegistry } from './javaWorldgenData';

/** The three identifiers Java treats as air. */
const AIR_BLOCKS = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air']);

/** Java's `#minecraft:replaceable`, which is what `canBeReplaced` resolves to for most blocks. */
const REPLACEABLE_TAG = 'minecraft:replaceable';

/** The cached flag for a block that fills its whole cell. */
const FULL_CUBE = 1;

/** The cached flag for a block another block can stand on. */
const STURDY_TOP = 2;

/** The cached flag for a non-air block that fills its whole cell. */
const SOLID = 4;

/** One block's support rule: the tag Java tests the block below against, and who follows it. */
interface SupportRule {
    /** The `#minecraft:supports_*` tag the block below has to be in. */
    readonly support: string;
    /** Placed blocks named one at a time, because no tag collects them. */
    readonly blocks?: readonly string[];
    /** Block tags whose every member follows this rule, read out of the datapack. */
    readonly groups?: readonly string[];
}

/**
 * Which support tag each placed block tests, read off the 26.3 block classes.
 *
 * `VegetationBlock.mayPlaceOn` is `state.is(SUPPORTS_VEGETATION)`, and a subclass that wants a
 * different base overrides it: `AzaleaBlock` takes `SUPPORTS_AZALEA`, `MangrovePropaguleBlock`
 * takes `SUPPORTS_MANGROVE_PROPAGULE`, `WitherRoseBlock` takes `SUPPORTS_WITHER_ROSE`. Cactus,
 * sugar cane and bamboo are plain `Block` subclasses that test their own tag in `canSurvive`.
 *
 * Rules apply in order and a block's last rule wins, so the overrides come after the groups
 * that also hold them: `#minecraft:saplings` holds the azaleas and the mangrove propagule, and
 * `#minecraft:small_flowers` holds the wither rose.
 */
const SUPPORT_RULES: readonly SupportRule[] = [
    {
        support: 'minecraft:supports_vegetation',
        groups: ['minecraft:saplings', 'minecraft:small_flowers'],
        blocks: [
            'minecraft:short_grass',
            'minecraft:fern',
            'minecraft:tall_grass',
            'minecraft:large_fern',
            'minecraft:bush',
            'minecraft:firefly_bush',
            'minecraft:sweet_berry_bush',
            'minecraft:pink_petals',
            'minecraft:wildflowers'
        ]
    },
    {
        support: 'minecraft:supports_dry_vegetation',
        blocks: ['minecraft:short_dry_grass', 'minecraft:tall_dry_grass', 'minecraft:dead_bush']
    },
    { support: 'minecraft:supports_cactus', blocks: ['minecraft:cactus'] },
    { support: 'minecraft:supports_sugar_cane', blocks: ['minecraft:sugar_cane'] },
    { support: 'minecraft:supports_lily_pad', blocks: ['minecraft:lily_pad'] },
    { support: 'minecraft:supports_bamboo', blocks: ['minecraft:bamboo', 'minecraft:bamboo_sapling'] },
    { support: 'minecraft:supports_azalea', blocks: ['minecraft:azalea', 'minecraft:flowering_azalea'] },
    { support: 'minecraft:supports_mangrove_propagule', blocks: ['minecraft:mangrove_propagule'] },
    { support: 'minecraft:supports_wither_rose', blocks: ['minecraft:wither_rose'] }
];

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
 * Turns {@link SUPPORT_RULES} into a lookup from placed block to the blocks it may stand on.
 *
 * A rule whose support tag the datapack does not carry is dropped, which leaves its blocks on
 * the sturdy-face fallback instead of making them unplaceable. That is what a caller building
 * an oracle without block tags, such as a test that only reads `isSolid`, gets today.
 *
 * @param tags - Every block tag, already expanded to flat identifier sets.
 */
const buildSupports = (tags: Map<string, Set<string>>): Map<string, Set<string>> => {
    const supports = new Map<string, Set<string>>();

    for (const rule of SUPPORT_RULES) {
        const members = tags.get(rule.support);
        if (members === undefined || members.size === 0) continue;

        for (const group of rule.groups ?? []) {
            for (const block of tags.get(group) ?? []) supports.set(block, members);
        }
        for (const block of rule.blocks ?? []) supports.set(block, members);
    }

    return supports;
};

/**
 * Builds the oracle the decoration pass reads.
 *
 * @param blockTags - The `tags/block` registry, as the datapack loader read it.
 */
export const createJavaBlockOracle = (blockTags: JavaRegistry): BlockOracle => {
    const tags = expandTags(blockTags);
    const replaceable = tags.get(REPLACEABLE_TAG) ?? new Set<string>();
    const supports = buildSupports(tags);
    const facts = new Map<string, number>();

    /**
     * The Bedrock facts for a Java state, as the two flags above.
     *
     * The decoration pass asks this of millions of positions per chunk, so the answer is a
     * number rather than a record: a record would allocate on every hit, and the hits are the
     * whole point of the cache.
     *
     * An unmapped Java block answers "not a full cube", which makes a feature treat it as
     * something it may not build on, rather than quietly building on a block this server
     * cannot place anyway.
     */
    const bedrockFacts = (state: BlockState): number => {
        const cached = facts.get(state.name);
        if (cached !== undefined) return cached;

        const mapped = javaBlockStateToBedrock(state.name, state.properties);
        const block = mapped.kind === 'unknown' ? undefined : mapped.bedrock;
        const fullCube = block !== undefined && isFullCube(block);
        const flags =
            (fullCube ? FULL_CUBE : 0) |
            (block !== undefined && hasSturdyTopFace(block) ? STURDY_TOP : 0) |
            (fullCube && !AIR_BLOCKS.has(state.name) ? SOLID : 0);

        facts.set(state.name, flags);
        return flags;
    };

    const isAir = (state: BlockState): boolean => AIR_BLOCKS.has(state.name);

    const fluid = (state: BlockState): FluidKind => javaBlockFluidKindOf(state);

    /**
     * Java's `isSolid` is `blocksMotion`, which the Bedrock property table does not carry.
     * A full cube is the closest fact it does carry: it agrees for every block the vanilla
     * features build on or test against, and disagrees for the slabs and stairs features do
     * not read.
     */
    const isSolid = (state: BlockState): boolean => (bedrockFacts(state) & SOLID) !== 0;

    return {
        isAir,
        isSolid,
        isSturdy: (state: BlockState, direction: Direction) =>
            (bedrockFacts(state) & (direction === 'up' ? STURDY_TOP : FULL_CUBE)) !== 0,
        isReplaceable: (state: BlockState) => isAir(state) || replaceable.has(state.name),
        fluid,
        hasTag: (state: BlockState, tag: string) => tags.get(normalize(tag))?.has(state.name) ?? false,
        /**
         * Java asks each block class whether it can stand where it is being placed, which is
         * code rather than data. Two answers cover the blocks world generation places.
         *
         * A plant names a support tag and the block below has to be in it, which is what
         * {@link SUPPORT_RULES} records. Stone, gravel, sandstone and the mushroom blocks are
         * in none of those tags, so a sapling does not survive on a huge mushroom cap and grass
         * does not survive on exposed stone.
         *
         * Everything else needs a sturdy top face under it, which is the rule `LeafLitterBlock`,
         * `SnowLayerBlock` and the other `canSurvive` overrides that read `isFaceSturdy` use.
         */
        canSurvive: (world, position, state) => {
            if ((bedrockFacts(state) & FULL_CUBE) !== 0) return true;

            const below = world.getBlock({ x: position.x, y: position.y - 1, z: position.z });
            const support = supports.get(state.name);
            return support === undefined ? (bedrockFacts(below) & STURDY_TOP) !== 0 : support.has(below.name);
        },
        tagMembers: (tag: string) => [...(tags.get(normalize(tag)) ?? [])]
    };
};
