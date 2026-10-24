export {
    BEDROCK_TARGET_STATE_COUNT,
    MAPPING_VERSIONS,
    javaBlockStateToBedrock,
    type BedrockBlockState,
    type BlockMappingResult
} from './blockMapping';
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
    BLOCK_LOSSES,
    BLOCK_MERGES,
    DROPPED_BLOCK_PROPERTIES,
    ENTITY_LOSSES,
    ENTITY_MERGES,
    ITEM_LOSSES,
    ITEM_MERGES,
    PARTIAL_BLOCK_PROPERTY_COLLAPSES,
    REGISTRY_LOSSES,
    type BlockLoss,
    type BlockMerge,
    type BlockPropertyRecovery,
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
    javaIdentifierToBedrock,
    type IdentifierMappingResult,
    type MappedRegistry
} from './registryMapping';
