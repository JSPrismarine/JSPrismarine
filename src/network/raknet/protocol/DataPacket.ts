import BitFlags from './BitFlags';
import EncapsulatedPacket from './EncapsulatedPacket';
import Packet from './Packet';

export default class DataPacket extends Packet {
    public constructor(buffer?: Buffer) {
        super(BitFlags.VALID | 0, buffer);
    }

    public packets: Array<EncapsulatedPacket> = [];
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
        let length = 4;
        for (const packet of this.packets) {
            length += packet.getTotalLength();
        }
        return length;
    }
}
