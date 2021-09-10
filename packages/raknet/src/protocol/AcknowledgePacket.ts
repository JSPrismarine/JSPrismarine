import Packet from './Packet';
import BinaryStream from '@jsprismarine/jsbinaryutils';

export default class AcknowledgePacket extends Packet {
    public packets: Array<number> = [];

    public decodePayload(): void {
        // Clear old cached decoded packets
        this.packets = [];

        const recordCount = this.readShort();
        for (let i = 0; i < recordCount; i++) {
            const notRange = this.readBool();

            if (notRange) {
                this.packets.push(this.readLTriad());
            } else {
                const start = this.readLTriad();
                const end = this.readLTriad();

                for (let i = start; i <= end; i++) {
                    this.packets.push(i);
                }
            }
        }
    }

    public encodePayload(): void {
        const stream = new BinaryStream();
        this.packets.sort((a, b) => a - b);
        const count = this.packets.length;
        let records = 0;

        if (count > 0) {
            let pointer = 1;
            let start = this.packets[0];
            let last = this.packets[0];

            while (pointer < count) {
                let current = this.packets[pointer++];
                const diff = current - last;
                if (diff === 1) {
                    last = current;
                } else if (diff > 1) {
                    if (start === last) {
                        stream.writeBool(true); // single?
                        stream.writeLTriad(start);
                        start = last = current;
                    } else {
                        stream.writeBool(false); // single?
                        stream.writeLTriad(start);
                        stream.writeLTriad(last);
                        start = last = current;
                    }
                    ++records;
                }
            }

            // last iteration
            if (start === last) {
                stream.writeBool(true); // single?
                stream.writeLTriad(start);
            } else {
                stream.writeBool(false); // single?
                stream.writeLTriad(start);
                stream.writeLTriad(last);
            }
            ++records;
        }

        this.writeShort(records);
        this.append(stream.getBuffer());
    }
}
