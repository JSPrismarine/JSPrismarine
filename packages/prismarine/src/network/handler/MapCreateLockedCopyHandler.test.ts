import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';
import { sessionContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import type PlayerSession from '../PlayerSession';
import MapCreateLockedCopyPacket from '@jsprismarine/protocol/packet/MapCreateLockedCopyPacket';
import MapCreateLockedCopyHandler from './MapCreateLockedCopyHandler';

describe('MapCreateLockedCopyHandler', () => {
    it('logs both map ids', () => {
        const logged: string[] = [];
        const log = stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') });
        const session = stub<PlayerSession>({ identity: STEVE });
        const packet = Object.assign(new MapCreateLockedCopyPacket(), { originalMapId: 5n, newMapId: 6n });

        new MapCreateLockedCopyHandler().handle(packet, sessionContext(session, { log }));

        expect(logged).toEqual(['Steve locked map 5 as 6. The server stores no maps']);
    });
});
