import type { LevelStem, NoiseGeneratorDefinition } from '@jsprismarine/worldgen';

import type { GeneratorLogger } from '../../BaseGenerator';
import type { GeneratorFactory } from '../../GeneratorFactories';
import { chunkWorkerCount } from '../chunkConcurrency';
import type { StagePoolOptions } from '../datadriven/DataDrivenGenerator';
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
 * The `minecraft:noise` kind over {@link DataDrivenGenerator}.
 *
 * The stem's `settings` names a `worldgen/noise_settings` document or carries one inline; the
 * inline form is registered under a private id so the workers, which only get ids, find it
 * too. The `biome_source` goes to the generator as a definition and is resolved there.
 *
 * Terrain and feature status bodies run in a pool of worker threads sized from the core count
 * unless the context says how many. A host that cannot run workers generates on this thread and
 * says so once.
 *
 * @throws When the Java data is not on disk, or the settings id is not a registered
 *   `worldgen/noise_settings` document.
 */
export const noiseGeneratorFactory: GeneratorFactory = {
    kind: NOISE_GENERATOR_KIND,
    build(context) {
        const generator = context.stem.generator;
        if (generator.type !== NOISE_GENERATOR_KIND || !('biomeSource' in generator)) {
            throw new TypeError(`The ${context.dimension.id} stem carries no noise generator settings`);
        }

        const { registries, noiseSettings } = resolveSettings(context.worldgen(), context.dimension.id, generator);
        const stages = stagePool(context.workers ?? chunkWorkerCount(), context.logger);
        const built = new DataDrivenGenerator({
            registries,
            dimension: context.dimension,
            noiseSettings,
            biomeSource: generator.biomeSource,
            templates: findJavaTemplateSource(cacheRoot(), registries.processorLists),
            ...(stages === undefined ? {} : { stages })
        });
        if (stages !== undefined && stages.workers > 0) {
            context.logger.info(
                `Generating ${context.dimension.id} terrain and features in §b${stages.workers}§r worker thread(s)`
            );
        }
        return built;
    }
};

/** The registries to generate from, with an inline settings document added under its own id. */
const resolveSettings = (
    registries: JavaWorldgenRegistries,
    dimensionType: string,
    generator: NoiseGeneratorDefinition
): { readonly registries: JavaWorldgenRegistries; readonly noiseSettings: string } => {
    if (typeof generator.settings !== 'string') {
        const noiseSettings = inlineSettingsId(dimensionType);
        return {
            registries: {
                ...registries,
                noiseSettings: new Map([...registries.noiseSettings, [noiseSettings, generator.settings]])
            },
            noiseSettings
        };
    }

    if (!registries.noiseSettings.has(generator.settings)) {
        throw new Error(
            `The ${dimensionType} stem names the noise settings ${generator.settings}, which no worldgen/noise_settings document defines`
        );
    }
    return { registries, noiseSettings: generator.settings };
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
