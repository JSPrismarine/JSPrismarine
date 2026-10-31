/**
 * The registry that turns a level stem into a {@link Generator}.
 *
 * A stem names its generator by kind, `minecraft:noise` or `minecraft:flat` in the vanilla
 * presets, and a factory registered under that kind builds the generator for one dimension.
 * The registry also remembers what it built, so a shutdown can tell every generator to drop
 * its queue at once; see {@link GeneratorFactories.stopGenerating}.
 */
import type { LevelStem } from '@jsprismarine/worldgen';

import type { ServerContent } from '../content/ServerContent';
import type { GeneratorLogger } from './BaseGenerator';
import type { DimensionType } from './DimensionType';
import type { Generator } from './Generator';
import { builtInGeneratorFactories } from './generators/factories';
import type { JavaWorldgenRegistries } from './generators/datadriven/javaWorldgenData';

/** Everything a factory may read while building one dimension's generator. */
export interface GeneratorBuildContext {
    /** The stem naming the generator kind and its settings. */
    readonly stem: LevelStem;
    /** The dimension the generator fills, whose bounds every chunk takes. */
    readonly dimension: DimensionType;
    /** The world seed. A generator that is seeded per chunk request may ignore it. */
    readonly seed: bigint;
    /** The server's loaded content, read when a block is placed. */
    readonly content: () => ServerContent;
    /**
     * Java's world generation registries.
     *
     * A function, because reading them costs about 1500 JSON files and a flat or void
     * dimension never needs them. Throws when the Java data is not on disk.
     */
    readonly worldgen: () => JavaWorldgenRegistries;
    /** Where a factory or its generator reports a decision a person should see. */
    readonly logger: GeneratorLogger;
    /**
     * How many worker threads the generator may start.
     *
     * Defaults to the host's share, `min(6, cores - 2)`. Zero keeps generation on the calling
     * thread, which is what a test wants and what a host too small for a worker gets anyway.
     * The noise factory shares one pool between every stem it builds, so the first stem's value
     * sizes it and later ones are not read.
     */
    readonly workers?: number;
}

/** Builds the generator for one kind of stem. */
export interface GeneratorFactory {
    /** The generator kind this factory answers, as a stem's `generator.type` spells it. */
    readonly kind: string;
    /**
     * Builds a generator for one dimension.
     *
     * @throws When the stem's settings cannot be honored, which is the moment a misconfigured
     *   world should fail rather than at its first chunk.
     */
    build(context: GeneratorBuildContext): Generator;
}

/**
 * The generator kinds a server can build, keyed by kind id.
 *
 * Starts with the built-in kinds unless told otherwise: `minecraft:noise`, `minecraft:flat`,
 * `minecraft:debug` and `jsprismarine:void`.
 */
export class GeneratorFactories {
    private readonly factories = new Map<string, GeneratorFactory>();

    /** Every generator built so far, so a shutdown reaches all of them. */
    private readonly built = new Set<Generator>();

    /**
     * @param factories - The factories to start with. Defaults to the built-in kinds; pass an
     *   empty list for a registry that knows nothing.
     */
    public constructor(factories: Iterable<GeneratorFactory> = builtInGeneratorFactories()) {
        for (const factory of factories) this.register(factory);
    }

    /**
     * Adds a factory under its kind.
     *
     * @throws {Error} When the kind is already registered. A second factory for one kind would
     *   silently change which generator every stem of that kind gets.
     */
    public register(factory: GeneratorFactory): void {
        if (this.factories.has(factory.kind)) {
            throw new Error(`A generator factory for ${factory.kind} is already registered`);
        }
        this.factories.set(factory.kind, factory);
    }

    /**
     * Builds the generator a stem asks for.
     *
     * @throws {Error} When no factory answers the stem's kind. The message lists the kinds that
     *   are registered, which is what a person who misspelled one needs.
     */
    public build(context: GeneratorBuildContext): Generator {
        const kind = context.stem.generator.type;
        const factory = this.factories.get(kind);
        if (factory === undefined) {
            throw new Error(`Unknown generator kind ${kind}. Registered kinds: ${this.kinds().join(', ')}`);
        }

        const generator = factory.build(context);
        this.built.add(generator);
        return generator;
    }

    /** The registered kind ids, in registration order. */
    public kinds(): readonly string[] {
        return [...this.factories.keys()];
    }

    /**
     * Gives up the queued chunks of every generator this registry built.
     *
     * Called at the top of a shutdown, before anything is awaited. What is already being
     * generated finishes; what is only queued is dropped, since the save that follows writes the
     * chunks a world has in memory and a chunk the generator never started is not one of them.
     */
    public stopGenerating(): void {
        for (const generator of this.built) generator.stopGenerating?.();
    }
}
