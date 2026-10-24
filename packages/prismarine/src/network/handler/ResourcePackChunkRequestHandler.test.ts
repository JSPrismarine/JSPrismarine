import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import ResourcePackChunkRequestPacket from '../packet/ResourcePackChunkRequestPacket';
import ResourcePackChunkRequestHandler from './ResourcePackChunkRequestHandler';

describe('ResourcePackChunkRequestHandler', () => {
    it('logs the pack and chunk', () => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        const packet = Object.assign(new ResourcePackChunkRequestPacket(), { resourceName: 'pack_1.0', chunk: 2 });

        new ResourcePackChunkRequestHandler().handle(packet, server, session);

        expect(logged).toEqual(['Steve requested chunk 2 of pack pack_1.0, which the server does not serve']);
    });
});
