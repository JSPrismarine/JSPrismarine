import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { sessionContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import type PlayerSession from '../PlayerSession';
import BlockPos from '@jsprismarine/protocol/structure/BlockPos';
import BlockPickRequestPacket from '@jsprismarine/protocol/packet/BlockPickRequestPacket';
import BlockPickRequestHandler from './BlockPickRequestHandler';

describe('BlockPickRequestHandler', () => {
    it('logs the position and flags', () => {
        const logged: string[] = [];
        const log = stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') });
        const session = stub<PlayerSession>({ identity: STEVE });
        const packet = new BlockPickRequestPacket({
            position: new BlockPos(1, 2, 3),
            withData: true,
            maxSlots: 4
        });

        new BlockPickRequestHandler().handle(packet, sessionContext(session, { log }));

        expect(logged).toEqual([
            'Steve picked the block at 1, 2, 3 with data (4 free hotbar slots). Block picking is not implemented'
        ]);
    });
});
