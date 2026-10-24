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
