export { MCSTRUCTURE_FORMAT_VERSION, mcStructureIndex, mcStructurePosition, readMcStructure } from './bedrockTemplate';
export { PALETTE_KEY_RENAME_DATA_VERSION, isGzip, readJavaStructureTemplate } from './javaTemplate';
export {
    NO_BLOCK,
    StructureFormatError,
    type BedrockBlockState,
    type BedrockStructureTemplate,
    type BedrockTemplateBlock,
    type EntityPosition,
    type JavaBlockState,
    type JavaPaletteKeySpelling,
    type JavaStructureTemplate,
    type JavaTemplateBlock,
    type TemplateEntity,
    type TemplatePosition
} from './types';
export { TRANSFORM_NAMES, type Mirror, type Rotation, type TransformName } from './tableShape';
export {
    AMBIGUOUS_STATE_TRANSFORMS,
    STATE_TRANSFORM_VERSIONS,
    mirrorBedrockState,
    rotateBedrockState,
    transformBedrockState,
    transformEntityPosition,
    transformPosition,
    transformTemplate,
    transformedSize,
    verifyStateTransforms,
    type Placement,
    type TransformMismatch,
    type TransformedTemplate
} from './transform';
export {
    translateJavaTemplate,
    type TemplateLossKind,
    type TemplateTranslationLoss,
    type TranslateOptions,
    type TranslatedTemplate
} from './translate';
export { createLegacyRandom, largeFeatureSeed, largeFeatureWithSaltSeed, type RandomSource } from './random';
export {
    BLOCK_ENTITY_MODIFIER_TYPES,
    POS_RULE_TEST_TYPES,
    PROCESSOR_TYPES,
    RULE_TEST_TYPES,
    applyProcessors,
    createProcessor,
    createProcessorList,
    parseBlockStateString,
    type ProcessorBlock,
    type ProcessorContext,
    type ProcessorType,
    type StructureProcessor
} from './processors';
export {
    STRUCTURE_PLACEMENT_TYPES,
    concentricRingChunks,
    isStructureChunk,
    parseStructurePlacement,
    parseStructureSet,
    pickStructure,
    potentialStructureChunk,
    structureSetCandidates,
    type ChunkPosition,
    type ConcentricRingsPlacement,
    type DimensionOriginPlacement,
    type FrequencyReductionMethod,
    type RandomSpreadPlacement,
    type SpreadType,
    type StructurePlacement,
    type StructureSet
} from './structureSets';
export {
    POOL_ELEMENT_TYPES,
    assembleJigsaw,
    boxesOverlap,
    canAttach,
    jigsawBlocksOf,
    jigsawOrientationOf,
    jigsawStateFor,
    oppositeDirection,
    parseOrientation,
    parsePoolAliases,
    parseTemplatePool,
    rotateDirection,
    startJigsaw,
    type BoundingBox,
    type Direction,
    type JigsawAssembly,
    type JigsawJunction,
    type JigsawBlockInfo,
    type JigsawConfig,
    type JigsawSources,
    type JigsawStart,
    type JointType,
    type PlacedPiece,
    type PoolElement,
    type PoolElementProcessors,
    type PoolElementType,
    type Projection,
    type TemplatePool
} from './jigsaw';
