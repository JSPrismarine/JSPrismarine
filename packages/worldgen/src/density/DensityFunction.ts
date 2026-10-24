/** The axis a `gradient` or `slice` function works along. */
export type Axis = 'x' | 'y' | 'z';

/** How a `gradient` function behaves outside its coordinate range. */
export type TilingMode = 'clamp_to_edge' | 'repeat' | 'mirrored_repeat';

/** The distance measure a `distance_to_point` function uses. */
export type DistanceMetric = 'euclidean' | 'euclidean_squared' | 'manhattan' | 'chebyshev';

/** The eleven single-input operators that take only `input`. */
export type UnaryDensityType =
    | 'abs'
    | 'cube'
    | 'half_negative'
    | 'log'
    | 'negate'
    | 'quarter_negative'
    | 'reciprocal'
    | 'sign'
    | 'sqrt'
    | 'square'
    | 'squeeze';

/** The six two-input operators that take `left` and `right`. */
export type BinaryDensityType = 'add' | 'div' | 'max' | 'min' | 'mul' | 'sub';

/** The four rounding operators that take `input` and `multiple`. */
export type RoundingDensityType = 'ceil' | 'floor' | 'round' | 'truncate';

/** The three operators whose value comes from the chunk being generated, not from the data. */
export type ContextDensityType = 'beardifier' | 'blend_alpha' | 'blend_offset';

/** A cubic spline, either a fixed value or a curve over another density function. */
export type SplineNode =
    | { readonly kind: 'constant'; readonly value: number }
    | {
          readonly kind: 'multipoint';
          /** The density function whose value selects a point on the curve. */
          readonly coordinate: DensityFunctionNode;
          /** Knot positions along the coordinate, in ascending order. */
          readonly locations: readonly number[];
          /** The value at each knot, itself a spline so curves can nest. */
          readonly values: readonly SplineNode[];
          /** The slope used to extend the curve past each end knot. */
          readonly derivatives: readonly number[];
      };

/**
 * One node of a parsed density function tree.
 *
 * This mirrors the 44 types Java Edition 26.3 registers in
 * `minecraft:density_function_type`. 1.21's `flat_cache`, `cache_2d`,
 * `cache_all_in_cell`, `cache_once`, `y_clamped_gradient`, `shifted_noise`,
 * `weird_scaled_sampler`, `end_islands` and `old_blended_noise` either merged into the types
 * below or moved: caching became one value-neutral `cache`, the quantizing caches became
 * `slice` and `interpolated`, `shifted_noise` became `noise` with optional shift inputs, and
 * `y_clamped_gradient` became `gradient` with a tiling mode.
 */
export type DensityFunctionNode =
    | { readonly type: 'constant'; readonly value: number }
    | { readonly type: ContextDensityType }
    | { readonly type: 'end_outer_islands' }
    | {
          readonly type: 'gradient';
          readonly axis: Axis;
          readonly tiling: TilingMode;
          readonly fromCoordinate: number;
          readonly toCoordinate: number;
          readonly fromValue: number;
          readonly toValue: number;
      }
    | {
          readonly type: 'noise';
          readonly noise: string;
          readonly xzScale: number;
          readonly yScale: number;
          readonly shiftX: DensityFunctionNode;
          readonly shiftY: DensityFunctionNode;
          readonly shiftZ: DensityFunctionNode;
      }
    | { readonly type: 'shift' | 'shift_a' | 'shift_b'; readonly noise: string }
    | {
          readonly type: 'old_blended_noise';
          readonly xzScale: number;
          readonly yScale: number;
          readonly xzFactor: number;
          readonly yFactor: number;
          readonly smearScaleMultiplier: number;
      }
    | {
          readonly type: 'distance_to_point';
          readonly point: readonly [number, number, number];
          readonly metric: DistanceMetric;
      }
    | { readonly type: 'blend_density' | 'cache'; readonly input: DensityFunctionNode }
    | { readonly type: UnaryDensityType; readonly input: DensityFunctionNode }
    | {
          readonly type: RoundingDensityType;
          readonly input: DensityFunctionNode;
          readonly multiple: DensityFunctionNode;
      }
    | { readonly type: BinaryDensityType; readonly left: DensityFunctionNode; readonly right: DensityFunctionNode }
    | { readonly type: 'clamp'; readonly input: DensityFunctionNode; readonly min: number; readonly max: number }
    | {
          readonly type: 'find_top_surface';
          readonly density: DensityFunctionNode;
          readonly upperBound: DensityFunctionNode;
          readonly lowerBound: number;
          readonly cellHeight: number;
      }
    | {
          readonly type: 'interpolated';
          readonly input: DensityFunctionNode;
          readonly cellSizeXz: number;
          readonly cellSizeY: number;
      }
    | {
          readonly type: 'interval_select';
          readonly input: DensityFunctionNode;
          readonly thresholds: readonly number[];
          readonly functions: readonly DensityFunctionNode[];
      }
    | {
          readonly type: 'lerp';
          readonly alpha: DensityFunctionNode;
          readonly first: DensityFunctionNode;
          readonly second: DensityFunctionNode;
      }
    | { readonly type: 'pow'; readonly base: DensityFunctionNode; readonly exponent: DensityFunctionNode }
    | {
          readonly type: 'range_choice';
          readonly input: DensityFunctionNode;
          readonly minInclusive: number;
          readonly maxExclusive: number;
          readonly whenInRange: DensityFunctionNode;
          readonly whenOutOfRange: DensityFunctionNode;
      }
    | { readonly type: 'slice'; readonly axis: Axis; readonly coordinate: number; readonly input: DensityFunctionNode }
    | { readonly type: 'spline'; readonly spline: SplineNode };

/** The 44 operator names Java Edition 26.3 registers, in registration order. */
export const DENSITY_FUNCTION_TYPES = [
    'constant',
    'blend_alpha',
    'blend_offset',
    'beardifier',
    'noise',
    'end_outer_islands',
    'distance_to_point',
    'gradient',
    'shift_a',
    'shift_b',
    'shift',
    'abs',
    'square',
    'cube',
    'sqrt',
    'half_negative',
    'quarter_negative',
    'reciprocal',
    'negate',
    'squeeze',
    'log',
    'sign',
    'floor',
    'round',
    'ceil',
    'truncate',
    'add',
    'sub',
    'mul',
    'div',
    'min',
    'max',
    'pow',
    'spline',
    'lerp',
    'clamp',
    'range_choice',
    'interval_select',
    'cache',
    'blend_density',
    'interpolated',
    'slice',
    'find_top_surface',
    'old_blended_noise'
] as const satisfies readonly DensityFunctionNode['type'][];
