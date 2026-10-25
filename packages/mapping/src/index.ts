export {
    BEDROCK_TARGET_STATE_COUNT,
    MAPPING_VERSIONS,
    javaBlockStateToBedrock,
    type BedrockBlockState,
    type BlockMappingResult
} from './blockMapping';
export { bedrockBlockStates, javaBlockStates, type BlockStateValue } from './blockStates';
export {
    BEDROCK_ONLY_BLOCKS,
    BLOCK_PROPERTY_CONFLICTS,
    BLOCK_PROPERTY_VERSIONS,
    bedrockBlockPropertiesOf,
    type BedrockBlockProperties
} from './blockProperties';
export { javaEntityTypeToBedrock, type EntityMappingResult } from './entityMapping';
export { javaItemToBedrock, type BedrockItem, type ItemMappingResult } from './itemMapping';
export {
    createPackIdentifierResolver,
    type PackIdentifierResolution,
    type PackIdentifierResolver
} from './packIdentifierResolver';
export {
    BEDROCK_BIOME_LOSSES,
    BLOCK_LOSSES,
    BLOCK_MERGES,
    BLOCK_STATE_LOSSES,
    DROPPED_BLOCK_PROPERTIES,
    ENTITY_LOSSES,
    ENTITY_MERGES,
    ITEM_LOSSES,
    ITEM_MERGES,
    PARTIAL_BLOCK_PROPERTY_COLLAPSES,
    REGISTRY_LOSSES,
    type BedrockBiomeLoss,
    type BlockLoss,
    type BlockMerge,
    type BlockPropertyRecovery,
    type BlockStateLoss,
    type DroppedBlockProperty,
    type EntityLoss,
    type EntityLossKind,
    type EntityMerge,
    type ItemLoss,
    type ItemMerge,
    type PartialBlockPropertyCollapse,
    type RegistryLoss
} from './lossList';
export {
    MAPPED_REGISTRIES,
    bedrockBiomeToJava,
    javaIdentifierToBedrock,
    type BedrockBiome,
    type BedrockBiomeResult,
    type IdentifierMappingResult,
    type MappedRegistry
} from './registryMapping';
