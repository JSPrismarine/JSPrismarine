import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type PlayerSession from '../../player/PlayerSession';
import { sessionContext } from '../../testing/handlerContext.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import PickEntityHandler from './PickEntityHandler';

/** A handler context whose session has been shown actor 12 only, and the lines it logs. */
const seeing12 = () => {
    const logged = { debug: [] as string[], verbose: [] as string[] };
    const log = stub<Logger>({
        debug: (...message) => void logged.debug.push(message[0] ?? ''),
        verbose: (...message) => void logged.verbose.push(message[0] ?? '')
    });
    const session = stub<PlayerSession>({ identity: STEVE, tracks: (runtimeId) => runtimeId === 12n });
    return { logged, context: sessionContext(session, { log }) };
};

describe('PickEntityHandler', () => {
    it('logs a pick of an actor the player sees', () => {
        const { logged, context } = seeing12();

        new PickEntityHandler().handle({ kind: 'pickEntity', target: 12n, withData: false }, context);

        expect(logged.debug).toEqual(['Steve picked actor 12. Actor picking is not implemented']);
        expect(logged.verbose).toEqual([]);
    });

    it('drops a pick of an actor the player has not been shown', () => {
        const { logged, context } = seeing12();

        new PickEntityHandler().handle({ kind: 'pickEntity', target: 99n, withData: true }, context);

        expect(logged.debug).toEqual([]);
        expect(logged.verbose).toEqual(['Dropped a pick of actor 99 from Steve: they have not been shown it']);
    });
});
