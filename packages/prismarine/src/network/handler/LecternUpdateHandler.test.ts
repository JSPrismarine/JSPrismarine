import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import BlockPosition from '../../world/BlockPosition';
import type PlayerSession from '../PlayerSession';
import LecternUpdatePacket from '../packet/LecternUpdatePacket';
import LecternUpdateHandler from './LecternUpdateHandler';

describe('LecternUpdateHandler', () => {
    it('logs the page and position', () => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        const packet = Object.assign(new LecternUpdatePacket(), {
            newPage: 1,
            totalPages: 3,
            position: new BlockPosition(4, 65, -2)
        });

        new LecternUpdateHandler().handle(packet, server, session);

        expect(logged).toEqual(['Steve turned the lectern at 4, 65, -2 to page 1 of 3. Lectern pages are not stored']);
    });
});
