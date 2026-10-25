/**
 * The weather cycle.
 *
 * `ServerLevel.advanceWeatherCycle` over `WeatherData`, which is the fifth engine system
 * neither edition publishes as data. Three counters and two flags, stepped once a game tick,
 * and that is the whole of why it rains: nothing samples a climate and nothing reads a
 * forecast, a counter runs out and the flag it was holding flips.
 *
 * Written as a function from one state to the next rather than as something that owns a
 * world, because the state is five numbers the host already has to save and send. The host
 * steps it, keeps what comes back, and tells its clients when {@link weatherOf} changed.
 *
 * Rain and thunder are two independent cycles that happen to both read as weather, which is
 * why a thunderstorm always rains: `thundering` is only ever true while `raining` is, and the
 * two counters run down separately. The third counter, `clearWeatherTime`, is the one
 * `/weather clear` sets, and while it is running neither of the other two advances.
 */

import type { Weather } from './world';

/** Java's `WeatherData`: everything a level saves about its weather. */
export interface WeatherState {
    /**
     * Ticks of forced clear weather left.
     *
     * While above zero nothing else moves: both other counters are pinned to one tick and
     * both flags are held false, so the cycle restarts the moment this runs out. Only
     * `/weather clear` and a datapack set it.
     */
    readonly clearWeatherTime: number;
    /** Ticks until {@link raining} flips. */
    readonly rainTime: number;
    /** Ticks until {@link thundering} flips. */
    readonly thunderTime: number;
    /** Whether rain is falling. */
    readonly raining: boolean;
    /** Whether the rain is a thunderstorm. Never true on its own; see the module comment. */
    readonly thundering: boolean;
}

/** A dry world whose first shower is due on the next tick. The state Java starts a level in. */
export const CLEAR_WEATHER: WeatherState = {
    clearWeatherTime: 0,
    rainTime: 0,
    thunderTime: 0,
    raining: false,
    thundering: false
};

/** An inclusive range of ticks, Java's `UniformInt`. */
export interface TickRange {
    readonly min: number;
    readonly max: number;
}

/** How long a dry spell lasts, and what `/weather clear` uses with no duration. 10 to 150 minutes. */
export const RAIN_DELAY: TickRange = { min: 12000, max: 180000 };

/** How long a shower lasts, and what `/weather rain` uses with no duration. 10 to 20 minutes. */
export const RAIN_DURATION: TickRange = { min: 12000, max: 24000 };

/** How long the rain stays plain before a storm is due. 10 to 150 minutes. */
export const THUNDER_DELAY: TickRange = { min: 12000, max: 180000 };

/** How long a storm lasts, and what `/weather thunder` uses with no duration. 3 to 13 minutes. */
export const THUNDER_DURATION: TickRange = { min: 3600, max: 15600 };

/**
 * A draw from an inclusive range, Java's `UniformInt.sample`.
 *
 * @param range - The range, both ends included.
 * @param randomInt - The host's random source, as `WorldAccess.randomInt`: a draw in
 *   `[0, bound)`.
 */
export const sampleTicks = (range: TickRange, randomInt: (bound: number) => number): number =>
    range.min + randomInt(range.max - range.min + 1);

/**
 * Which of the three the state reads as, for the rules that branch on weather rather than on
 * the counters.
 *
 * @returns `thunder` while a storm is overhead, `rain` for plain rain, `clear` otherwise.
 */
export const weatherOf = (state: WeatherState): Weather => {
    if (!state.raining) return 'clear';
    return state.thundering ? 'thunder' : 'rain';
};

/**
 * One game tick of the cycle, Java's `ServerLevel.advanceWeatherCycle`.
 *
 * The three counters run down in order of precedence. A clear spell outranks everything and
 * pins the other two to one tick, so when it ends the next tick flips both. Otherwise each of
 * thunder and rain either counts down - flipping its flag and booking the opposite stretch
 * when it reaches zero - or, if it was already at zero, books its first stretch without
 * flipping anything. That last branch is why a fresh world's weather does not change on tick
 * one: the counters start at zero, and the first tick only decides how long to wait.
 *
 * The caller decides whether to run this at all. Java gates it on the `doWeatherCycle` game
 * rule and on whether the dimension can have weather, and neither is this function's business.
 *
 * @param state - The state at the top of the tick.
 * @param randomInt - The host's random source, used only when a counter has to be booked.
 * @returns The state at the bottom of it. The same object is never returned twice, so a host
 *   can compare {@link weatherOf} before and after to decide whether to tell its clients.
 */
export const advanceWeatherCycle = (state: WeatherState, randomInt: (bound: number) => number): WeatherState => {
    let { clearWeatherTime, rainTime, thunderTime, raining, thundering } = state;

    if (clearWeatherTime > 0) {
        clearWeatherTime -= 1;
        thunderTime = thundering ? 0 : 1;
        rainTime = raining ? 0 : 1;
        thundering = false;
        raining = false;

        return { clearWeatherTime, rainTime, thunderTime, raining, thundering };
    }

    if (thunderTime > 0) {
        thunderTime -= 1;
        if (thunderTime === 0) thundering = !thundering;
    } else {
        thunderTime = sampleTicks(thundering ? THUNDER_DURATION : THUNDER_DELAY, randomInt);
    }

    if (rainTime > 0) {
        rainTime -= 1;
        if (rainTime === 0) raining = !raining;
    } else {
        rainTime = sampleTicks(raining ? RAIN_DURATION : RAIN_DELAY, randomInt);
    }

    return { clearWeatherTime, rainTime, thunderTime, raining, thundering };
};

/**
 * What a player sleeping through the night does to the weather, Java's
 * `ServerLevel.resetWeatherCycle`.
 *
 * Both counters go to zero rather than to a fresh draw, so the next tick books the dry spell
 * that follows. The clear spell is left where it is, which is how `/weather clear 1d` survives
 * a night's sleep.
 */
export const resetWeatherCycle = (state: WeatherState): WeatherState => ({
    ...state,
    rainTime: 0,
    thunderTime: 0,
    raining: false,
    thundering: false
});

/**
 * What `/weather` sets, Java's `MinecraftServer.setWeatherParameters`.
 *
 * One duration covers both counters, which is what makes the command's effect last exactly as
 * long as it says whichever cycle would have moved first.
 *
 * @param clearTime - Ticks of forced clear weather. `/weather rain` and `/weather thunder`
 *   pass 0, which releases the pin.
 * @param weatherTime - Ticks both the rain and the thunder counter are set to.
 * @param raining - Whether it rains for that stretch.
 * @param thundering - Whether the rain is a storm. Java never passes true without `raining`.
 */
export const setWeatherParameters = (
    clearTime: number,
    weatherTime: number,
    raining: boolean,
    thundering: boolean
): WeatherState => ({
    clearWeatherTime: clearTime,
    rainTime: weatherTime,
    thunderTime: weatherTime,
    raining,
    thundering
});

/**
 * The state `/weather <kind> [duration]` asks for, with Java's default duration per kind.
 *
 * `WeatherCommand.getDuration` samples the kind's own range when the command names no
 * duration, which is why `/weather rain` lasts between ten and twenty minutes and
 * `/weather thunder` between three and thirteen. A host wiring the command calls this and
 * hands the result to its world; nothing else about the command belongs here.
 *
 * @param kind - What the command asked for.
 * @param randomInt - The host's random source, used only when `durationTicks` is absent.
 * @param durationTicks - The duration the command named, in ticks.
 * @example
 * ```typescript
 * world.setWeather(weatherCommandState('thunder', (bound) => world.randomInt(bound)));
 * ```
 */
export const weatherCommandState = (
    kind: Weather,
    randomInt: (bound: number) => number,
    durationTicks?: number
): WeatherState => {
    const duration = (range: TickRange): number => durationTicks ?? sampleTicks(range, randomInt);

    if (kind === 'clear') return setWeatherParameters(duration(RAIN_DELAY), 0, false, false);
    if (kind === 'rain') return setWeatherParameters(0, duration(RAIN_DURATION), true, false);
    return setWeatherParameters(0, duration(THUNDER_DURATION), true, true);
};
