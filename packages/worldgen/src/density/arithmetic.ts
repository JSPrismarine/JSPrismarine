import { clamp, f32 } from '../math';

/** `square`, rounded to `float` as Java's `DensityFunctions.Mapped` does. */
export const square = (value: number): number => f32(value * value);

/** `cube`, rounded to `float` after each multiplication, in Java's order. */
export const cube = (value: number): number => f32(f32(value * value) * value);

/** `squeeze`: the input clamped to [-1, 1], then `x / 2 - x³ / 24`, each step rounded to `float`. */
export const squeeze = (value: number): number => {
    const clamped = clamp(value, -1, 1);
    return f32(f32(clamped / 2) - f32(cube(clamped) / 24));
};
