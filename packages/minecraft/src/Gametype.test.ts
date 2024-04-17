import { describe, expect, it } from 'vitest';

import { Gametype, getGametypeId, getGametypeName } from './Gametype';

describe('minecraft', () => {
    describe('Gametype', () => {
        describe('getGametypeName', () => {
            it('should return correct name', () => {
                expect(getGametypeName(Gametype.SURVIVAL)).toBe('Survival');
                expect(getGametypeName(Gametype.CREATIVE)).toBe('Creative');
                expect(getGametypeName(Gametype.ADVENTURE)).toBe('Adventure');
                expect(getGametypeName(Gametype.SPECTATOR)).toBe('Spectator');
            });

            it('should throw on invalid gametype', () => {
                expect(() => getGametypeName(Gametype.UNDEFINED)).toThrowError('Unknown gametype');
            });
        });

        describe('getGametypeId', () => {
            it('should return correct id', () => {
                expect(getGametypeId('survival')).toBe(Gametype.SURVIVAL);
                expect(getGametypeId('s')).toBe(Gametype.SURVIVAL);
                expect(getGametypeId(Gametype.SURVIVAL)).toBe(Gametype.SURVIVAL);

                expect(getGametypeId('creative')).toBe(Gametype.CREATIVE);
                expect(getGametypeId('c')).toBe(Gametype.CREATIVE);
                expect(getGametypeId(Gametype.CREATIVE)).toBe(Gametype.CREATIVE);

                expect(getGametypeId('adventure')).toBe(Gametype.ADVENTURE);
                expect(getGametypeId('a')).toBe(Gametype.ADVENTURE);
                expect(getGametypeId(Gametype.ADVENTURE)).toBe(Gametype.ADVENTURE);

                expect(getGametypeId('spectator')).toBe(Gametype.SPECTATOR);
                expect(getGametypeId('sp')).toBe(Gametype.SPECTATOR);
                expect(getGametypeId(Gametype.SPECTATOR)).toBe(Gametype.SPECTATOR);
            });

            it('should throw on invalid gametype', () => {
                expect(() => getGametypeId('invalid')).toThrowError('Unknown gametype');
            });
        });
    });
});
