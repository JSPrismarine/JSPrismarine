import { defineErrors, JSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';

/** Raised when bytes are not a readable structure template. */
export abstract class StructureFormatError extends JSPrismarineError {
    public override name = 'StructureFormatError';
}

/** The errors `@jsprismarine/structures` throws. */
export const StructuresErrors = defineErrors('structures', {
    /**
     * A structure file, from a datapack or the generated Java data, has an `append_loot` modifier
     * without a `loot_table`.
     */
    AppendLootNoLootTable: { message: 'append_loot: no loot_table', base: StructureFormatError },
    /**
     * A structure file, from a datapack or the generated Java data, has a block entity modifier
     * that is not an object.
     */
    BlockEntityModifierExpectedObject: {
        message: 'block entity modifier: expected an object',
        base: StructureFormatError
    },
    /**
     * A structure file, from a datapack or the generated Java data, uses a block entity modifier
     * type this server does not implement.
     */
    BlockEntityModifierUnknownType: {
        message: 'block entity modifier: unknown type {type}',
        base: StructureFormatError
    },
    /**
     * A structure file, from a datapack or the generated Java data, has a `block_ignore` processor
     * without a `blocks` list.
     */
    BlockIgnoreNoBlocks: { message: 'block_ignore: no blocks', base: StructureFormatError },
    /** Structure code drew a random integer below a bound of zero or less. This is a bug. */
    BoundMustBePositive: { message: 'bound must be positive, got {bound}', base: RangeError },
    /**
     * A structure file, from a datapack or the generated Java data, has something other than a
     * block state where one belongs.
     */
    ExpectedBlockState: { message: '{what}: expected a block state', base: StructureFormatError },
    /**
     * A structure file, from a datapack or the generated Java data, has something other than a
     * number or an int provider where one belongs.
     */
    ExpectedIntProvider: { message: '{what}: expected an int provider', base: StructureFormatError },
    /**
     * A structure file, from a datapack or the generated Java data, has something other than a list
     * of rule tests where one belongs.
     */
    ExpectedListOfTests: { message: '{what}: expected a list of tests', base: StructureFormatError },
    /**
     * A structure template's position or size does not have three numbers, so the template is
     * damaged.
     */
    ExpectedThreeNumbers: {
        message: '{context}: expected {key} to be three numbers, found {valuesCount}',
        base: StructureFormatError
    },
    /**
     * A structure file, from a datapack or the generated Java data, names a block state that does
     * not exist in the Java version this server maps from.
     */
    UnknownJavaBlockState: { message: '{what}: {javaId} is not a Java 26.3 block state', base: StructureFormatError },
    /** A Java `.nbt` structure template could not be read as NBT. The message says why. */
    JavaTemplateUnreadable: { message: 'java structure template: {value}', base: StructureFormatError },
    /** A Java structure template has no block palette, so it is damaged. */
    JavaTemplateNoPalette: { message: 'java structure template: no palette', base: StructureFormatError },
    /** A Java structure template's palette has an entry without a block name, so it is damaged. */
    JavaTemplatePaletteEntryUnnamed: {
        message: 'java structure template: palette entry {index} has no block identifier',
        base: StructureFormatError
    },
    /** A Bedrock `.mcstructure` file could not be read as NBT. The message says why. */
    McstructureUnreadable: { message: 'mcstructure: {value}', base: StructureFormatError },
    /** A `.mcstructure` file's block list does not match its size, so it is damaged. */
    McstructureBlockCountMismatch: {
        message: 'mcstructure: block_indices holds {primaryCount} entries for a {size} template',
        base: StructureFormatError
    },
    /** A `.mcstructure` file's block list holds something other than numbers, so it is damaged. */
    McstructureBlockIndexNotNumeric: {
        message: 'mcstructure: block_indices holds a non-numeric entry',
        base: StructureFormatError
    },
    /** A `.mcstructure` file's block layer is not a list, so it is damaged. */
    McstructureBlockLayerNotList: {
        message: 'mcstructure: block_indices layer is not a list',
        base: StructureFormatError
    },
    /** A `.mcstructure` file has no block list, so it is damaged. */
    McstructureNoBlockIndices: { message: 'mcstructure: no block_indices', base: StructureFormatError },
    /** A `.mcstructure` file has no default palette, so it is damaged. */
    McstructureNoDefaultPalette: { message: 'mcstructure: no default palette', base: StructureFormatError },
    /** A `.mcstructure` file has no `structure` compound, so it is damaged or not a structure. */
    McstructureNoStructureCompound: { message: 'mcstructure: no structure compound', base: StructureFormatError },
    /** A `.mcstructure` file's palette has an entry without a block name, so it is damaged. */
    McstructurePaletteEntryHasNoName: { message: 'mcstructure: palette entry has no name', base: StructureFormatError },
    /** A `.mcstructure` file uses a format version this server does not read. */
    McstructureUnsupportedFormatVersion: {
        message: 'mcstructure: unsupported format_version {formatVersion}',
        base: StructureFormatError
    },
    /**
     * A template pool, from a datapack or the generated Java data, has an element that is not an
     * object.
     */
    PoolElementExpectedObject: { message: 'pool element: expected an object', base: StructureFormatError },
    /** A template pool uses an element type this server does not implement. */
    PoolElementUnknownElementType: { message: 'pool element: unknown element_type {type}', base: StructureFormatError },
    /**
     * A structure file, from a datapack or the generated Java data, has a position test that is not
     * an object.
     */
    PositionTestExpectedObject: { message: 'position test: expected an object', base: StructureFormatError },
    /**
     * A structure file, from a datapack or the generated Java data, uses a position test type this
     * server does not implement.
     */
    PositionTestUnknownPredicateType: {
        message: 'position test: unknown predicate_type {type}',
        base: StructureFormatError
    },
    /**
     * A structure file, from a datapack or the generated Java data, has a processor that is not an
     * object.
     */
    ProcessorExpectedObject: { message: 'processor: expected an object', base: StructureFormatError },
    /**
     * A structure file, from a datapack or the generated Java data, has a processor list without a
     * `processors` array.
     */
    ProcessorListNoProcessors: { message: 'processor list: no processors', base: StructureFormatError },
    /**
     * A structure file, from a datapack or the generated Java data, uses a processor type this
     * server does not implement.
     */
    ProcessorUnknownProcessorType: { message: 'processor: unknown processor_type {type}', base: StructureFormatError },
    /**
     * A structure file, from a datapack or the generated Java data, has a `protected_blocks`
     * processor without the tag it protects.
     */
    ProtectedBlocksNoValue: { message: 'protected_blocks: no value', base: StructureFormatError },
    /**
     * A structure file, from a datapack or the generated Java data, has a rule processor without a
     * `rules` list.
     */
    RuleProcessorNoRules: { message: 'rule processor: no rules', base: StructureFormatError },
    /**
     * A structure file, from a datapack or the generated Java data, has a rule processor whose
     * rules include something other than an object.
     */
    RuleProcessorRuleIsNotObject: { message: 'rule processor: a rule is not an object', base: StructureFormatError },
    /**
     * A structure file, from a datapack or the generated Java data, has a rule test that is not an
     * object.
     */
    RuleTestExpectedObject: { message: 'rule test: expected an object', base: StructureFormatError },
    /**
     * A structure file, from a datapack or the generated Java data, uses a rule test type this
     * server does not implement.
     */
    RuleTestUnknownPredicateType: { message: 'rule test: unknown predicate_type {type}', base: StructureFormatError },
    /**
     * A structure set, from a datapack or the generated Java data, has a placement that is not an
     * object.
     */
    StructurePlacementExpectedObject: {
        message: 'structure placement: expected an object',
        base: StructureFormatError
    },
    /** A structure set uses a placement type this server does not implement. */
    StructurePlacementUnknownType: { message: 'structure placement: unknown type {type}', base: StructureFormatError },
    /** A structure set has an entry without a `structure`. */
    StructureSetEntryNamesNoStructure: {
        message: 'structure set: an entry names no structure',
        base: StructureFormatError
    },
    /** A structure set file is not a JSON object. */
    StructureSetExpectedObject: { message: 'structure set: expected an object', base: StructureFormatError },
    /** A structure set lists no structures. */
    StructureSetNoStructures: { message: 'structure set: no structures', base: StructureFormatError },
    /**
     * A structure file, from a datapack or the generated Java data, has a `tag_match` test without
     * a tag.
     */
    TagMatchNoTag: { message: 'tag_match: no tag', base: StructureFormatError },
    /** A template pool has an entry that is not an object. */
    TemplatePoolEntryIsNotObject: { message: 'template pool: an entry is not an object', base: StructureFormatError },
    /** A template pool has no `elements` list. */
    TemplatePoolNoElements: { message: 'template pool: no elements', base: StructureFormatError },
    /**
     * A structure file, from a datapack or the generated Java data, uses an int provider type this
     * server does not implement.
     */
    UnsupportedIntProvider: { message: '{what}: unsupported int provider {type}', base: StructureFormatError }
});
