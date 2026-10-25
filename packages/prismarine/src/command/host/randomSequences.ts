/**
 * The named random sequences `/random` draws from.
 *
 * Java keeps one `RandomSequence` per id, each a Xoroshiro128++ stream seeded
 * from the world seed exclusive-ored with the MD5 hash of the id. That is the
 * same construction `@jsprismarine/loot` already reproduces bit for bit for a
 * loot table's `random_sequence`, so this reuses it rather than writing a
 * second generator: `/random value 1..6 my:dice` and a loot table naming
 * `my:dice` draw from one stream, which is what Java does.
 *
 * A sequence advances as it is drawn from, so two draws differ; two worlds
 * with the same seed draw the same numbers. Java saves the advanced state
 * with the world and this does not, so a restart replays from the beginning.
 */
import { lootSequenceRandom } from '@jsprismarine/loot';
import type { RandomSource } from '@jsprismarine/predicates';

/** The id `/random reset` means "every sequence" by. */
const ALL_SEQUENCES = '*';

/** One stream per sequence id, plus the unkeyed one a draw without an id uses. */
export class RandomSequences {
    private readonly streams = new Map<string, RandomSource>();

    private unkeyed: RandomSource | undefined;

    /**
     * @param worldSeed - Read rather than held, because the default world is
     *   loaded after the host is built.
     */
    public constructor(private readonly worldSeed: () => bigint) {}

    /**
     * Draws one value, inclusive of both ends.
     *
     * @returns A value in `[min, max]`, or `min` when the range is empty,
     *   which is how `/random value 5..1` answers rather than throwing.
     */
    public draw(min: number, max: number, sequence?: string): number {
        const low = Math.trunc(min);
        const span = Math.trunc(max) - low + 1;
        if (span <= 1) return low;
        return low + this.streamFor(sequence).nextInt(span);
    }

    /**
     * Drops a sequence so its next draw starts over.
     *
     * @param sequence - One id, or `*` for every sequence at once.
     * @param seed - Replaces the world seed the stream is keyed from, which is
     *   what makes a draw reproducible across worlds.
     * @returns Whether anything was reset. Resetting a sequence nobody has
     *   drawn from yet still counts, because the next draw does start over.
     */
    public reset(sequence: string, seed?: number): boolean {
        if (sequence === ALL_SEQUENCES) {
            this.streams.clear();
            this.unkeyed = undefined;
            return true;
        }

        if (seed === undefined) {
            this.streams.delete(sequence);
            return true;
        }

        this.streams.set(sequence, lootSequenceRandom(BigInt(Math.trunc(seed)), sequence));
        return true;
    }

    private streamFor(sequence: string | undefined): RandomSource {
        if (sequence === undefined) {
            this.unkeyed ??= lootSequenceRandom(this.worldSeed());
            return this.unkeyed;
        }

        const existing = this.streams.get(sequence);
        if (existing) return existing;

        const created = lootSequenceRandom(this.worldSeed(), sequence);
        this.streams.set(sequence, created);
        return created;
    }
}
