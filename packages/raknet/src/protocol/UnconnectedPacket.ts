import Packet from './Packet';
import { RAKNET_MAGIC } from '../RakNet';

export default class UnconnectedPacket extends Packet {
    private magic!: Buffer;

    // Used to read offline packets magic (needed to validate the packet)
    public readMagic(): void {
        this.magic = this.getBuffer().slice(this.getOffset(), this.addOffset(16, true));
    }

    public writeMagic(): void {
        this.append(RAKNET_MAGIC);
    }

    public isValid(): boolean {
        return RAKNET_MAGIC.equals(this.magic);
    }
}
