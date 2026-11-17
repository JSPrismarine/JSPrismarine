/**
 * Java's `Level.getSkyDarken` for the overworld: how far the sky light has dropped below 15.
 *
 * `Level.updateSkyBrightness` sets it to `(int) (15 - sky_light_level)`, and the environment
 * attribute `minecraft:gameplay/sky_light_level` is the dimension's 15 multiplied by the
 * `minecraft:day` timeline's track, then blended toward 4 by rain and again by thunder in
 * `WeatherAttributes`. The phantom spawner waits for a darkness of 5, which the evening reaches at
 * day time 12687 and a thunderstorm reaches at noon.
 */
import type { Weather } from '@jsprismarine/engine-systems';

import { DAY_LENGTH, timeOfDay } from './DayCycle';

/** The sky light level a dimension without its own writes, `EnvironmentAttributes.SKY_LIGHT_LEVEL`'s default. */
const FULL_SKY_LIGHT = 15;

/**
 * The `minecraft:gameplay/sky_light_level` track of `data/minecraft/timeline/day.json`, a
 * multiplier by day time that interpolates linearly between keyframes and wraps at midnight.
 */
export const DAY_SKY_LIGHT_KEYFRAMES: readonly (readonly [ticks: number, multiplier: number])[] = [
    [133, 1],
    [11_867, 1],
    [13_670, 0.26666668],
    [22_330, 0.26666668]
];

/** The sky light rain and thunder blend toward, `WeatherAttributes`' `FloatWithAlpha(4.0, ...)`. */
const STORM_SKY_LIGHT = 4;

/** How far rain blends the sky light toward {@link STORM_SKY_LIGHT}, at full rain. */
const RAIN_ALPHA = 0.3125;

/** How far thunder blends it on top of the rain, at a full storm. */
const THUNDER_ALPHA = 0.52734375;

/** The day timeline's sky light multiplier at a day time. */
export const daySkyLightMultiplier = (dayTime: number): number => {
    const time = timeOfDay(dayTime);
    const frames = DAY_SKY_LIGHT_KEYFRAMES;
    for (let index = 0; index < frames.length; index += 1) {
        const [startTicks, startValue] = frames[index]!;
        const [nextTicks, nextValue] = frames[(index + 1) % frames.length]!;
        const endTicks = nextTicks > startTicks ? nextTicks : nextTicks + DAY_LENGTH;
        const at = time >= startTicks ? time : time + DAY_LENGTH;
        if (at >= startTicks && at <= endTicks)
            return Math.fround(
                startValue +
                    Math.fround(Math.fround(nextValue - startValue) * ((at - startTicks) / (endTicks - startTicks)))
            );
    }
    return frames[0]![1];
};

/**
 * `Level.getSkyDarken` of the overworld at a day time and weather: 0 at noon, 11 at midnight.
 *
 * @param dayTime - The world's day time in ticks.
 * @param weather - The weather the world reports; Java's rain and thunder levels are full in it.
 */
export const overworldSkyDarken = (dayTime: number, weather: Weather): number => {
    // Java works these out in floats, which is what makes midnight's 15 * 0.26666668 exactly 4.
    let light = Math.fround(FULL_SKY_LIGHT * daySkyLightMultiplier(dayTime));
    if (weather !== 'clear') light = Math.fround(light + Math.fround((STORM_SKY_LIGHT - light) * RAIN_ALPHA));
    if (weather === 'thunder') light = Math.fround(light + Math.fround((STORM_SKY_LIGHT - light) * THUNDER_ALPHA));
    return Math.trunc(Math.fround(FULL_SKY_LIGHT - light));
};
