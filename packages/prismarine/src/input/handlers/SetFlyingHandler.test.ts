import { describe, expect, it } from 'vitest';

import type PlayerSession from '../../player/PlayerSession';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import SetFlyingHandler from './SetFlyingHandler';

describe('SetFlyingHandler', () => {
    it('sets the flight through the session, which allows or refuses it', async () => {
        const flights: boolean[] = [];
        const session = stub<PlayerSession>({ setFlying: async (flying) => void flights.push(flying) });
        const { context, settled } = inputContext(session);

        new SetFlyingHandler().handle({ kind: 'setFlying', flying: false }, context);
        await settled();

        expect(flights).toEqual([false]);
    });
});
