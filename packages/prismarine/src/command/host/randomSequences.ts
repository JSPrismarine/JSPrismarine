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
import type { LootRandomState, StatefulLootRandomSource } from '@jsprismarine/loot';

/** Seed and continuation state for one command sequence. */
export type RandomSequenceStreamState = readonly [seed: string, state: LootRandomState];

/** JSON-safe state for `/random`'s named and unkeyed streams. */
export interface RandomSequencesState {
    readonly version: 1;
    readonly worldSeed: string;
    readonly unkeyed: RandomSequenceStreamState | null;
    readonly streams: readonly (readonly [sequence: string, stream: RandomSequenceStreamState])[];
}

/** The id `/random reset` means "every sequence" by. */
const ALL_SEQUENCES = '*';

/** One stream per sequence id, plus the unkeyed one a draw without an id uses. */
export class RandomSequences {
    private readonly streams = new Map<string, { readonly seed: bigint; readonly random: StatefulLootRandomSource }>();

    private unkeyed: { readonly seed: bigint; readonly random: StatefulLootRandomSource } | undefined;

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

        const worldSeed = BigInt(Math.trunc(seed));
        this.streams.set(sequence, { seed: worldSeed, random: lootSequenceRandom(worldSeed, sequence) });
        return true;
    }

    /** Captures the streams that have advanced, along with any explicit reset seeds. */
    public saveState(): RandomSequencesState {
        return {
            version: 1,
            worldSeed: this.worldSeed().toString(),
            unkeyed:
                this.unkeyed === undefined ? null : [this.unkeyed.seed.toString(), this.unkeyed.random.saveState()],
            streams: [...this.streams]
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([sequence, stream]) => [sequence, [stream.seed.toString(), stream.random.saveState()] as const])
        };
    }

    /** Restores command streams only when they belong to the same default world seed. */
    public restoreState(state: unknown): void {
        if (
            typeof state !== 'object' ||
            state === null ||
            !('version' in state) ||
            !('worldSeed' in state) ||
            !('unkeyed' in state) ||
            !('streams' in state) ||
            state.version !== 1 ||
            typeof state.worldSeed !== 'string' ||
            state.worldSeed !== this.worldSeed().toString() ||
            !Array.isArray(state.streams)
        ) {
            throw new TypeError('Invalid command random sequence state');
        }

        const unkeyed = state.unkeyed === null ? undefined : streamOf(state.unkeyed, undefined);
        const streams = new Map<string, { readonly seed: bigint; readonly random: StatefulLootRandomSource }>();
        for (const entry of state.streams) {
            if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || entry[0].length === 0) {
                throw new TypeError('Invalid named command random sequence state');
            }
            if (streams.has(entry[0])) throw new TypeError(`Duplicate command random sequence state: ${entry[0]}`);
            streams.set(entry[0], streamOf(entry[1], entry[0]));
        }

        this.unkeyed = unkeyed;
        this.streams.clear();
        for (const [sequence, stream] of streams) this.streams.set(sequence, stream);
    }

    private streamFor(sequence: string | undefined): RandomSource {
        if (sequence === undefined) {
            if (this.unkeyed === undefined) {
                const seed = this.worldSeed();
                this.unkeyed = { seed, random: lootSequenceRandom(seed) };
            }
            return this.unkeyed.random;
        }

        const existing = this.streams.get(sequence);
        if (existing) return existing.random;

        const seed = this.worldSeed();
        const created = { seed, random: lootSequenceRandom(seed, sequence) };
        this.streams.set(sequence, created);
        return created.random;
    }
}

/** Builds one stream from a saved seed and state without consuming a draw. */
const streamOf = (
    value: unknown,
    sequence: string | undefined
): { readonly seed: bigint; readonly random: StatefulLootRandomSource } => {
    if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== 'string') {
        throw new TypeError(`Invalid${sequence === undefined ? '' : ` ${sequence}`} random stream state`);
    }
    if (!/^(0|-?[1-9]\d*)$/.test(value[0])) throw new TypeError('Invalid random sequence seed');
    const seed = BigInt(value[0]);
    const random = lootSequenceRandom(seed, sequence);
    random.restoreState(value[1]);
    return { seed, random };
};
