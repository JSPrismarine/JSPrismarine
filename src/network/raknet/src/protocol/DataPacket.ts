import BitFlags from './BitFlags';
import EncapsulatedPacket from './EncapsulatedPacket';
import Packet from './Packet';

export default class DataPacket extends Packet {
    public constructor(buffer?: Buffer) {
        super(Math.trunc(BitFlags.VALID), buffer);
    }

    public packets: EncapsulatedPacket[] = [];
    public sendTime!: number;

    // Packet sequence number
    // used to check for missing packets
    public sequenceNumber!: number;

    public decodePayload(): void {
        this.sequenceNumber = this.readLTriad();
        while (!this.feof()) {
            this.packets.push(EncapsulatedPacket.fromBinary(this));
        }
    }

    public encodePayload(): void {
        this.writeLTriad(this.sequenceNumber);
        for (const packet of this.packets) {
            this.append(packet.toBinary().getBuffer());
        }
    }

    public getLength(): number {
        // header (1 byte) + triad (3 bytes)
        let length = 4;
        for (const packet of this.packets) {
            length += packet.getByteLength();
        }

        return length;
    }
}
