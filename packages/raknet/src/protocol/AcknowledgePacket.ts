import BinaryStream from '@jsprismarine/jsbinaryutils';
import Packet from './Packet';

export default class AcknowledgePacket extends Packet {
    public sequenceNumbers: number[] = [];

    public decodePayload(): void {
        // Clear old cached decoded packets
        this.sequenceNumbers = [];

        const recordCount = this.readUnsignedShort();
        for (let i = 0; i < recordCount; i++) {
            const notRange = this.readBoolean();

            if (notRange) {
                this.sequenceNumbers.push(this.readUnsignedTriadLE());
            } else {
                const start = this.readUnsignedTriadLE();
                const end = this.readUnsignedTriadLE();

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
            let start = this.sequenceNumbers[0]!;
            let last = this.sequenceNumbers[0]!;

            while (pointer < count) {
                const current = this.sequenceNumbers[pointer++]!;
                const diff = current - last;
                if (diff === 1) {
                    last = current;
                } else if (diff > 1) {
                    if (start === last) {
                        stream.writeBoolean(true); // single?
                        stream.writeUnsignedTriadLE(start);
                        start = last = current;
                    } else {
                        stream.writeBoolean(false); // single?
                        stream.writeUnsignedTriadLE(start);
                        stream.writeUnsignedTriadLE(last);
                        start = last = current;
                    }
                    ++records;
                }
            }

            // last iteration
            if (start === last) {
                stream.writeBoolean(true); // single?
                stream.writeUnsignedTriadLE(start);
            } else {
                stream.writeBoolean(false); // single?
                stream.writeUnsignedTriadLE(start);
                stream.writeUnsignedTriadLE(last);
            }
            ++records;
        }

        this.writeUnsignedShort(records);
        this.write(stream.getBuffer());
    }
}
