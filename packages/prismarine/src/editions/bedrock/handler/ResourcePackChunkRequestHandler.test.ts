import type { Logger } from '@jsprismarine/logger';
import { DisconnectReason } from '@jsprismarine/minecraft';
import { assert, describe, expect, it, vi } from 'vitest';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import ResourcePackChunkDataPacket from '@jsprismarine/protocol/bedrock/packet/ResourcePackChunkDataPacket';
import type ClientConnection from '../../../network/ClientConnection';
import type { ServedResourcePack } from '../../../resourcePacks/ServedResourcePacks';
import { RESOURCE_PACK_CHUNK_SIZE } from '../../../resourcePacks/ServedResourcePacks';

import { inputContext } from '../../../testing/handlerContext.test.helper';
import { identityNamed } from '../../../testing/sessionIdentity.test.helper';
import { stub } from '../../../testing/stub.test.helper';
import type PlayerSession from '../../../player/PlayerSession';
import ResourcePackChunkRequestPacket from '@jsprismarine/protocol/bedrock/packet/ResourcePackChunkRequestPacket';
import ResourcePackChunkRequestHandler from './ResourcePackChunkRequestHandler';

describe('ResourcePackChunkRequestHandler', () => {
    const harness = () => {
        const logged: string[] = [];
        const kick = vi.fn(async (_reason: string, _code?: DisconnectReason) => {});
        const session = stub<PlayerSession>({
            identity: identityNamed('Steve'),
            kick
        });
        const { context, settled } = inputContext(session, {
            log: stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });

        return { logged, kick, context, settled };
    };

    it('logs the pack and chunk, then kicks with the resource pack reason', async () => {
        const { logged, kick, context, settled } = harness();
        const packet = Object.assign(new ResourcePackChunkRequestPacket(), { resourceName: 'pack_1.0', chunk: 2 });

        new ResourcePackChunkRequestHandler().handle(packet, context);
        // In the handler's unit: the kick takes the player off as it is called.
        expect(kick).toHaveBeenCalledOnce();
        await settled();

        expect(logged).toEqual(['Steve requested chunk 2 of pack pack_1.0, which the server does not serve']);
        expect(kick).toHaveBeenCalledOnce();
        expect(kick.mock.calls[0]?.[1]).toBe(DisconnectReason.RESOURCE_PACK_PROBLEM);
    });

    it('sends the chunk asked for, cut from the pack at its offset, and logs the last one', async () => {
        const logged: string[] = [];
        const sent: NetworkPacket[] = [];
        const kicks: string[] = [];
        const session = stub<PlayerSession>({
            identity: identityNamed('Steve'),
            kick: async (reason: string) => void kicks.push(reason),
            getConnection: () =>
                stub<ClientConnection>({ sendDataPacket: async (packet: NetworkPacket) => void sent.push(packet) })
        });
        const bytes = new Uint8Array(RESOURCE_PACK_CHUNK_SIZE + 5).map((_, index) => index % 251);
        const pack = stub<ServedResourcePack>({ bytes, chunkCount: 2, resourceName: 'pack_1.0.0' });
        const { context, settled } = inputContext(session, {
            log: stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') }),
            services: { resourcePacks: { offered: () => [pack], find: () => pack, chosenSubpack: () => '' } }
        });
        const packet = Object.assign(new ResourcePackChunkRequestPacket(), { resourceName: 'pack_1.0.0', chunk: 1 });

        new ResourcePackChunkRequestHandler().handle(packet, context);
        await settled();

        expect(kicks).toEqual([]);
        const [chunk] = sent;
        assert(chunk instanceof ResourcePackChunkDataPacket);
        expect(chunk.resourceName).toBe('pack_1.0.0');
        expect(chunk.chunkId).toBe(1);
        expect(chunk.byteOffset).toBe(BigInt(RESOURCE_PACK_CHUNK_SIZE));
        expect([...chunk.chunkData]).toEqual([...bytes.subarray(RESOURCE_PACK_CHUNK_SIZE)]);
        expect(logged).toEqual(['Sent Steve the last of 2 chunks of resource pack pack_1.0.0']);
    });

    it("kicks for a chunk past a pack's last", async () => {
        const { kick, context: plain } = harness();
        const pack = stub<ServedResourcePack>({ bytes: new Uint8Array(10), chunkCount: 1 });
        const context = {
            ...plain,
            services: {
                ...plain.services,
                resourcePacks: { offered: () => [pack], find: () => pack, chosenSubpack: () => '' }
            }
        };
        const packet = Object.assign(new ResourcePackChunkRequestPacket(), { resourceName: 'pack_1.0.0', chunk: 1 });

        new ResourcePackChunkRequestHandler().handle(packet, context);

        expect(kick).toHaveBeenCalledOnce();
    });

    it('kicks for a negative chunk index too, since no pack has one', async () => {
        const { kick, context, settled } = harness();
        const packet = Object.assign(new ResourcePackChunkRequestPacket(), { resourceName: 'pack_1.0', chunk: -1 });

        new ResourcePackChunkRequestHandler().handle(packet, context);
        await settled();

        expect(kick).toHaveBeenCalledOnce();
    });
});
