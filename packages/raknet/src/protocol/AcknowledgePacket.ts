import BinaryStream from '@jsprismarine/jsbinaryutils';
import Packet from './Packet';

export default class AcknowledgePacket extends Packet {
    public sequenceNumbers: number[] = [];

    public decodePayload(): void {
        // Clear old cached decoded packets
        this.sequenceNumbers = [];

        const recordCount = this.readShort();
        for (let i = 0; i < recordCount; i++) {
            const notRange = this.readBool();

            if (notRange) {
                this.sequenceNumbers.push(this.readLTriad());
            } else {
                const start = this.readLTriad();
                const end = this.readLTriad();

                for (let i = start; i <= end; i++) {
                    this.sequenceNumbers.push(i);
                }
            }
        }
    }

    public encodePayload(): void {
        const stream = new BinaryStream();
        this.sequenceNumbers.sort((a, b) => a - b);
        const count = this.sequenceNumbers.length;
        let records = 0;

        if (count > 0) {
            let pointer = 1;
            let start = this.sequenceNumbers[0];
            let last = this.sequenceNumbers[0];

            while (pointer < count) {
                const current = this.sequenceNumbers[pointer++];
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
