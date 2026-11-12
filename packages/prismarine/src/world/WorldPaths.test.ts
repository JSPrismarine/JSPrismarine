import { describe, expect, it } from 'vitest';

import { playerDataFileName } from './WorldPaths';

describe('playerDataFileName', () => {
    it.each(['2535412345678901', 'Steve', 'Alex 42', 'name.with.dots', '..'])(
        'keeps the ordinary key %j as it is',
        (key) => {
            expect(playerDataFileName(key)).toBe(`${key}.json`);
        }
    );

    it.each([
        ['../../config', '..%2F..%2Fconfig.json'],
        ['..\\\\server', '..%5C%5Cserver.json'],
        ['C:evil', 'C%3Aevil.json'],
        ['nul\u0000byte', 'nul%00byte.json'],
        ['100%', '100%25.json']
    ])('escapes what could leave the folder in %j', (key, expected) => {
        expect(playerDataFileName(key)).toBe(expected);
    });

    it('never gives two keys the same file', () => {
        expect(playerDataFileName('a/b')).not.toBe(playerDataFileName('a%2Fb'));
    });
});
