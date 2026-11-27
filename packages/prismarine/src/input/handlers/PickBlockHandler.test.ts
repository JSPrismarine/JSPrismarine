import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type PlayerSession from '../../player/PlayerSession';
import { sessionContext } from '../../testing/handlerContext.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import PickBlockHandler from './PickBlockHandler';

describe('PickBlockHandler', () => {
    it('logs the position and whether the data was asked for', () => {
        const logged: string[] = [];
        const log = stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') });
        const context = sessionContext(stub<PlayerSession>({ identity: STEVE }), { log });

        new PickBlockHandler().handle({ kind: 'pickBlock', position: { x: 1, y: 2, z: 3 }, withData: true }, context);

        expect(logged).toEqual(['Steve picked the block at 1, 2, 3 with data. Block picking is not implemented']);
    });
});
