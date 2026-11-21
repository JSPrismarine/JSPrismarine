import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../../network/PlayerSession';
import SetViewDistanceHandler from './SetViewDistanceHandler';

/** Runs the handler against a server with the given view distance and returns what it granted and logged. */
const run = async (radius: number, maxRadius: number, serverMax: number) => {
    let granted: number | undefined;
    const logged: string[] = [];
    const session = stub<PlayerSession>({
        identity: STEVE,
        setViewDistance: async (distance) => void (granted = distance)
    });
    const { context, settled } = inputContext(session, {
        config: { getViewDistance: () => serverMax },
        log: stub<Logger>({ debug: (...message) => void logged.push(String(message[0] ?? '')) })
    });

    new SetViewDistanceHandler().handle({ kind: 'setViewDistance', radius, maxRadius }, context);
    await settled();

    return { granted, logged };
};

const grant = async (radius: number, maxRadius: number, serverMax: number) =>
    (await run(radius, maxRadius, serverMax)).granted;

describe('SetViewDistanceHandler', () => {
    it('records the request and the grant', async () => {
        // The radius exchange is what lets a client accept terrain, so a join that stalls has to
        // show whether it happened.
        const { logged } = await run(10, 6, 12);

        expect(logged).toEqual(['Steve asked for a chunk radius of 10 (max 6), granted 6']);
    });

    it('grants the requested radius when both the client and the server allow it', async () => {
        expect(await grant(8, 16, 12)).toBe(8);
    });

    it('caps the grant at the client max', async () => {
        // A client that states a maximum cannot render past it, whatever it asked for.
        expect(await grant(10, 6, 12)).toBe(6);
    });

    it('caps the grant at the server view distance', async () => {
        expect(await grant(32, 48, 12)).toBe(12);
    });

    it('ignores a client max of zero', async () => {
        // A zero means the client did not state one.
        expect(await grant(8, 0, 12)).toBe(8);
    });

    it('never grants less than one chunk', async () => {
        // A radius of 0 would switch terrain off for the player.
        expect(await grant(0, 0, 12)).toBe(1);
        expect(await grant(-4, 0, 12)).toBe(1);
    });
});
