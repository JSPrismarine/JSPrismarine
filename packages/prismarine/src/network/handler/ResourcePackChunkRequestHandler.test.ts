import type { Logger } from '@jsprismarine/logger';
import { DisconnectReason } from '@jsprismarine/minecraft';
import { describe, expect, it, vi } from 'vitest';

import { inputContext } from '../../testing/handlerContext.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import ResourcePackChunkRequestPacket from '@jsprismarine/protocol/packet/ResourcePackChunkRequestPacket';
import ResourcePackChunkRequestHandler from './ResourcePackChunkRequestHandler';

describe('ResourcePackChunkRequestHandler', () => {
    const harness = () => {
        const logged: string[] = [];
        const kick = vi.fn(async (_reason: string, _code?: DisconnectReason) => {});
        const session = stub<PlayerSession>({
            identity: identityNamed('Steve'),
            kick
        });
        const { context, deferred, settled } = inputContext(session, {
            log: stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });

        return { logged, kick, context, deferred, settled };
    };

    it('logs the pack and chunk, then kicks with the resource pack reason', async () => {
        const { logged, kick, context, deferred, settled } = harness();
        const packet = Object.assign(new ResourcePackChunkRequestPacket(), { resourceName: 'pack_1.0', chunk: 2 });

        new ResourcePackChunkRequestHandler().handle(packet, context);
        // The kick tears the player down, which still waits, so the step runs it after the handler.
        expect(deferred).toHaveLength(1);
        expect(kick).not.toHaveBeenCalled();
        await settled();

        expect(logged).toEqual(['Steve requested chunk 2 of pack pack_1.0, which the server does not serve']);
        expect(kick).toHaveBeenCalledOnce();
        expect(kick.mock.calls[0]?.[1]).toBe(DisconnectReason.RESOURCE_PACK_PROBLEM);
    });

    it('kicks for a negative chunk index too, since no pack has one', async () => {
        const { kick, context, settled } = harness();
        const packet = Object.assign(new ResourcePackChunkRequestPacket(), { resourceName: 'pack_1.0', chunk: -1 });

        new ResourcePackChunkRequestHandler().handle(packet, context);
        await settled();

        expect(kick).toHaveBeenCalledOnce();
    });
});
