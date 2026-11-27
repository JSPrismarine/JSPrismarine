import { Logger } from '@jsprismarine/logger';
import { NetworkBinaryStream, PacketIdentifier } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import LatencyPing, { NetworkStackLatencyPacket } from './LatencyPing';
import ClientPacketRegistry from './net/ClientPacketRegistry';
import ClientSession from './net/ClientSession';
import { FakeTransport } from './testing/fakeTransport.test.helper';

const newPing = () => {
    const transport = new FakeTransport();
    const registry = new ClientPacketRegistry();
    registry.register(NetworkStackLatencyPacket);
    const session = new ClientSession(transport, registry, new Logger('error'));
    new LatencyPing(session);
    return { transport, session };
};

const ping = (creationTime: bigint, isFromServer: boolean) =>
    new NetworkStackLatencyPacket({ creationTime, isFromServer });

describe('LatencyPing', () => {
    it("echoes the server's ping time with the flag cleared, in both phases", async () => {
        const { transport, session } = newPing();

        await transport.deliver(ping(1234n, true));
        await session.settled();
        session.setPhase('play');
        await transport.deliver(ping(5678n, true));
        await session.settled();

        const sent = await transport.sentPackets();
        expect(sent.map((packet) => ClientPacketRegistry.readPacketId(packet))).toEqual([
            PacketIdentifier.NETWORK_STACK_LATENCY,
            PacketIdentifier.NETWORK_STACK_LATENCY
        ]);
        expect(
            sent.map((buffer) => new NetworkStackLatencyPacket().deserialize(new NetworkBinaryStream(buffer)))
        ).toEqual([
            { creationTime: 1234n, isFromServer: false },
            { creationTime: 5678n, isFromServer: false }
        ]);
    });

    it('leaves an answer to its own ping unanswered', async () => {
        const { transport, session } = newPing();

        await transport.deliver(ping(1234n, false));
        await session.settled();

        expect(transport.sent).toEqual([]);
    });
});
