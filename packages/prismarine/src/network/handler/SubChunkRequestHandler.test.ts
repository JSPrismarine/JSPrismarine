import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import SubChunkRequestPacket from '../packet/SubChunkRequestPacket';
import SubChunkRequestHandler from './SubChunkRequestHandler';

describe('SubChunkRequestHandler', () => {
    it('logs the request without answering', () => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        const packet = Object.assign(new SubChunkRequestPacket(), {
            dimensionType: 0,
            offsets: [{ x: 0, y: 1, z: 0 }],
            centerPos: { x: 2, y: 3, z: 4 }
        });

        new SubChunkRequestHandler().handle(packet, server, session);

        expect(logged).toEqual([
            'Steve requested 1 sub chunk(s) around 2, 3, 4 in dimension 0. The server does not offer sub chunk requests'
        ]);
    });
});
