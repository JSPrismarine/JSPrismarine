import { describe, expect, it } from 'vitest';

import { fakeLevel } from '../testing/level';
import { LevelScriptWorld } from './LevelScriptWorld';
import type { ScriptWorldSources } from './LevelScriptWorld';

/** A level's script world over a test level's real weather. */
const scriptWorld = (overrides: Partial<ScriptWorldSources> = {}) => {
    const weather = fakeLevel().getWeather();
    const world = new LevelScriptWorld({
        dimensions: () => ['minecraft:overworld'],
        players: () => [],
        weather,
        clock: () => 0,
        ...overrides
    });
    return { world, weather };
};

describe('LevelScriptWorld', () => {
    it('runs a script guard in the level’s weather action, in the Script API’s names', () => {
        const { world, weather } = scriptWorld();
        const seen: unknown[] = [];
        world.guardWeather((intent) => {
            seen.push(intent);
            return intent.newWeather === 'Thunder'
                ? { veto: true }
                : { veto: false, intent: { ...intent, duration: 77 } };
        });

        world.setWeather('minecraft:overworld', 'Thunder', 600);
        world.setWeather('minecraft:overworld', 'Rain', 600);

        expect(seen).toEqual([
            { dimension: 'minecraft:overworld', previousWeather: 'Clear', newWeather: 'Thunder', duration: 600 },
            { dimension: 'minecraft:overworld', previousWeather: 'Clear', newWeather: 'Rain', duration: 600 }
        ]);
        expect(weather.current()).toBe('rain');
        expect(weather.saved().rainTime).toBe(77);
    });

    it('hands the scripts each weather change once, whatever made it', () => {
        const { world, weather } = scriptWorld();

        weather.set('rain', 100);
        world.setWeather('minecraft:nether', 'Clear', 100);

        expect(world.takeEvents()).toEqual([
            { type: 'weatherChange', dimension: 'minecraft:overworld', previousWeather: 'Clear', newWeather: 'Rain' },
            { type: 'weatherChange', dimension: 'minecraft:overworld', previousWeather: 'Rain', newWeather: 'Clear' }
        ]);
        expect(world.takeEvents()).toEqual([]);
        world.close();
        weather.set('thunder', 100);
        expect(world.takeEvents()).toEqual([]);
    });

    it('sends a message to every player of the level', () => {
        const received: string[] = [];
        const { world } = scriptWorld({
            players: () => [
                { id: '1', sendMessage: (message) => received.push(`1 ${message}`) },
                { id: '2', sendMessage: (message) => received.push(`2 ${message}`) }
            ]
        });

        world.sendMessage('hello');

        expect(world.players()).toEqual(['1', '2']);
        expect(received).toEqual(['1 hello', '2 hello']);
    });
});
