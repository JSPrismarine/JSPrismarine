import { BatchPacket, DataPacket } from './Packets';
import { Protocol, RakNetSession } from '@jsprismarine/raknet';

import { Logger } from '../Prismarine';

/**
 * This should handle everything related to a hypotetic Client session such
 * as packet queues, batching, encrypting and so on... but nothing regarding Minecraft itself
 */
export default class Connection {
    private readonly rakSession: RakNetSession;
    private readonly logger?: Logger;

    public constructor(session: RakNetSession, logger?: Logger) {
        this.rakSession = session;
        this.logger = logger;
    }

    public async sendDataPacket(packet: DataPacket): Promise<void> {
        const batch = new BatchPacket();
        try {
            batch.addPacket(packet);
            batch.encode();
        } catch (error) {
            this.logger?.warn(
                `Packet §b${packet.constructor.name}§r to §b${this.rakSession
                    .getAddress()
                    .toToken()}§r failed with: ${error}`,
                'PlayerConnection/sendDataPacket'
            );
            return;
        }

        // Add this in raknet
        const sendPacket = new Protocol.Frame();
        sendPacket.reliability = Protocol.FrameReliability.RELIABLE_ORDERED;
        sendPacket.orderChannel = 0;
        sendPacket.content = batch.getBuffer();

        this.rakSession.sendFrame(sendPacket, Protocol.RakNetPriority.IMMEDIATE);
        this.logger?.silly(`Sent §b${packet.constructor.name}§r packet`, 'PlayerConnection/sendDataPacket');
    }

    public forceDisconnect(): void {
        this.rakSession.disconnect();
    }
}
