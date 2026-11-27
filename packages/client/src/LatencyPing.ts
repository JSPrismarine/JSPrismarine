import { NetworkPacket, PacketIdentifier, layoutAt, networkStackLatencyPacket } from '@jsprismarine/protocol';

import type { NetworkBinaryStream, NetworkStackLatencyPayload } from '@jsprismarine/protocol';
import type { ClientPacketHandler } from './net/ClientHandler';
import type ClientSession from './net/ClientSession';

/**
 * `NetworkStackLatencyPacket` as a typed payload codec, both wire directions through the shared
 * `networkStackLatencyPacket` definition.
 *
 * The protocol package's own `NetworkStackLatencyPacket` is field-based, and this client's
 * registry hands a handler the decoded payload object, which a field packet does not have.
 */
export class NetworkStackLatencyPacket extends NetworkPacket<NetworkStackLatencyPayload> {
    /** The name this packet's wire id is listed under, the same as the protocol package's own. */
    public getName(): string {
        return 'NetworkStackLatencyPacket';
    }

    /** The default wire id, `NETWORK_STACK_LATENCY`. */
    public get id(): number {
        return PacketIdentifier.NETWORK_STACK_LATENCY;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: NetworkStackLatencyPayload): void {
        layoutAt(networkStackLatencyPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): NetworkStackLatencyPayload {
        return layoutAt(networkStackLatencyPacket, this.codecProtocol).decode(stream);
    }
}

/**
 * Answers the server's `NetworkStackLatency` pings, which a server sends as its keep-alive.
 *
 * A ping with Is From Server set asks for the same Creation Time back. The answer clears the
 * flag, so the server reads it as an answer and does not echo it again. JSPrismarine disconnects
 * a client that leaves one ping unanswered until the next, so a client that ignored them would be
 * dropped after two keep-alive intervals. A ping without the flag answers a ping of this client's
 * and is left alone.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/network-stack-latency-packet/
 */
export default class LatencyPing {
    /**
     * Registers the answer on the session, for the life of the session.
     * @param session - The session whose pings this answers.
     */
    public constructor(session: ClientSession) {
        session.registerHandler(NetworkStackLatencyPacket, this.ping);
    }

    /** Echoes a ping that asks for an answer, in either phase, since a server may ping before spawn. */
    private readonly ping: ClientPacketHandler<NetworkStackLatencyPayload> = {
        phases: ['login', 'play'],
        handle: async ({ creationTime, isFromServer }, { session }) => {
            if (!isFromServer) return;
            await session.send(new NetworkStackLatencyPacket({ creationTime, isFromServer: false }));
        }
    };
}
