import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import NetworkStackLatencyPacket from '@jsprismarine/protocol/packet/NetworkStackLatencyPacket';
import type PacketHandler from './PacketHandler';

/**
 * The client's latency ping.
 *
 * Is From Server is the flag that asks for an answer: whoever sets it wants the same
 * Creation Time echoed back, which is how either side measures the round trip through the
 * whole Minecraft stack rather than through RakNet alone. A ping that sets it is echoed with
 * the flag cleared, so the answer does not read as another request and the two sides do not
 * ping each other forever. A ping that does not set it is recorded and left alone.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/network-stack-latency-packet/
 */
export default class NetworkStackLatencyHandler implements PacketHandler<NetworkStackLatencyPacket> {
    public static PacketName = 'NetworkStackLatencyPacket';
    public readonly phases = ['resourcePacks', 'play'] as const;

    /** Echoes the timestamp when the ping asked for an answer, and logs it either way. */
    public async handle(packet: NetworkStackLatencyPacket, server: Server, session: PlayerSession): Promise<void> {
        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} pinged at ${packet.creationTime}${packet.isFromServer ? ', asking for an answer' : ''}`,
                'NetworkStackLatencyHandler/handle'
            );

        if (!packet.isFromServer) return;

        const answer = new NetworkStackLatencyPacket();
        answer.creationTime = packet.creationTime;
        answer.isFromServer = false;
        await session.getConnection().sendDataPacket(answer);
    }
}
