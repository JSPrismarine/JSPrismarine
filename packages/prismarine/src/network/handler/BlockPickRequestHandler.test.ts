import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import BlockPos from '@jsprismarine/protocol/structure/BlockPos';
import BlockPickRequestPacket from '@jsprismarine/protocol/packet/BlockPickRequestPacket';
import BlockPickRequestHandler from './BlockPickRequestHandler';

describe('BlockPickRequestHandler', () => {
    it('logs the position and flags', () => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        const packet = new BlockPickRequestPacket({
            position: new BlockPos(1, 2, 3),
            withData: true,
            maxSlots: 4
        });

        new BlockPickRequestHandler().handle(packet, server, session);

        expect(logged).toEqual([
            'Steve picked the block at 1, 2, 3 with data (4 free hotbar slots). Block picking is not implemented'
        ]);
    });
});
