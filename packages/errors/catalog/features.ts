import { defineErrors } from './defineErrors';

/** The errors `@jsprismarine/features` throws. */
export const FeaturesErrors = defineErrors('features', {
    /**
     * A world generation file, from a datapack or the generated Java data, defines a
     * `biased_to_bottom` int provider whose maximum is below its minimum. The path names the field.
     */
    BiasedToBottomMaxBelowMin: { message: 'biased_to_bottom int max {max} is below min {min}', base: RangeError },
    /**
     * Generation code drew a random integer below zero or zero. This is a bug in the feature that
     * drew it.
     */
    BoundMustBePositive: { message: 'Bound must be positive', base: RangeError },
    /**
     * A feature drew a random element from an empty list, such as a block list with no entries.
     * Check the feature's data for an empty list.
     */
    CannotPickFromEmptyList: { message: 'Cannot pick from an empty list', base: RangeError },
    /**
     * A world generation file, from a datapack or the generated Java data, has something other than
     * a list where a list belongs. The path names the field.
     */
    ExpectedArray: { message: '{path}: expected an array, got {value}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, gives a block set that
     * is not a block identifier, a `#tag` or a list of identifiers.
     */
    ExpectedBlockSet: {
        message: '{path}: expected a block identifier, a tag reference or a list, got {source}',
        base: TypeError
    },
    /**
     * A world generation file, from a datapack or the generated Java data, has something other than
     * `true` or `false` where a boolean belongs.
     */
    ExpectedBoolean: { message: '{path}: expected a boolean, got {value}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, names a direction that
     * is not one of `up`, `down`, `north`, `south`, `east` or `west`.
     */
    ExpectedDirection: { message: '{path}: expected a direction, got {source}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, has something other than
     * a number where a number belongs.
     */
    ExpectedFiniteNumber: { message: '{path}: expected a finite number, got {value}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, has a fraction where a
     * whole number belongs.
     */
    ExpectedInteger: { message: '{path}: expected an integer, got {parsed}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, has an empty weighted
     * list, so nothing can be drawn from it.
     */
    EmptyWeightedList: { message: '{path}: expected a non-empty weighted list', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, has something other than
     * an object where an object belongs.
     */
    ExpectedObject: { message: '{path}: expected an object, got {value}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, has a value outside the
     * set the field allows. The message lists the allowed values.
     */
    ExpectedOne: { message: '{path}: expected one of {allowed}, got {value}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, gives a vertical anchor
     * without its kind. Write it as `absolute`, `above_bottom`, `below_top` or
     * `relative_to_sea_level`.
     */
    ExpectedVerticalAnchor: {
        message: '{path}: expected one of absolute, above_bottom, below_top or relative_to_sea_level',
        base: TypeError
    },
    /**
     * A world generation file, from a datapack or the generated Java data, has something other than
     * a string where a registry identifier belongs.
     */
    ExpectedRegistryIdentifier: { message: '{path}: expected a registry identifier, got {value}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, has something other than
     * a string where a string belongs.
     */
    ExpectedString: { message: '{path}: expected a string, got {value}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, gives an offset that is
     * not three whole numbers.
     */
    ExpectedThreeIntegers: { message: '{entryPath}: expected three integers', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, gives an offset with the
     * wrong number of values; it takes three.
     */
    WrongIntegerCount: { message: '{path}: expected three integers, got {valuesCount}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, gives a vertical
     * direction that is not `up` or `down`.
     */
    ExpectedUpOrDown: { message: '{path}: expected up or down, got {source}', base: TypeError },
    /**
     * The biomes' feature lists order the same features in contradicting ways, so no single order
     * satisfies them all. A datapack's biome lists two features in the opposite order of another
     * biome.
     */
    FeatureOrderCycle: 'Feature order cycle found, reached again at {reference}',
    /**
     * A configured feature refers to itself, directly or through other features, so it cannot be
     * read.
     */
    FeatureReferenceCycle: { message: '{full}: feature reference cycle', base: TypeError },
    /**
     * A feature type is known but no reader handles it. This is a bug in `@jsprismarine/features`.
     */
    FeatureTypeHasNoReader: {
        message: '{path}: feature type {type} is registered but has no reader',
        base: TypeError
    },
    /**
     * A saved world generation random state does not have the shape this server writes, so the save
     * is damaged.
     */
    InvalidRandomState: { message: 'Invalid WorldgenRandom state', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, has an identifier with
     * characters registry identifiers do not allow, such as capitals or spaces.
     */
    InvalidRegistryIdentifier: { message: '{path}: {value} is not a valid registry identifier', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, refers to a block state
     * provider no loaded file defines.
     */
    NoSuchBlockStateProvider: { message: '{path}: no such block state provider {full}', base: TypeError },
    /** A placed feature or biome refers to a configured feature no loaded file defines. */
    NoSuchConfiguredFeature: { message: '{full}: no such configured feature', base: TypeError },
    /** A biome refers to a placed feature no loaded file defines. */
    NoSuchPlacedFeature: { message: '{full}: no such placed feature', base: TypeError },
    /**
     * A noise state provider picked an index past its list. This is a bug in the provider's
     * sampling.
     */
    NoiseStateIndexOutOfRange: { message: 'Noise state index fell outside the state list', base: RangeError },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a noise state
     * provider with no states.
     */
    EmptyNoiseStateProvider: { message: 'A noise state provider needs at least one state', base: RangeError },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a placement
     * modifier list that is empty where one entry is needed.
     */
    EmptyPlacements: { message: '{path}.placements: expected a non-empty list', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a trapezoid int
     * provider whose maximum is below its minimum.
     */
    TrapezoidMaxBelowMin: { message: 'trapezoid int max {max} is below min {min}', base: RangeError },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a trapezoid int
     * provider whose plateau is wider than its range.
     */
    TrapezoidPlateauTooWide: { message: 'trapezoid int plateau {plateau} exceeds the span', base: RangeError },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a uniform int
     * provider whose maximum is below its minimum.
     */
    UniformMaxBelowMin: { message: 'uniform int max {max} is below min {min}', base: RangeError },
    /**
     * A world generation file, from a datapack or the generated Java data, uses a block predicate
     * type this server does not implement.
     */
    UnknownBlockPredicateType: { message: '{path}: unknown block predicate type {type}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, uses a block state
     * provider type this server does not implement.
     */
    UnknownBlockStateProviderType: { message: '{path}: unknown block state provider type {type}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, uses a tree feature size
     * type this server does not implement.
     */
    UnknownFeatureSizeType: { message: '{path}: unknown feature size type {type}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, uses a feature type this
     * server does not implement.
     */
    UnknownFeatureType: { message: '{path}: unknown feature type {type}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, uses a float provider
     * type this server does not implement.
     */
    UnknownFloatProviderType: { message: '{path}: unknown float provider type {type}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, names a fluid other than
     * water, lava or empty.
     */
    UnknownFluid: { message: '{path}: unknown fluid {name}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, uses a tree foliage
     * placer type this server does not implement.
     */
    UnknownFoliagePlacerType: { message: '{path}: unknown foliage placer type {type}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, uses a height provider
     * type this server does not implement.
     */
    UnknownHeightProviderType: { message: '{path}: unknown height provider type {type}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, uses an int provider
     * type this server does not implement.
     */
    UnknownIntProviderType: { message: '{path}: unknown int provider type {type}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, uses a placement
     * modifier type this server does not implement.
     */
    UnknownPlacementModifierType: { message: '{path}: unknown placement modifier type {type}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, uses a tree root placer
     * type this server does not implement.
     */
    UnknownRootPlacerType: { message: '{path}: unknown root placer type {type}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, uses a rule test type
     * this server does not implement.
     */
    UnknownRuleTestType: { message: '{path}: unknown rule test type {type}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, uses a tree decorator
     * type this server does not implement.
     */
    UnknownTreeDecoratorType: { message: '{path}: unknown tree decorator type {type}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, uses a tree trunk placer
     * type this server does not implement.
     */
    UnknownTrunkPlacerType: { message: '{path}: unknown trunk placer type {type}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a
     * `very_biased_to_bottom` int provider whose maximum is below its minimum.
     */
    VeryBiasedToBottomMaxBelowMin: {
        message: 'very_biased_to_bottom int max {max} is below min {min}',
        base: RangeError
    },
    /** A feature drew from a weighted list with no entries. */
    WeightedListHasNoElements: { message: 'Weighted list has no elements', base: RangeError },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a
     * `weighted_list` int provider with no entries.
     */
    EmptyWeightedListInt: { message: 'weighted_list int needs at least one entry', base: RangeError },
    /**
     * A weighted draw landed past the last entry, which means the weights changed while drawing.
     * This is a bug.
     */
    WeightedSelectionPastEnd: { message: 'Weighted list selection fell past the end', base: RangeError },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a weighted state
     * provider with no entries.
     */
    EmptyWeightedStateProvider: {
        message: 'A weighted state provider needs at least one entry',
        base: RangeError
    },
    /**
     * A generation random source was saved that is neither of Java's two algorithms. This is a bug
     * in the code that built the source.
     */
    UnsupportedRandomSource: {
        message: 'WorldgenRandom has an unsupported random source',
        base: TypeError
    },
    /**
     * A saved world generation random state was written by the other algorithm, so it belongs to a
     * different world or the save is damaged.
     */
    RandomStateAlgorithmMismatch: {
        message: 'WorldgenRandom state does not match its algorithm',
        base: TypeError
    }
});
