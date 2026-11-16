import type { RandomSource } from './filterContext';

/** A uniform draw in `[0, bound)`, from the source's own integer draw when it has one. */
export const nextInt = (random: RandomSource, bound: number): number =>
    Math.min(bound - 1, Math.max(0, random.nextInt?.(bound) ?? Math.floor(random.next() * bound)));
