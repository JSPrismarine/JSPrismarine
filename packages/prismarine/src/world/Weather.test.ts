import { CLEAR_WEATHER, RAIN_DELAY, THUNDER_DURATION } from '@jsprismarine/engine-systems';
import { LevelEvent } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import { WorldWeather, savedWeatherOf } from './Weather';
import type { WeatherWorld } from './Weather';

/** A world that records what went out and always draws the shortest stretch. */
const weatherWorld = (cycleAllowed = true) => {
    const sent: Array<{ event: LevelEvent; data: number }> = [];
    const world: WeatherWorld = {
        cycleAllowed: () => cycleAllowed,
        randomInt: () => 0,
        broadcast: (event, data) => void sent.push({ event, data })
    };

    return { sent, weather: new WorldWeather(world), events: () => sent.map(({ event }) => event) };
};

/** Runs `ticks` game ticks, counting from one. */
const tick = (weather: WorldWeather, ticks: number, from = 1): void => {
    for (let at = from; at < from + ticks; at += 1) weather.tick(at);
};

describe('savedWeatherOf', () => {
    it('reads back the record it was written as', () => {
        const saved = { clearWeatherTime: 1, rainTime: 2, thunderTime: 3, raining: true, thundering: false };

        expect(savedWeatherOf(saved)).toEqual(saved);
    });

    it('refuses anything that is not one, so a hand-edited file cannot stop the cycle', () => {
        expect(savedWeatherOf(undefined)).toBeUndefined();
        expect(savedWeatherOf('raining')).toBeUndefined();
        expect(savedWeatherOf({ raining: true })).toBeUndefined();
        expect(savedWeatherOf({ ...CLEAR_WEATHER, raining: 'yes' })).toBeUndefined();
        expect(savedWeatherOf({ ...CLEAR_WEATHER, rainTime: Number.NaN })).toBeUndefined();
    });

    it('floors a negative counter rather than letting it run away downward', () => {
        expect(savedWeatherOf({ ...CLEAR_WEATHER, rainTime: -5 })?.rainTime).toBe(0);
    });
});

describe('WorldWeather', () => {
    it('starts clear and says nothing while it stays that way', () => {
        const { weather, sent } = weatherWorld();

        tick(weather, 100);

        expect(weather.current()).toBe('clear');
        expect(sent).toEqual([]);
    });

    it('tells everyone the moment the rain starts', () => {
        const { weather, events } = weatherWorld();

        // Every stretch is its shortest here, so the first rain is also a storm: the two
        // counters are both booked on tick one and both run out together.
        tick(weather, RAIN_DELAY.min + 1);

        expect(weather.current()).toBe('thunder');
        expect(events()).toEqual([LevelEvent.START_RAINING, LevelEvent.START_THUNDERSTORM]);
    });

    it('stops the storm before it stops the rain, so no lightning is left over a blue sky', () => {
        const { weather, sent } = weatherWorld();
        weather.set('thunder', 2);
        sent.length = 0;

        tick(weather, 2);

        expect(weather.current()).toBe('clear');
        expect(sent.map(({ event }) => event)).toEqual([LevelEvent.STOP_THUNDERSTORM, LevelEvent.STOP_RAINING]);
    });

    it('repeats itself once a second, which is how a player who just joined is told', () => {
        const { weather, events } = weatherWorld();
        weather.set('rain', 1000);

        tick(weather, 40);

        // One for the command and two more for the two whole seconds that went by.
        expect(events()).toEqual([LevelEvent.START_RAINING, LevelEvent.START_RAINING, LevelEvent.START_RAINING]);
    });

    it('repeats a storm as both of its events, because the client keeps two levels', () => {
        const { weather, sent } = weatherWorld();
        weather.set('thunder', 1000);
        sent.length = 0;

        tick(weather, 20);

        expect(sent.map(({ event }) => event)).toEqual([LevelEvent.START_RAINING, LevelEvent.START_THUNDERSTORM]);
    });

    it('holds the sky still when `doWeatherCycle` is off', () => {
        const { weather, sent } = weatherWorld(false);

        tick(weather, RAIN_DELAY.max + 10);

        expect(weather.current()).toBe('clear');
        expect(sent).toEqual([]);
    });

    it('still answers `/weather` with the cycle off, which is what makes the rule a pause', () => {
        const { weather } = weatherWorld(false);

        weather.set('rain', 100);
        tick(weather, 1000);

        // Frozen where the command put it rather than running out, because nothing advances.
        expect(weather.current()).toBe('rain');
    });

    describe('what a save keeps', () => {
        it('comes back where it left off, counters and all', () => {
            const { weather } = weatherWorld();
            weather.set('thunder');
            tick(weather, 100);
            const saved = weather.saved();

            const { weather: restarted, sent } = weatherWorld();
            restarted.restore(saved);

            expect(restarted.current()).toBe('thunder');
            expect(restarted.saved()).toEqual(saved);
            expect(saved.thunderTime).toBe(THUNDER_DURATION.min - 100);
            // Nothing announced on the way back in: a world being loaded has nobody in it.
            expect(sent).toEqual([]);
        });

        it('runs out at the right moment after a restart rather than starting over', () => {
            const { weather } = weatherWorld();
            weather.set('rain', 50);
            tick(weather, 30);

            const { weather: restarted } = weatherWorld();
            restarted.restore(weather.saved());

            tick(restarted, 19);
            expect(restarted.current()).toBe('rain');

            tick(restarted, 1, 20);
            expect(restarted.current()).toBe('clear');
        });

        it('leaves a fresh world clear when the save holds nothing', () => {
            const { weather } = weatherWorld();

            weather.restore(undefined);

            expect(weather.saved()).toEqual(CLEAR_WEATHER);
        });
    });

    describe('the command seam', () => {
        it('announces at once rather than on the next tick', () => {
            const { weather, events } = weatherWorld();

            weather.set('rain', 100);

            expect(weather.current()).toBe('rain');
            expect(events()).toEqual([LevelEvent.START_RAINING]);
        });

        it('clears a storm it was in', () => {
            const { weather, sent } = weatherWorld();
            weather.set('thunder', 1000);
            sent.length = 0;

            weather.set('clear', 1000);

            expect(weather.current()).toBe('clear');
            expect(sent.map(({ event }) => event)).toEqual([LevelEvent.STOP_THUNDERSTORM, LevelEvent.STOP_RAINING]);
        });

        it('lasts exactly as long as it was told to', () => {
            const { weather } = weatherWorld();
            weather.set('rain', 100);

            tick(weather, 99);
            expect(weather.current()).toBe('rain');

            tick(weather, 1, 100);
            expect(weather.current()).toBe('clear');
        });
    });
});
