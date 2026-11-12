import type { PlainRecord } from './PlainData';

/** A shape checked to be plain data where it is declared. */
type Plain<Shape extends PlainRecord> = Shape;

/**
 * What a world's own clocks and the work it has in flight were as a tick sealed: the part of the
 * replay digest that no entry of the change log carries
 * ([ADR 0012](../../../../../docs/adr/0012-the-change-log-is-the-history.md)).
 *
 * Each of these moves every tick whether or not anything was written, so an entry for each would
 * break the rule that an idle world appends nothing. The sealed tick carries them once instead,
 * which is how a snapshot plus the log reaches a later tick's digest without running the tick.
 *
 * - The level clock, the weather cycle and the random tick generator advance on every tick.
 * - The game rules belong to the level, which every world of it shares, so no one world's log owns
 *   a change to them.
 * - The light queue is work derived from block writes, and only a tick drains it.
 * - The chunk loads in flight are requests whose completions arrive as inputs
 *   ([ADR 0009](../../../../../docs/adr/0009-external-inputs-enter-once-per-tick.md)).
 */
export type TickHeader = Plain<{
    /** The level clock, as `World.getTicks` reads it. */
    readonly tick: number;
    /** The level's weather, as a save holds it. */
    readonly weather: Plain<{
        readonly clearWeatherTime: number;
        readonly rainTime: number;
        readonly thunderTime: number;
        readonly raining: boolean;
        readonly thundering: boolean;
    }>;
    /** Every game rule, as its name, its value and whether it can be edited. */
    readonly gameRules: readonly (readonly [string, readonly [boolean | number, boolean]])[];
    /** Each chunk load in flight, as its packed position and its urgency, by position. */
    readonly pendingChunkLoads: readonly (readonly [number, string])[];
    /** The state of the generator that draws random tick positions. */
    readonly randomTickState: number;
    /** How deep the light queue is. */
    readonly pendingLighting: Plain<{ readonly queued: number; readonly deferred: number }>;
}>;
