import type { RandomSource } from './RandomSource';

/**
 * The Marsaglia polar method Java Edition uses for `nextGaussian`.
 *
 * It produces two values per rejection loop and hands out the second on the following call, so
 * the number of `nextDouble` draws a caller consumes depends on how many calls came before.
 */
export class MarsagliaPolarGaussian {
    private nextNextGaussian = 0;
    private haveNextNextGaussian = false;

    public constructor(private readonly randomSource: RandomSource) {}

    /** Forgets the cached second value, as Java does when a source is reseeded. */
    public reset(): void {
        this.haveNextNextGaussian = false;
    }

    /** Returns the next normally distributed value with mean 0 and standard deviation 1. */
    public nextGaussian(): number {
        if (this.haveNextNextGaussian) {
            this.haveNextNextGaussian = false;
            return this.nextNextGaussian;
        }

        let x: number;
        let y: number;
        let radiusSquared: number;
        do {
            x = 2 * this.randomSource.nextDouble() - 1;
            y = 2 * this.randomSource.nextDouble() - 1;
            radiusSquared = x * x + y * y;
        } while (radiusSquared >= 1 || radiusSquared === 0);

        const multiplier = Math.sqrt((-2 * Math.log(radiusSquared)) / radiusSquared);
        this.nextNextGaussian = y * multiplier;
        this.haveNextNextGaussian = true;
        return x * multiplier;
    }
}
