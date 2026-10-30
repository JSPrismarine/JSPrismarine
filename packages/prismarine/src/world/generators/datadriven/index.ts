/**
 * The world generator built from Java Edition's published data.
 *
 * The registries come out of the pack stack `@jsprismarine/packs` composes, plus the biome
 * parameter reports; see [`javaWorldgenData.ts`](javaWorldgenData.ts) for which and why.
 */
export { DataDrivenGenerator, type DataDrivenGeneratorOptions, type PipelineKey } from './DataDrivenGenerator';
export {
    GenerationRegion,
    type GenerationRegionOptions,
    type RegionBlock,
    type RegionBlockEntity,
    type RegionEntitySpawn
} from './GenerationRegion';
export { createJavaBlockOracle } from './javaBlockOracle';
export { createBlockEntity, createEntitySpawn } from './javaGeneratedContent';
export {
    JAVA_TEMPLATE_ENV,
    createTemplateSource,
    findJavaTemplateSource,
    findJavaTemplates,
    readTemplateDirectory,
    readTemplateJar
} from './javaStructureTemplates';
export { placeJavaTemplate, type TemplateSource, type TemplateTarget } from './javaTemplatePlacement';
export { JavaStateTranslator, bedrockBiomeIdOf, type JavaState } from './javaTranslation';
export {
    JAVA_WORLDGEN_ENV,
    cacheRoot,
    findJavaWorldgenSources,
    loadJavaWorldgenRegistries,
    loadJavaWorldgenRegistriesFrom,
    requireJavaWorldgenRegistries,
    type JavaRegistry,
    type JavaWorldgenRegistries,
    type JavaWorldgenSources
} from './javaWorldgenData';
