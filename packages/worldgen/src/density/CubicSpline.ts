import { binarySearch, f32, lerpF } from '../math';
import type { SampleContext } from './SampleContext';

/** A compiled cubic spline, sampled the same way a density function is. */
export type CompiledSpline = (context: SampleContext, x: number, y: number, z: number) => number;

/** The pieces a compiled multipoint spline is built from. */
export interface MultipointSpline {
    /** Reads the value that selects a point on the curve. */
    readonly coordinate: CompiledSpline;
    /** Knot positions along the coordinate, ascending. */
    readonly locations: readonly number[];
    /** The nested spline evaluated at each knot. */
    readonly values: readonly CompiledSpline[];
    /** The slope used to extend the curve past each end knot. */
    readonly derivatives: readonly number[];
}

/**
 * Builds the sampler for a multipoint spline.
 *
 * Between two knots the curve is the Hermite interpolant Java computes, and outside the end
 * knots it continues along the end derivative. Every step is single precision, which matters
 * because the overworld's offset, factor and jaggedness all come out of these curves.
 */
export const compileMultipointSpline = (spline: MultipointSpline): CompiledSpline => {
    const coordinate = spline.coordinate;
    const locations = Float32Array.from(spline.locations);
    const derivatives = Float32Array.from(spline.derivatives);
    const values = spline.values.slice();
    const lastIndex = locations.length - 1;
    const first = values[0];
    const last = values[lastIndex];
    if (!first || !last) throw new RangeError('A multipoint spline needs at least one point');

    const linearExtend = (input: number, value: number, index: number): number => {
        const derivative = derivatives[index] ?? 0;
        if (derivative === 0) return value;
        return f32(value + f32(derivative * f32(input - (locations[index] ?? 0))));
    };

    return (context, x, y, z) => {
        const input = coordinate(context, x, y, z);
        const start = binarySearch(0, locations.length, (index) => input < (locations[index] ?? 0)) - 1;

        if (start < 0) return linearExtend(input, first(context, x, y, z), 0);
        if (start === lastIndex) return linearExtend(input, last(context, x, y, z), lastIndex);

        const lower = values[start];
        const upper = values[start + 1];
        if (!lower || !upper) return 0;

        const x1 = locations[start] ?? 0;
        const x2 = locations[start + 1] ?? 0;
        const span = f32(x2 - x1);
        const t = f32(f32(input - x1) / span);
        const y1 = lower(context, x, y, z);
        const y2 = upper(context, x, y, z);
        const delta = f32(y2 - y1);
        const a = f32(f32((derivatives[start] ?? 0) * span) - delta);
        const b = f32(f32(-(derivatives[start + 1] ?? 0) * span) + delta);
        return f32(lerpF(t, y1, y2) + f32(f32(t * f32(1 - t)) * lerpF(t, a, b)));
    };
};
