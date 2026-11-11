import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { sessionContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import type PlayerSession from '../PlayerSession';
import MapInfoRequestPacket from '@jsprismarine/protocol/packet/MapInfoRequestPacket';
import MapInfoRequestHandler from './MapInfoRequestHandler';

describe('MapInfoRequestHandler', () => {
    it('logs the map id and pixel count', () => {
        const logged: string[] = [];
        const log = stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') });
        const session = stub<PlayerSession>({ identity: STEVE });
        const packet = Object.assign(new MapInfoRequestPacket(), {
            mapUniqueId: 3n,
            clientPixels: [{ pixel: 1, index: 2 }]
        });

        new MapInfoRequestHandler().handle(packet, sessionContext(session, { log }));

        expect(logged).toEqual(['Steve requested map 3 and offered 1 pixel(s). Maps are not stored']);
    });
});
