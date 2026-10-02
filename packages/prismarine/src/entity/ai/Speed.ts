/**
 * How fast things move, and how often they bother, in one place.
 *
 * The numbers and the ratios between them are taken from the vanilla Bedrock behaviour packs rather
 * than chosen, because the thing being matched is a feel rather than a figure - a cow that moves at
 * a plausible speed but sets off four times as often as a real one still reads as wrong.
 *
 * Speeds are written in blocks per second, since that is the unit anyone can judge: a player walks
 * at 4.317 and sprints at 5.6. The engine wants blocks per tick, which is a twentieth of that and
 * turns each of these into a small indistinguishable decimal - which is how a mob ends up at twice
 * the intended speed without anyone noticing in review.
 * @see https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitygoals/minecraftbehavior_random_stroll
 * @see https://github.com/Mojang/bedrock-samples/tree/main/behavior_pack/entities/cow.json
 */

/** Server ticks per second. */
export const TICKS_PER_SECOND = 20;

/** A speed in blocks per second, as the blocks per tick the movement model wants. */
export const blocksPerSecond = (speed: number): number => speed / TICKS_PER_SECOND;

/**
 * A mob's base movement, before a goal's multiplier.
 *
 * Vanilla's cow carries `"minecraft:movement": { "value": 0.25 }`, which is in units of its own and
 * does not convert to blocks per second by any published factor - the naive reading of it comes out
 * at more than twice a sprinting player. So this is set by eye against the one reference everybody
 * shares: clearly slower than a walking player, which is what an animal ambling about looks like.
 */
export const WALK_SPEED = blocksPerSecond(2.4);

/**
 * Goal speed multipliers, straight from the vanilla behaviour packs.
 *
 * A cow strolls at `speed_multiplier: 0.8` and panics at `1.25`, so wandering is deliberately
 * slower than the mob's own pace and only fear makes it hurry. Keeping them as multipliers rather
 * than as absolute speeds is what preserves the relationship when the base is tuned.
 */
export const STROLL_MULTIPLIER = 0.8;
export const CHASE_MULTIPLIER = 1.15;
export const PANIC_MULTIPLIER = 1.25;

/**
 * How the vanilla goals decide when to run, as a chance per tick.
 *
 * `random_stroll` has `interval: 120`, documented as "a 1/interval chance to choose this goal" -
 * rolled every tick, so the wait between strolls is geometric with a mean of six seconds and a long
 * tail. That distribution is the point: a mob sometimes sets off at once and sometimes stands for
 * half a minute, and a fixed or uniform pause instead makes a field of animals visibly pulse.
 */
export const STROLL_CHANCE = 1 / 120;

/** How far a stroll goes: `xz_dist` and `y_dist` of vanilla's `random_stroll`. */
export const STROLL_RANGE = 10;
export const STROLL_HEIGHT = 7;

/**
 * `look_at_player`, from the cow: `look_distance: 6.0`, `probability: 0.02`.
 *
 * Two percent a tick, not "whenever somebody is nearby". A mob that tracks you continuously the
 * moment you come into range is most of what makes a herd look mechanical - real ones glance up,
 * watch for a moment, and go back to ignoring you.
 */
export const LOOK_CHANCE = 0.02;
export const LOOK_DISTANCE = 6;

/** `random_look_around`, which is what an idle mob does with its head the rest of the time. */
export const LOOK_AROUND_CHANCE = 1 / 60;
