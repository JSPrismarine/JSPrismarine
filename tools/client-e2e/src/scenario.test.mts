import { describe, expect, it, vi } from 'vitest';

import { untilPlayersOnline } from './scenario.mts';

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
