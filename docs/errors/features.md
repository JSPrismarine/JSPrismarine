---
title: '@jsprismarine/features errors'
description: The code, message and meaning of every error @jsprismarine/features throws.
group: Documents
category: Errors
---

# @jsprismarine/features errors

These are the errors `@jsprismarine/features` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.features -->
## `FEATURES_BIASED_TO_BOTTOM_MAX_BELOW_MIN`

`biased_to_bottom int max {max} is below min {min}`

Thrown as `FeaturesErrors.BiasedToBottomMaxBelowMin`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, defines a
`biased_to_bottom` int provider whose maximum is below its minimum. The path names the field.

## `FEATURES_BOUND_MUST_BE_POSITIVE`

`Bound must be positive`

Thrown as `FeaturesErrors.BoundMustBePositive`, which extends `RangeError`.

Generation code drew a random integer below zero or zero. This is a bug in the feature that
drew it.

## `FEATURES_CANNOT_PICK_FROM_EMPTY_LIST`

`Cannot pick from an empty list`

Thrown as `FeaturesErrors.CannotPickFromEmptyList`, which extends `RangeError`.

A feature drew a random element from an empty list, such as a block list with no entries.
Check the feature's data for an empty list.

## `FEATURES_EMPTY_NOISE_STATE_PROVIDER`

`A noise state provider needs at least one state`

Thrown as `FeaturesErrors.EmptyNoiseStateProvider`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, defines a noise state
provider with no states.

## `FEATURES_EMPTY_PLACEMENTS`

`{path}.placements: expected a non-empty list`

Thrown as `FeaturesErrors.EmptyPlacements`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, defines a placement
modifier list that is empty where one entry is needed.

## `FEATURES_EMPTY_WEIGHTED_LIST`

`{path}: expected a non-empty weighted list`

Thrown as `FeaturesErrors.EmptyWeightedList`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, has an empty weighted
list, so nothing can be drawn from it.

## `FEATURES_EMPTY_WEIGHTED_LIST_INT`

`weighted_list int needs at least one entry`

Thrown as `FeaturesErrors.EmptyWeightedListInt`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, defines a
`weighted_list` int provider with no entries.

## `FEATURES_EMPTY_WEIGHTED_STATE_PROVIDER`

`A weighted state provider needs at least one entry`

Thrown as `FeaturesErrors.EmptyWeightedStateProvider`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, defines a weighted state
provider with no entries.

## `FEATURES_EXPECTED_ARRAY`

`{path}: expected an array, got {value}`

Thrown as `FeaturesErrors.ExpectedArray`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, has something other than
a list where a list belongs. The path names the field.

## `FEATURES_EXPECTED_BLOCK_SET`

`{path}: expected a block identifier, a tag reference or a list, got {source}`

Thrown as `FeaturesErrors.ExpectedBlockSet`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, gives a block set that
is not a block identifier, a `#tag` or a list of identifiers.

## `FEATURES_EXPECTED_BOOLEAN`

`{path}: expected a boolean, got {value}`

Thrown as `FeaturesErrors.ExpectedBoolean`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, has something other than
`true` or `false` where a boolean belongs.

## `FEATURES_EXPECTED_DIRECTION`

`{path}: expected a direction, got {source}`

Thrown as `FeaturesErrors.ExpectedDirection`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, names a direction that
is not one of `up`, `down`, `north`, `south`, `east` or `west`.

## `FEATURES_EXPECTED_FINITE_NUMBER`

`{path}: expected a finite number, got {value}`

Thrown as `FeaturesErrors.ExpectedFiniteNumber`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, has something other than
a number where a number belongs.

## `FEATURES_EXPECTED_INTEGER`

`{path}: expected an integer, got {parsed}`

Thrown as `FeaturesErrors.ExpectedInteger`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, has a fraction where a
whole number belongs.

## `FEATURES_EXPECTED_OBJECT`

`{path}: expected an object, got {value}`

Thrown as `FeaturesErrors.ExpectedObject`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, has something other than
an object where an object belongs.

## `FEATURES_EXPECTED_ONE`

`{path}: expected one of {allowed}, got {value}`

Thrown as `FeaturesErrors.ExpectedOne`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, has a value outside the
set the field allows. The message lists the allowed values.

## `FEATURES_EXPECTED_REGISTRY_IDENTIFIER`

`{path}: expected a registry identifier, got {value}`

Thrown as `FeaturesErrors.ExpectedRegistryIdentifier`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, has something other than
a string where a registry identifier belongs.

## `FEATURES_EXPECTED_STRING`

`{path}: expected a string, got {value}`

Thrown as `FeaturesErrors.ExpectedString`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, has something other than
a string where a string belongs.

## `FEATURES_EXPECTED_THREE_INTEGERS`

`{entryPath}: expected three integers`

Thrown as `FeaturesErrors.ExpectedThreeIntegers`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, gives an offset that is
not three whole numbers.

## `FEATURES_EXPECTED_UP_OR_DOWN`

`{path}: expected up or down, got {source}`

Thrown as `FeaturesErrors.ExpectedUpOrDown`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, gives a vertical
direction that is not `up` or `down`.

## `FEATURES_EXPECTED_VERTICAL_ANCHOR`

`{path}: expected one of absolute, above_bottom, below_top or relative_to_sea_level`

Thrown as `FeaturesErrors.ExpectedVerticalAnchor`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, gives a vertical anchor
without its kind. Write it as `absolute`, `above_bottom`, `below_top` or
`relative_to_sea_level`.

## `FEATURES_FEATURE_ORDER_CYCLE`

`Feature order cycle found, reached again at {reference}`

Thrown as `FeaturesErrors.FeatureOrderCycle`, which extends `Error`.

The biomes' feature lists order the same features in contradicting ways, so no single order
satisfies them all. A datapack's biome lists two features in the opposite order of another
biome.

## `FEATURES_FEATURE_REFERENCE_CYCLE`

`{full}: feature reference cycle`

Thrown as `FeaturesErrors.FeatureReferenceCycle`, which extends `TypeError`.

A configured feature refers to itself, directly or through other features, so it cannot be
read.

## `FEATURES_FEATURE_TYPE_HAS_NO_READER`

`{path}: feature type {type} is registered but has no reader`

Thrown as `FeaturesErrors.FeatureTypeHasNoReader`, which extends `TypeError`.

A feature type is known but no reader handles it. This is a bug in `@jsprismarine/features`.

## `FEATURES_INVALID_RANDOM_STATE`

`Invalid WorldgenRandom state`

Thrown as `FeaturesErrors.InvalidRandomState`, which extends `TypeError`.

A saved world generation random state does not have the shape this server writes, so the save
is damaged.

## `FEATURES_INVALID_REGISTRY_IDENTIFIER`

`{path}: {value} is not a valid registry identifier`

Thrown as `FeaturesErrors.InvalidRegistryIdentifier`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, has an identifier with
characters registry identifiers do not allow, such as capitals or spaces.

## `FEATURES_NO_SUCH_BLOCK_STATE_PROVIDER`

`{path}: no such block state provider {full}`

Thrown as `FeaturesErrors.NoSuchBlockStateProvider`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, refers to a block state
provider no loaded file defines.

## `FEATURES_NO_SUCH_CONFIGURED_FEATURE`

`{full}: no such configured feature`

Thrown as `FeaturesErrors.NoSuchConfiguredFeature`, which extends `TypeError`.

A placed feature or biome refers to a configured feature no loaded file defines.

## `FEATURES_NO_SUCH_PLACED_FEATURE`

`{full}: no such placed feature`

Thrown as `FeaturesErrors.NoSuchPlacedFeature`, which extends `TypeError`.

A biome refers to a placed feature no loaded file defines.

## `FEATURES_NOISE_STATE_INDEX_OUT_OF_RANGE`

`Noise state index fell outside the state list`

Thrown as `FeaturesErrors.NoiseStateIndexOutOfRange`, which extends `RangeError`.

A noise state provider picked an index past its list. This is a bug in the provider's
sampling.

## `FEATURES_RANDOM_STATE_ALGORITHM_MISMATCH`

`WorldgenRandom state does not match its algorithm`

Thrown as `FeaturesErrors.RandomStateAlgorithmMismatch`, which extends `TypeError`.

A saved world generation random state was written by the other algorithm, so it belongs to a
different world or the save is damaged.

## `FEATURES_TRAPEZOID_MAX_BELOW_MIN`

`trapezoid int max {max} is below min {min}`

Thrown as `FeaturesErrors.TrapezoidMaxBelowMin`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, defines a trapezoid int
provider whose maximum is below its minimum.

## `FEATURES_TRAPEZOID_PLATEAU_TOO_WIDE`

`trapezoid int plateau {plateau} exceeds the span`

Thrown as `FeaturesErrors.TrapezoidPlateauTooWide`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, defines a trapezoid int
provider whose plateau is wider than its range.

## `FEATURES_UNIFORM_MAX_BELOW_MIN`

`uniform int max {max} is below min {min}`

Thrown as `FeaturesErrors.UniformMaxBelowMin`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, defines a uniform int
provider whose maximum is below its minimum.

## `FEATURES_UNKNOWN_BLOCK_PREDICATE_TYPE`

`{path}: unknown block predicate type {type}`

Thrown as `FeaturesErrors.UnknownBlockPredicateType`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, uses a block predicate
type this server does not implement.

## `FEATURES_UNKNOWN_BLOCK_STATE_PROVIDER_TYPE`

`{path}: unknown block state provider type {type}`

Thrown as `FeaturesErrors.UnknownBlockStateProviderType`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, uses a block state
provider type this server does not implement.

## `FEATURES_UNKNOWN_FEATURE_SIZE_TYPE`

`{path}: unknown feature size type {type}`

Thrown as `FeaturesErrors.UnknownFeatureSizeType`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, uses a tree feature size
type this server does not implement.

## `FEATURES_UNKNOWN_FEATURE_TYPE`

`{path}: unknown feature type {type}`

Thrown as `FeaturesErrors.UnknownFeatureType`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, uses a feature type this
server does not implement.

## `FEATURES_UNKNOWN_FLOAT_PROVIDER_TYPE`

`{path}: unknown float provider type {type}`

Thrown as `FeaturesErrors.UnknownFloatProviderType`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, uses a float provider
type this server does not implement.

## `FEATURES_UNKNOWN_FLUID`

`{path}: unknown fluid {name}`

Thrown as `FeaturesErrors.UnknownFluid`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, names a fluid other than
water, lava or empty.

## `FEATURES_UNKNOWN_FOLIAGE_PLACER_TYPE`

`{path}: unknown foliage placer type {type}`

Thrown as `FeaturesErrors.UnknownFoliagePlacerType`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, uses a tree foliage
placer type this server does not implement.

## `FEATURES_UNKNOWN_HEIGHT_PROVIDER_TYPE`

`{path}: unknown height provider type {type}`

Thrown as `FeaturesErrors.UnknownHeightProviderType`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, uses a height provider
type this server does not implement.

## `FEATURES_UNKNOWN_INT_PROVIDER_TYPE`

`{path}: unknown int provider type {type}`

Thrown as `FeaturesErrors.UnknownIntProviderType`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, uses an int provider
type this server does not implement.

## `FEATURES_UNKNOWN_PLACEMENT_MODIFIER_TYPE`

`{path}: unknown placement modifier type {type}`

Thrown as `FeaturesErrors.UnknownPlacementModifierType`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, uses a placement
modifier type this server does not implement.

## `FEATURES_UNKNOWN_ROOT_PLACER_TYPE`

`{path}: unknown root placer type {type}`

Thrown as `FeaturesErrors.UnknownRootPlacerType`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, uses a tree root placer
type this server does not implement.

## `FEATURES_UNKNOWN_RULE_TEST_TYPE`

`{path}: unknown rule test type {type}`

Thrown as `FeaturesErrors.UnknownRuleTestType`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, uses a rule test type
this server does not implement.

## `FEATURES_UNKNOWN_TREE_DECORATOR_TYPE`

`{path}: unknown tree decorator type {type}`

Thrown as `FeaturesErrors.UnknownTreeDecoratorType`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, uses a tree decorator
type this server does not implement.

## `FEATURES_UNKNOWN_TRUNK_PLACER_TYPE`

`{path}: unknown trunk placer type {type}`

Thrown as `FeaturesErrors.UnknownTrunkPlacerType`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, uses a tree trunk placer
type this server does not implement.

## `FEATURES_UNSUPPORTED_RANDOM_SOURCE`

`WorldgenRandom has an unsupported random source`

Thrown as `FeaturesErrors.UnsupportedRandomSource`, which extends `TypeError`.

A generation random source was saved that is neither of Java's two algorithms. This is a bug
in the code that built the source.

## `FEATURES_VERY_BIASED_TO_BOTTOM_MAX_BELOW_MIN`

`very_biased_to_bottom int max {max} is below min {min}`

Thrown as `FeaturesErrors.VeryBiasedToBottomMaxBelowMin`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, defines a
`very_biased_to_bottom` int provider whose maximum is below its minimum.

## `FEATURES_WEIGHTED_LIST_HAS_NO_ELEMENTS`

`Weighted list has no elements`

Thrown as `FeaturesErrors.WeightedListHasNoElements`, which extends `RangeError`.

A feature drew from a weighted list with no entries.

## `FEATURES_WEIGHTED_SELECTION_PAST_END`

`Weighted list selection fell past the end`

Thrown as `FeaturesErrors.WeightedSelectionPastEnd`, which extends `RangeError`.

A weighted draw landed past the last entry, which means the weights changed while drawing.
This is a bug.

## `FEATURES_WRONG_INTEGER_COUNT`

`{path}: expected three integers, got {valuesCount}`

Thrown as `FeaturesErrors.WrongIntegerCount`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, gives an offset with the
wrong number of values; it takes three.
<!-- /fact -->
