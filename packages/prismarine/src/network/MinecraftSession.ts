import type { Logger } from '@jsprismarine/logger';
import type { RakNetSession } from '@jsprismarine/raknet';
import { ConnectionPriority, Protocol } from '@jsprismarine/raknet';
import type { DataPacket } from './Packets';
import { BatchPacket } from './Packets';

/**
 * Act as the first connection layer, handles everything related to batching,
 * queuing and encrypting of Minecraft packets in a hypotetical session.
 * TODO: implement ticking, batching, queues, encryption.
 */
export default class MinecraftSession {
    protected readonly rakSession: RakNetSession;

    public constructor(
        session: RakNetSession,
        private readonly logger: Logger
    ) {
        this.rakSession = session;
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
            this.logger.error(error);
            this.logger.warn(
                `Packet §b${packet.constructor.name}§r to §b${this.rakSession
                    .getAddress()
                    .toToken()}§r failed with: ${(error as Error).message}`
            );
            return;
        }

        // Add this in raknet
        const sendPacket = new Protocol.Frame();
        sendPacket.reliability = Protocol.FrameReliability.RELIABLE_ORDERED;
        sendPacket.orderChannel = 0;
        sendPacket.content = batch.getBuffer();

        this.rakSession.sendFrame(sendPacket, direct ? ConnectionPriority.IMMEDIATE : ConnectionPriority.NORMAL);
        this.logger.silly(`Sent §b${packet.constructor.name}§r packet`);
    }

    public forceDisconnect(): void {
        this.rakSession.disconnect();
    }
}
