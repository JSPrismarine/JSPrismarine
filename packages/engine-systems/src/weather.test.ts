import { describe, expect, it } from 'vitest';

import {
    CLEAR_WEATHER,
    RAIN_DELAY,
    RAIN_DURATION,
    THUNDER_DELAY,
    THUNDER_DURATION,
    advanceWeatherCycle,
    resetWeatherCycle,
    sampleTicks,
    setWeatherParameters,
    weatherCommandState,
    weatherOf
} from './weather';
import type { WeatherState } from './weather';

/** A random source that always draws the lowest value, so every stretch is its shortest. */
const lowest = (): number => 0;

/** A random source that always draws the highest, so every stretch is its longest. */
const highest = (bound: number): number => bound - 1;

/** Runs the cycle `ticks` times and answers where it ended up. */
const after = (state: WeatherState, ticks: number, randomInt = lowest): WeatherState => {
    let current = state;
    for (let tick = 0; tick < ticks; tick += 1) current = advanceWeatherCycle(current, randomInt);
    return current;
};

/** The tick the predicate first held on, counting the first advance as tick one. */
const firstTickWhere = (state: WeatherState, holds: (state: WeatherState) => boolean, limit: number): number => {
    let current = state;
    for (let tick = 1; tick <= limit; tick += 1) {
        current = advanceWeatherCycle(current, lowest);
        if (holds(current)) return tick;
    }
    return -1;
};

describe('weatherOf', () => {
    it('reads thunder, rain and clear off the two flags', () => {
        expect(weatherOf(CLEAR_WEATHER)).toBe('clear');
        expect(weatherOf({ ...CLEAR_WEATHER, raining: true })).toBe('rain');
        expect(weatherOf({ ...CLEAR_WEATHER, raining: true, thundering: true })).toBe('thunder');
    });

    it('reads clear for a thundering flag with no rain under it, which Java never produces', () => {
        expect(weatherOf({ ...CLEAR_WEATHER, thundering: true })).toBe('clear');
    });
});

describe('sampleTicks', () => {
    it("includes both ends of the range, which is Java's UniformInt", () => {
        expect(sampleTicks(RAIN_DURATION, lowest)).toBe(12000);
        expect(sampleTicks(RAIN_DURATION, highest)).toBe(24000);
    });
});

describe('advanceWeatherCycle', () => {
    it('books a dry spell on the first tick rather than changing the weather', () => {
        const booked = advanceWeatherCycle(CLEAR_WEATHER, lowest);

        expect(weatherOf(booked)).toBe('clear');
        expect(booked.rainTime).toBe(RAIN_DELAY.min);
        expect(booked.thunderTime).toBe(THUNDER_DELAY.min);
    });

    it('starts raining when the dry spell runs out, and not before', () => {
        // A thunder counter too long to reach, so the rain that starts is plain rain. With
        // both counters drawing their minimum they would flip together and it would storm.
        const quiet = { ...CLEAR_WEATHER, thunderTime: 1_000_000 };

        // One tick to book the shortest delay, then that many to run it down. The flag flips
        // on the tick the counter reaches zero, which is the last of them.
        expect(weatherOf(after(quiet, RAIN_DELAY.min))).toBe('clear');
        expect(weatherOf(after(quiet, RAIN_DELAY.min + 1))).toBe('rain');
    });

    it('books a shower when the rain starts and stops when it runs out', () => {
        const starting = after({ ...CLEAR_WEATHER, thunderTime: 1_000_000 }, RAIN_DELAY.min + 1);
        expect(starting.rainTime).toBe(0);

        // Zero means "book the next stretch", and since it is now raining the stretch booked
        // is the shower rather than another dry spell.
        const booked = advanceWeatherCycle(starting, lowest);
        expect(booked.rainTime).toBe(RAIN_DURATION.min);

        expect(weatherOf(after(booked, RAIN_DURATION.min - 1))).toBe('rain');
        expect(weatherOf(after(booked, RAIN_DURATION.min))).toBe('clear');
    });

    it('runs the thunder counter beside the rain one rather than inside it', () => {
        // Both are booked on the same first tick and both are the same shortest delay here,
        // so they flip together and the first rain is a storm. With real draws they diverge,
        // which is what makes most rain plain.
        const storm = firstTickWhere(CLEAR_WEATHER, (state) => state.thundering, RAIN_DELAY.min + 2);

        expect(storm).toBe(THUNDER_DELAY.min + 1);
        expect(weatherOf(after(CLEAR_WEATHER, storm))).toBe('thunder');
    });

    it('lets the thundering flag come up on its own and still reads it as clear', () => {
        // The two counters are independent, so Java does reach a state with the thundering
        // flag set and no rain under it. `getThunderLevel` multiplies by the rain level, so
        // that state is clear everywhere it matters, which is what `weatherOf` answers.
        //
        // Six minutes of thunder over a dry spell long enough to outlast it.
        const quiet = { ...CLEAR_WEATHER, rainTime: 100_000, thunderTime: 7200 };

        const storming = after(quiet, 7200);

        expect(storming.thundering).toBe(true);
        expect(storming.raining).toBe(false);
        expect(weatherOf(storming)).toBe('clear');
    });

    it('holds the invariant across a long randomized run', () => {
        let state = CLEAR_WEATHER;
        let seed = 1;
        let stormed = 0;
        for (let tick = 0; tick < 300_000; tick += 1) {
            // A plain congruential source, so the two cycles fall out of step the way real
            // draws make them rather than marching in lockstep.
            state = advanceWeatherCycle(state, (bound) => {
                seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
                return (seed >>> 1) % bound;
            });
            if (weatherOf(state) === 'thunder') {
                stormed += 1;
                expect(state.raining).toBe(true);
            }
        }

        expect(stormed).toBeGreaterThan(0);
    });

    it('pins both counters and holds the sky clear while a clear spell runs', () => {
        const forced = setWeatherParameters(100, 0, false, false);

        const held = after(forced, 99);
        expect(held.clearWeatherTime).toBe(1);
        expect(weatherOf(held)).toBe('clear');
        // Pinned to one rather than to zero, so the tick after the spell ends flips them both
        // instead of booking a fresh wait.
        expect(held.rainTime).toBe(1);
        expect(held.thunderTime).toBe(1);
    });

    it('lets the rain back in the moment a clear spell ends', () => {
        const forced = setWeatherParameters(1, 0, false, false);

        const ended = after(forced, 1);
        expect(ended.clearWeatherTime).toBe(0);

        expect(weatherOf(advanceWeatherCycle(ended, lowest))).toBe('thunder');
    });

    it('stops a storm it was already in when a clear spell is forced over it', () => {
        const stormy = setWeatherParameters(0, 500, true, true);
        const forced = { ...stormy, clearWeatherTime: 50 };

        expect(weatherOf(advanceWeatherCycle(forced, lowest))).toBe('clear');
    });
});

describe('resetWeatherCycle', () => {
    it("clears the sky a night's sleep ends, and books the dry spell that follows", () => {
        const stormy = setWeatherParameters(0, 500, true, true);

        const slept = resetWeatherCycle(stormy);

        expect(weatherOf(slept)).toBe('clear');
        expect(advanceWeatherCycle(slept, lowest).rainTime).toBe(RAIN_DELAY.min);
    });

    it('leaves a forced clear spell running, so `/weather clear 1d` survives the night', () => {
        expect(resetWeatherCycle(setWeatherParameters(24000, 0, false, false)).clearWeatherTime).toBe(24000);
    });
});

describe('weatherCommandState', () => {
    it("gives each kind Java's own default duration", () => {
        expect(weatherCommandState('clear', lowest)).toEqual({
            clearWeatherTime: RAIN_DELAY.min,
            rainTime: 0,
            thunderTime: 0,
            raining: false,
            thundering: false
        });
        expect(weatherCommandState('rain', lowest).rainTime).toBe(RAIN_DURATION.min);
        expect(weatherCommandState('thunder', lowest).thunderTime).toBe(THUNDER_DURATION.min);
    });

    it('uses the duration the command named instead', () => {
        expect(weatherCommandState('rain', lowest, 300)).toEqual({
            clearWeatherTime: 0,
            rainTime: 300,
            thunderTime: 300,
            raining: true,
            thundering: false
        });
    });

    it('makes thunder rain too, because a storm is rain with lightning in it', () => {
        const storm = weatherCommandState('thunder', lowest, 300);

        expect(storm.raining).toBe(true);
        expect(weatherOf(storm)).toBe('thunder');
    });

    it('releases the pin when it asks for weather, so the rain can actually start', () => {
        expect(weatherCommandState('rain', lowest, 300).clearWeatherTime).toBe(0);
    });

    it('lasts as long as it says', () => {
        const rain = weatherCommandState('rain', lowest, 300);

        expect(weatherOf(after(rain, 299))).toBe('rain');
        expect(weatherOf(after(rain, 300))).toBe('clear');
    });
});
