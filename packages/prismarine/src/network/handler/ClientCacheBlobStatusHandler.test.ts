import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import ClientCacheBlobStatusPacket from '../packet/ClientCacheBlobStatusPacket';
import ClientCacheBlobStatusHandler from './ClientCacheBlobStatusHandler';

describe('ClientCacheBlobStatusHandler', () => {
    it('logs the hit and miss counts', () => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        const packet = Object.assign(new ClientCacheBlobStatusPacket(), { missingIds: [1n, 2n], foundIds: [3n] });

        new ClientCacheBlobStatusHandler().handle(packet, server, session);

        expect(logged).toEqual(['Steve holds 1 cached blob(s) and is missing 2. The server keeps the cache off']);
    });
});
