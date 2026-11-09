/**
 * The value at a fraction of an ascending sample, by nearest rank.
 * @param {readonly number[]} sorted - Samples in ascending order.
 * @param {number} fraction - Where to read, from 0 to 1; 0.5 is the median.
 * @returns {number} The sample at that rank, or 0 for an empty sample.
 */
export const percentile = (sorted: readonly number[], fraction: number): number =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))] ?? 0;
