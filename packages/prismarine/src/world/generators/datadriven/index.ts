/**
 * The world generator built from Java Edition's published data.
 *
 * `@jsprismarine/packs` routes no `worldgen/*` registry, so the pieces here read Mojang's data
 * themselves; see [`javaWorldgenData.ts`](javaWorldgenData.ts) for which directories and why.
 */
export { DataDrivenGenerator, type DataDrivenGeneratorOptions } from './DataDrivenGenerator';
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
    type JavaRegistry,
    type JavaWorldgenRegistries,
    type JavaWorldgenSources
} from './javaWorldgenData';
