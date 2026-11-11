import { BatchCodec, NetworkBinaryStream } from '@jsprismarine/protocol';
import { EventEmitter } from 'node:events';

import type { NetworkPacket } from '@jsprismarine/protocol';
import type { ITransport, TransportStats } from '../net/ITransport';

/** A transport that goes nowhere: batches are pushed in and captured on the way out. */
export class FakeTransport extends EventEmitter implements ITransport {
    public readonly sent: Buffer[] = [];

    public async connect(): Promise<void> {}
    public send(payload: Buffer): void {
        this.sent.push(payload);
    }
    public close(): void {}
    public getStats(): TransportStats {
        return { rtt: null, bytesSent: 0, bytesReceived: 0, packetsSent: 0, packetsReceived: 0 };
    }

    /** Hands the session the packets as one uncompressed batch, as a server sends before compression. */
    public async deliver(...packets: NetworkPacket<any>[]): Promise<void> {
        const encoded = packets.map((packet) => packet.serialize(new NetworkBinaryStream()));
        this.emit('batch', await BatchCodec.uncompressed().encodeAsync(encoded));
    }

    /** Every packet sent so far, header included, from a session that never enabled compression. */
    public async sentPackets(): Promise<Buffer[]> {
        const batches = await Promise.all(this.sent.map((batch) => BatchCodec.uncompressed().decodeAsync(batch)));
        return batches.flat();
    }
}
