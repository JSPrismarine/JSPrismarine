import { describe, expect, it } from 'vitest';

import type { ChatSendIntent, Guard } from '@jsprismarine/script-host/host/world';

import type { PlayerChatGuard } from '../chat/ChatManager';
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
        chat: { addGuard: () => () => {} },
        clock: () => 0,
        ...overrides
    });
    return { world, weather };
};

describe('LevelScriptWorld', () => {
    it("runs a script guard on the chat of the level's players only, by their script ids", () => {
        const guards: PlayerChatGuard[] = [];
        const { world } = scriptWorld({
            chat: {
                addGuard: (guard) => {
                    guards.push(guard);
                    return () => void guards.splice(guards.indexOf(guard), 1);
                }
            },
            players: () => [{ id: '7', sendMessage: () => {} }]
        });
        const seen: unknown[] = [];
        const remove = world.guardChat((intent) => {
            seen.push(intent);
            return { veto: true };
        });
        const [guard] = guards;
        if (guard === undefined) throw new Error('no chat guard was added');

        expect(guard({ sender: 7n, message: 'mine' })).toEqual({ veto: true });
        expect(guard({ sender: 9n, message: 'elsewhere' })).toEqual({
            veto: false,
            intent: { sender: 9n, message: 'elsewhere' }
        });
        expect(seen).toEqual([{ sender: '7', message: 'mine' }]);
        remove();
        expect(guards).toEqual([]);
    });

    it('takes a chat guard that can only veto, as a script cannot change the line', () => {
        const guards: PlayerChatGuard[] = [];
        const { world } = scriptWorld({
            players: () => [{ id: '7', sendMessage: () => {} }],
            chat: {
                addGuard: (guard) => {
                    guards.push(guard);
                    return () => {};
                }
            }
        });
        const replacing: Guard<ChatSendIntent> = (intent) => ({ veto: false, intent: { ...intent, message: 'x' } });
        // @ts-expect-error ChatSendBeforeEvent's message is read-only, so a chat guard has no intent to hand back.
        world.guardChat(replacing);
        const [guard] = guards;
        if (guard === undefined) throw new Error('no chat guard was added');

        expect(guard({ sender: 7n, message: 'mine' })).toEqual({
            veto: false,
            intent: { sender: 7n, message: 'mine' }
        });
    });

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
