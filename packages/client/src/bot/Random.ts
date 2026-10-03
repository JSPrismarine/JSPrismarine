/**
 * A small, seeded pseudo-random generator.
 *
 * `Math.random()` cannot be seeded, and a load run that cannot be repeated is not a
 * measurement: two runs against the same server have to differ because the *server*
 * behaved differently, not because the bots decided to walk somewhere else. Every choice a
 * behaviour makes comes from here.
 *
 * Mulberry32 - thirty-two bits of state, a handful of operations, and a period long enough
 * that a bot would have to run for weeks to notice it. The point is reproducibility, not
 * cryptography, and nothing here should ever be used for the latter.
 * @see https://github.com/bryc/code/blob/master/jshash/PRNGs.md
 */
export default class Random {
    private state: number;

    public constructor(seed: number) {
        // Zero is a fixed point for the mixing below, so a seed of 0 would return the same
        // value for ever. Fold it away rather than documenting a footgun.
        this.state = (seed | 0) === 0 ? 0x9e3779b9 : seed | 0;
    }

    /**
     * A generator for one bot in a fleet, derived from the fleet's seed and the bot's index.
     *
     * Derived rather than shared: one generator handed to five hundred bots would have them
     * take turns drawing from a single sequence, so what each bot did would depend on how
     * the others were scheduled - which is exactly the non-determinism the seed exists to
     * remove.
     */
    public static forMember(seed: number, index: number): Random {
        // Golden-ratio stride, so adjacent indices land far apart in the state space rather
        // than producing near-identical opening sequences.
        return new Random((seed + index * 0x9e3779b9) | 0);
    }

    /** A float in [0, 1). */
    public next(): number {
        this.state = (this.state + 0x6d2b79f5) | 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    }

    /** An integer in [min, max]. */
    public nextInt(min: number, max: number): number {
        return min + Math.floor(this.next() * (max - min + 1));
    }

    /** A float in [min, max). */
    public nextFloat(min: number, max: number): number {
        return min + this.next() * (max - min);
    }

    public nextBoolean(probability = 0.5): boolean {
        return this.next() < probability;
    }

    public pick<T>(items: readonly T[]): T {
        if (items.length === 0) throw new Error('Cannot pick from an empty list');

        return items[this.nextInt(0, items.length - 1)]!;
    }
}
