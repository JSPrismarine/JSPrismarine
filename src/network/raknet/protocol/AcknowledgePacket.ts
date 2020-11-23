import BinaryStream from '@jsprismarine/jsbinaryutils';
import Packet from './Packet';

const MaxAcknowledgePackets = 4096;
export default class AcknowledgePacket extends Packet {
    // Array containing all sequence numbers of received (ACK)
    // or lost (NACK) packets
    private packets: Array<number> = [];

    public decodePayload(): void {
        // Clear old cached decoded packets
        this.packets = [];
        let recordCount = this.readShort();

        for (let i = 0; i < recordCount; i++) {
            let recordType = this.readByte();

            // Range
            if (recordType == 0) {
                let start = this.readLTriad();
                let end = this.readLTriad();

                for (let pack = start; pack <= end; pack++) {
                    this.packets.push(pack);
                    if (this.packets.length > MaxAcknowledgePackets) {
                        throw new Error(
                            'Maximum acknowledgement packets size exceeded'
                        );
                    }
                }
            } else {
                // Single
                this.packets.push(this.readLTriad());
            }
        }
    }

    public encodePayload(): void {
        let records = 0;
        // We have to create a stream because the encoding is records + buffer
        // but we need to send records first and to compute them we have to decode the packet
        // and as we need to write first of all records, we cannot write decoded data so
        // we keep them in a temporary stream that will be appended later on
        let stream = new BinaryStream();
        // Sort packets to ensure a correct encoding
        this.packets.sort((a, b) => a - b);
        let count = this.packets.length;

        if (count > 0) {
            let pointer = 1;
            let start = this.packets[0];
            let last = this.packets[0];

            while (pointer < count) {
                let current = this.packets[pointer++];
                let diff = current - last;
                if (diff === 1) {
                    last = current;
                } else if (diff > 1) {
                    if (start === last) {
                        stream.writeByte(1);
                        stream.writeLTriad(start);
                        start = last = current;
                    } else {
                        stream.writeByte(0);
                        stream.writeLTriad(start);
                        stream.writeLTriad(last);
                        start = last = current;
                    }
                    records++;
                }
            }

            if (start === last) {
                stream.writeByte(1);
                stream.writeLTriad(start);
            } else {
                stream.writeByte(0);
                stream.writeLTriad(start);
                stream.writeLTriad(last);
            }
            records++;
        }

        this.writeShort(records);
        this.append(stream.getBuffer());
    }

    public setPackets(packets: Array<number>): void {
        this.packets = packets;
    }

    public getPackets(): Array<number> {
        return this.packets;
    }
}
