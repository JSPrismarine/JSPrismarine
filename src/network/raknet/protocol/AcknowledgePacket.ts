import Packet from './Packet';

const MAX_ACK_PACKETS = 4096;
export default class AcknowledgePacket extends Packet {
    // Array containing all sequence numbers of received (ACK)
    // or lost (NACK) packets
    private packets: number[] = [];

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
        const seqNumbersCount = this.packets.length;
        // Record count (a range has start and end values, so count 2 values)
        this.writeShort(seqNumbersCount > 1 ? seqNumbersCount / 2 : 1);
        // Sort in ascending order
        this.packets.sort((a, b) => a - b);

        if (seqNumbersCount > 1) {
            // True if is a single record
            this.writeBool(false);
            // We always have 2 sequence numbers max, so this may be a hack
            for (let i = 0; i < seqNumbersCount / 2; i += 2) {
                // Write start sequence number
                this.writeLTriad(this.packets[i]);
                // Write end sequence number
                this.writeLTriad(this.packets[i + 1]);
            }
        } else {
            // True if is a single record
            this.writeBool(true);
            // Write the only value we have
            this.writeLTriad(this.packets[0]);
        }
    }

    public setPackets(packets: number[]): void {
        this.packets = packets;
    }

    public getPackets(): number[] {
        return this.packets;
    }
}
