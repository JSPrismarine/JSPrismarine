/**
 * What time of day it is.
 *
 * One definition, because two things now care and they must agree: the spawner only lets monsters
 * appear at night, and the undead catch fire in the morning. Two copies of these numbers would let
 * a zombie spawn into a world that was about to set it alight.
 *
 * The figures are vanilla's clock: a day is twenty-four thousand ticks, the sun sets at thirteen
 * thousand and rises again at twenty-three.
 * @see https://minecraft.wiki/w/Daylight_cycle
 */

/** Ticks in a full day. */
export const DAY_LENGTH = 24000;

/** When the sun goes down, and when it comes back up. */
export const NIGHT_START = 13000;
export const NIGHT_END = 23000;

/**
 * The time of day, as a tick between nought and {@link DAY_LENGTH}.
 *
 * The double modulo is not redundant: a world's clock can be set backwards, and `%` on a negative
 * number is negative in JavaScript - which would put a world at dusk into an hour that does not
 * exist.
 * @param {number} ticks - The world's clock.
 * @returns {number} Where in the day it is.
 */
export const timeOfDay = (ticks: number): number => ((ticks % DAY_LENGTH) + DAY_LENGTH) % DAY_LENGTH;

/**
 * Whether it is dark out.
 * @param {number} ticks - The world's clock.
 * @returns {boolean} `true` between dusk and dawn.
 */
export const isNight = (ticks: number): boolean => {
    const time = timeOfDay(ticks);

    return time >= NIGHT_START && time <= NIGHT_END;
};

/**
 * Whether the sun is up, and therefore whether the undead are in trouble.
 * @param {number} ticks - The world's clock.
 * @returns {boolean} `true` between dawn and dusk.
 */
export const isDay = (ticks: number): boolean => !isNight(ticks);
