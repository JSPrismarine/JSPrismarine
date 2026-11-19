import { normalizeIdentifier, typeName } from '../identifier';
import type {
    Axis,
    BinaryDensityType,
    DensityFunctionNode,
    DistanceMetric,
    RoundingDensityType,
    SplineNode,
    TilingMode,
    UnaryDensityType
} from './DensityFunction';
import { readsSince } from '../dataPackFormat';
import { WorldgenErrors } from '@jsprismarine/errors/worldgen';

/** Resolves a `worldgen/density_function` reference to its parsed tree. */
export type DensityFunctionResolver = (id: string) => DensityFunctionNode;

/**
 * 26.4 (format 128) replaced `interpolated`, with its `cell_size_xz` and `cell_size_y`, by
 * `upscale`, which gives each axis its own `{ cell_size, mode }`.
 */
export const SINCE_UPSCALE_DENSITY_FUNCTION = 128;

/** The `upscale` mode that reads the same as the `interpolated` it replaced. */
const LINEAR_UPSCALE_MODE = 'interpolate_linear';

const ZERO: DensityFunctionNode = { type: 'constant', value: 0 };

const UNARY_TYPES = new Set<string>([
    'abs',
    'cube',
    'half_negative',
    'log',
    'negate',
    'quarter_negative',
    'reciprocal',
    'sign',
    'sqrt',
    'square',
    'squeeze'
]);
const BINARY_TYPES = new Set<string>(['add', 'div', 'max', 'min', 'mul', 'sub']);
const ROUNDING_TYPES = new Set<string>(['ceil', 'floor', 'round', 'truncate']);
const AXES = new Set<string>(['x', 'y', 'z']);
const TILING_MODES = new Set<string>(['clamp_to_edge', 'repeat', 'mirrored_repeat']);
const METRICS = new Set<string>(['euclidean', 'euclidean_squared', 'manhattan', 'chebyshev']);

/** Throws a parse error from an expression, such as the right side of `??`. */
const fail = (error: Error): never => {
    throw error;
};

const asObject = (value: unknown, path: string): Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return fail(new WorldgenErrors.ExpectedObject({ path, source: JSON.stringify(value) }));
    }
    // A parsed JSON document is `unknown`; every field read below is checked.
    return value as Record<string, unknown>;
};

const number = (value: unknown, path: string, fallback?: number): number => {
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fail(new WorldgenErrors.ExpectedFiniteNumber({ path, value: JSON.stringify(value) }));
    }
    return value;
};

const integer = (value: unknown, path: string, fallback?: number): number => {
    const parsed = number(value, path, fallback);
    if (!Number.isInteger(parsed)) return fail(new WorldgenErrors.ExpectedInteger({ path, value: parsed }));
    return parsed;
};

const enumValue = <T extends string>(value: unknown, allowed: ReadonlySet<string>, path: string): T => {
    if (typeof value !== 'string' || !allowed.has(value)) {
        return fail(
            new WorldgenErrors.ExpectedOne({ path, allowed: [...allowed].join(', '), text: JSON.stringify(value) })
        );
    }
    // The membership check above narrows the string to the union the caller declared.
    return value as T;
};

const parseSpline = (
    source: unknown,
    path: string,
    parse: (value: unknown, path: string) => DensityFunctionNode
): SplineNode => {
    if (typeof source === 'number') return { kind: 'constant', value: source };
    const raw = asObject(source, path);
    const points = raw['points'];
    if (!Array.isArray(points) || points.length === 0) {
        return fail(new WorldgenErrors.EmptySplinePoints({ path }));
    }

    const locations: number[] = [];
    const values: SplineNode[] = [];
    const derivatives: number[] = [];
    for (const [index, entry] of points.entries()) {
        const pointPath = `${path}.points[${index}]`;
        const point = asObject(entry, pointPath);
        const location = number(point['location'], `${pointPath}.location`);
        if (locations.length > 0 && location <= (locations[locations.length - 1] ?? 0)) {
            return fail(new WorldgenErrors.SplinePointsOutOfOrder({ pointPath }));
        }
        locations.push(location);
        values.push(parseSpline(point['value'], `${pointPath}.value`, parse));
        derivatives.push(number(point['derivative'], `${pointPath}.derivative`, 0));
    }

    return {
        kind: 'multipoint',
        coordinate: parse(raw['coordinate'], `${path}.coordinate`),
        locations,
        values,
        derivatives
    };
};

/**
 * Reads one `worldgen/density_function` JSON document into a tree.
 *
 * A bare number is a constant and a bare string is a reference, both of which Java accepts
 * anywhere a function is expected. References are resolved eagerly through `resolve`, so the
 * returned tree has no indirection left for the compiler to chase.
 *
 * @param resolve - Looks up another density function by identifier.
 * @param format - The target's data pack format major, which picks between grammars that
 *   changed; undefined reads the default release's grammar.
 * @throws When a type is unknown, a field is missing, or a value has the wrong shape. Nothing
 *   falls back to zero, because a silently zeroed subtree changes terrain without failing.
 */
export const parseDensityFunction = (
    source: unknown,
    resolve: DensityFunctionResolver,
    path = '<root>',
    format?: number
): DensityFunctionNode => {
    if (typeof source === 'number') {
        if (!Number.isFinite(source)) return fail(new WorldgenErrors.ExpectedFiniteNumber({ path, value: source }));
        return { type: 'constant', value: source };
    }
    if (typeof source === 'string') return resolve(normalizeIdentifier(source));

    const raw = asObject(source, path);
    const parse = (value: unknown, childPath: string): DensityFunctionNode =>
        parseDensityFunction(value, resolve, childPath, format);
    const type = typeName(raw['type']);

    if (UNARY_TYPES.has(type)) {
        return {
            type: enumValue<UnaryDensityType>(type, UNARY_TYPES, path),
            input: parse(raw['input'], `${path}.input`)
        };
    }
    if (BINARY_TYPES.has(type)) {
        return {
            type: enumValue<BinaryDensityType>(type, BINARY_TYPES, path),
            left: parse(raw['left'], `${path}.left`),
            right: parse(raw['right'], `${path}.right`)
        };
    }
    if (ROUNDING_TYPES.has(type)) {
        return {
            type: enumValue<RoundingDensityType>(type, ROUNDING_TYPES, path),
            input: parse(raw['input'], `${path}.input`),
            multiple:
                raw['multiple'] === undefined
                    ? { type: 'constant', value: 1 }
                    : parse(raw['multiple'], `${path}.multiple`)
        };
    }

    switch (type) {
        case 'constant':
            return { type: 'constant', value: number(raw['value'], `${path}.value`) };
        case 'blend_alpha':
        case 'blend_offset':
        case 'beardifier':
        case 'end_outer_islands':
            return { type };
        case 'gradient':
            return {
                type: 'gradient',
                axis: enumValue<Axis>(raw['axis'], AXES, `${path}.axis`),
                tiling:
                    raw['tiling'] === undefined
                        ? 'clamp_to_edge'
                        : enumValue<TilingMode>(raw['tiling'], TILING_MODES, `${path}.tiling`),
                fromCoordinate: integer(raw['from_coordinate'], `${path}.from_coordinate`),
                toCoordinate: integer(raw['to_coordinate'], `${path}.to_coordinate`),
                fromValue: number(raw['from_value'], `${path}.from_value`),
                toValue: number(raw['to_value'], `${path}.to_value`)
            };
        case 'noise':
            return {
                type: 'noise',
                noise: normalizeIdentifier(raw['noise']),
                xzScale: number(raw['xz_scale'], `${path}.xz_scale`, 1),
                yScale: number(raw['y_scale'], `${path}.y_scale`, 1),
                shiftX: raw['shift_x'] === undefined ? ZERO : parse(raw['shift_x'], `${path}.shift_x`),
                shiftY: raw['shift_y'] === undefined ? ZERO : parse(raw['shift_y'], `${path}.shift_y`),
                shiftZ: raw['shift_z'] === undefined ? ZERO : parse(raw['shift_z'], `${path}.shift_z`)
            };
        case 'shift':
        case 'shift_a':
        case 'shift_b':
            return { type, noise: normalizeIdentifier(raw['noise']) };
        case 'old_blended_noise':
            return {
                type: 'old_blended_noise',
                xzScale: number(raw['xz_scale'], `${path}.xz_scale`),
                yScale: number(raw['y_scale'], `${path}.y_scale`),
                xzFactor: number(raw['xz_factor'], `${path}.xz_factor`),
                yFactor: number(raw['y_factor'], `${path}.y_factor`),
                smearScaleMultiplier: number(raw['smear_scale_multiplier'], `${path}.smear_scale_multiplier`)
            };
        case 'distance_to_point': {
            const point = raw['point'];
            if (!Array.isArray(point) || point.length !== 3)
                return fail(new WorldgenErrors.ExpectedThreeCoordinates({ path }));
            return {
                type: 'distance_to_point',
                point: [
                    integer(point[0], `${path}.point[0]`),
                    integer(point[1], `${path}.point[1]`),
                    integer(point[2], `${path}.point[2]`)
                ],
                metric: enumValue<DistanceMetric>(raw['metric'], METRICS, `${path}.metric`)
            };
        }
        case 'cache':
        case 'blend_density':
            return { type, input: parse(raw['input'], `${path}.input`) };
        case 'clamp': {
            const min = number(raw['min'], `${path}.min`);
            const max = number(raw['max'], `${path}.max`);
            if (max < min) return fail(new WorldgenErrors.MinAboveMax({ path, min, max }));
            return { type: 'clamp', input: parse(raw['input'], `${path}.input`), min, max };
        }
        case 'find_top_surface':
            return {
                type: 'find_top_surface',
                density: parse(raw['density'], `${path}.density`),
                upperBound: parse(raw['upper_bound'], `${path}.upper_bound`),
                lowerBound: integer(raw['lower_bound'], `${path}.lower_bound`, 0),
                cellHeight: integer(raw['cell_height'], `${path}.cell_height`, 1)
            };
        case 'interpolated':
            if (readsSince(format, SINCE_UPSCALE_DENSITY_FUNCTION)) {
                return fail(new WorldgenErrors.UnknownDensityFunctionType({ path, type }));
            }
            return {
                type: 'interpolated',
                input: parse(raw['input'], `${path}.input`),
                cellSizeXz: integer(raw['cell_size_xz'], `${path}.cell_size_xz`, 4),
                cellSizeY: integer(raw['cell_size_y'], `${path}.cell_size_y`, 4)
            };
        case 'upscale': {
            if (!readsSince(format, SINCE_UPSCALE_DENSITY_FUNCTION)) {
                return fail(new WorldgenErrors.UnknownDensityFunctionType({ path, type }));
            }
            // Every vanilla `upscale` interpolates linearly with equal x and z cells, which is
            // the `interpolated` node the chunk sampler already fills cell by cell.
            const cellSize = (axis: 'x' | 'y' | 'z'): number => {
                const axisPath = `${path}.${axis}`;
                const fields = asObject(raw[axis], axisPath);
                if (fields['mode'] !== LINEAR_UPSCALE_MODE) {
                    return fail(
                        new WorldgenErrors.UnsupportedUpscaleMode({
                            path: `${axisPath}.mode`,
                            mode: JSON.stringify(fields['mode'])
                        })
                    );
                }
                const size = integer(fields['cell_size'], `${axisPath}.cell_size`);
                // Interpolation divides by the cell size, so zero would sample NaN.
                if (size <= 0) {
                    return fail(new WorldgenErrors.NonPositiveUpscaleCell({ path: `${axisPath}.cell_size`, size }));
                }
                return size;
            };
            const cellSizeX = cellSize('x');
            const cellSizeZ = cellSize('z');
            if (cellSizeX !== cellSizeZ) {
                return fail(new WorldgenErrors.UnevenUpscaleCells({ path, x: cellSizeX, z: cellSizeZ }));
            }
            return {
                type: 'interpolated',
                input: parse(raw['input'], `${path}.input`),
                cellSizeXz: cellSizeX,
                cellSizeY: cellSize('y')
            };
        }
        case 'interval_select': {
            const thresholdSource = raw['thresholds'];
            const functionSource = raw['functions'];
            if (!Array.isArray(thresholdSource)) return fail(new WorldgenErrors.ThresholdsNotList({ path }));
            if (!Array.isArray(functionSource) || functionSource.length < 2) {
                return fail(new WorldgenErrors.IntervalSelectNeedsTwoFunctions({ path }));
            }
            if (thresholdSource.length !== functionSource.length - 1) {
                return fail(
                    new WorldgenErrors.ThresholdCountMismatch({
                        path,
                        value: functionSource.length - 1,
                        functionSourceCount: functionSource.length,
                        thresholdSourceCount: thresholdSource.length
                    })
                );
            }
            const thresholds = thresholdSource.map((entry, index) => number(entry, `${path}.thresholds[${index}]`));
            for (let i = 1; i < thresholds.length; i++) {
                if ((thresholds[i] ?? 0) < (thresholds[i - 1] ?? 0)) {
                    return fail(new WorldgenErrors.ThresholdsOutOfOrder({ path }));
                }
            }
            return {
                type: 'interval_select',
                input: parse(raw['input'], `${path}.input`),
                thresholds,
                functions: functionSource.map((entry, index) => parse(entry, `${path}.functions[${index}]`))
            };
        }
        case 'lerp':
            return {
                type: 'lerp',
                alpha: parse(raw['alpha'], `${path}.alpha`),
                first: parse(raw['first'], `${path}.first`),
                second: parse(raw['second'], `${path}.second`)
            };
        case 'pow':
            return {
                type: 'pow',
                base: parse(raw['base'], `${path}.base`),
                exponent: parse(raw['exponent'], `${path}.exponent`)
            };
        case 'range_choice':
            return {
                type: 'range_choice',
                input: parse(raw['input'], `${path}.input`),
                minInclusive: number(raw['min_inclusive'], `${path}.min_inclusive`),
                maxExclusive: number(raw['max_exclusive'], `${path}.max_exclusive`),
                whenInRange: parse(raw['when_in_range'], `${path}.when_in_range`),
                whenOutOfRange: parse(raw['when_out_of_range'], `${path}.when_out_of_range`)
            };
        case 'slice':
            return {
                type: 'slice',
                axis: enumValue<Axis>(raw['axis'], AXES, `${path}.axis`),
                coordinate: integer(raw['coordinate'], `${path}.coordinate`),
                input: parse(raw['input'], `${path}.input`)
            };
        case 'spline':
            return { type: 'spline', spline: parseSpline(raw['spline'], `${path}.spline`, parse) };
        default:
            return fail(new WorldgenErrors.UnknownDensityFunctionType({ path, type }));
    }
};
