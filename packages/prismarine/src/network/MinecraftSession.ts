import { BatchPacket, DataPacket } from './Packets';
import { Protocol, RakNetSession, ConnectionPriority } from '@jsprismarine/raknet';

import { Logger } from '../';

/**
 * Act as the first connection layer, handles everything related to batching,
 * queuing and encrypting of Minecraft packets in a hypotetical session.
 * TODO: implement ticking, batching, queues, encryption.
 */
export default class MinecraftSession {
    protected readonly rakSession: RakNetSession;
    private readonly logger?: Logger;

    public constructor(session: RakNetSession, logger?: Logger) {
        this.rakSession = session;
        this.logger = logger;
    }

    public sendBatch(batch: BatchPacket, direct = true): void {
        batch.encode();
        const sendPacket = new Protocol.Frame();
        sendPacket.reliability = Protocol.FrameReliability.RELIABLE_ORDERED;
        sendPacket.orderChannel = 0;
        sendPacket.content = batch.getBuffer();

        this.rakSession.sendFrame(sendPacket, direct ? ConnectionPriority.IMMEDIATE : ConnectionPriority.NORMAL);
    }

    public async sendDataPacket<T extends DataPacket>(packet: T, comp = true, direct = false): Promise<void> {
        const batch = new BatchPacket();
        try {
            batch.addPacket(packet);
            batch.compressed = comp;
            batch.encode();
        } catch (error: unknown) {
            this.logger?.error(error, 'PlayerConnection/sendDataPacket');
            this.logger?.warn(
                `Packet §b${packet.constructor.name}§r to §b${this.rakSession
                    .getAddress()
                    .toToken()}§r failed with: ${(error as Error).message}`,
                'PlayerConnection/sendDataPacket'
            );
            return;
        }

        // Add this in raknet
        const sendPacket = new Protocol.Frame();
        sendPacket.reliability = Protocol.FrameReliability.RELIABLE_ORDERED;
        sendPacket.orderChannel = 0;
        sendPacket.content = batch.getBuffer();

        this.rakSession.sendFrame(sendPacket, direct ? ConnectionPriority.IMMEDIATE : ConnectionPriority.NORMAL);
        this.logger?.silly(`Sent §b${packet.constructor.name}§r packet`, 'PlayerConnection/sendDataPacket');
    }

    public forceDisconnect(): void {
        this.rakSession.disconnect();
    }
}
