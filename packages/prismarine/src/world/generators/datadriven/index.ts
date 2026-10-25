/**
 * The world generator built from Java Edition's published data.
 *
 * `@jsprismarine/packs` routes no `worldgen/*` registry, so the pieces here read Mojang's data
 * themselves; see [`javaWorldgenData.ts`](javaWorldgenData.ts) for which directories and why.
 */
export { DataDrivenGenerator, type DataDrivenGeneratorOptions } from './DataDrivenGenerator';
export { GenerationRegion, type GenerationRegionOptions } from './GenerationRegion';
export { BEDROCK_BIOME_IDS } from './bedrockBiomeIds';
export { createJavaBlockOracle } from './javaBlockOracle';
export { JavaStateTranslator, bedrockBiomeIdOf, type JavaState } from './javaTranslation';
export {
    JAVA_WORLDGEN_ENV,
    findJavaWorldgenSources,
    loadJavaWorldgenRegistries,
    type JavaRegistry,
    type JavaWorldgenRegistries,
    type JavaWorldgenSources
} from './javaWorldgenData';
