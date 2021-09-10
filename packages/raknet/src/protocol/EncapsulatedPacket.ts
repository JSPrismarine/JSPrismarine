import { isReliable, isSequenced, isSequencedOrOrdered } from './ReliabilityLayer';

import BinaryStream from '@jsprismarine/jsbinaryutils';
import BitFlags from './BitFlags';

export default class EncapsulatedPacket {
    // Decoded Encapsulated content
    public buffer!: Buffer;

    // Packet reliability
    public reliability!: number;

    // Reliable message number, used to identify reliable messages on the network
    public messageIndex!: number;

    // Identifier used with sequenced messages
    public sequenceIndex!: number;
    // Identifier used for ordering packets, included in sequenced messages
    public orderIndex!: number;
    // The order channel the packet is on, used just if the reliability type has it
    public orderChannel!: number;

    // If the packet is splitted, this is the count of splits
    public splitCount = 0;
    // If the packet is splitted, this ID refers to the index in the splits array
    public splitIndex!: number;
    // The ID of the split packet (if the packet is splitted)
    public splitId!: number;

    public static fromBinary(stream: BinaryStream): EncapsulatedPacket {
        const packet = new EncapsulatedPacket();
        const header = stream.readByte();
        packet.reliability = (header & 224) >> 5;
        // Length from bits to bytes
        const length = stream.readShort() / 8;

        if (isReliable(packet.reliability)) {
            packet.messageIndex = stream.readLTriad();
        }

        if (isSequenced(packet.reliability)) {
            packet.sequenceIndex = stream.readLTriad();
        }

        if (isSequencedOrOrdered(packet.reliability)) {
            packet.orderIndex = stream.readLTriad();
            packet.orderChannel = stream.readByte();
        }

        const split = (header & BitFlags.SPLIT) > 0;
        if (split) {
            packet.splitCount = stream.readInt();
            packet.splitId = stream.readShort();
            packet.splitIndex = stream.readInt();
        }

        packet.buffer = stream.read(length);
        return packet;
    }

    public toBinary(): BinaryStream {
        const stream = new BinaryStream();
        let header = this.reliability << 5;
        if (this.splitCount > 0) {
            header |= BitFlags.SPLIT;
        }

        stream.writeByte(header);
        stream.writeShort(this.buffer.length << 3);

        if (isReliable(this.reliability)) {
            stream.writeLTriad(this.messageIndex || 0);
        }

        if (isSequenced(this.reliability)) {
            stream.writeLTriad(this.sequenceIndex);
        }

        if (isSequencedOrOrdered(this.reliability)) {
            stream.writeLTriad(this.orderIndex);
            stream.writeByte(this.orderChannel);
        }

        if (this.splitCount > 0) {
            stream.writeInt(this.splitCount);
            stream.writeShort(this.splitId);
            stream.writeInt(this.splitIndex);
        }

        stream.append(this.buffer);
        return stream;
    }

    public getByteLength(): number {
        return (
            3 +
            this.buffer.byteLength +
            (isReliable(this.reliability) ? 3 : 0) +
            (isSequenced(this.reliability) ? 3 : 0) +
            (isSequencedOrOrdered(this.reliability) ? 4 : 0) +
            (this.splitCount > 0 ? 10 : 0)
        );
    }
}
