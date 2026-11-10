import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import type PlayerSession from '../PlayerSession';
import ClientCacheBlobStatusPacket from '@jsprismarine/protocol/packet/ClientCacheBlobStatusPacket';
import ClientCacheBlobStatusHandler from './ClientCacheBlobStatusHandler';

describe('ClientCacheBlobStatusHandler', () => {
    it('responds through the session and logs the hit and miss counts', async () => {
        const logged: string[] = [];
        const reports: Array<{ missingIds: readonly bigint[]; foundIds: readonly bigint[] }> = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({
            identity: STEVE,
            handleClientCacheBlobStatus: async (report) => {
                reports.push({ missingIds: report.missingIds, foundIds: report.foundIds });
                return 2;
            }
        });
        const packet = Object.assign(new ClientCacheBlobStatusPacket(), { missingIds: [1n, 2n], foundIds: [3n] });

        await new ClientCacheBlobStatusHandler().handle(packet, server, session);

        expect(reports).toEqual([{ missingIds: [1n, 2n], foundIds: [3n] }]);
        expect(logged).toEqual(['Steve holds 1 cached blob(s) and is missing 2; sent 2']);
    });
});
