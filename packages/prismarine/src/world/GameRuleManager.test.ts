import BinaryStream from '@jsprismarine/binaryutils';
import type { Logger } from '@jsprismarine/logger';
import { beforeEach, describe, expect, it } from 'vitest';

import type Server from '../Server';
import { stub } from '../testing/stub.test.helper';
import GameRuleManager, { GameRules, toNetworkGameRule } from './GameRuleManager';

/**
 * One rule as the docs lay it out: the name after its varuint length, the editable flag, the
 * value's varuint selector, and the value bytes.
 */
const rule = (name: string, editable: boolean, selectorAndValue: number[]): Buffer =>
    Buffer.concat([
        Buffer.from([name.length]),
        Buffer.from(name, 'utf8'),
        Buffer.from([editable ? 1 : 0, ...selectorAndValue])
    ]);

const serialize = (manager: GameRuleManager): Buffer => {
    const stream = new BinaryStream();
    manager.networkSerialize(stream);
    return stream.getBuffer();
};

describe('GameRuleManager', () => {
    let logged: string[];
    let server: Server;
    let gameRuleManager: GameRuleManager;

    beforeEach(() => {
        logged = [];
        server = stub<Server>({
            getLogger: () => stub<Logger>({ error: (...message) => void logged.push(String(message[0])) })
        });
        gameRuleManager = new GameRuleManager(server);
    });

    it('should set a gameRule', () => {
        const name = 'CommandBlockOutput';
        const value = true;
        const editable = true;

        gameRuleManager.setGameRule(name, value, editable);

        const rule = gameRuleManager.getGameRule(name);
        expect(rule).toEqual([value, editable]);
    });

    it('should get a gameRule', () => {
        const name = 'CommandBlockOutput';
        const value = true;
        const editable = true;

        gameRuleManager.setGameRule(name, value, editable);

        const rule = gameRuleManager.getGameRule(name);
        expect(rule).toEqual([value, editable]);
    });

    it('should return null for unknown gameRule', () => {
        const name = 'UnknownGameRule';

        const rule = gameRuleManager.getGameRule(name);
        expect(rule).toBeNull();
        expect(logged).toEqual(['Unknown GameRule with name UnknownGameRule']);
    });

    it('stores every default under the name a dedicated server sends', () => {
        const names = [...gameRuleManager.getGameRules().keys()];

        expect(names).toEqual(Object.values(GameRules));
        expect(names).toContain('doDayLightCycle');
        expect(names).not.toContain('dodaylightcycle');
    });

    it('finds a rule by any casing and keeps the wire spelling', () => {
        // A level file written by an older server spells the names in lowercase.
        gameRuleManager.setGameRule('showcoordinates', true, false);

        expect(gameRuleManager.getGameRule('ShowCoordinates')).toEqual([true, false]);
        expect(gameRuleManager.getGameRule(GameRules.ShowCoordinates)).toEqual([true, false]);
        expect(gameRuleManager.getGameRules().has('showCoordinates')).toBe(true);
        expect(gameRuleManager.getGameRules().has('showcoordinates')).toBe(false);
    });

    it('keeps the spelling a new rule arrives with', () => {
        gameRuleManager.setGameRule('doImmediateRespawn', false, true);

        expect(gameRuleManager.getGameRules().has('doImmediateRespawn')).toBe(true);
        expect(gameRuleManager.getGameRule('DOIMMEDIATERESPAWN')).toEqual([false, true]);
    });

    it('tells the listener about a change, under the wire name, and not about the defaults', () => {
        const changes: Array<[string, boolean | number, boolean]> = [];
        const manager = new GameRuleManager(
            server,
            (name, value, editable) => void changes.push([name, value, editable])
        );

        manager.setGameRule('dodaylightcycle', false, true);
        manager.setGameRule('spawnRadius', 10, false);

        expect(changes).toEqual([
            ['doDayLightCycle', false, true],
            ['spawnRadius', 10, false]
        ]);
    });

    it('serializes the defaults as a varuint count and one camelCase rule each', () => {
        const expected = Buffer.concat([
            Buffer.from([19]),
            rule('commandBlockOutput', true, [0x01, 0x01]),
            rule('doDayLightCycle', true, [0x01, 0x01]),
            rule('doEntityDrops', true, [0x01, 0x01]),
            rule('doFireTick', true, [0x01, 0x01]),
            rule('doMobLoot', true, [0x01, 0x01]),
            rule('doMobSpawning', true, [0x01, 0x01]),
            rule('doTileDrops', true, [0x01, 0x01]),
            rule('doWeatherCycle', true, [0x01, 0x01]),
            rule('drowningDamage', true, [0x01, 0x01]),
            rule('fallDamage', true, [0x01, 0x01]),
            rule('fireDamage', true, [0x01, 0x01]),
            rule('keepInventory', true, [0x01, 0x00]),
            rule('mobGriefing', true, [0x01, 0x01]),
            rule('naturalRegeneration', true, [0x01, 0x01]),
            rule('pvp', true, [0x01, 0x01]),
            rule('showCoordinates', true, [0x01, 0x00]),
            // An integer is a signed int32 LE, four fixed bytes.
            rule('randomTickSpeed', true, [0x02, 0x03, 0x00, 0x00, 0x00]),
            rule('tntExplodes', true, [0x01, 0x01]),
            rule('sendCommandFeedback', true, [0x01, 0x01])
        ]);

        expect(serialize(gameRuleManager)).toEqual(expected);
    });

    it('writes a negative integer rather than throwing', () => {
        gameRuleManager.setGameRule('spawnRadius', -1, true);

        const bytes = serialize(gameRuleManager);
        const tail = rule('spawnRadius', true, [0x02, 0xff, 0xff, 0xff, 0xff]);

        expect(bytes.subarray(bytes.length - tail.length)).toEqual(tail);
    });

    it('writes a fraction as a little-endian float', () => {
        gameRuleManager.setGameRule('ruleFloat', 0.5, false);

        const bytes = serialize(gameRuleManager);
        const tail = rule('ruleFloat', false, [0x03, 0x00, 0x00, 0x00, 0x3f]);

        expect(bytes.subarray(bytes.length - tail.length)).toEqual(tail);
    });

    it('shapes a stored rule as the protocol alternative its value needs', () => {
        expect(toNetworkGameRule('pvp', true, true)).toEqual({
            ruleName: 'pvp',
            ruleCanBeModified: true,
            ruleValue: { type: 1, value: true }
        });
        expect(toNetworkGameRule('spawnRadius', 10, false).ruleValue).toEqual({ type: 2, value: 10 });
        expect(toNetworkGameRule('ruleFloat', 1.5, false).ruleValue).toEqual({ type: 3, value: 1.5 });
    });
});
