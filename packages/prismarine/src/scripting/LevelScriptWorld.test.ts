import { describe, expect, it } from 'vitest';

import type { ChatSendIntent, Guard } from '@jsprismarine/script-host/host/world';

import type { PlayerChatGuard } from '../chat/ChatManager';
import { fakeLevel } from '../testing/level';
import { LevelScriptWorld, NO_LEVEL_ACCESS } from './LevelScriptWorld';
import type { ScriptWorldSources } from './LevelScriptWorld';
import type { ScriptEntityEvent } from './scriptEntityEvents';

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

    it("commits a chatSend for a line of the level's players that went out", () => {
        const listeners: ((intent: { sender: bigint; message: string }) => void)[] = [];
        const { world } = scriptWorld({
            players: () => [{ id: '7', sendMessage: () => {} }],
            chat: {
                addGuard: () => () => {},
                onSent: (listener) => {
                    listeners.push(listener);
                    return () => {};
                }
            }
        });
        world.takeEvents();
        for (const listener of listeners) {
            listener({ sender: 7n, message: 'mine' });
            listener({ sender: 9n, message: 'elsewhere' });
        }

        expect(world.takeEvents()).toEqual([{ type: 'chatSend', sender: '7', message: 'mine' }]);
    });

    it('tells a player who leaves during a script flush as gone in the next flush, and one who left before it at once', () => {
        let present = [
            { id: '1', name: 'Early', sendMessage: () => {} },
            { id: '2', name: 'During', sendMessage: () => {} }
        ];
        const { world } = scriptWorld({ players: () => present });
        world.takeEvents();

        present = present.filter((player) => player.id !== '1');
        world.beginFlush();
        const atStart = world.takeEvents();
        present = [];
        const during = world.takeEvents();
        world.endFlush();
        world.beginFlush();
        const next = world.takeEvents();
        world.endFlush();

        expect(atStart).toEqual([{ type: 'playerLeave', playerId: '1', playerName: 'Early' }]);
        expect(during).toEqual([]);
        expect(next).toEqual([{ type: 'playerLeave', playerId: '2', playerName: 'During' }]);
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

    it("sends a script's form to the player it names, and hands back the answers once", () => {
        const sent: string[] = [];
        const { world } = scriptWorld({
            players: () => [
                {
                    id: '1',
                    sendMessage: () => {},
                    showForm: (formId, json) => sent.push(`1 form ${formId} ${json}`),
                    closeForms: () => sent.push('1 closed')
                },
                { id: '2', sendMessage: () => {} }
            ]
        });

        world.forms.show('1', 3, '{}\n');
        world.forms.show('2', 4, '{}\n');
        world.forms.closeAll('1');
        world.answerForm({ player: '1', formId: 3, response: '0', cancelReason: null });

        expect(sent).toEqual(['1 form 3 {}\n', '1 closed']);
        expect(world.forms.takeResponses()).toEqual([{ player: '1', formId: 3, response: '0', cancelReason: null }]);
        expect(world.forms.takeResponses()).toEqual([]);
    });

    it('tells the scripts of a player joining and leaving, once each, at the next take', () => {
        let online = [{ id: '7', name: 'Alex', sendMessage: () => {} }];
        const { world } = scriptWorld({ players: () => online });

        expect(world.takeEvents()).toEqual([
            { type: 'playerJoin', playerId: '7', playerName: 'Alex' },
            { type: 'playerSpawn', playerId: '7', initialSpawn: true }
        ]);
        expect(world.takeEvents()).toEqual([]);
        online = [];
        expect(world.takeEvents()).toEqual([{ type: 'playerLeave', playerId: '7', playerName: 'Alex' }]);
    });

    it('calls a leave watcher only for a player the scripts were told of', () => {
        const listeners: ((player: string) => void)[] = [];
        const { world } = scriptWorld({
            players: () => [{ id: '7', name: 'Alex', sendMessage: () => {} }],
            onPlayerLeaving: (listener) => {
                listeners.push(listener);
                return () => {};
            }
        });
        const left: string[] = [];
        world.watchPlayerLeave((player) => left.push(player));
        world.takeEvents();
        for (const listener of listeners) {
            listener('7');
            listener('9');
        }

        expect(left).toEqual(['7']);
    });

    it('answers /scriptevent itself and passes every other command on', () => {
        const ran: string[] = [];
        const { world } = scriptWorld({
            access: {
                ...NO_LEVEL_ACCESS,
                runCommand: (command) => {
                    ran.push(command);
                    return { successCount: 1 };
                }
            }
        });

        expect(world.runCommand('scriptevent jsp:hello hi there', { dimension: 'minecraft:overworld' })).toEqual({
            successCount: 1
        });
        expect(world.runCommand('scriptevent hello hi', { dimension: 'minecraft:overworld' })).toEqual({
            successCount: 0
        });
        expect(world.runCommand('scriptevent minecraft:hello', { entity: '7' })).toEqual({ successCount: 0 });
        expect(world.runCommand('say hi', { entity: '7' })).toEqual({ successCount: 1 });
        expect(ran).toEqual(['say hi']);
        expect(world.takeEvents()).toEqual([
            { type: 'scriptEvent', id: 'jsp:hello', message: 'hi there', sourceType: 'Server' }
        ]);
    });

    it('raises scriptEventReceive for a /scriptevent from the console or a player', () => {
        const { world } = scriptWorld();

        expect(world.scriptEvent('jsp:console', 'two  spaces')).toBe(true);
        expect(world.scriptEvent('jsp:player', '', '7')).toBe(true);
        expect(world.scriptEvent('minecraft:refused', 'x')).toBe(false);
        expect(world.takeEvents()).toEqual([
            { type: 'scriptEvent', id: 'jsp:console', message: 'two  spaces', sourceType: 'Server' },
            { type: 'scriptEvent', id: 'jsp:player', message: '', sourceType: 'Entity', sourceEntity: '7' }
        ]);
    });

    it("hands the scripts a flush's entity events as BDS does: spawns, then blows, then deaths", () => {
        const listeners: ((event: ScriptEntityEvent) => void)[] = [];
        const { world } = scriptWorld({
            entityEvents: (listener) => {
                listeners.push(listener);
                return () => void listeners.splice(listeners.indexOf(listener), 1);
            }
        });
        const pig = { id: '3', typeId: 'minecraft:pig' };
        const fall = { cause: 'fall' };
        const raise = (event: ScriptEntityEvent) => {
            for (const listener of listeners) listener(event);
        };
        raise({ type: 'entitySpawn', entity: pig, cause: 'Spawned' });
        raise({ type: 'entityHurt', entity: pig, damage: 3, source: fall });
        raise({ type: 'entityDie', entity: pig, source: fall });
        world.scriptEvent('jsp:between', '');
        raise({ type: 'entityHurt', entity: pig, damage: 1, source: fall });

        expect(world.takeEvents().map((event) => event.type)).toEqual([
            'entitySpawn',
            'entityHurt',
            'entityHurt',
            'scriptEvent',
            'entityDie'
        ]);
        world.close();
        expect(listeners).toEqual([]);
    });
});
