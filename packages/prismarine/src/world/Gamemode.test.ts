import { describe, it, expect } from 'vitest';

import Gamemode from './Gamemode';

describe('world', () => {
    describe('Gamemode', () => {
        it('getGamemodeName() should return correct name', () => {
            expect(Gamemode.getGamemodeName(0)).toBe('Survival');
            expect(Gamemode.getGamemodeName(1)).toBe('Creative');
            expect(Gamemode.getGamemodeName(2)).toBe('Adventure');
            expect(Gamemode.getGamemodeName(3)).toBe('Spectator');
        });

        it('getGamemodeName() should throw on invalid gamemode', () => {
            expect(() => Gamemode.getGamemodeName(-1)).toThrowError('Unknown gamemode');
        });

        it('getGamemodeId() should return correct id', () => {
            expect(Gamemode.getGamemodeId('survival')).toBe(Gamemode.Survival);
            expect(Gamemode.getGamemodeId('0')).toBe(Gamemode.Survival);

            expect(Gamemode.getGamemodeId('creative')).toBe(Gamemode.Creative);
            expect(Gamemode.getGamemodeId('1')).toBe(Gamemode.Creative);

            expect(Gamemode.getGamemodeId('adventure')).toBe(Gamemode.Adventure);
            expect(Gamemode.getGamemodeId('2')).toBe(Gamemode.Adventure);

            expect(Gamemode.getGamemodeId('spectator')).toBe(Gamemode.Spectator);
            expect(Gamemode.getGamemodeId('3')).toBe(Gamemode.Spectator);
        });

        it('getGamemodeId() should throw on invalid gamemode', () => {
            expect(() => Gamemode.getGamemodeId('unknown')).toThrowError('Unknown gamemode');
        });
    });
});
