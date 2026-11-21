import { defineErrors } from '@jsprismarine/errors/JSPrismarineError';

/** The errors `@jsprismarine/worldgen` throws. */
export const WorldgenErrors = defineErrors('worldgen', {
    /**
     * A noise was built with a different number of amplitude modifiers than octaves. This is a bug
     * in world generation; report it with the stack trace.
     */
    AmplitudeModifierCountMismatch: {
        message: 'amplitude_modifiers had size {amplitudeModifiersCount}, but octave_count was {octaveCount}',
        base: RangeError
    },
    /**
     * A world generation file, from a datapack or the generated Java data, gives a biome tag where
     * this server needs the biomes listed. List them instead of the `#tag`.
     */
    BiomeTagNotResolved: {
        message: '{path}: biome tags are not resolved here, list the biomes instead, got {value}',
        base: TypeError
    },
    /**
     * A world generation file, from a datapack or the generated Java data, gives a biome source
     * whose `biomes` is not a list.
     */
    BiomesNotList: { message: '{path}.biomes: expected an array', base: TypeError },
    /**
     * Generation code drew more random bits than one draw holds. This is a bug in world generation;
     * report it with the stack trace.
     */
    InvalidBitCount: { message: 'Bit count must be an integer in [0, 32], got {bits}', base: RangeError },
    /**
     * Generation code drew a random integer below a bound of zero or less. This is a bug in world
     * generation; report it with the stack trace.
     */
    BoundMustBePositive: { message: 'Bound must be positive', base: RangeError },
    /**
     * The density function compiler met a node it cannot compile. This is a bug in world
     * generation; report it with the stack trace.
     */
    UncompilableDensityFunction: { message: 'Cannot compile density function node {node}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a checkerboard
     * biome source with no biomes.
     */
    EmptyCheckerboardBiomeSource: {
        message: 'A checkerboard biome source needs at least one biome',
        base: RangeError
    },
    /**
     * The packed biome climate table refers to a biome it did not record. This is a bug in world
     * generation; report it with the stack trace.
     */
    ClimateEntryValueUnknown: 'Climate entry contains a value absent from its table',
    /**
     * A biome's climate entry lacks one of the six parameters, so the biome source data is
     * malformed.
     */
    ClimateEntryIsMissingAxis: 'Climate entry {index} is missing axis {axis}',
    /**
     * A world generation file, from a datapack or the generated Java data, defines a multi-noise
     * biome source with no biomes.
     */
    EmptyClimateParameterList: {
        message: 'A climate parameter list needs at least one entry',
        base: RangeError
    },
    /**
     * The biome climate search ended without finding a biome. This is a bug in world generation;
     * report it with the stack trace.
     */
    ClimateSearchFoundNoLeaf: 'A climate search subtree produced no leaf',
    /**
     * The packed biome climate table is missing an entry its tree points at. This is a bug in world
     * generation; report it with the stack trace.
     */
    ClimateTableIsMissingEntry: 'Climate table is missing entry {index}',
    /**
     * The biome climate tree refers to a biome it did not record. This is a bug in world
     * generation; report it with the stack trace.
     */
    ClimateTreeValueUnknown: 'Climate tree contains a value absent from its entries',
    /**
     * Packing the biome climate tree lost a node. This is a bug in world generation; report it with
     * the stack trace.
     */
    ClimateTreeLostChild: 'Climate tree flattening lost a child index',
    /**
     * Packing the biome climate tree lost a node. This is a bug in world generation; report it with
     * the stack trace.
     */
    ClimateTreeLostNode: 'Climate tree flattening lost a node',
    /**
     * A node of the biome climate tree lacks one of the six parameters. This is a bug in world
     * generation; report it with the stack trace.
     */
    ClimateTreeNodeIsMissingAxis: 'Climate tree node is missing axis {axis}',
    /**
     * A node of the packed biome climate tree has no children. This is a bug in world generation;
     * report it with the stack trace.
     */
    ClimateSubtreeHasNoChild: 'Climate tree subtree has no first child',
    /**
     * The packed biome climate tree lost the order of its biomes. This is a bug in world
     * generation; report it with the stack trace.
     */
    ClimateSubtreeLostLeaf: 'Climate tree subtree lost its first leaf rank',
    /**
     * The surface pass was given a block column of the wrong height. This is a bug in world
     * generation; report it with the stack trace.
     */
    SurfaceColumnWrongHeight: {
        message: 'Column {localX},{localZ} has {columnCount} blocks, expected {height}',
        base: RangeError
    },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a dimension type
     * whose `coordinate_scale` is outside the range Java allows.
     */
    CoordinateScaleOutOfRange: {
        message:
            '{path}.coordinate_scale has to be between {coordinateScaleMin} and {coordinateScaleMax}, got {coordinateScale}',
        base: RangeError
    },
    /**
     * A world generation file, from a datapack or the generated Java data, defines density
     * functions that refer to each other in a loop, so none can be computed.
     */
    DensityFunctionCycle: {
        message: 'Density function {id} references itself through {resolving}',
        base: RangeError
    },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a world preset
     * that lists the same dimension twice.
     */
    DuplicatePresetDimension: { message: '{path}.dimensions: {id} is defined twice', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a world preset
     * without an overworld, which every world needs.
     */
    WorldPresetHasNoOverworld: {
        message: '{path}.dimensions: a world preset has to define {overworldStemId}',
        base: TypeError
    },
    /**
     * A world generation file, from a datapack or the generated Java data, has something other than
     * a list where a list belongs. The path names the field.
     */
    ExpectedArray: { message: '{path}: expected an array, got {value}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, has something other than
     * a list where a list belongs. The path names the field.
     */
    ExpectedList: { message: '{path}: expected an array', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, has something other than
     * `true` or `false` where a boolean belongs.
     */
    ExpectedBoolean: { message: '{path}: expected a boolean, got {value}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, has something other than
     * a number where a number belongs.
     */
    ExpectedFiniteNumber: { message: '{path}: expected a finite number, got {value}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, has a cave surface that
     * is not `floor` or `ceiling`.
     */
    ExpectedCaveSurface: { message: '{path}: expected "floor" or "ceiling", got {value}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, has a fraction where a
     * whole number belongs.
     */
    ExpectedInteger: { message: '{path}: expected an integer, got {value}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, gives a climate range
     * that is not a number or a pair of numbers.
     */
    ExpectedClimateRange: { message: '{path}: expected [min, max], got {source}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, gives a spawn target
     * range that is not a pair of numbers.
     */
    ExpectedInterval: { message: '{path}[{targetIndex}].{id}: expected a [min, max] interval', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, has something other than
     * an object where an object belongs.
     */
    ExpectedObject: { message: '{path}: expected an object, got {source}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, has something other than
     * an object where an object belongs.
     */
    ExpectedEntryObject: { message: '{entryPath}: expected an object', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, gives a biome source
     * that is neither an object nor a list of biomes.
     */
    ExpectedBiomeSource: { message: '{path}: expected an object or an array', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, has a value outside the
     * set the field allows. The message lists the allowed values.
     */
    ExpectedOne: { message: '{path}: expected one of {allowed}, got {text}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, gives a vertical anchor
     * without its kind. Write it as `absolute`, `above_bottom`, `below_top` or
     * `relative_to_sea_level`.
     */
    ExpectedVerticalAnchor: {
        message: '{path}: expected one of absolute, above_bottom, below_top or relative_to_sea_level, got {source}',
        base: TypeError
    },
    /**
     * A world generation file, from a datapack or the generated Java data, has something other than
     * a string where a registry identifier belongs.
     */
    ExpectedRegistryIdentifier: { message: 'Expected a registry identifier, got {value}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, has something other than
     * a string where a string belongs.
     */
    ExpectedString: { message: '{path}: expected a string, got {value}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, defines an
     * `interval_select` density function with one threshold fewer than its functions; it needs
     * exactly that many.
     */
    ThresholdCountMismatch: {
        message: '{path}: expected {value} thresholds for {functionSourceCount} functions, got {thresholdSourceCount}',
        base: TypeError
    },
    /**
     * A noise was built with a positive first octave, which Java refuses as well. A world
     * generation file, from a datapack or the generated Java data, probably defines it.
     */
    PositiveFirstOctave: { message: 'firstOctave>0', base: RangeError },
    /**
     * A world generation file, from a datapack or the generated Java data, defines an
     * `interval_select` density function with fewer than two functions.
     */
    IntervalSelectNeedsTwoFunctions: {
        message: '{path}.functions: expected at least two functions',
        base: TypeError
    },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a gradient
     * density function whose start and end coordinates are equal, so it has no slope.
     */
    FlatGradient: {
        message: 'gradient from_coordinate cannot equal to_coordinate',
        base: RangeError
    },
    /**
     * A world generation file, from a datapack or the generated Java data, has a number outside the
     * range Java allows for that field.
     */
    NumberOutOfRange: { message: '{path} has to be between {min} and {max}, got {value}', base: RangeError },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a dimension type
     * whose `height` is not a multiple of 16.
     */
    HeightNotMultipleOf16: { message: '{path}.height has to be a multiple of 16, got {height}', base: RangeError },
    /** A saved chunk's blending data has the wrong number of heights, so the chunk is damaged. */
    BlendingHeightsWrongLength: { message: 'heights has to be of length {blendingCellColumnCount}', base: RangeError },
    /**
     * A world generation file, from a datapack or the generated Java data, gives a spawn target
     * range whose bounds are not numbers.
     */
    InvalidIntervalBounds: {
        message: '{path}[{targetIndex}].{id}: interval bounds must be finite numbers',
        base: TypeError
    },
    /**
     * An `interval_select` density function was compiled without functions. This is a bug in world
     * generation; report it with the stack trace.
     */
    EmptyIntervalSelect: { message: 'interval_select needs at least one function', base: RangeError },
    /** A saved random state's cached Gaussian value has the wrong shape, so the save is damaged. */
    InvalidGaussianCacheState: { message: 'Invalid Gaussian cache state', base: TypeError },
    /** A saved legacy random state has the wrong shape, so the save is damaged. */
    InvalidLegacyRandomSourceState: { message: 'Invalid legacy random source state', base: TypeError },
    /** A saved Xoroshiro random state has the wrong shape, so the save is damaged. */
    InvalidXoroshiroRandomSourceState: { message: 'Invalid xoroshiro random source state', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, gives a surface rule a
     * biome tag, and the server reading it cannot resolve tags here. List the biomes instead.
     */
    BiomeTagWithoutResolver: {
        message: '{entryPath}: {entry} is a biome tag and no tag resolver was supplied',
        base: RangeError
    },
    /**
     * A world generation file, from a datapack or the generated Java data, has an identifier with
     * characters registry identifiers do not allow, such as capitals or spaces.
     */
    InvalidRegistryIdentifier: { message: '{value} is not a valid registry identifier', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, defines surface rules
     * that refer to each other in a loop.
     */
    SurfaceRuleCycle: {
        message: 'Material {key} references itself through {resolving}',
        base: RangeError
    },
    /**
     * A climate range was built with its minimum above its maximum. A world generation file, from a
     * datapack or the generated Java data, probably gives it in the wrong order.
     */
    ClimateMinAboveMax: { message: 'min > max: {min} {max}', base: RangeError },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a density
     * function whose `min` is above its `max`.
     */
    MinAboveMax: {
        message: '{path}: min ({min}) must be less than or equal to max ({max})',
        base: TypeError
    },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a dimension type
     * whose `min_y` is not a multiple of 16.
     */
    MinYNotMultipleOf16: { message: '{path}.min_y has to be a multiple of 16, got {minY}', base: RangeError },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a dimension type
     * that reaches above the highest block Java allows.
     */
    DimensionTooTall: {
        message: '{path}: min_y + height has to be at most {maxYExclusive}, got {value}',
        base: RangeError
    },
    /**
     * A spline was built without points. A world generation file, from a datapack or the generated
     * Java data, probably defines one.
     */
    SplineHasNoPoints: { message: 'A multipoint spline needs at least one point', base: RangeError },
    /**
     * A noise was built without octaves. A world generation file, from a datapack or the generated
     * Java data, probably defines one with an empty `amplitudes` list.
     */
    NoiseHasNoAmplitudes: { message: 'Need at least 1 amplitude', base: RangeError },
    /**
     * A world generation file, from a datapack or the generated Java data, refers to a density
     * function no loaded file defines.
     */
    NoDensityFunctionIsRegistered: { message: 'No density function is registered as {id}', base: RangeError },
    /**
     * A world generation file, from a datapack or the generated Java data, refers to a surface
     * condition no loaded file defines.
     */
    NoMaterialConditionIsRegistered: { message: 'No material condition is registered as {id}', base: RangeError },
    /**
     * A world generation file, from a datapack or the generated Java data, refers to a surface rule
     * no loaded file defines.
     */
    NoMaterialRuleIsRegistered: { message: 'No material rule is registered as {id}', base: RangeError },
    /**
     * A world generation file, from a datapack or the generated Java data, refers to a noise no
     * loaded file defines.
     */
    NoNoiseIsRegistered: { message: 'No noise is registered as {id}', base: RangeError },
    /**
     * A dimension refers to noise settings no loaded file defines. Check the world's preset and the
     * datapacks it loads.
     */
    NoNoiseSettingsAreRegistered: { message: 'No noise settings are registered as {id}', base: RangeError },
    /**
     * A world generation file, from a datapack or the generated Java data, defines noise settings
     * whose height is not a multiple of 16.
     */
    NoiseHeightNotMultipleOf16: { message: '{path}.noise.height has to be a multiple of 16', base: RangeError },
    /**
     * A world generation file, from a datapack or the generated Java data, defines noise settings
     * whose `min_y` is not a multiple of 16.
     */
    NoiseMinYNotMultipleOf16: { message: '{path}.noise.min_y has to be a multiple of 16', base: RangeError },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a noise whose
     * `amplitude_modifiers` is not a list.
     */
    InvalidAmplitudeModifiers: {
        message: 'Noise parameter amplitude_modifiers must be an array',
        base: TypeError
    },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a noise whose
     * first octave is not a whole number from -32 to 32.
     */
    InvalidBaseOctave: {
        message: 'Noise parameter base_octave must be an integer in [-32, 32], got {baseOctave}',
        base: RangeError
    },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a noise with a
     * field that is not a number.
     */
    InvalidNoiseParameter: { message: 'Noise parameter {field} must be a finite number', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a noise whose
     * `normalize` is not `true`, `false` or `legacy`.
     */
    InvalidNoiseNormalization: {
        message: 'Noise parameter normalize must be a boolean or "legacy", got {value}',
        base: TypeError
    },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a noise whose
     * octave count is not a whole number from 1 to 32.
     */
    InvalidOctaveCount: {
        message: 'Noise parameter octave_count must be an integer in [1, 32], got {octaveCount}',
        base: RangeError
    },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a noise without
     * a field it needs.
     */
    MissingNoiseParameter: {
        message: 'Noise parameters are missing the required field {field}',
        base: TypeError
    },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a noise that is
     * not a JSON object.
     */
    NoiseParametersNotObject: { message: 'Noise parameters must be a JSON object', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, gives a point that is
     * not three numbers.
     */
    ExpectedThreeCoordinates: { message: '{path}.point: expected three coordinates', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a spline without
     * points.
     */
    EmptySplinePoints: { message: '{path}.points: expected a non-empty array', base: TypeError },
    /**
     * The legacy Nether noise was built with an octave Java's legacy noise never uses. This is a
     * bug in world generation; report it with the stack trace.
     */
    LegacyNoisePositiveOctave: {
        message: 'Positive octaves are not supported by the legacy nether noise',
        base: RangeError
    },
    /**
     * A world generation file, from a datapack or the generated Java data, names a biome parameter
     * list preset that does not exist.
     */
    UnknownBiomeParameterPreset: {
        message: '{path}.preset: no multi_noise_biome_source_parameter_list named {preset}',
        base: TypeError
    },
    /**
     * A world generation file, from a datapack or the generated Java data, defines an ore vein
     * whose `raw_ore_chance` is not a number.
     */
    InvalidRawOreChance: { message: '{path}.raw_ore_chance: expected a finite number', base: TypeError },
    /**
     * The biome climate tree was built with an empty node. This is a bug in world generation;
     * report it with the stack trace.
     */
    EmptyClimateTreeNode: { message: 'A search tree node needs at least one child', base: RangeError },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a surface rule
     * sequence without rules.
     */
    EmptySurfaceSequence: { message: '{path}.sequence: expected a non-empty array', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a canyon carver
     * whose `width_smoothness` is not a positive whole number.
     */
    InvalidWidthSmoothness: {
        message: '{path}.shape.width_smoothness: expected a positive integer',
        base: TypeError
    },
    /**
     * The biome climate table shared between generation workers is damaged. This is a bug in world
     * generation; report it with the stack trace.
     */
    SharedClimateTableInvalidValues: {
        message: 'Shared climate table contains an invalid value dictionary',
        base: TypeError
    },
    /**
     * Memory given to a generation worker as a biome climate table is not one. This is a bug in
     * world generation; report it with the stack trace.
     */
    SharedClimateTableHasBadMagic: { message: 'Shared climate table has bad magic', base: TypeError },
    /**
     * The biome climate table shared between generation workers is empty. This is a bug in world
     * generation; report it with the stack trace.
     */
    SharedClimateTableHasEmptyDimensions: { message: 'Shared climate table has empty dimensions', base: TypeError },
    /**
     * The biome climate table shared between generation workers has inconsistent sizes. This is a
     * bug in world generation; report it with the stack trace.
     */
    SharedClimateTableHasInconsistentLengths: {
        message: 'Shared climate table has inconsistent lengths or offsets',
        base: TypeError
    },
    /**
     * A generation worker read a biome past the end of the shared climate table. This is a bug in
     * world generation; report it with the stack trace.
     */
    SharedClimateTableHasNoValue: { message: 'Shared climate table has no value at index {index}', base: TypeError },
    /**
     * The biome climate table shared between generation workers is truncated. This is a bug in
     * world generation; report it with the stack trace.
     */
    SharedClimateTableIsShorter: { message: 'Shared climate table is shorter than its header', base: TypeError },
    /**
     * The biome climate table shared between generation workers disagrees with its own biome count.
     * This is a bug in world generation; report it with the stack trace.
     */
    SharedClimateTableValueCount: { message: 'Shared climate table value count does not match', base: TypeError },
    /**
     * A generation worker got a biome climate table in a layout it does not read, so the server and
     * its workers run different versions. Restart the server.
     */
    SharedClimateTableVersionIsUnsupported: {
        message: 'Shared climate table version {uint32} is unsupported',
        base: TypeError
    },
    /**
     * Generation workers share memory through `SharedArrayBuffer`, which this JavaScript runtime
     * does not provide. Run the server on Node.js.
     */
    SharedArrayBufferUnavailable: 'SharedArrayBuffer is not available in this runtime',
    /**
     * A debug check found that skipping an air cell would change a block. This is a bug in world
     * generation; report it with the stack trace.
     */
    SkippedCellMismatch:
        'Skipped cell differed from scalar sampling at {x},{y},{z}: global={expectedState}/{expectedScheduleFluidUpdate}, scalar={scalarState}/{scalarScheduleFluidUpdate}',
    /**
     * A debug check found solid ground in a cell generation skipped as air. This is a bug in world
     * generation; report it with the stack trace.
     */
    SkippedCellWasSolid: 'Skipped cell had positive scalar density {density} at {x},{y},{z}',
    /**
     * A world generation file, from a datapack or the generated Java data, defines a spline whose
     * points are not in ascending order of location.
     */
    SplinePointsOutOfOrder: {
        message: '{pointPath}: spline points must be in ascending location order',
        base: TypeError
    },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a biome whose
     * `temperature` is not a number.
     */
    InvalidTemperature: {
        message: '{path}.temperature: expected a finite number, got {temperature}',
        base: TypeError
    },
    /**
     * A world generation file, from a datapack or the generated Java data, defines a biome whose
     * `temperature_modifier` is not `none` or `frozen`.
     */
    InvalidTemperatureModifier: {
        message: '{path}.temperature_modifier: expected "none" or "frozen", got {modifier}',
        base: TypeError
    },
    /**
     * A world generation file, from a datapack or the generated Java data, defines an
     * `interval_select` density function whose `thresholds` is not a list.
     */
    ThresholdsNotList: { message: '{path}.thresholds: expected an array', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, defines an
     * `interval_select` density function whose thresholds are not in ascending order.
     */
    ThresholdsOutOfOrder: {
        message: '{path}.thresholds: threshold values must be ordered from smallest to largest',
        base: TypeError
    },
    /**
     * A world generation file, from a datapack or the generated Java data, has an entry whose
     * `type` is not a string.
     */
    TypeNotString: { message: '{path}.type: expected a string, got {type}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, uses a biome source type
     * this server does not implement.
     */
    UnknownBiomeSourceType: { message: '{path}: unknown biome source type {type}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, uses a carver type this
     * server does not implement.
     */
    UnknownCarverType: { message: '{path}: unknown carver type {type}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, uses a density function
     * type this server does not implement.
     */
    UnknownDensityFunctionType: {
        message: '{path}: unknown density function type minecraft:{type}',
        base: TypeError
    },
    /**
     * A 26.4 `upscale` density function names a mode other than `interpolate_linear` on one axis.
     * Every vanilla `upscale` interpolates linearly, and this server implements only that mode;
     * change the axis's `mode` to `interpolate_linear` or leave the function out.
     */
    UnsupportedUpscaleMode: {
        message: '{path}: upscale mode {mode} is not implemented; only "interpolate_linear" is',
        base: TypeError
    },
    /**
     * A 26.4 `upscale` density function gives its x and z axes different cell sizes. The chunk
     * sampler fills square horizontal cells, as every vanilla `upscale` uses, so give `x` and `z`
     * the same `cell_size`.
     */
    UnevenUpscaleCells: {
        message: '{path}: upscale cell sizes differ across x ({x}) and z ({z}); only equal sizes are implemented',
        base: TypeError
    },
    /**
     * A 26.4 `upscale` density function gives an axis a `cell_size` of zero or less. Interpolation
     * divides by the cell size, so give each axis a positive whole number, as every vanilla
     * `upscale` does.
     */
    NonPositiveUpscaleCell: {
        message: '{path}: expected a positive upscale cell size, got {size}',
        base: RangeError
    },
    /**
     * A world generation file, from a datapack or the generated Java data, uses a float provider
     * type this server does not implement.
     */
    UnknownFloatProviderType: { message: '{path}: unknown float provider type {type}', base: TypeError },
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
     * A world generation file, from a datapack or the generated Java data, uses a surface condition
     * type this server does not implement.
     */
    UnknownMaterialConditionType: { message: '{path}: unknown material condition type {type}', base: TypeError },
    /**
     * A world generation file, from a datapack or the generated Java data, uses a surface rule type
     * this server does not implement.
     */
    UnknownMaterialRuleType: { message: '{path}: unknown material rule type {type}', base: TypeError },
    /**
     * The density function compiler met a single-input function it does not know. This is a bug in
     * world generation; report it with the stack trace.
     */
    UnknownUnaryDensityFunction: { message: 'Unknown unary density function {type}', base: TypeError }
});
