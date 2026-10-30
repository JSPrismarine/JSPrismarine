import type { LevelStem, NoiseGeneratorDefinition } from '@jsprismarine/worldgen';

import type { GeneratorLogger } from '../../BaseGenerator';
import type { GeneratorBuildContext, GeneratorFactory } from '../../GeneratorFactories';
import { chunkWorkerCount } from '../chunkConcurrency';
import type { PipelineKey, StagePoolOptions } from '../datadriven/DataDrivenGenerator';
import { DataDrivenGenerator, defaultChunkPipeline } from '../datadriven/DataDrivenGenerator';
import { findJavaTemplateSource } from '../datadriven/javaStructureTemplates';
import type { JavaWorldgenRegistries } from '../datadriven/javaWorldgenData';
import { cacheRoot } from '../datadriven/javaWorldgenData';

/** The kind id of Java's noise generator, which every vanilla dimension uses. */
export const NOISE_GENERATOR_KIND = 'minecraft:noise';

/** The Overworld stem of Java's `minecraft:normal` world preset. */
export const OVERWORLD_NOISE_STEM: LevelStem = {
    type: 'minecraft:overworld',
    generator: {
        type: NOISE_GENERATOR_KIND,
        settings: 'minecraft:overworld',
        biomeSource: { type: 'minecraft:multi_noise', preset: 'minecraft:overworld' }
    }
};

/**
 * Where a stem's inline noise settings are registered, so the pipeline can look them up by id.
 * The dimension's namespace separator becomes a slash, because an identifier holds one colon.
 */
const inlineSettingsId = (dimensionType: string): string => `jsprismarine:inline/${dimensionType.replace(':', '/')}`;

/**
 * A `minecraft:noise` factory whose stems share one {@link DataDrivenGenerator}.
 *
 * The first stem built opens the generator from the context's registries, with a pool of
 * worker threads sized by the context's `workers` or the core count. Every stem after that,
 * the Nether's and the End's included, gets a view of the same generator keyed by its settings,
 * its biome source and its dimension, so a server runs one pool of `min(6, cores - 2)` workers
 * rather than one per dimension. The stem's `settings` names a `worldgen/noise_settings`
 * document or carries one inline; the inline form travels under a private id. A host that
 * cannot run workers generates on the server thread and says so once.
 *
 * One factory per {@link GeneratorFactories} registry, which is one per server: the registry's
 * `stopGenerating` reaches the shared generator through any of the views it built.
 *
 * @throws When the Java data is not on disk, or the settings id is not a registered
 *   `worldgen/noise_settings` document, or the biome source cannot be built.
 */
export const createNoiseGeneratorFactory = (): GeneratorFactory => {
    let shared: DataDrivenGenerator | undefined;

    return {
        kind: NOISE_GENERATOR_KIND,
        build(context) {
            const generator = context.stem.generator;
            if (generator.type !== NOISE_GENERATOR_KIND || !('biomeSource' in generator)) {
                throw new TypeError(`The ${context.dimension.id} stem carries no noise generator settings`);
            }

            const registries = context.worldgen();
            const settings = resolveSettings(registries, context.dimension.id, generator);
            shared ??= openShared(registries, context);

            return shared.forStem({
                ...settings,
                biomeSource: generator.biomeSource,
                dimension: context.dimension
            } satisfies PipelineKey);
        }
    };
};

/** The server's one generator, over the first stem's registries and worker count. */
const openShared = (registries: JavaWorldgenRegistries, context: GeneratorBuildContext): DataDrivenGenerator => {
    const stages = stagePool(context.workers ?? chunkWorkerCount(), context.logger);
    const built = new DataDrivenGenerator({
        registries,
        templates: findJavaTemplateSource(cacheRoot(), registries.processorLists),
        ...(stages === undefined ? {} : { stages })
    });
    if (stages !== undefined && stages.workers > 0) {
        context.logger.info(`Generating terrain and features in §b${stages.workers}§r worker thread(s)`);
    }
    return built;
};

/**
 * The settings half of a stem's key: a registered id, or a private id with the inline document
 * beside it.
 *
 * @throws When a named id has no `worldgen/noise_settings` document.
 */
const resolveSettings = (
    registries: JavaWorldgenRegistries,
    dimensionType: string,
    generator: NoiseGeneratorDefinition
): Pick<PipelineKey, 'noiseSettings' | 'inlineNoiseSettings'> => {
    if (typeof generator.settings !== 'string') {
        return { noiseSettings: inlineSettingsId(dimensionType), inlineNoiseSettings: generator.settings };
    }

    if (!registries.noiseSettings.has(generator.settings)) {
        throw new Error(
            `The ${dimensionType} stem names the noise settings ${generator.settings}, which no worldgen/noise_settings document defines`
        );
    }
    return { noiseSettings: generator.settings };
};

/**
 * How terrain and feature status bodies should run, or undefined when there is no worker to
 * run them in.
 *
 * The pipeline module is resolved rather than configured, and a worker inherits this
 * process's loader, so a checkout run under `tsx` and a published install both work with
 * nothing built first. A single executable keeps its modules in the binary, where no worker
 * thread can import them, so there the generator says so once and builds chunks here.
 */
const stagePool = (workers: number, logger: GeneratorLogger): StagePoolOptions | undefined => {
    if (workers < 1) return undefined;

    return {
        pipeline: defaultChunkPipeline(),
        workers,
        javaTemplates: true,
        onUnavailable: (reason) => {
            logger.warn(`Generating terrain and features on the server thread, because ${reason}`);
        }
    };
};
