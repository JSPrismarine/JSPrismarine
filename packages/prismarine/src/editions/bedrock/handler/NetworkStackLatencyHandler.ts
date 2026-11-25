import NetworkStackLatencyPacket from '@jsprismarine/protocol/bedrock/packet/NetworkStackLatencyPacket';
import type { SessionContext } from '../../../player/context/HandlerContext';
import type { ConnectionLaneHandler } from '../../../player/context/SessionHandler';

/**
 * The client's latency ping.
 *
 * Is From Server is the flag that asks for an answer: whoever sets it wants the same
 * Creation Time echoed back, which is how either side measures the round trip through the
 * whole Minecraft stack rather than through RakNet alone. A ping that sets it is echoed with
 * the flag cleared, so the answer does not read as another request and the two sides do not
 * ping each other forever. A ping that does not set it is recorded and left alone. Either answers
 * the server's own keep-alive.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/network-stack-latency-packet/
 */
export default class NetworkStackLatencyHandler implements ConnectionLaneHandler<NetworkStackLatencyPacket> {
    public static PacketName = 'NetworkStackLatencyPacket';
    public readonly phases = ['resourcePacks', 'play'] as const;
    public readonly lane = 'connection';

    /** Echoes the timestamp when the ping asked for an answer, and logs it either way. */
    public async handle(packet: NetworkStackLatencyPacket, { session, log }: SessionContext): Promise<void> {
        log.debug(
            `${session.identity.name} pinged at ${packet.creationTime}${packet.isFromServer ? ', asking for an answer' : ''}`
        );

        // Whatever its flag, it shows the client is there, which answers the keep-alive. A game
        // client answers the server's own ping with the flag still set and the time scaled up, as
        // cinnabar does after it, so neither tells an answer from a ping.
        session.getConnection().keepAliveAnswered();

        if (!packet.isFromServer) return;

        const answer = new NetworkStackLatencyPacket();
        answer.creationTime = packet.creationTime;
        answer.isFromServer = false;
        await session.getConnection().sendDataPacket(answer);
    }
}
