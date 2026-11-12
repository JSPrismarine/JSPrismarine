import { describe, expect, it, vi } from 'vitest';

import { healthOf, readHealth, untilPlayersOnline, vec3 } from './scenario.mts';

/**
 * A server whose `list` answers with each count in turn, then the last one for ever.
 * @param counts - What each `list` reports.
 */
const listingServer = (counts: readonly number[]) => {
    let lists = 0;
    let waiting: ((line: string) => void) | undefined;
    const server = {
        command: (line: string): void => {
            if (line !== 'list') return;
            lists += 1;
            waiting?.(`There are ${counts[Math.min(lists, counts.length) - 1]} players online.`);
        },
        waitForLine: (_pattern: RegExp): Promise<string> =>
            new Promise((resolve) => {
                waiting = resolve;
            })
    };
    return { server, lists: () => lists };
};

describe('untilPlayersOnline', () => {
    it('keeps asking until a closed client has left', async () => {
        vi.useFakeTimers();
        const { server, lists } = listingServer([2, 2, 1]);

        const alone = untilPlayersOnline(server, 1);
        await vi.runAllTimersAsync();
        await alone;

        expect(lists()).toBe(3);
    });

    it('fails when the player count never comes down', async () => {
        vi.useFakeTimers();
        const { server } = listingServer([2]);

        const alone = untilPlayersOnline(server, 1);
        const failed = expect(alone).rejects.toThrow('the server still counts 2 players online, not 1');
        await vi.runAllTimersAsync();
        await failed;
    });
});

describe('vec3', () => {
    it('reads three numbers', () => {
        expect(vec3({ feet: [1, 64, -2.5] }, 'feet')).toEqual([1, 64, -2.5]);
    });

    it('throws on anything else', () => {
        expect(() => vec3({ feet: [1, 64] }, 'feet')).toThrow('state.feet is not a 3-vector: [1,64]');
        expect(() => vec3({ feet: [1, '64', 2] }, 'feet')).toThrow('state.feet is not a 3-vector');
        expect(() => vec3({}, 'feet')).toThrow('state.feet is not a 3-vector');
    });
});

describe('readHealth', () => {
    it('reads the current and maximum health', () => {
        expect(readHealth({ health: { current: 14, maximum: 20 } })).toEqual({ current: 14, maximum: 20 });
    });

    it('is undefined while the state shows no pair of numbers', () => {
        expect(readHealth({})).toBeUndefined();
        expect(readHealth({ health: null })).toBeUndefined();
        expect(readHealth({ health: { current: 14 } })).toBeUndefined();
        expect(readHealth({ health: { current: '14', maximum: 20 } })).toBeUndefined();
    });
});

describe('healthOf', () => {
    it('throws where readHealth finds nothing', () => {
        expect(healthOf({ health: { current: 20, maximum: 20 } })).toEqual({ current: 20, maximum: 20 });
        expect(() => healthOf({ health: { current: 14 } })).toThrow(
            'state.health is not a pair of numbers: {"current":14}'
        );
    });
});
