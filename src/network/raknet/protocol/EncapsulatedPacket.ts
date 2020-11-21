import BinaryStream from '@jsprismarine/jsbinaryutils';
import BitFlags from './BitFlags';
import Reliability from './Reliability';

export default class EncapsulatedPacket {
    // Decoded Encapsulated content
    public buffer!: Buffer;

    // Encapsulation decoded fields
    public reliability!: number;

    public messageIndex!: number;
    public sequenceIndex!: number;
    public orderIndex!: number;
    public orderChannel!: number;

    public split!: boolean;
    // If packet is not splitted all those
    // fields remains undefined
    public splitCount!: number;
    public splitIndex!: number;
    public splitID!: number;

    public needACK = false;

    public static fromBinary(stream: BinaryStream): EncapsulatedPacket {
        let packet = new EncapsulatedPacket();
        let header = stream.readByte();
        packet.reliability = (header & 224) >> 5;
        packet.split = (header & BitFlags.SPLIT) > 0;

        let length = stream.readShort();
        length >>= 3;
        if (length == 0) {
            throw new Error('Got an empty encapsulated packet');
        }

        if (Reliability.isReliable(packet.reliability)) {
            packet.messageIndex = stream.readLTriad();
        }

        if (Reliability.isSequenced(packet.reliability)) {
            packet.sequenceIndex = stream.readLTriad();
        }

        if (Reliability.isSequencedOrOrdered(packet.reliability)) {
            packet.orderIndex = stream.readLTriad();
            packet.orderChannel = stream.readByte();
        }

        if (packet.split) {
            packet.splitCount = stream.readInt();
            packet.splitID = stream.readShort();
            packet.splitIndex = stream.readInt();
        }

        packet.buffer = stream.getBuffer().slice(stream.getOffset());
        stream.addOffset(length, true);

        return packet;
    }

    public toBinary(): BinaryStream {
        let stream = new BinaryStream();
        let header = this.reliability << 5;
        if (this.split) {
            header |= BitFlags.SPLIT;
        }
        stream.writeByte(header);
        stream.writeShort(this.buffer.length << 3);

        if (Reliability.isReliable(this.reliability)) {
            stream.writeLTriad(this.messageIndex);
        }

        if (Reliability.isSequenced(this.reliability)) {
            stream.writeLTriad(this.sequenceIndex);
        }

        if (Reliability.isSequencedOrOrdered(this.reliability)) {
            stream.writeLTriad(this.orderIndex);
            stream.writeByte(this.orderChannel);
        }

        if (this.split) {
            stream.writeInt(this.splitCount);
            stream.writeShort(this.splitID);
            stream.writeInt(this.splitIndex);
        }

        stream.append(this.buffer);
        return stream;
    }

    public getTotalLength(): number {
        return (
            3 +
            this.buffer.length +
            (typeof this.messageIndex !== 'undefined' ? 3 : 0) +
            (typeof this.orderIndex !== 'undefined' ? 4 : 0) +
            (this.split ? 10 : 0)
        );
    }
}
module.exports = EncapsulatedPacket;
