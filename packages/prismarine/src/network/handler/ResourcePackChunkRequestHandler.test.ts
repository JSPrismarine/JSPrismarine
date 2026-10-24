import type { Logger } from '@jsprismarine/logger';
import { DisconnectReason } from '@jsprismarine/minecraft';
import { describe, expect, it, vi } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import ResourcePackChunkRequestPacket from '../packet/ResourcePackChunkRequestPacket';
import ResourcePackChunkRequestHandler from './ResourcePackChunkRequestHandler';

describe('ResourcePackChunkRequestHandler', () => {
    const harness = () => {
        const logged: string[] = [];
        const kick = vi.fn(async (_reason: string, _code?: DisconnectReason) => {});
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve', kick }) });

        return { logged, kick, server, session };
    };

    it('logs the pack and chunk, then kicks with the resource pack reason', async () => {
        const { logged, kick, server, session } = harness();
        const packet = Object.assign(new ResourcePackChunkRequestPacket(), { resourceName: 'pack_1.0', chunk: 2 });

        await new ResourcePackChunkRequestHandler().handle(packet, server, session);

        expect(logged).toEqual(['Steve requested chunk 2 of pack pack_1.0, which the server does not serve']);
        expect(kick).toHaveBeenCalledOnce();
        expect(kick.mock.calls[0]?.[1]).toBe(DisconnectReason.RESOURCE_PACK_PROBLEM);
    });

    it('kicks for a negative chunk index too, since no pack has one', async () => {
        const { kick, server, session } = harness();
        const packet = Object.assign(new ResourcePackChunkRequestPacket(), { resourceName: 'pack_1.0', chunk: -1 });

        await new ResourcePackChunkRequestHandler().handle(packet, server, session);

        expect(kick).toHaveBeenCalledOnce();
    });
});
