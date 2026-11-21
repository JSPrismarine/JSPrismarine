import { describe, expect, it } from 'vitest';

import type { LevelRef } from './worlds.ts';
import { configFile, DEFAULT_WORLD, displayName, modify, readConfig, worldRules } from './worlds.ts';

const SKY = '6f1c9d2a-3b4e-4f5a-8b6c-7d8e9f0a1b2c';
const LOBBY = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

describe('the Multiverse config', () => {
    it('leaves out each world and field of the wrong shape and names it, keeping the rest', () => {
        const config = readConfig({
            worlds: {
                [SKY.toUpperCase()]: { gamemode: 'hardcore', alias: 'Sky', playerLimit: -1, respawnWorld: 'lobby' },
                sky: {},
                [LOBBY]: 'yes'
            }
        });

        expect([...config.worlds]).toEqual([[SKY, { ...DEFAULT_WORLD, alias: 'Sky' }]]);
        expect(config.problems).toEqual([
            `\`worlds.${SKY.toUpperCase()}.gamemode\` is not one of survival, creative, adventure, spectator`,
            `\`worlds.${SKY.toUpperCase()}.playerLimit\` is not a whole number, 0 or more`,
            `\`worlds.${SKY.toUpperCase()}.respawnWorld\` is not a level UUID`,
            "`worlds.sky` is not a level UUID; /mv info shows a world's",
            `\`worlds.${LOBBY}\` is not an object`
        ]);
    });

    it('gives a level the file has no rules for the defaults, and shows its alias in place of its name', () => {
        const config = readConfig({ worlds: { [SKY]: { alias: 'Skylands' } } });

        expect(worldRules(config, { id: LOBBY, name: 'lobby' })).toEqual(DEFAULT_WORLD);
        expect(displayName(config, { id: SKY, name: 'sky' })).toBe('Skylands');
        expect(displayName(config, { id: LOBBY, name: 'lobby' })).toBe('lobby');
    });

    it('writes the worlds back in order without their defaults, keeping what else the file holds', () => {
        const config = readConfig({ note: 'keep', worlds: { [SKY]: { hidden: true }, [LOBBY]: {} } });
        const worlds = new Map(config.worlds).set(SKY, { hidden: true, respawnWorld: LOBBY });

        expect(configFile({ note: 'keep' }, worlds)).toEqual({
            note: 'keep',
            worlds: { [SKY]: { hidden: true, respawnWorld: LOBBY }, [LOBBY]: {} }
        });
        expect(readConfig(configFile(undefined, worlds)).worlds).toEqual(worlds);
    });
});

describe('/mv modify', () => {
    const levels: readonly LevelRef[] = [
        { id: SKY, name: 'sky' },
        { id: LOBBY, name: 'lobby' }
    ];
    const levelNamed = (name: string) => levels.find((level) => level.name === name || level.id === name);
    const set = (property: string, value: string) => {
        const result = modify(DEFAULT_WORLD, property, value, levelNamed);
        return result.ok ? result.world : result.reason;
    };

    it('sets and clears each property', () => {
        expect(set('Alias', 'Skylands')).toEqual({ ...DEFAULT_WORLD, alias: 'Skylands' });
        expect(set('gamemode', 'Creative')).toEqual({ ...DEFAULT_WORLD, gamemode: 'creative' });
        expect(set('hidden', 'true')).toEqual({ ...DEFAULT_WORLD, hidden: true });
        expect(set('playerlimit', '12')).toEqual({ ...DEFAULT_WORLD, playerLimit: 12 });
        expect(set('alias', 'none')).toEqual(DEFAULT_WORLD);
    });

    it('keeps the respawn world by its UUID, so renaming the level keeps the rule', () => {
        expect(set('respawnworld', 'lobby')).toEqual({ ...DEFAULT_WORLD, respawnWorld: LOBBY });
        expect(set('respawnworld', 'nowhere')).toBe('There is no world nowhere. /mv list shows the worlds.');
    });

    it('refuses a value a property does not take, and a property there is not', () => {
        expect(set('playerlimit', '1.5')).toBe('playerlimit takes a whole number of players, or none.');
        expect(set('pvp', 'false')).toMatch(/^There is no property pvp\./);
    });
});
