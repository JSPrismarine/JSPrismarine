import { afterEach, describe, expect, it, vi } from 'vitest';

import { settleOnFakeClock } from '../fakeClock.test.helper.mts';
import { dropFrom } from './fall-damage.mts';

const EYE_HEIGHT = 1.62;
const FLOOR = 64;

/**
 * A client whose state reads the way cinnabar's does: `server_position` is the eyes of the last
 * teleport the server sent, a teleport reaches the snapshot on the second poll after the command,
 * as the server and the network take their time, and the player then falls three blocks a poll
 * until it stands on the floor.
 * @param lastTeleportY - The feet height of the teleport the client last received.
 */
const fallingPlayer = (lastTeleportY: number) => {
    let serverY = lastTeleportY + EYE_HEIGHT;
    let feet = FLOOR;
    let pending: { readonly y: number; polls: number } | undefined;
    /** The highest the feet have been since the last teleport reached the client. */
    let peak = feet;
    const client = {
        state: async (): Promise<Record<string, unknown>> => {
            if (pending !== undefined && pending.polls > 0) {
                pending.polls -= 1;
            } else if (pending !== undefined) {
                serverY = pending.y + EYE_HEIGHT;
                feet = pending.y;
                peak = feet;
                pending = undefined;
            } else {
                feet = Math.max(FLOOR, feet - 3);
            }
            return { server_position: [0.5, serverY, 0.5], feet: [0.5, feet, 0.5] };
        }
    };
    const server = {
        command: (line: string): void => {
            const teleport = /^teleport \S+ \S+ (\S+) \S+$/.exec(line);
            if (teleport !== null) pending = { y: Number(teleport[1]), polls: 1 };
        }
    };
    return { client, server, playerName: 'jsp-e2e', peak: () => peak, feet: () => feet };
};

afterEach(() => {
    vi.useRealTimers();
});

describe('dropFrom', () => {
    it('waits for the fall when the drop before it was from the same height', async () => {
        vi.useFakeTimers();
        const player = fallingPlayer(75);

        const dropped = dropFrom(player, 75);
        await settleOnFakeClock(dropped);

        expect(player.peak()).toBe(75);
        expect(player.feet()).toBe(FLOOR);
    });

    it('waits for the fall from a height the client was not at', async () => {
        vi.useFakeTimers();
        const player = fallingPlayer(67);

        const dropped = dropFrom(player, 75);
        await settleOnFakeClock(dropped);

        expect(player.peak()).toBe(75);
        expect(player.feet()).toBe(FLOOR);
    });
});
