/**
 * The world as the loot and predicate grammar reads one.
 *
 * `LevelView` is the seam `@jsprismarine/predicates` leaves for the host:
 * the conditions that ask about the world rather than about the thing that
 * died or broke - `time_check`, `weather_check`, `location_check` - read it,
 * and a roll made without one reports that no level is bound and evaluates
 * them false. Both loot callers used to pass none, so those conditions could
 * not be reached at all.
 *
 * Every member is optional by design, and this view implements the two the
 * server can answer truthfully today. The rest are left out deliberately:
 *
 * - **Blocks, fluids and biomes.** The chunks hold Bedrock-named states and
 *   the predicates compare Java names, and `@jsprismarine/mapping` only
 *   translates the other way. Answering with a Bedrock name would make
 *   `location_check` say "not tall grass" about tall grass, which is worse
 *   than saying nothing.
 * - **Weather, sky and light.** No rain, thunder or sky-visibility state
 *   exists on a world yet, and light is per-chunk rather than per-position.
 */
import type { LevelView } from '@jsprismarine/predicates';

/** The little of a world {@link lootLevelOf} reads, so a test satisfies it without building one. */
export interface LootLevelWorld {
    /** Ticks since the world started, which is the clock a `time_check` period is applied to. */
    getTicks(): number;
    /** The dimension this world is, by the identifier a `location_check` compares. */
    getDimension(): { readonly name: string };
}

/**
 * The level view for one world.
 *
 * @param world - The world the roll happens in.
 * @returns The view, reading through to the world on every call rather than
 *   snapshotting it, because a roll may happen ticks after the view is made.
 */
export const lootLevelOf = (world: LootLevelWorld): LevelView => ({
    clockTicks: () => world.getTicks(),
    dimension: () => world.getDimension().name
});
