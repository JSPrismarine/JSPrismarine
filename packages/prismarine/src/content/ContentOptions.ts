/**
 * What {@link import('./ServerContent').buildServerContent} is given, and the
 * seams a test replaces.
 *
 * Every source the build reads is injectable, because the default sources are
 * Mojang's two fetched halves and nothing in CI should need them. A test
 * passes a {@link PackLoader} that returns definitions it built in memory and
 * a tiny block palette to match, and gets a real content build out, with the
 * real resolvers, the real behavior families and the real flattening.
 */
import type { BlockPalette } from '@jsprismarine/blocks';
import type { Definition as ContentDefinition } from '@jsprismarine/content';
import type {
    Definition,
    Definitions,
    IdentifierResolver,
    LoadOptions,
    LoadResult,
    PackStack
} from '@jsprismarine/packs';
import { JAVA_REGISTRY_IDS, REGISTRY_IDS } from '@jsprismarine/packs';

import type { PackStackRequest } from './packStack';
import type { ServerWorldSource } from './world/adapter';

/** Loads a pack stack. `load` from `@jsprismarine/packs` is the default. */
export type PackLoader = (stack: PackStack, options: LoadOptions) => LoadResult;

/** How to build a {@link import('./ServerContent').ServerContent}. */
export interface ContentOptions {
    /** The pack stack to load. When absent, {@link PackStackRequest} resolves the default one. */
    readonly stack?: PackStack;
    /** Which default stack members to include, used only when `stack` is absent. */
    readonly packs?: PackStackRequest;
    /**
     * Fail the build on the first error instead of reporting it and carrying on.
     *
     * The flag reaches the pack loader and both resolvers, so a bad pack, a
     * block file naming a state its block does not have and an item
     * component nothing implements all fail rather than loading short.
     */
    readonly strict?: boolean;
    /** Replaces the pack loader, which is how a test builds content without touching the disk. */
    readonly load?: PackLoader;
    /**
     * Resolves the Java identifiers the stack references against Bedrock.
     * Defaults to `@jsprismarine/mapping`'s tables; a test replaces it to
     * drive the totality check without them.
     */
    readonly identifiers?: IdentifierResolver;
    /** The world the behavior families act through. Defaults to one that throws on every call. */
    readonly world?: ServerWorldSource;
    /** The world seed, which the loot sequences are keyed from. */
    readonly seed?: bigint;
    /**
     * The palette the block runtime ids are assigned from. Defaults to the
     * captured vanilla palette of 1477 blocks over 22079 states. A stack that
     * declares fewer blocks than the palette holds cannot be flattened, so a
     * test that loads a handful of blocks passes a palette of the same handful.
     */
    readonly blockPalette?: BlockPalette;
    /**
     * The Java item definitions to resolve. Defaults to Java's committed
     * table of 1658 items; Bedrock `items/` files are loaded separately from
     * the pack stack and their components stay on each type as Bedrock data.
     */
    readonly itemDefinitions?: Iterable<ContentDefinition>;
}

/**
 * A `Definitions` object with every registry empty.
 *
 * The registry list comes from `@jsprismarine/packs`, so a registry added
 * there appears here without an edit.
 */
export const emptyDefinitions = (): Definitions => {
    const registries: Partial<Record<Definition['registry'], Map<string, Definition>>> = {};
    for (const registry of [...REGISTRY_IDS, ...JAVA_REGISTRY_IDS]) registries[registry] = new Map();

    // Every key of the record was just written, which the compiler cannot see through a loop
    // over the two literal lists. The alternative is naming all nineteen registries here, and
    // then a registry added to `@jsprismarine/packs` would silently be missing instead.
    return registries as Definitions;
};

/**
 * Fills in the registries a partial set leaves out, so a test names only the
 * ones it cares about.
 */
export const definitionsOf = (partial: Partial<Definitions>): Definitions => ({ ...emptyDefinitions(), ...partial });

/** Builds one definition, for a test or for content that never passed through a pack. */
export const definitionOf = (
    registry: Definition['registry'],
    identifier: string,
    data: unknown,
    pack = 'test'
): Definition => ({ identifier, registry, pack, path: `${registry}/${identifier}.json`, data });
