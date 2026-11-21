---
title: '@jsprismarine/worldgen errors'
description: The code, message and meaning of every error @jsprismarine/worldgen throws.
group: Documents
category: Errors
---

# @jsprismarine/worldgen errors

These are the errors `@jsprismarine/worldgen` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.worldgen -->
## `WORLDGEN_AMPLITUDE_MODIFIER_COUNT_MISMATCH`

`amplitude_modifiers had size {amplitudeModifiersCount}, but octave_count was {octaveCount}`

Thrown as `WorldgenErrors.AmplitudeModifierCountMismatch`, which extends `RangeError`.

A noise was built with a different number of amplitude modifiers than octaves. This is a bug
in world generation; report it with the stack trace.

## `WORLDGEN_BIOME_TAG_NOT_RESOLVED`

`{path}: biome tags are not resolved here, list the biomes instead, got {value}`

Thrown as `WorldgenErrors.BiomeTagNotResolved`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, gives a biome tag where
this server needs the biomes listed. List them instead of the `#tag`.

## `WORLDGEN_BIOME_TAG_WITHOUT_RESOLVER`

`{entryPath}: {entry} is a biome tag and no tag resolver was supplied`

Thrown as `WorldgenErrors.BiomeTagWithoutResolver`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, gives a surface rule a
biome tag, and the server reading it cannot resolve tags here. List the biomes instead.

## `WORLDGEN_BIOMES_NOT_LIST`

`{path}.biomes: expected an array`

Thrown as `WorldgenErrors.BiomesNotList`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, gives a biome source
whose `biomes` is not a list.

## `WORLDGEN_BLENDING_HEIGHTS_WRONG_LENGTH`

`heights has to be of length {blendingCellColumnCount}`

Thrown as `WorldgenErrors.BlendingHeightsWrongLength`, which extends `RangeError`.

A saved chunk's blending data has the wrong number of heights, so the chunk is damaged.

## `WORLDGEN_BOUND_MUST_BE_POSITIVE`

`Bound must be positive`

Thrown as `WorldgenErrors.BoundMustBePositive`, which extends `RangeError`.

Generation code drew a random integer below a bound of zero or less. This is a bug in world
generation; report it with the stack trace.

## `WORLDGEN_CLIMATE_ENTRY_IS_MISSING_AXIS`

`Climate entry {index} is missing axis {axis}`

Thrown as `WorldgenErrors.ClimateEntryIsMissingAxis`, which extends `Error`.

A biome's climate entry lacks one of the six parameters, so the biome source data is
malformed.

## `WORLDGEN_CLIMATE_ENTRY_VALUE_UNKNOWN`

`Climate entry contains a value absent from its table`

Thrown as `WorldgenErrors.ClimateEntryValueUnknown`, which extends `Error`.

The packed biome climate table refers to a biome it did not record. This is a bug in world
generation; report it with the stack trace.

## `WORLDGEN_CLIMATE_MIN_ABOVE_MAX`

`min > max: {min} {max}`

Thrown as `WorldgenErrors.ClimateMinAboveMax`, which extends `RangeError`.

A climate range was built with its minimum above its maximum. A world generation file, from a
datapack or the generated Java data, probably gives it in the wrong order.

## `WORLDGEN_CLIMATE_SEARCH_FOUND_NO_LEAF`

`A climate search subtree produced no leaf`

Thrown as `WorldgenErrors.ClimateSearchFoundNoLeaf`, which extends `Error`.

The biome climate search ended without finding a biome. This is a bug in world generation;
report it with the stack trace.

## `WORLDGEN_CLIMATE_SUBTREE_HAS_NO_CHILD`

`Climate tree subtree has no first child`

Thrown as `WorldgenErrors.ClimateSubtreeHasNoChild`, which extends `Error`.

A node of the packed biome climate tree has no children. This is a bug in world generation;
report it with the stack trace.

## `WORLDGEN_CLIMATE_SUBTREE_LOST_LEAF`

`Climate tree subtree lost its first leaf rank`

Thrown as `WorldgenErrors.ClimateSubtreeLostLeaf`, which extends `Error`.

The packed biome climate tree lost the order of its biomes. This is a bug in world
generation; report it with the stack trace.

## `WORLDGEN_CLIMATE_TABLE_IS_MISSING_ENTRY`

`Climate table is missing entry {index}`

Thrown as `WorldgenErrors.ClimateTableIsMissingEntry`, which extends `Error`.

The packed biome climate table is missing an entry its tree points at. This is a bug in world
generation; report it with the stack trace.

## `WORLDGEN_CLIMATE_TREE_LOST_CHILD`

`Climate tree flattening lost a child index`

Thrown as `WorldgenErrors.ClimateTreeLostChild`, which extends `Error`.

Packing the biome climate tree lost a node. This is a bug in world generation; report it with
the stack trace.

## `WORLDGEN_CLIMATE_TREE_LOST_NODE`

`Climate tree flattening lost a node`

Thrown as `WorldgenErrors.ClimateTreeLostNode`, which extends `Error`.

Packing the biome climate tree lost a node. This is a bug in world generation; report it with
the stack trace.

## `WORLDGEN_CLIMATE_TREE_NODE_IS_MISSING_AXIS`

`Climate tree node is missing axis {axis}`

Thrown as `WorldgenErrors.ClimateTreeNodeIsMissingAxis`, which extends `Error`.

A node of the biome climate tree lacks one of the six parameters. This is a bug in world
generation; report it with the stack trace.

## `WORLDGEN_CLIMATE_TREE_VALUE_UNKNOWN`

`Climate tree contains a value absent from its entries`

Thrown as `WorldgenErrors.ClimateTreeValueUnknown`, which extends `Error`.

The biome climate tree refers to a biome it did not record. This is a bug in world
generation; report it with the stack trace.

## `WORLDGEN_COORDINATE_SCALE_OUT_OF_RANGE`

`{path}.coordinate_scale has to be between {coordinateScaleMin} and {coordinateScaleMax}, got {coordinateScale}`

Thrown as `WorldgenErrors.CoordinateScaleOutOfRange`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, defines a dimension type
whose `coordinate_scale` is outside the range Java allows.

## `WORLDGEN_DENSITY_FUNCTION_CYCLE`

`Density function {id} references itself through {resolving}`

Thrown as `WorldgenErrors.DensityFunctionCycle`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, defines density
functions that refer to each other in a loop, so none can be computed.

## `WORLDGEN_DIMENSION_TOO_TALL`

`{path}: min_y + height has to be at most {maxYExclusive}, got {value}`

Thrown as `WorldgenErrors.DimensionTooTall`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, defines a dimension type
that reaches above the highest block Java allows.

## `WORLDGEN_DUPLICATE_PRESET_DIMENSION`

`{path}.dimensions: {id} is defined twice`

Thrown as `WorldgenErrors.DuplicatePresetDimension`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, defines a world preset
that lists the same dimension twice.

## `WORLDGEN_EMPTY_CHECKERBOARD_BIOME_SOURCE`

`A checkerboard biome source needs at least one biome`

Thrown as `WorldgenErrors.EmptyCheckerboardBiomeSource`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, defines a checkerboard
biome source with no biomes.

## `WORLDGEN_EMPTY_CLIMATE_PARAMETER_LIST`

`A climate parameter list needs at least one entry`

Thrown as `WorldgenErrors.EmptyClimateParameterList`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, defines a multi-noise
biome source with no biomes.

## `WORLDGEN_EMPTY_CLIMATE_TREE_NODE`

`A search tree node needs at least one child`

Thrown as `WorldgenErrors.EmptyClimateTreeNode`, which extends `RangeError`.

The biome climate tree was built with an empty node. This is a bug in world generation;
report it with the stack trace.

## `WORLDGEN_EMPTY_INTERVAL_SELECT`

`interval_select needs at least one function`

Thrown as `WorldgenErrors.EmptyIntervalSelect`, which extends `RangeError`.

An `interval_select` density function was compiled without functions. This is a bug in world
generation; report it with the stack trace.

## `WORLDGEN_EMPTY_SPLINE_POINTS`

`{path}.points: expected a non-empty array`

Thrown as `WorldgenErrors.EmptySplinePoints`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, defines a spline without
points.

## `WORLDGEN_EMPTY_SURFACE_SEQUENCE`

`{path}.sequence: expected a non-empty array`

Thrown as `WorldgenErrors.EmptySurfaceSequence`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, defines a surface rule
sequence without rules.

## `WORLDGEN_EXPECTED_ARRAY`

`{path}: expected an array, got {value}`

Thrown as `WorldgenErrors.ExpectedArray`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, has something other than
a list where a list belongs. The path names the field.

## `WORLDGEN_EXPECTED_BIOME_SOURCE`

`{path}: expected an object or an array`

Thrown as `WorldgenErrors.ExpectedBiomeSource`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, gives a biome source
that is neither an object nor a list of biomes.

## `WORLDGEN_EXPECTED_BOOLEAN`

`{path}: expected a boolean, got {value}`

Thrown as `WorldgenErrors.ExpectedBoolean`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, has something other than
`true` or `false` where a boolean belongs.

## `WORLDGEN_EXPECTED_CAVE_SURFACE`

`{path}: expected "floor" or "ceiling", got {value}`

Thrown as `WorldgenErrors.ExpectedCaveSurface`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, has a cave surface that
is not `floor` or `ceiling`.

## `WORLDGEN_EXPECTED_CLIMATE_RANGE`

`{path}: expected [min, max], got {source}`

Thrown as `WorldgenErrors.ExpectedClimateRange`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, gives a climate range
that is not a number or a pair of numbers.

## `WORLDGEN_EXPECTED_ENTRY_OBJECT`

`{entryPath}: expected an object`

Thrown as `WorldgenErrors.ExpectedEntryObject`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, has something other than
an object where an object belongs.

## `WORLDGEN_EXPECTED_FINITE_NUMBER`

`{path}: expected a finite number, got {value}`

Thrown as `WorldgenErrors.ExpectedFiniteNumber`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, has something other than
a number where a number belongs.

## `WORLDGEN_EXPECTED_INTEGER`

`{path}: expected an integer, got {value}`

Thrown as `WorldgenErrors.ExpectedInteger`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, has a fraction where a
whole number belongs.

## `WORLDGEN_EXPECTED_INTERVAL`

`{path}[{targetIndex}].{id}: expected a [min, max] interval`

Thrown as `WorldgenErrors.ExpectedInterval`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, gives a spawn target
range that is not a pair of numbers.

## `WORLDGEN_EXPECTED_LIST`

`{path}: expected an array`

Thrown as `WorldgenErrors.ExpectedList`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, has something other than
a list where a list belongs. The path names the field.

## `WORLDGEN_EXPECTED_OBJECT`

`{path}: expected an object, got {source}`

Thrown as `WorldgenErrors.ExpectedObject`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, has something other than
an object where an object belongs.

## `WORLDGEN_EXPECTED_ONE`

`{path}: expected one of {allowed}, got {text}`

Thrown as `WorldgenErrors.ExpectedOne`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, has a value outside the
set the field allows. The message lists the allowed values.

## `WORLDGEN_EXPECTED_REGISTRY_IDENTIFIER`

`Expected a registry identifier, got {value}`

Thrown as `WorldgenErrors.ExpectedRegistryIdentifier`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, has something other than
a string where a registry identifier belongs.

## `WORLDGEN_EXPECTED_STRING`

`{path}: expected a string, got {value}`

Thrown as `WorldgenErrors.ExpectedString`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, has something other than
a string where a string belongs.

## `WORLDGEN_EXPECTED_THREE_COORDINATES`

`{path}.point: expected three coordinates`

Thrown as `WorldgenErrors.ExpectedThreeCoordinates`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, gives a point that is
not three numbers.

## `WORLDGEN_EXPECTED_VERTICAL_ANCHOR`

`{path}: expected one of absolute, above_bottom, below_top or relative_to_sea_level, got {source}`

Thrown as `WorldgenErrors.ExpectedVerticalAnchor`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, gives a vertical anchor
without its kind. Write it as `absolute`, `above_bottom`, `below_top` or
`relative_to_sea_level`.

## `WORLDGEN_FLAT_GRADIENT`

`gradient from_coordinate cannot equal to_coordinate`

Thrown as `WorldgenErrors.FlatGradient`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, defines a gradient
density function whose start and end coordinates are equal, so it has no slope.

## `WORLDGEN_HEIGHT_NOT_MULTIPLE_OF16`

`{path}.height has to be a multiple of 16, got {height}`

Thrown as `WorldgenErrors.HeightNotMultipleOf16`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, defines a dimension type
whose `height` is not a multiple of 16.

## `WORLDGEN_INTERVAL_SELECT_NEEDS_TWO_FUNCTIONS`

`{path}.functions: expected at least two functions`

Thrown as `WorldgenErrors.IntervalSelectNeedsTwoFunctions`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, defines an
`interval_select` density function with fewer than two functions.

## `WORLDGEN_INVALID_AMPLITUDE_MODIFIERS`

`Noise parameter amplitude_modifiers must be an array`

Thrown as `WorldgenErrors.InvalidAmplitudeModifiers`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, defines a noise whose
`amplitude_modifiers` is not a list.

## `WORLDGEN_INVALID_BASE_OCTAVE`

`Noise parameter base_octave must be an integer in [-32, 32], got {baseOctave}`

Thrown as `WorldgenErrors.InvalidBaseOctave`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, defines a noise whose
first octave is not a whole number from -32 to 32.

## `WORLDGEN_INVALID_BIT_COUNT`

`Bit count must be an integer in [0, 32], got {bits}`

Thrown as `WorldgenErrors.InvalidBitCount`, which extends `RangeError`.

Generation code drew more random bits than one draw holds. This is a bug in world generation;
report it with the stack trace.

## `WORLDGEN_INVALID_GAUSSIAN_CACHE_STATE`

`Invalid Gaussian cache state`

Thrown as `WorldgenErrors.InvalidGaussianCacheState`, which extends `TypeError`.

A saved random state's cached Gaussian value has the wrong shape, so the save is damaged.

## `WORLDGEN_INVALID_INTERVAL_BOUNDS`

`{path}[{targetIndex}].{id}: interval bounds must be finite numbers`

Thrown as `WorldgenErrors.InvalidIntervalBounds`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, gives a spawn target
range whose bounds are not numbers.

## `WORLDGEN_INVALID_LEGACY_RANDOM_SOURCE_STATE`

`Invalid legacy random source state`

Thrown as `WorldgenErrors.InvalidLegacyRandomSourceState`, which extends `TypeError`.

A saved legacy random state has the wrong shape, so the save is damaged.

## `WORLDGEN_INVALID_NOISE_NORMALIZATION`

`Noise parameter normalize must be a boolean or "legacy", got {value}`

Thrown as `WorldgenErrors.InvalidNoiseNormalization`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, defines a noise whose
`normalize` is not `true`, `false` or `legacy`.

## `WORLDGEN_INVALID_NOISE_PARAMETER`

`Noise parameter {field} must be a finite number`

Thrown as `WorldgenErrors.InvalidNoiseParameter`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, defines a noise with a
field that is not a number.

## `WORLDGEN_INVALID_OCTAVE_COUNT`

`Noise parameter octave_count must be an integer in [1, 32], got {octaveCount}`

Thrown as `WorldgenErrors.InvalidOctaveCount`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, defines a noise whose
octave count is not a whole number from 1 to 32.

## `WORLDGEN_INVALID_RAW_ORE_CHANCE`

`{path}.raw_ore_chance: expected a finite number`

Thrown as `WorldgenErrors.InvalidRawOreChance`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, defines an ore vein
whose `raw_ore_chance` is not a number.

## `WORLDGEN_INVALID_REGISTRY_IDENTIFIER`

`{value} is not a valid registry identifier`

Thrown as `WorldgenErrors.InvalidRegistryIdentifier`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, has an identifier with
characters registry identifiers do not allow, such as capitals or spaces.

## `WORLDGEN_INVALID_TEMPERATURE`

`{path}.temperature: expected a finite number, got {temperature}`

Thrown as `WorldgenErrors.InvalidTemperature`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, defines a biome whose
`temperature` is not a number.

## `WORLDGEN_INVALID_TEMPERATURE_MODIFIER`

`{path}.temperature_modifier: expected "none" or "frozen", got {modifier}`

Thrown as `WorldgenErrors.InvalidTemperatureModifier`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, defines a biome whose
`temperature_modifier` is not `none` or `frozen`.

## `WORLDGEN_INVALID_WIDTH_SMOOTHNESS`

`{path}.shape.width_smoothness: expected a positive integer`

Thrown as `WorldgenErrors.InvalidWidthSmoothness`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, defines a canyon carver
whose `width_smoothness` is not a positive whole number.

## `WORLDGEN_INVALID_XOROSHIRO_RANDOM_SOURCE_STATE`

`Invalid xoroshiro random source state`

Thrown as `WorldgenErrors.InvalidXoroshiroRandomSourceState`, which extends `TypeError`.

A saved Xoroshiro random state has the wrong shape, so the save is damaged.

## `WORLDGEN_LEGACY_NOISE_POSITIVE_OCTAVE`

`Positive octaves are not supported by the legacy nether noise`

Thrown as `WorldgenErrors.LegacyNoisePositiveOctave`, which extends `RangeError`.

The legacy Nether noise was built with an octave Java's legacy noise never uses. This is a
bug in world generation; report it with the stack trace.

## `WORLDGEN_MIN_ABOVE_MAX`

`{path}: min ({min}) must be less than or equal to max ({max})`

Thrown as `WorldgenErrors.MinAboveMax`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, defines a density
function whose `min` is above its `max`.

## `WORLDGEN_MIN_YNOT_MULTIPLE_OF16`

`{path}.min_y has to be a multiple of 16, got {minY}`

Thrown as `WorldgenErrors.MinYNotMultipleOf16`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, defines a dimension type
whose `min_y` is not a multiple of 16.

## `WORLDGEN_MISSING_NOISE_PARAMETER`

`Noise parameters are missing the required field {field}`

Thrown as `WorldgenErrors.MissingNoiseParameter`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, defines a noise without
a field it needs.

## `WORLDGEN_NO_DENSITY_FUNCTION_IS_REGISTERED`

`No density function is registered as {id}`

Thrown as `WorldgenErrors.NoDensityFunctionIsRegistered`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, refers to a density
function no loaded file defines.

## `WORLDGEN_NO_MATERIAL_CONDITION_IS_REGISTERED`

`No material condition is registered as {id}`

Thrown as `WorldgenErrors.NoMaterialConditionIsRegistered`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, refers to a surface
condition no loaded file defines.

## `WORLDGEN_NO_MATERIAL_RULE_IS_REGISTERED`

`No material rule is registered as {id}`

Thrown as `WorldgenErrors.NoMaterialRuleIsRegistered`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, refers to a surface rule
no loaded file defines.

## `WORLDGEN_NO_NOISE_IS_REGISTERED`

`No noise is registered as {id}`

Thrown as `WorldgenErrors.NoNoiseIsRegistered`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, refers to a noise no
loaded file defines.

## `WORLDGEN_NO_NOISE_SETTINGS_ARE_REGISTERED`

`No noise settings are registered as {id}`

Thrown as `WorldgenErrors.NoNoiseSettingsAreRegistered`, which extends `RangeError`.

A dimension refers to noise settings no loaded file defines. Check the world's preset and the
datapacks it loads.

## `WORLDGEN_NOISE_HAS_NO_AMPLITUDES`

`Need at least 1 amplitude`

Thrown as `WorldgenErrors.NoiseHasNoAmplitudes`, which extends `RangeError`.

A noise was built without octaves. A world generation file, from a datapack or the generated
Java data, probably defines one with an empty `amplitudes` list.

## `WORLDGEN_NOISE_HEIGHT_NOT_MULTIPLE_OF16`

`{path}.noise.height has to be a multiple of 16`

Thrown as `WorldgenErrors.NoiseHeightNotMultipleOf16`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, defines noise settings
whose height is not a multiple of 16.

## `WORLDGEN_NOISE_MIN_YNOT_MULTIPLE_OF16`

`{path}.noise.min_y has to be a multiple of 16`

Thrown as `WorldgenErrors.NoiseMinYNotMultipleOf16`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, defines noise settings
whose `min_y` is not a multiple of 16.

## `WORLDGEN_NOISE_PARAMETERS_NOT_OBJECT`

`Noise parameters must be a JSON object`

Thrown as `WorldgenErrors.NoiseParametersNotObject`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, defines a noise that is
not a JSON object.

## `WORLDGEN_NON_POSITIVE_UPSCALE_CELL`

`{path}: expected a positive upscale cell size, got {size}`

Thrown as `WorldgenErrors.NonPositiveUpscaleCell`, which extends `RangeError`.

A 26.4 `upscale` density function gives an axis a `cell_size` of zero or less. Interpolation
divides by the cell size, so give each axis a positive whole number, as every vanilla
`upscale` does.

## `WORLDGEN_NUMBER_OUT_OF_RANGE`

`{path} has to be between {min} and {max}, got {value}`

Thrown as `WorldgenErrors.NumberOutOfRange`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, has a number outside the
range Java allows for that field.

## `WORLDGEN_POSITIVE_FIRST_OCTAVE`

`firstOctave>0`

Thrown as `WorldgenErrors.PositiveFirstOctave`, which extends `RangeError`.

A noise was built with a positive first octave, which Java refuses as well. A world
generation file, from a datapack or the generated Java data, probably defines it.

## `WORLDGEN_SHARED_ARRAY_BUFFER_UNAVAILABLE`

`SharedArrayBuffer is not available in this runtime`

Thrown as `WorldgenErrors.SharedArrayBufferUnavailable`, which extends `Error`.

Generation workers share memory through `SharedArrayBuffer`, which this JavaScript runtime
does not provide. Run the server on Node.js.

## `WORLDGEN_SHARED_CLIMATE_TABLE_HAS_BAD_MAGIC`

`Shared climate table has bad magic`

Thrown as `WorldgenErrors.SharedClimateTableHasBadMagic`, which extends `TypeError`.

Memory given to a generation worker as a biome climate table is not one. This is a bug in
world generation; report it with the stack trace.

## `WORLDGEN_SHARED_CLIMATE_TABLE_HAS_EMPTY_DIMENSIONS`

`Shared climate table has empty dimensions`

Thrown as `WorldgenErrors.SharedClimateTableHasEmptyDimensions`, which extends `TypeError`.

The biome climate table shared between generation workers is empty. This is a bug in world
generation; report it with the stack trace.

## `WORLDGEN_SHARED_CLIMATE_TABLE_HAS_INCONSISTENT_LENGTHS`

`Shared climate table has inconsistent lengths or offsets`

Thrown as `WorldgenErrors.SharedClimateTableHasInconsistentLengths`, which extends `TypeError`.

The biome climate table shared between generation workers has inconsistent sizes. This is a
bug in world generation; report it with the stack trace.

## `WORLDGEN_SHARED_CLIMATE_TABLE_HAS_NO_VALUE`

`Shared climate table has no value at index {index}`

Thrown as `WorldgenErrors.SharedClimateTableHasNoValue`, which extends `TypeError`.

A generation worker read a biome past the end of the shared climate table. This is a bug in
world generation; report it with the stack trace.

## `WORLDGEN_SHARED_CLIMATE_TABLE_INVALID_VALUES`

`Shared climate table contains an invalid value dictionary`

Thrown as `WorldgenErrors.SharedClimateTableInvalidValues`, which extends `TypeError`.

The biome climate table shared between generation workers is damaged. This is a bug in world
generation; report it with the stack trace.

## `WORLDGEN_SHARED_CLIMATE_TABLE_IS_SHORTER`

`Shared climate table is shorter than its header`

Thrown as `WorldgenErrors.SharedClimateTableIsShorter`, which extends `TypeError`.

The biome climate table shared between generation workers is truncated. This is a bug in
world generation; report it with the stack trace.

## `WORLDGEN_SHARED_CLIMATE_TABLE_VALUE_COUNT`

`Shared climate table value count does not match`

Thrown as `WorldgenErrors.SharedClimateTableValueCount`, which extends `TypeError`.

The biome climate table shared between generation workers disagrees with its own biome count.
This is a bug in world generation; report it with the stack trace.

## `WORLDGEN_SHARED_CLIMATE_TABLE_VERSION_IS_UNSUPPORTED`

`Shared climate table version {uint32} is unsupported`

Thrown as `WorldgenErrors.SharedClimateTableVersionIsUnsupported`, which extends `TypeError`.

A generation worker got a biome climate table in a layout it does not read, so the server and
its workers run different versions. Restart the server.

## `WORLDGEN_SKIPPED_CELL_MISMATCH`

`Skipped cell differed from scalar sampling at {x},{y},{z}: global={expectedState}/{expectedScheduleFluidUpdate}, scalar={scalarState}/{scalarScheduleFluidUpdate}`

Thrown as `WorldgenErrors.SkippedCellMismatch`, which extends `Error`.

A debug check found that skipping an air cell would change a block. This is a bug in world
generation; report it with the stack trace.

## `WORLDGEN_SKIPPED_CELL_WAS_SOLID`

`Skipped cell had positive scalar density {density} at {x},{y},{z}`

Thrown as `WorldgenErrors.SkippedCellWasSolid`, which extends `Error`.

A debug check found solid ground in a cell generation skipped as air. This is a bug in world
generation; report it with the stack trace.

## `WORLDGEN_SPLINE_HAS_NO_POINTS`

`A multipoint spline needs at least one point`

Thrown as `WorldgenErrors.SplineHasNoPoints`, which extends `RangeError`.

A spline was built without points. A world generation file, from a datapack or the generated
Java data, probably defines one.

## `WORLDGEN_SPLINE_POINTS_OUT_OF_ORDER`

`{pointPath}: spline points must be in ascending location order`

Thrown as `WorldgenErrors.SplinePointsOutOfOrder`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, defines a spline whose
points are not in ascending order of location.

## `WORLDGEN_SURFACE_COLUMN_WRONG_HEIGHT`

`Column {localX},{localZ} has {columnCount} blocks, expected {height}`

Thrown as `WorldgenErrors.SurfaceColumnWrongHeight`, which extends `RangeError`.

The surface pass was given a block column of the wrong height. This is a bug in world
generation; report it with the stack trace.

## `WORLDGEN_SURFACE_RULE_CYCLE`

`Material {key} references itself through {resolving}`

Thrown as `WorldgenErrors.SurfaceRuleCycle`, which extends `RangeError`.

A world generation file, from a datapack or the generated Java data, defines surface rules
that refer to each other in a loop.

## `WORLDGEN_THRESHOLD_COUNT_MISMATCH`

`{path}: expected {value} thresholds for {functionSourceCount} functions, got {thresholdSourceCount}`

Thrown as `WorldgenErrors.ThresholdCountMismatch`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, defines an
`interval_select` density function with one threshold fewer than its functions; it needs
exactly that many.

## `WORLDGEN_THRESHOLDS_NOT_LIST`

`{path}.thresholds: expected an array`

Thrown as `WorldgenErrors.ThresholdsNotList`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, defines an
`interval_select` density function whose `thresholds` is not a list.

## `WORLDGEN_THRESHOLDS_OUT_OF_ORDER`

`{path}.thresholds: threshold values must be ordered from smallest to largest`

Thrown as `WorldgenErrors.ThresholdsOutOfOrder`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, defines an
`interval_select` density function whose thresholds are not in ascending order.

## `WORLDGEN_TYPE_NOT_STRING`

`{path}.type: expected a string, got {type}`

Thrown as `WorldgenErrors.TypeNotString`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, has an entry whose
`type` is not a string.

## `WORLDGEN_UNCOMPILABLE_DENSITY_FUNCTION`

`Cannot compile density function node {node}`

Thrown as `WorldgenErrors.UncompilableDensityFunction`, which extends `TypeError`.

The density function compiler met a node it cannot compile. This is a bug in world
generation; report it with the stack trace.

## `WORLDGEN_UNEVEN_UPSCALE_CELLS`

`{path}: upscale cell sizes differ across x ({x}) and z ({z}); only equal sizes are implemented`

Thrown as `WorldgenErrors.UnevenUpscaleCells`, which extends `TypeError`.

A 26.4 `upscale` density function gives its x and z axes different cell sizes. The chunk
sampler fills square horizontal cells, as every vanilla `upscale` uses, so give `x` and `z`
the same `cell_size`.

## `WORLDGEN_UNKNOWN_BIOME_PARAMETER_PRESET`

`{path}.preset: no multi_noise_biome_source_parameter_list named {preset}`

Thrown as `WorldgenErrors.UnknownBiomeParameterPreset`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, names a biome parameter
list preset that does not exist.

## `WORLDGEN_UNKNOWN_BIOME_SOURCE_TYPE`

`{path}: unknown biome source type {type}`

Thrown as `WorldgenErrors.UnknownBiomeSourceType`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, uses a biome source type
this server does not implement.

## `WORLDGEN_UNKNOWN_CARVER_TYPE`

`{path}: unknown carver type {type}`

Thrown as `WorldgenErrors.UnknownCarverType`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, uses a carver type this
server does not implement.

## `WORLDGEN_UNKNOWN_DENSITY_FUNCTION_TYPE`

`{path}: unknown density function type minecraft:{type}`

Thrown as `WorldgenErrors.UnknownDensityFunctionType`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, uses a density function
type this server does not implement.

## `WORLDGEN_UNKNOWN_FLOAT_PROVIDER_TYPE`

`{path}: unknown float provider type {type}`

Thrown as `WorldgenErrors.UnknownFloatProviderType`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, uses a float provider
type this server does not implement.

## `WORLDGEN_UNKNOWN_HEIGHT_PROVIDER_TYPE`

`{path}: unknown height provider type {type}`

Thrown as `WorldgenErrors.UnknownHeightProviderType`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, uses a height provider
type this server does not implement.

## `WORLDGEN_UNKNOWN_INT_PROVIDER_TYPE`

`{path}: unknown int provider type {type}`

Thrown as `WorldgenErrors.UnknownIntProviderType`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, uses an int provider
type this server does not implement.

## `WORLDGEN_UNKNOWN_MATERIAL_CONDITION_TYPE`

`{path}: unknown material condition type {type}`

Thrown as `WorldgenErrors.UnknownMaterialConditionType`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, uses a surface condition
type this server does not implement.

## `WORLDGEN_UNKNOWN_MATERIAL_RULE_TYPE`

`{path}: unknown material rule type {type}`

Thrown as `WorldgenErrors.UnknownMaterialRuleType`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, uses a surface rule type
this server does not implement.

## `WORLDGEN_UNKNOWN_UNARY_DENSITY_FUNCTION`

`Unknown unary density function {type}`

Thrown as `WorldgenErrors.UnknownUnaryDensityFunction`, which extends `TypeError`.

The density function compiler met a single-input function it does not know. This is a bug in
world generation; report it with the stack trace.

## `WORLDGEN_UNSUPPORTED_UPSCALE_MODE`

`{path}: upscale mode {mode} is not implemented; only "interpolate_linear" is`

Thrown as `WorldgenErrors.UnsupportedUpscaleMode`, which extends `TypeError`.

A 26.4 `upscale` density function names a mode other than `interpolate_linear` on one axis.
Every vanilla `upscale` interpolates linearly, and this server implements only that mode;
change the axis's `mode` to `interpolate_linear` or leave the function out.

## `WORLDGEN_WORLD_PRESET_HAS_NO_OVERWORLD`

`{path}.dimensions: a world preset has to define {overworldStemId}`

Thrown as `WorldgenErrors.WorldPresetHasNoOverworld`, which extends `TypeError`.

A world generation file, from a datapack or the generated Java data, defines a world preset
without an overworld, which every world needs.
<!-- /fact -->
