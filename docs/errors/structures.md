---
title: '@jsprismarine/structures errors'
description: The code, message and meaning of every error @jsprismarine/structures throws.
group: Documents
category: Errors
---

# @jsprismarine/structures errors

These are the errors `@jsprismarine/structures` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.structures -->
## Groups

Catch one of these classes to handle every error that extends it.

| Class                  | What its errors mean                                     |
| ---------------------- | -------------------------------------------------------- |
| `StructureFormatError` | Raised when bytes are not a readable structure template. |

## `STRUCTURES_APPEND_LOOT_NO_LOOT_TABLE`

`append_loot: no loot_table`

Thrown as `StructuresErrors.AppendLootNoLootTable`, which extends `StructureFormatError`.

A structure file, from a datapack or the generated Java data, has an `append_loot` modifier
without a `loot_table`.

## `STRUCTURES_BLOCK_ENTITY_MODIFIER_EXPECTED_OBJECT`

`block entity modifier: expected an object`

Thrown as `StructuresErrors.BlockEntityModifierExpectedObject`, which extends `StructureFormatError`.

A structure file, from a datapack or the generated Java data, has a block entity modifier
that is not an object.

## `STRUCTURES_BLOCK_ENTITY_MODIFIER_UNKNOWN_TYPE`

`block entity modifier: unknown type {type}`

Thrown as `StructuresErrors.BlockEntityModifierUnknownType`, which extends `StructureFormatError`.

A structure file, from a datapack or the generated Java data, uses a block entity modifier
type this server does not implement.

## `STRUCTURES_BLOCK_IGNORE_NO_BLOCKS`

`block_ignore: no blocks`

Thrown as `StructuresErrors.BlockIgnoreNoBlocks`, which extends `StructureFormatError`.

A structure file, from a datapack or the generated Java data, has a `block_ignore` processor
without a `blocks` list.

## `STRUCTURES_BOUND_MUST_BE_POSITIVE`

`bound must be positive, got {bound}`

Thrown as `StructuresErrors.BoundMustBePositive`, which extends `RangeError`.

Structure code drew a random integer below a bound of zero or less. This is a bug.

## `STRUCTURES_EXPECTED_BLOCK_STATE`

`{what}: expected a block state`

Thrown as `StructuresErrors.ExpectedBlockState`, which extends `StructureFormatError`.

A structure file, from a datapack or the generated Java data, has something other than a
block state where one belongs.

## `STRUCTURES_EXPECTED_INT_PROVIDER`

`{what}: expected an int provider`

Thrown as `StructuresErrors.ExpectedIntProvider`, which extends `StructureFormatError`.

A structure file, from a datapack or the generated Java data, has something other than a
number or an int provider where one belongs.

## `STRUCTURES_EXPECTED_LIST_OF_TESTS`

`{what}: expected a list of tests`

Thrown as `StructuresErrors.ExpectedListOfTests`, which extends `StructureFormatError`.

A structure file, from a datapack or the generated Java data, has something other than a list
of rule tests where one belongs.

## `STRUCTURES_EXPECTED_THREE_NUMBERS`

`{context}: expected {key} to be three numbers, found {valuesCount}`

Thrown as `StructuresErrors.ExpectedThreeNumbers`, which extends `StructureFormatError`.

A structure template's position or size does not have three numbers, so the template is
damaged.

## `STRUCTURES_JAVA_TEMPLATE_NO_PALETTE`

`java structure template: no palette`

Thrown as `StructuresErrors.JavaTemplateNoPalette`, which extends `StructureFormatError`.

A Java structure template has no block palette, so it is damaged.

## `STRUCTURES_JAVA_TEMPLATE_PALETTE_ENTRY_UNNAMED`

`java structure template: palette entry {index} has no block identifier`

Thrown as `StructuresErrors.JavaTemplatePaletteEntryUnnamed`, which extends `StructureFormatError`.

A Java structure template's palette has an entry without a block name, so it is damaged.

## `STRUCTURES_JAVA_TEMPLATE_UNREADABLE`

`java structure template: {value}`

Thrown as `StructuresErrors.JavaTemplateUnreadable`, which extends `StructureFormatError`.

A Java `.nbt` structure template could not be read as NBT. The message says why.

## `STRUCTURES_MCSTRUCTURE_BLOCK_COUNT_MISMATCH`

`mcstructure: block_indices holds {primaryCount} entries for a {size} template`

Thrown as `StructuresErrors.McstructureBlockCountMismatch`, which extends `StructureFormatError`.

A `.mcstructure` file's block list does not match its size, so it is damaged.

## `STRUCTURES_MCSTRUCTURE_BLOCK_INDEX_NOT_NUMERIC`

`mcstructure: block_indices holds a non-numeric entry`

Thrown as `StructuresErrors.McstructureBlockIndexNotNumeric`, which extends `StructureFormatError`.

A `.mcstructure` file's block list holds something other than numbers, so it is damaged.

## `STRUCTURES_MCSTRUCTURE_BLOCK_LAYER_NOT_LIST`

`mcstructure: block_indices layer is not a list`

Thrown as `StructuresErrors.McstructureBlockLayerNotList`, which extends `StructureFormatError`.

A `.mcstructure` file's block layer is not a list, so it is damaged.

## `STRUCTURES_MCSTRUCTURE_NO_BLOCK_INDICES`

`mcstructure: no block_indices`

Thrown as `StructuresErrors.McstructureNoBlockIndices`, which extends `StructureFormatError`.

A `.mcstructure` file has no block list, so it is damaged.

## `STRUCTURES_MCSTRUCTURE_NO_DEFAULT_PALETTE`

`mcstructure: no default palette`

Thrown as `StructuresErrors.McstructureNoDefaultPalette`, which extends `StructureFormatError`.

A `.mcstructure` file has no default palette, so it is damaged.

## `STRUCTURES_MCSTRUCTURE_NO_STRUCTURE_COMPOUND`

`mcstructure: no structure compound`

Thrown as `StructuresErrors.McstructureNoStructureCompound`, which extends `StructureFormatError`.

A `.mcstructure` file has no `structure` compound, so it is damaged or not a structure.

## `STRUCTURES_MCSTRUCTURE_PALETTE_ENTRY_HAS_NO_NAME`

`mcstructure: palette entry has no name`

Thrown as `StructuresErrors.McstructurePaletteEntryHasNoName`, which extends `StructureFormatError`.

A `.mcstructure` file's palette has an entry without a block name, so it is damaged.

## `STRUCTURES_MCSTRUCTURE_UNREADABLE`

`mcstructure: {value}`

Thrown as `StructuresErrors.McstructureUnreadable`, which extends `StructureFormatError`.

A Bedrock `.mcstructure` file could not be read as NBT. The message says why.

## `STRUCTURES_MCSTRUCTURE_UNSUPPORTED_FORMAT_VERSION`

`mcstructure: unsupported format_version {formatVersion}`

Thrown as `StructuresErrors.McstructureUnsupportedFormatVersion`, which extends `StructureFormatError`.

A `.mcstructure` file uses a format version this server does not read.

## `STRUCTURES_POOL_ELEMENT_EXPECTED_OBJECT`

`pool element: expected an object`

Thrown as `StructuresErrors.PoolElementExpectedObject`, which extends `StructureFormatError`.

A template pool, from a datapack or the generated Java data, has an element that is not an
object.

## `STRUCTURES_POOL_ELEMENT_UNKNOWN_ELEMENT_TYPE`

`pool element: unknown element_type {type}`

Thrown as `StructuresErrors.PoolElementUnknownElementType`, which extends `StructureFormatError`.

A template pool uses an element type this server does not implement.

## `STRUCTURES_POSITION_TEST_EXPECTED_OBJECT`

`position test: expected an object`

Thrown as `StructuresErrors.PositionTestExpectedObject`, which extends `StructureFormatError`.

A structure file, from a datapack or the generated Java data, has a position test that is not
an object.

## `STRUCTURES_POSITION_TEST_UNKNOWN_PREDICATE_TYPE`

`position test: unknown predicate_type {type}`

Thrown as `StructuresErrors.PositionTestUnknownPredicateType`, which extends `StructureFormatError`.

A structure file, from a datapack or the generated Java data, uses a position test type this
server does not implement.

## `STRUCTURES_PROCESSOR_EXPECTED_OBJECT`

`processor: expected an object`

Thrown as `StructuresErrors.ProcessorExpectedObject`, which extends `StructureFormatError`.

A structure file, from a datapack or the generated Java data, has a processor that is not an
object.

## `STRUCTURES_PROCESSOR_LIST_NO_PROCESSORS`

`processor list: no processors`

Thrown as `StructuresErrors.ProcessorListNoProcessors`, which extends `StructureFormatError`.

A structure file, from a datapack or the generated Java data, has a processor list without a
`processors` array.

## `STRUCTURES_PROCESSOR_UNKNOWN_PROCESSOR_TYPE`

`processor: unknown processor_type {type}`

Thrown as `StructuresErrors.ProcessorUnknownProcessorType`, which extends `StructureFormatError`.

A structure file, from a datapack or the generated Java data, uses a processor type this
server does not implement.

## `STRUCTURES_PROTECTED_BLOCKS_NO_VALUE`

`protected_blocks: no value`

Thrown as `StructuresErrors.ProtectedBlocksNoValue`, which extends `StructureFormatError`.

A structure file, from a datapack or the generated Java data, has a `protected_blocks`
processor without the tag it protects.

## `STRUCTURES_RULE_PROCESSOR_NO_RULES`

`rule processor: no rules`

Thrown as `StructuresErrors.RuleProcessorNoRules`, which extends `StructureFormatError`.

A structure file, from a datapack or the generated Java data, has a rule processor without a
`rules` list.

## `STRUCTURES_RULE_PROCESSOR_RULE_IS_NOT_OBJECT`

`rule processor: a rule is not an object`

Thrown as `StructuresErrors.RuleProcessorRuleIsNotObject`, which extends `StructureFormatError`.

A structure file, from a datapack or the generated Java data, has a rule processor whose
rules include something other than an object.

## `STRUCTURES_RULE_TEST_EXPECTED_OBJECT`

`rule test: expected an object`

Thrown as `StructuresErrors.RuleTestExpectedObject`, which extends `StructureFormatError`.

A structure file, from a datapack or the generated Java data, has a rule test that is not an
object.

## `STRUCTURES_RULE_TEST_UNKNOWN_PREDICATE_TYPE`

`rule test: unknown predicate_type {type}`

Thrown as `StructuresErrors.RuleTestUnknownPredicateType`, which extends `StructureFormatError`.

A structure file, from a datapack or the generated Java data, uses a rule test type this
server does not implement.

## `STRUCTURES_STRUCTURE_PLACEMENT_EXPECTED_OBJECT`

`structure placement: expected an object`

Thrown as `StructuresErrors.StructurePlacementExpectedObject`, which extends `StructureFormatError`.

A structure set, from a datapack or the generated Java data, has a placement that is not an
object.

## `STRUCTURES_STRUCTURE_PLACEMENT_UNKNOWN_TYPE`

`structure placement: unknown type {type}`

Thrown as `StructuresErrors.StructurePlacementUnknownType`, which extends `StructureFormatError`.

A structure set uses a placement type this server does not implement.

## `STRUCTURES_STRUCTURE_SET_ENTRY_NAMES_NO_STRUCTURE`

`structure set: an entry names no structure`

Thrown as `StructuresErrors.StructureSetEntryNamesNoStructure`, which extends `StructureFormatError`.

A structure set has an entry without a `structure`.

## `STRUCTURES_STRUCTURE_SET_EXPECTED_OBJECT`

`structure set: expected an object`

Thrown as `StructuresErrors.StructureSetExpectedObject`, which extends `StructureFormatError`.

A structure set file is not a JSON object.

## `STRUCTURES_STRUCTURE_SET_NO_STRUCTURES`

`structure set: no structures`

Thrown as `StructuresErrors.StructureSetNoStructures`, which extends `StructureFormatError`.

A structure set lists no structures.

## `STRUCTURES_TAG_MATCH_NO_TAG`

`tag_match: no tag`

Thrown as `StructuresErrors.TagMatchNoTag`, which extends `StructureFormatError`.

A structure file, from a datapack or the generated Java data, has a `tag_match` test without
a tag.

## `STRUCTURES_TEMPLATE_POOL_ENTRY_IS_NOT_OBJECT`

`template pool: an entry is not an object`

Thrown as `StructuresErrors.TemplatePoolEntryIsNotObject`, which extends `StructureFormatError`.

A template pool has an entry that is not an object.

## `STRUCTURES_TEMPLATE_POOL_NO_ELEMENTS`

`template pool: no elements`

Thrown as `StructuresErrors.TemplatePoolNoElements`, which extends `StructureFormatError`.

A template pool has no `elements` list.

## `STRUCTURES_UNKNOWN_JAVA_BLOCK_STATE`

`{what}: {javaId} is not a Java 26.3 block state`

Thrown as `StructuresErrors.UnknownJavaBlockState`, which extends `StructureFormatError`.

A structure file, from a datapack or the generated Java data, names a block state that does
not exist in the Java version this server maps from.

## `STRUCTURES_UNSUPPORTED_INT_PROVIDER`

`{what}: unsupported int provider {type}`

Thrown as `StructuresErrors.UnsupportedIntProvider`, which extends `StructureFormatError`.

A structure file, from a datapack or the generated Java data, uses an int provider type this
server does not implement.
<!-- /fact -->
