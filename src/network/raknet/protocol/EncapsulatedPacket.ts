import BinaryStream from '@jsprismarine/jsbinaryutils';
import BitFlags from './BitFlags';
import ReliabilityLayer, {
    isReliable,
    isSequenced,
    isSequencedOrOrdered
} from './ReliabilityLayer';

export default class EncapsulatedPacket {
    // Decoded Encapsulated content
    public buffer!: Buffer;

    // Encapsulation decoded fields
    public reliability!: number;

    // reliable message number
    public messageIndex: number | null = null;
    public sequenceIndex!: number;
    public orderIndex!: number;
    public orderChannel!: number;

    // If packet is not splitted all those
    // fields remains undefined
    public splitCount!: number;
    public splitIndex!: number;
    public splitId!: number;

    public static fromBinary(stream: BinaryStream): EncapsulatedPacket {
        const packet = new EncapsulatedPacket();
        const header = stream.readByte();
        packet.reliability = (header & 224) >> 5;
        const split = (header & BitFlags.SPLIT) > 0;

        let length = stream.readShort();
        length >>= 3;
        if (length == 0) {
            throw new Error('Got an empty encapsulated packet');
        }

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

        if (split) {
            packet.splitCount = stream.readInt();
            packet.splitId = stream.readShort();
            packet.splitIndex = stream.readInt();
        }

        packet.buffer = stream.getBuffer().slice(stream.getOffset());
        stream.addOffset(length, true);

        return packet;
    }

    public toBinary(): BinaryStream {
        let stream = new BinaryStream();
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

    public getTotalLength(): number {
        return (
            3 +
            this.buffer.byteLength +
            (typeof this.messageIndex !== 'undefined' ? 3 : 0) +
            (typeof this.orderIndex !== 'undefined' ? 4 : 0) +
            (this.splitCount ? 10 : 0)
        );
    }
}
module.exports = EncapsulatedPacket;
