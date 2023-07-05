// https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.h#L52

import PacketPool from './protocol/PacketPool.js';

// Number of available streams, up to 2^5.
export const NUMBER_OF_ORDERED_STREAMS = 32;

// Ref: https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.h
// Datagram reliable, ordered, unordered and sequenced sends. Flow control. Message splitting, reassembly, and coalescence.
export default abstract class ReliabilityLayer {
    protected readonly orderedIndex = Array.from<number>({ length: NUMBER_OF_ORDERED_STREAMS }).fill(0);
    protected readonly acknowlegements = new Set<number>();

    // Packet pool is the best option to reduce allocations
    protected readonly packetPool = new PacketPool();

    public constructor(protected readonly mtuSize: number) {}

    public abstract update(timestamp: number): void;

    protected sendAcknowledgementPacket(sequenceNumber: number) {
        this.acknowlegements.add(sequenceNumber);
        // console.log('Ack push %d', sequenceNumber);
    }
}
